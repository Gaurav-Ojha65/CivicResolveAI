import importlib.util
import sys
from pathlib import Path

import pandas as pd
import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "training" / "inspect_dataset.py"
spec = importlib.util.spec_from_file_location("inspect_dataset", SCRIPT)
inspect_dataset = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = inspect_dataset
assert spec.loader is not None
spec.loader.exec_module(inspect_dataset)


def fixture_data():
    return pd.DataFrame({
        "Date received": ["2025-01-02", "2025-02-03", "2025-04-10", "2025-05-01", "2024-12-30"],
        "Product": ["Credit card", "Debt collection", "Credit card", "Mortgage", "Credit card"],
        "Consumer complaint narrative": [
            "I was charged XXXX dollars after I disputed the payment.",
            "The collector called me several times and threatened me.",
            "XXXX XXXX were included on my statement and the error remains.",
            "My mortgage payment was applied to the wrong account.",
            "This row is outside the requested period.",
        ],
        "Company response to consumer": [None, "Closed with explanation", "", "Closed", "Closed"],
        "Complaint ID": [1, 2, 3, 4, 5],
    })


def test_inspect_computes_actual_fixture_metrics():
    data = fixture_data().iloc[:4].copy()
    data.attrs["source_description"] = "pytest fixture"
    data.attrs["sample_method"] = "deterministic fixture"
    report = inspect_dataset.inspect_dataframe(data, "2025-01-01", "2025-06-30", 25_000)
    assert "Rows inspected in sample: 4" in report
    assert "Narratives containing at least one XXXX mask: 2" in report
    assert "Total XXXX occurrences: 3" in report
    assert "Unique Product labels in usable sample: 3" in report
    assert "Mean:" in report and "95th percentile:" in report
    assert "Product is a consumer financial product category" in report


def test_api_failure_report_does_not_fabricate_metrics(tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise inspect_dataset.DatasetUnavailableError("fixture: live narrative field unavailable")
    monkeypatch.setattr(inspect_dataset, "fetch_official_api", fail)
    monkeypatch.setattr(inspect_dataset, "fetch_historical_snapshot_hf", fail)
    out = tmp_path / "dataset_report.txt"
    rc = inspect_dataset.main(["--output", str(out)])
    report = out.read_text(encoding="utf-8")
    assert rc == 2
    assert "STATUS: BLOCKED" in report
    assert "Row counts: NOT COMPUTED" in report
    assert "XXXX mask frequency: NOT COMPUTED" in report
    assert "fixture: live narrative field unavailable" in report


def test_missing_narrative_field_is_rejected():
    data = pd.DataFrame({"Product": ["Credit card"], "Issue": ["Billing"]})
    with pytest.raises(inspect_dataset.DatasetUnavailableError, match="Missing required fields"):
        inspect_dataset.inspect_dataframe(data, "2025-01-01", "2025-06-30", 100)


def test_limit_validation():
    with pytest.raises(ValueError, match="limit must be between"):
        inspect_dataset.fetch_official_api("2025-01-01", "2025-06-30", 100_001)


def test_local_csv_archive_filters_dates_and_uses_seeded_limit(tmp_path):
    source = tmp_path / "archive.csv"
    fixture_data().to_csv(source, index=False)
    data = inspect_dataset._read_archive_chunks(
        source, "2025-01-01", "2025-06-30", limit=2, chunksize=2
    )
    assert len(data) == 2
    assert data.attrs["eligible_records_seen"] == 4
    dates = pd.to_datetime(data["Date received"], errors="coerce")
    assert dates.min() >= pd.Timestamp("2025-01-01")
    assert dates.max() <= pd.Timestamp("2025-06-30")


def test_historical_snapshot_viewer_parser_with_mocked_response(monkeypatch):
    import json
    from urllib.parse import parse_qs, urlparse

    page_rows = [
        {"row_idx": 10, "row": {"date_received": "2025-01-02", "product": "Credit card", "narrative": "I was charged XXXX twice."}},
        {"row_idx": 11, "row": {"date_received": "2025-04-08", "product": "Mortgage", "narrative": "My payment was applied incorrectly."}},
    ]

    class FakeResponse:
        def __init__(self, payload):
            self.payload = json.dumps(payload).encode("utf-8")
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def read(self):
            return self.payload

    def fake_urlopen(request, timeout=30):
        parsed = urlparse(request.full_url)
        query = parse_qs(parsed.query)
        assert query["dataset"][0] == "vivekkopthsd/cfpb-consumer-complaints"
        if query["length"][0] == "1":
            return FakeResponse({"num_rows_total": 2, "partial": False, "rows": [page_rows[0]]})
        return FakeResponse({"num_rows_total": 2, "partial": False, "rows": page_rows})

    monkeypatch.setattr(inspect_dataset.urllib.request, "urlopen", fake_urlopen)
    data = inspect_dataset.fetch_historical_snapshot_hf("2025-01-01", "2025-06-30", limit=2)
    assert len(data) == 2
    assert set(data["product"]) == {"Credit card", "Mortgage"}
    assert data.attrs["eligible_records_seen"] == 2
    assert "third-party mirror" in data.attrs["source_description"]
