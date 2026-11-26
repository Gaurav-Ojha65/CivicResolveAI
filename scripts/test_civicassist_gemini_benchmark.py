import unittest
from unittest.mock import patch

from benchmark_civicassist_gemini import CASES, benchmark_case, grounded, knowledge, prompt


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

    def test_live_response_shape_rejects_reversed_meaning(self):
        entry = {"id": "approval", "title": "Approval", "answer":
                 "AI classification does not approve complaints.", "source": "README.md"}
        response = {"candidates": [{"content": {"parts": [{"text":
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


if __name__ == "__main__":
    unittest.main()
