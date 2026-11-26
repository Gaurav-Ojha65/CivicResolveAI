"""Small, public-knowledge-only Gemini comparison. Invoked by the secure PowerShell wrapper."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import statistics
import sys
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE = ROOT / "backend/src/main/resources/assistant/knowledge.tsv"
REPORT = ROOT / "backend/target/civicassist_gemini_benchmark.json"
API = "https://generativelanguage.googleapis.com/v1beta/models"
MODELS = ("gemini-3.8-flash", "gemini-3.5-flash-lite")
CASES = (
    ("tracking", "en", "English tracking", None),
    ("confidence", "en", "English model explanation", None),
    ("approved_status", "en", "English status/negation", None),
    ("submit_hi", "hi", "Hindi intake", None),
    ("tracking_hi", "hi", "Hinglish tracking resolved locally", None),
    ("secret_hi", "hi", "Hinglish follow-up resolved locally", "tracking_hi"),
)
MARKERS = {"no", "not", "never", "only", "must", "may", "can", "cannot", "should",
           "without", "except", "before", "after", "all", "every", "always",
           "नहीं", "केवल", "सिर्फ", "बिना", "ज़रूरी", "अनिवार्य"}


def words(value: str) -> list[str]:
    result: list[str] = []
    current = ""
    for char in unicodedata.normalize("NFKC", value).lower():
        if unicodedata.category(char)[0] in "LMN":
            current += char
        elif current:
            result.append(current)
            current = ""
    if current:
        result.append(current)
    return result


def grounded(answer: str, approved: str) -> bool:
    source, output = words(approved), words(answer)
    if not output:
        return False
    index = 0
    for word in output:
        while index < len(source) and source[index] != word:
            index += 1
        if index == len(source):
            return False
        index += 1
    source_count, output_count = Counter(source), Counter(output)
    return all(source_count[word] == output_count[word] for word in MARKERS) and all(
        source_count[word] == output_count[word] for word in source if word.isdigit()
    )


def knowledge() -> dict[str, dict[str, str]]:
    entries = {}
    for line in KNOWLEDGE.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        fields = line.split("|")
        if len(fields) != 10:
            raise ValueError("Malformed curated knowledge entry")
        item = dict(zip(("id", "category", "version", "title", "audience", "route",
                         "language", "aliases", "answer", "source"), fields))
        entries[item["id"]] = item
    for identifier, language, _, previous in CASES:
        entry = entries[identifier]
        if entry["audience"] != "PUBLIC" or entry["language"] != language:
            raise ValueError("Benchmark case must use matching approved public knowledge")
        if previous and entries[previous]["audience"] != "PUBLIC":
            raise ValueError("Follow-up context must use public knowledge")
    return entries


def request_json(url: str, key: str, payload: dict | None, timeout: int) -> dict:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=body, headers={"x-goog-api-key": key,
                      "Content-Type": "application/json"}, method="GET" if body is None else "POST")
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def listed_models(key: str) -> dict[str, bool]:
    found: dict[str, bool] = {}
    page_token = ""
    while True:
        url = API + "?pageSize=1000" + ("&pageToken=" + quote(page_token, safe="") if page_token else "")
        data = request_json(url, key, None, 15)
        for model in data.get("models", []):
            name = model.get("name", "").removeprefix("models/")
            if name in MODELS:
                found[name] = "generateContent" in model.get("supportedGenerationMethods", [])
        page_token = data.get("nextPageToken", "")
        if not page_token:
            break
    return found


def prompt(entry: dict[str, str], language: str) -> str:
    return ("Rewrite only this approved public CivicResolve knowledge in plain "
            + ("Hindi" if language == "hi" else "English") + ". "
            + "Do not add facts, links, advice or instructions. Return JSON with answer and sourceIds. "
            + "The only allowed source ID is " + entry["id"] + ". Canonical question: "
            + entry["title"] + ". Approved answer: " + entry["answer"])


def benchmark_case(model: str, entry: dict[str, str], language: str, key: str) -> dict:
    payload = {"contents": [{"parts": [{"text": prompt(entry, language)}]}],
               "generationConfig": {"maxOutputTokens": 220, "temperature": 0.1,
                                    "responseMimeType": "application/json"}}
    start = time.perf_counter()
    result = {"httpStatus": None, "latencyMs": None, "generatedAnswer": None,
              "servedAnswer": entry["answer"], "citationCorrect": False, "accepted": False,
              "fallback": True, "promptTokens": None, "candidateTokens": None, "totalTokens": None,
              "finishReason": None, "humanScores": {"factualCorrectness": None,
              "relevance": None, "completeness": None, "simplicity": None, "languageQuality": None}}
    try:
        response = request_json(API + "/" + model + ":generateContent", key, payload, 8)
        result["httpStatus"] = 200
        usage = response.get("usageMetadata", {})
        for field, api_field in (("promptTokens", "promptTokenCount"),
                                 ("candidateTokens", "candidatesTokenCount"),
                                 ("totalTokens", "totalTokenCount")):
            result[field] = usage.get(api_field)
        candidate = response.get("candidates", [{}])[0]
        result["finishReason"] = candidate.get("finishReason")
        raw = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
        parsed = json.loads(raw)
        answer = parsed.get("answer")
        citations = parsed.get("sourceIds")
        result["citationCorrect"] = citations == [entry["id"]]
        if isinstance(answer, str):
            result["generatedAnswer"] = answer
            result["accepted"] = (result["citationCorrect"] and 0 < len(answer.strip()) <= 700
                                  and "http://" not in answer and "https://" not in answer
                                  and grounded(answer.strip(), entry["answer"]))
            if result["accepted"]:
                result["servedAnswer"] = answer.strip()
                result["fallback"] = False
    except HTTPError as error:
        result["httpStatus"] = error.code
    except (URLError, TimeoutError, ValueError, IndexError, KeyError, TypeError):
        if result["httpStatus"] is None:
            result["httpStatus"] = "network_error"
    finally:
        result["latencyMs"] = round((time.perf_counter() - start) * 1000, 1)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Validate public cases without an API call")
    args = parser.parse_args()
    entries = knowledge()
    if args.dry_run:
        print(f"Validated {len(CASES)} approved public cases; no API requests sent.")
        return 0
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        print("GEMINI_API_KEY is unavailable; run the secure PowerShell wrapper.", file=sys.stderr)
        return 2
    try:
        available = listed_models(key)
    except (HTTPError, URLError, TimeoutError, ValueError):
        print("Could not verify this account's model list; no generation requests sent.", file=sys.stderr)
        return 3
    report = {"runAtUtc": datetime.now(timezone.utc).isoformat(), "method": "Six approved public entries per model; production-compatible prompt and safety gate",
              "modelList": available, "models": {}, "limitations": ["Account billing tier requires user confirmation in AI Studio.",
              "Human quality scores are unfilled until a reviewer scores public answers.",
              "This direct API benchmark does not measure full application or browser latency."]}
    for model in MODELS:
        if not available.get(model, False):
            report["models"][model] = {"unavailable": "Not listed with generateContent for this key"}
            continue
        rows = []
        for identifier, language, scenario, previous in CASES:
            entry = entries[identifier]
            outcome = benchmark_case(model, entry, language, key)
            rows.append({"caseId": identifier, "language": language, "scenario": scenario,
                         "previousKnowledgeId": previous, "canonicalQuestion": entry["title"],
                         "source": entry["source"], "approvedAnswer": entry["answer"], **outcome})
            if outcome["httpStatus"] == 429:
                report["limitations"].append("Stopped after HTTP 429 to preserve free quota.")
                break
            time.sleep(2)
        latencies = [row["latencyMs"] for row in rows if row["httpStatus"] == 200]
        report["models"][model] = {"cases": rows, "summary": {
            "requests": len(rows), "http200": sum(row["httpStatus"] == 200 for row in rows),
            "accepted": sum(row["accepted"] for row in rows),
            "fallbacks": sum(row["fallback"] for row in rows),
            "citationCorrect": sum(row["citationCorrect"] for row in rows),
            "medianLatencyMs": round(statistics.median(latencies), 1) if latencies else None,
            "promptTokens": sum(row["promptTokens"] or 0 for row in rows),
            "candidateTokens": sum(row["candidateTokens"] or 0 for row in rows),
            "totalTokens": sum(row["totalTokens"] or 0 for row in rows)}}
        if rows and rows[-1]["httpStatus"] == 429:
            break
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Saved public-output benchmark to", REPORT)
    for model, data in report["models"].items():
        print(model, data.get("summary", data.get("unavailable")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
