import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from benchmark_civicassist_gemini import CASES, benchmark_case, generation_payload, grounded, knowledge, main, prompt


class GeminiBenchmarkSafetyTest(unittest.TestCase):
    def test_meaning_reversals_are_rejected(self):
        self.assertFalse(grounded("AI classification does approve complaints.",
                                  "AI classification does not approve complaints."))
        self.assertFalse(grounded("AI can override a reviewer.",
                                  "A reviewer can override AI."))
        self.assertFalse(grounded("Review takes 3 days.", "Review takes 30 days."))
        self.assertTrue(grounded("AI classification does not approve complaints.",
                                 "AI classification does not approve complaints."))

    def test_every_outbound_case_uses_approved_public_text(self):
        entries = knowledge()
        for identifier, language, _, _ in CASES:
            entry = entries[identifier]
            self.assertEqual(entry["audience"], "PUBLIC")
            self.assertEqual(entry["language"], language)
            outbound = prompt(entry, language)
            self.assertIn(entry["title"], outbound)
            self.assertIn(entry["answer"], outbound)
            self.assertNotIn("GEMINI_API_KEY", outbound)
            schema = generation_payload(entry, language)["generationConfig"]["responseJsonSchema"]
            self.assertEqual(schema["type"], "object")
            self.assertEqual(schema["required"], ["answer", "sourceIds"])

    def test_live_response_shape_rejects_reversed_meaning(self):
        entry = {"id": "approval", "title": "Approval", "answer":
                 "AI classification does not approve complaints.", "source": "README.md"}
        response = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text":
                    '{"answer":"AI classification does approve complaints.","sourceIds":["approval"]}'}]}}],
                    "usageMetadata": {"promptTokenCount": 40, "candidatesTokenCount": 10,
                                      "totalTokenCount": 50}}
        with patch("benchmark_civicassist_gemini.request_json", return_value=response):
            result = benchmark_case("gemini-3.8-flash", entry, "en", "local-test-key")
        self.assertEqual(result["httpStatus"], 200)
        self.assertTrue(result["citationCorrect"])
        self.assertFalse(result["accepted"])
        self.assertTrue(result["fallback"])
        self.assertEqual(result["servedAnswer"], entry["answer"])
        self.assertEqual(result["totalTokens"], 50)

    def test_array_generated_json_reproduces_reported_crash_as_fallback(self):
        entry = {"id": "tracking", "title": "Track", "answer": "Use the Track page."}
        response = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "[]"}]}}]}
        with patch("benchmark_civicassist_gemini.request_json", return_value=response):
            result = benchmark_case("gemini-3.8-flash", entry, "en", "local-test-key")
        self.assertEqual(result["httpStatus"], 200)
        self.assertEqual(result["rejectionReason"], "invalid_generated_structure")
        self.assertFalse(result["accepted"])
        self.assertTrue(result["fallback"])
        self.assertEqual(result["servedAnswer"], entry["answer"])

    def test_malformed_null_missing_and_unexpected_shapes_fall_back(self):
        entry = {"id": "tracking", "title": "Track", "answer": "Use the Track page."}

        def wrapped(value):
            return {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": value}]}}]}

        cases = [
            [], None, {}, {"candidates": []}, {"candidates": [None]},
            {"candidates": [{"finishReason": "MAX_TOKENS"}]},
            {"candidates": [{"finishReason": "STOP", "content": {"parts": []}}]},
            wrapped(None), wrapped("{"), wrapped("[]"), wrapped("null"),
            wrapped(json.dumps({"sourceIds": ["tracking"]})),
            wrapped(json.dumps({"answer": None, "sourceIds": ["tracking"]})),
            wrapped(json.dumps({"answer": "Use the Track page.", "sourceIds": None})),
            wrapped(json.dumps({"answer": "Use the Track page.", "sourceIds": [1]})),
        ]
        for response in cases:
            with self.subTest(response=response), patch("benchmark_civicassist_gemini.request_json", return_value=response):
                result = benchmark_case("gemini-3.8-flash", entry, "en", "local-test-key")
                self.assertEqual(result["httpStatus"], 200)
                self.assertFalse(result["accepted"])
                self.assertTrue(result["fallback"])
                self.assertEqual(result["servedAnswer"], entry["answer"])
                self.assertIsNotNone(result["rejectionReason"])
        with patch("benchmark_civicassist_gemini.request_json", side_effect=ValueError("malformed JSON")):
            result = benchmark_case("gemini-3.8-flash", entry, "en", "local-test-key")
        self.assertEqual(result["rejectionReason"], "invalid_response_json")
        self.assertTrue(result["fallback"])

    def test_interruption_preserves_completed_cases(self):
        first = {"httpStatus": 200, "latencyMs": 10.0, "accepted": False, "fallback": True,
                 "citationCorrect": False, "promptTokens": 3, "candidateTokens": 2, "totalTokens": 5}
        with tempfile.TemporaryDirectory() as directory, \
                patch("benchmark_civicassist_gemini.REPORT", Path(directory) / "report.json") as report_path, \
                patch("benchmark_civicassist_gemini.listed_models", return_value={"gemini-3.8-flash": True}), \
                patch("benchmark_civicassist_gemini.benchmark_case", side_effect=[first, KeyboardInterrupt]), \
                patch("benchmark_civicassist_gemini.time.sleep"), \
                patch.dict("os.environ", {"GEMINI_API_KEY": "local-test-key"}), \
                patch("sys.argv", ["benchmark"]):
            self.assertEqual(main(), 130)
            report = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(report["models"]["gemini-3.8-flash"]["summary"]["requests"], 1)
        self.assertEqual(len(report["models"]["gemini-3.8-flash"]["cases"]), 1)
        self.assertIn("Interrupted", report["limitations"][-1])


if __name__ == "__main__":
    unittest.main()
