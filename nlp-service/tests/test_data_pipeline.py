"""CivicResolve AI — Data pipeline tests (Pre-Split Narrative Deduplication).

Tests verify:
- Deterministic narrative normalization works across case, whitespace, nulls.
- Clean narrative function removes XXXX masks correctly.
- No normalized narrative appears in more than one split (zero leakage).
- No duplicate normalized narratives remain within any split.
- No ambiguous-label narrative groups remain.
- No missing text or product_category labels in any split.
- Only approved categories remain in all splits.
- Complaint IDs do not overlap between splits.
- Train, validation, and test counts and class distributions match manifest.
- Stratification within +-5% relative tolerance per class.
- Output columns are exactly [complaint_id, text, product_category].
- No metadata columns leaked.
- Splits are reproducible with the same seed.
- Real processed dataset passes full data-quality gate.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Load data_split module
# ---------------------------------------------------------------------------

SCRIPT = Path(__file__).resolve().parents[1] / "training" / "data_split.py"
spec = importlib.util.spec_from_file_location("data_split", SCRIPT)
data_split = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = data_split
assert spec.loader is not None
spec.loader.exec_module(data_split)

APPROVED_LABELS = data_split.APPROVED_LABELS
APPROVED_SET = set(APPROVED_LABELS)
PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _make_fixture_archive(tmp_path: Path, n_per_class: int = 60) -> Path:
    """Create a minimal in-memory CSV ZIP mimicking the CFPB archive format."""
    import zipfile

    rows = []
    complaint_id = 1000
    for label in APPROVED_LABELS:
        for i in range(n_per_class):
            rows.append({
                "Date received": "2025-05-15",
                "Product": label,
                "Sub-product": "Some sub-product",
                "Issue": "Billing dispute",
                "Sub-issue": "",
                "Consumer complaint narrative": (
                    f"I had a serious problem with my {label.lower()} account. "
                    f"They charged me XXXX dollars without explanation. "
                    f"Case number {complaint_id}."
                ),
                "Company public response": "",
                "Company": "ACME Financial",
                "State": "CA",
                "ZIP code": "90210",
                "Tags": "",
                "Submitted via": "Web",
                "Date sent to company": "2025-05-16",
                "Company response to consumer": "Closed with explanation",
                "Timely response?": "Yes",
                "Complaint ID": complaint_id,
            })
            complaint_id += 1

    # Add duplicate normalized narratives with SAME label (should be deduplicated to 1 canonical)
    rows.append({
        "Date received": "2025-05-15",
        "Product": "Credit card",
        "Sub-product": "",
        "Issue": "Billing dispute",
        "Sub-issue": "",
        "Consumer complaint narrative": "Identical boilerplate narrative for duplicate test.",
        "Company public response": "",
        "Company": "ACME Financial",
        "State": "CA",
        "ZIP code": "90210",
        "Tags": "",
        "Submitted via": "Web",
        "Date sent to company": "2025-05-16",
        "Company response to consumer": "Closed",
        "Timely response?": "Yes",
        "Complaint ID": complaint_id,
    })
    complaint_id += 1
    rows.append({
        "Date received": "2025-05-15",
        "Product": "Credit card",
        "Sub-product": "",
        "Issue": "Billing dispute",
        "Sub-issue": "",
        "Consumer complaint narrative": "  identical boilerplate   narrative for duplicate test.  ",
        "Company public response": "",
        "Company": "ACME Financial",
        "State": "CA",
        "ZIP code": "90210",
        "Tags": "",
        "Submitted via": "Web",
        "Date sent to company": "2025-05-16",
        "Company response to consumer": "Closed",
        "Timely response?": "Yes",
        "Complaint ID": complaint_id,
    })
    complaint_id += 1

    # Add conflicting-label narrative group (same narrative across multiple Product labels -> excluded)
    rows.append({
        "Date received": "2025-05-15",
        "Product": "Credit card",
        "Sub-product": "",
        "Issue": "Billing dispute",
        "Sub-issue": "",
        "Consumer complaint narrative": "Conflicting multi-label narrative boilerplate text.",
        "Company public response": "",
        "Company": "ACME Financial",
        "State": "CA",
        "ZIP code": "90210",
        "Tags": "",
        "Submitted via": "Web",
        "Date sent to company": "2025-05-16",
        "Company response to consumer": "Closed",
        "Timely response?": "Yes",
        "Complaint ID": complaint_id,
    })
    complaint_id += 1
    rows.append({
        "Date received": "2025-05-15",
        "Product": "Debt collection",
        "Sub-product": "",
        "Issue": "Billing dispute",
        "Sub-issue": "",
        "Consumer complaint narrative": "  conflicting multi-label narrative boilerplate text. ",
        "Company public response": "",
        "Company": "ACME Financial",
        "State": "CA",
        "ZIP code": "90210",
        "Tags": "",
        "Submitted via": "Web",
        "Date sent to company": "2025-05-16",
        "Company response to consumer": "Closed",
        "Timely response?": "Yes",
        "Complaint ID": complaint_id,
    })
    complaint_id += 1

    # Add extra non-approved label rows
    for i in range(5):
        rows.append({
            "Date received": "2025-05-15",
            "Product": "Payday loan, title loan, personal loan, or advance loan",
            "Sub-product": "",
            "Issue": "Loan issue",
            "Sub-issue": "",
            "Consumer complaint narrative": f"Payday loan complaint {i}",
            "Company public response": "",
            "Company": "FastCash",
            "State": "TX",
            "ZIP code": "75001",
            "Tags": "",
            "Submitted via": "Web",
            "Date sent to company": "2025-05-16",
            "Company response to consumer": "Closed",
            "Timely response?": "Yes",
            "Complaint ID": complaint_id,
        })
        complaint_id += 1

    # Add a duplicate Complaint ID (same as the first row created)
    dup_row = dict(rows[0])
    dup_row["Consumer complaint narrative"] = "Duplicate complaint text with same ID"
    rows.append(dup_row)

    # Add an out-of-window row that must be excluded
    out_of_window_row = dict(rows[1])
    out_of_window_row["Date received"] = "2025-04-01"
    out_of_window_row["Complaint ID"] = complaint_id
    rows.append(out_of_window_row)

    df = pd.DataFrame(rows)
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    zip_path = tmp_path / "test_archive.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("test_complaints.csv", csv_bytes)
    return zip_path


# ---------------------------------------------------------------------------
# Unit tests: clean_narrative and normalize_narrative
# ---------------------------------------------------------------------------

class TestCleanAndNormalizeNarrative:

    def test_removes_xxxx_case_insensitive(self):
        text = "I was charged XXXX and xxxx dollars."
        result = data_split.clean_narrative(text)
        assert "XXXX" not in result
        assert "xxxx" not in result

    def test_removes_whole_word_only(self):
        text = "Reference XXXXX was filed."
        result = data_split.clean_narrative(text)
        assert "XXXXX" in result

    def test_collapses_multiple_spaces(self):
        text = "Hello   world   there"
        result = data_split.clean_narrative(text)
        assert "  " not in result
        assert "Hello world there" == result

    def test_strips_leading_trailing(self):
        text = "   Hello XXXX world   "
        result = data_split.clean_narrative(text)
        assert result == result.strip()

    def test_empty_string_stays_empty(self):
        assert data_split.clean_narrative("") == ""

    def test_only_xxxx_becomes_empty(self):
        result = data_split.clean_narrative("XXXX XXXX XXXX")
        assert result.strip() == ""

    def test_normalization_lowercase_and_whitespace(self):
        raw = "   Disputed   Account\n\nUnder  FCRA  Section 609.\t"
        norm = data_split.normalize_narrative(raw)
        assert norm == "disputed account under fcra section 609."

    def test_normalization_handles_none_empty_safely(self):
        assert data_split.normalize_narrative(None) == ""
        assert data_split.normalize_narrative("") == ""
        assert data_split.normalize_narrative(float("nan")) == ""


# ---------------------------------------------------------------------------
# Integration tests: build_pipeline on Fixture
# ---------------------------------------------------------------------------

class TestBuildPipeline:

    def test_pipeline_produces_three_csvs_and_manifest(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        manifest = data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        assert (out_dir / "train.csv").exists(), "train.csv not created"
        assert (out_dir / "val.csv").exists(), "val.csv not created"
        assert (out_dir / "test.csv").exists(), "test.csv not created"
        assert (out_dir / "split_manifest.json").exists(), "split_manifest.json not created"
        assert manifest is not None

    def test_no_cross_split_normalized_narrative_overlap(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        train = pd.read_csv(out_dir / "train.csv")
        val = pd.read_csv(out_dir / "val.csv")
        test = pd.read_csv(out_dir / "test.csv")

        norm_train = set(train["text"].map(data_split.normalize_narrative))
        norm_val = set(val["text"].map(data_split.normalize_narrative))
        norm_test = set(test["text"].map(data_split.normalize_narrative))

        assert not (norm_train & norm_val), "Cross-split overlap between train and val"
        assert not (norm_train & norm_test), "Cross-split overlap between train and test"
        assert not (norm_val & norm_test), "Cross-split overlap between val and test"

    def test_no_duplicate_normalized_narratives_within_any_split(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        for split_name in ("train", "val", "test"):
            df = pd.read_csv(out_dir / f"{split_name}.csv")
            norms = df["text"].map(data_split.normalize_narrative)
            dups = norms.duplicated().sum()
            assert dups == 0, f"{split_name} contains {dups} duplicate normalized narratives"

    def test_no_ambiguous_label_narrative_groups_remain(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        all_splits = pd.concat([
            pd.read_csv(out_dir / "train.csv"),
            pd.read_csv(out_dir / "val.csv"),
            pd.read_csv(out_dir / "test.csv"),
        ], ignore_index=True)
        all_splits["norm"] = all_splits["text"].map(data_split.normalize_narrative)
        multi_label = all_splits.groupby("norm")["product_category"].nunique()
        assert (multi_label > 1).sum() == 0, "Found narrative associated with >1 product category"

    def test_no_overlapping_complaint_ids(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        train = pd.read_csv(out_dir / "train.csv")
        val = pd.read_csv(out_dir / "val.csv")
        test = pd.read_csv(out_dir / "test.csv")

        ids_train = set(train["complaint_id"].astype(str))
        ids_val = set(val["complaint_id"].astype(str))
        ids_test = set(test["complaint_id"].astype(str))

        assert not (ids_train & ids_val), "Train/Val ID overlap"
        assert not (ids_train & ids_test), "Train/Test ID overlap"
        assert not (ids_val & ids_test), "Val/Test ID overlap"

    def test_no_missing_text_or_labels(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        for split_name in ("train", "val", "test"):
            df = pd.read_csv(out_dir / f"{split_name}.csv")
            missing_text = df["text"].isna() | df["text"].astype(str).str.strip().eq("")
            missing_label = df["product_category"].isna() | df["product_category"].astype(str).str.strip().eq("")
            assert not missing_text.any(), f"{split_name}: missing text"
            assert not missing_label.any(), f"{split_name}: missing label"

    def test_only_approved_labels_present(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        for split_name in ("train", "val", "test"):
            df = pd.read_csv(out_dir / f"{split_name}.csv")
            unexpected = set(df["product_category"].unique()) - APPROVED_SET
            assert not unexpected, f"{split_name}: unexpected labels: {unexpected}"

    def test_output_columns_are_exactly_correct(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        expected_cols = {"complaint_id", "text", "product_category"}
        forbidden_cols = {
            "norm", "narrative_raw", "sub-product", "issue", "company", "state", "tags"
        }
        for split_name in ("train", "val", "test"):
            df = pd.read_csv(out_dir / f"{split_name}.csv")
            actual_cols = {c.lower() for c in df.columns}
            assert actual_cols == expected_cols
            assert not (actual_cols & forbidden_cols)

    def test_stratification_within_tolerance(self, tmp_path):
        archive = _make_fixture_archive(tmp_path, n_per_class=60)
        out_dir = tmp_path / "processed"
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        train = pd.read_csv(out_dir / "train.csv")
        val = pd.read_csv(out_dir / "val.csv")
        test = pd.read_csv(out_dir / "test.csv")
        full = pd.concat([train, val, test], ignore_index=True)

        full_dist = (full["product_category"].value_counts() / len(full)).to_dict()
        for split_name, df in (("train", train), ("val", val), ("test", test)):
            split_dist = (df["product_category"].value_counts() / len(df)).to_dict()
            for label, overall_pct in full_dist.items():
                split_pct = split_dist.get(label, 0.0)
                diff = abs(split_pct - overall_pct)
                assert diff <= 0.05, f"{split_name}: label {label} diff {diff:.3f} > 5%"

    def test_manifest_accounting_consistency(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir = tmp_path / "processed"
        manifest = data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir,
        )
        rc = manifest["row_counts"]
        assert rc["train"] + rc["val"] + rc["test"] == rc["retained_for_splitting"]
        assert rc["conflicting_narrative_groups_excluded"] >= 1
        assert rc["duplicate_narratives_removed"] >= 1

    def test_splits_are_reproducible_with_same_seed(self, tmp_path):
        archive = _make_fixture_archive(tmp_path)
        out_dir_1 = tmp_path / "processed_1"
        out_dir_2 = tmp_path / "processed_2"

        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir_1,
        )
        data_split.build_pipeline(
            archive=archive,
            start_date="2025-05-11",
            end_date="2025-06-30",
            output_dir=out_dir_2,
        )

        for name in ("train.csv", "val.csv", "test.csv"):
            df1 = pd.read_csv(out_dir_1 / name)
            df2 = pd.read_csv(out_dir_2 / name)
            pd.testing.assert_frame_equal(df1, df2)

    def test_missing_archive_raises_file_not_found(self, tmp_path):
        out_dir = tmp_path / "processed"
        with pytest.raises(FileNotFoundError, match="Archive not found"):
            data_split.build_pipeline(
                archive=tmp_path / "nonexistent.zip",
                start_date="2025-05-11",
                end_date="2025-06-30",
                output_dir=out_dir,
            )


# ---------------------------------------------------------------------------
# Verification tests on Real Processed Dataset
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not (PROCESSED_DIR / "split_manifest.json").exists(),
    reason="Real processed dataset not yet generated.",
)
class TestRealProcessedDataset:

    @pytest.fixture(scope="class")
    @classmethod
    def real_splits(cls):
        train = pd.read_csv(PROCESSED_DIR / "train.csv")
        val = pd.read_csv(PROCESSED_DIR / "val.csv")
        test = pd.read_csv(PROCESSED_DIR / "test.csv")
        with (PROCESSED_DIR / "split_manifest.json").open(encoding="utf-8") as f:
            manifest = json.load(f)
        return {"train": train, "val": val, "test": test, "manifest": manifest}

    def test_manifest_row_counts_match_csvs(self, real_splits):
        rc = real_splits["manifest"]["row_counts"]
        assert len(real_splits["train"]) == rc["train"] == 59389
        assert len(real_splits["val"]) == rc["val"] == 12726
        assert len(real_splits["test"]) == rc["test"] == 12727
        assert rc["retained_for_splitting"] == 84842

    def test_real_splits_zero_cross_split_leakage(self, real_splits):
        train = real_splits["train"]
        val = real_splits["val"]
        test = real_splits["test"]

        train_norms = set(train["text"].map(data_split.normalize_narrative))
        val_norms = set(val["text"].map(data_split.normalize_narrative))
        test_norms = set(test["text"].map(data_split.normalize_narrative))

        assert len(train_norms & val_norms) == 0, "Found cross-split narrative overlap train/val"
        assert len(train_norms & test_norms) == 0, "Found cross-split narrative overlap train/test"
        assert len(val_norms & test_norms) == 0, "Found cross-split narrative overlap val/test"

    def test_real_splits_zero_duplicate_narratives_within_split(self, real_splits):
        for name in ("train", "val", "test"):
            df = real_splits[name]
            norms = df["text"].map(data_split.normalize_narrative)
            assert norms.duplicated().sum() == 0, f"Found duplicates within {name}"

    def test_real_splits_zero_ambiguous_label_narratives(self, real_splits):
        combined = pd.concat([
            real_splits["train"],
            real_splits["val"],
            real_splits["test"],
        ], ignore_index=True)
        combined["norm"] = combined["text"].map(data_split.normalize_narrative)
        conflicts = combined.groupby("norm")["product_category"].nunique()
        assert (conflicts > 1).sum() == 0, "Ambiguous multi-label narratives found in real splits"

    def test_real_splits_zero_overlapping_complaint_ids(self, real_splits):
        c_train = set(real_splits["train"]["complaint_id"])
        c_val = set(real_splits["val"]["complaint_id"])
        c_test = set(real_splits["test"]["complaint_id"])

        assert len(c_train & c_val) == 0, "Complaint ID overlap train/val"
        assert len(c_train & c_test) == 0, "Complaint ID overlap train/test"
        assert len(c_val & c_test) == 0, "Complaint ID overlap val/test"

    def test_real_splits_only_approved_labels(self, real_splits):
        for name in ("train", "val", "test"):
            cats = set(real_splits[name]["product_category"].unique())
            assert cats.issubset(APPROVED_SET)

    def test_real_splits_class_distribution_matches_manifest(self, real_splits):
        manifest_dist = real_splits["manifest"]["class_distribution"]
        for name in ("train", "val", "test"):
            actual_dist = real_splits[name]["product_category"].value_counts().to_dict()
            assert actual_dist == manifest_dist[name], f"Distribution mismatch in {name}"
