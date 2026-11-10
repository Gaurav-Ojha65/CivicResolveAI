#!/usr/bin/env python3
"""CivicResolve AI — Reproducible Data Pipeline with Pre-Split Narrative Deduplication.

Reads the full eligible date window from the raw CFPB ZIP archive without
extracting or modifying it, cleans narratives, deduplicates by Complaint ID,
normalizes narratives, eliminates ambiguous multi-label narrative groups,
deduplicates identical narratives to one canonical representative, restricts
to eight approved Product categories, and applies a stratified 70/15/15 split
(seed=42) producing train/val/test splits with zero cross-split narrative leakage.

Usage
-----
python nlp-service/training/data_split.py \\
    --csv nlp-service/data/raw/cfpb_2025_may_june.zip \\
    --start-date 2025-05-11 \\
    --end-date 2025-06-30 \\
    --output-dir nlp-service/data/processed

Model input is exclusively ``text`` (cleaned complaint narrative).
Target is ``product_category``.
``complaint_id`` is retained strictly for audit/provenance and must never enter
the model feature matrix.
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_CSV = Path(__file__).resolve().parents[1] / "data" / "raw" / "cfpb_2025_may_june.zip"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"
DEFAULT_START = "2025-05-11"
DEFAULT_END = "2025-06-30"
RANDOM_SEED = 42
TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
TEST_RATIO = 0.15
CHUNK_SIZE = 50_000  # rows per pandas chunk; tune if memory is tight

# Minimum samples per class to allow a valid stratified split into three folds.
MIN_SAMPLES_PER_CLASS = 10

# Approved Product labels for the initial experiment.
APPROVED_LABELS: list[str] = [
    "Credit reporting or other personal consumer reports",
    "Debt collection",
    "Credit card",
    "Checking or savings account",
    "Money transfer, virtual currency, or money service",
    "Mortgage",
    "Student loan",
    "Vehicle loan or lease",
]

# Column aliases that may appear in different CFPB export versions.
_ALIAS_MAP: dict[str, set[str]] = {
    "narrative": {
        "consumer complaint narrative",
        "consumer_complaint_narrative",
        "consumer narrative",
        "consumer_narrative",
        "narrative",
    },
    "product": {"product"},
    "date_received": {"date received", "date_received", "date"},
    "complaint_id": {"complaint id", "complaint_id", "complaintid"},
}


# ---------------------------------------------------------------------------
# Column resolution
# ---------------------------------------------------------------------------

def _norm(name: object) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _resolve_columns(columns: list[str]) -> dict[str, str]:
    """Return mapping logical_name -> actual_column_name."""
    norm_to_actual = {_norm(c): c for c in columns}
    found: dict[str, str] = {}
    for logical, aliases in _ALIAS_MAP.items():
        for alias in aliases:
            if _norm(alias) in norm_to_actual:
                found[logical] = norm_to_actual[_norm(alias)]
                break
    return found


# ---------------------------------------------------------------------------
# Text cleaning and normalization
# ---------------------------------------------------------------------------

_XXXX_RE = re.compile(r"(?i)\bX{4}\b")
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_NORMALIZE_WS_RE = re.compile(r"\s+")


def clean_narrative(text: str) -> str:
    """Clean a single narrative string reproducibly.

    Steps (documented for manifest):
    1. Strip leading/trailing whitespace.
    2. Remove case-insensitive XXXX redaction masks (whole-word).
    3. Collapse multiple consecutive spaces/tabs to a single space.
    4. Collapse 3+ consecutive newlines to two.
    5. Strip again.

    The original raw archive is never modified.
    """
    if text is None or pd.isna(text):
        return ""
    text = str(text).strip()
    text = _XXXX_RE.sub("", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    return text.strip()


def normalize_narrative(text: object) -> str:
    """Deterministic narrative normalization for deduplication and leakage auditing.

    Steps:
    1. Handle null, empty string, or NaN safely (returns empty string).
    2. Convert text to lowercase.
    3. Strip leading and trailing whitespace.
    4. Collapse consecutive whitespace (spaces, tabs, newlines) into a single space.
    """
    if text is None or pd.isna(text):
        return ""
    t = str(text).strip().lower()
    return _NORMALIZE_WS_RE.sub(" ", t)


PREPROCESSING_STEPS = [
    "Strip leading/trailing whitespace from raw narrative.",
    "Remove case-insensitive whole-word XXXX redaction masks (regex \\bX{4}\\b, re.IGNORECASE).",
    "Collapse multiple consecutive spaces/tabs to a single space.",
    "Collapse 3+ consecutive newlines to two newlines.",
    "Strip result again.",
    "Rows with empty cleaned text after these steps are excluded and counted.",
]

NORMALIZATION_STEPS = [
    "Convert cleaned text to lowercase.",
    "Strip leading and trailing whitespace.",
    "Collapse consecutive whitespace into a single space.",
    "Handle null or empty text safely (returns empty string).",
]


# ---------------------------------------------------------------------------
# Chunked reading from ZIP
# ---------------------------------------------------------------------------

def _iter_eligible_chunks(
    archive: Path,
    start_date: str,
    end_date: str,
    chunk_size: int = CHUNK_SIZE,
) -> Iterator[pd.DataFrame]:
    """Yield chunks of eligible rows (date-filtered, non-empty narrative+product).

    Reads directly from the ZIP via pandas with compression='zip'; never
    extracts the archive.  Resolves column aliases on the first chunk.
    """
    start_ts = pd.Timestamp(start_date)
    end_ts = pd.Timestamp(end_date) + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1)
    fields: dict[str, str] | None = None

    compression = "zip" if archive.suffix.lower() == ".zip" else "infer"
    reader = pd.read_csv(
        archive,
        compression=compression,
        chunksize=chunk_size,
        low_memory=False,
    )
    for chunk in reader:
        if fields is None:
            fields = _resolve_columns([str(c) for c in chunk.columns])
            required = {"narrative", "product", "date_received", "complaint_id"}
            missing = required - fields.keys()
            if missing:
                raise ValueError(
                    f"Archive missing required column(s): {sorted(missing)}. "
                    f"Available columns: {list(chunk.columns)}"
                )

        narr_col = fields["narrative"]
        prod_col = fields["product"]
        date_col = fields["date_received"]
        id_col = fields["complaint_id"]

        dates = pd.to_datetime(chunk[date_col], errors="coerce", utc=True).dt.tz_convert(None)
        narrative = chunk[narr_col].fillna("").astype(str).str.strip()
        products = chunk[prod_col].fillna("").astype(str).str.strip()

        eligible_mask = (
            dates.between(start_ts, end_ts)
            & narrative.ne("")
            & products.ne("")
        )
        eligible = chunk.loc[eligible_mask, [id_col, narr_col, prod_col]].copy()
        eligible.columns = ["complaint_id", "narrative_raw", "product_category"]
        if not eligible.empty:
            yield eligible


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def build_pipeline(
    archive: Path,
    start_date: str,
    end_date: str,
    output_dir: Path,
    chunk_size: int = CHUNK_SIZE,
) -> dict:
    """Execute the reproducible data pipeline and return the manifest dict."""

    if not archive.exists():
        raise FileNotFoundError(f"Archive not found: {archive}")

    output_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Step 1 — read full eligible dataset from archive
    # ------------------------------------------------------------------
    print(f"[Data Pipeline] Reading full eligible dataset from: {archive}")
    print(f"                Date window: {start_date} through {end_date}")

    all_chunks: list[pd.DataFrame] = []
    total_eligible = 0

    for i, chunk in enumerate(_iter_eligible_chunks(archive, start_date, end_date, chunk_size)):
        total_eligible += len(chunk)
        all_chunks.append(chunk)
        if (i + 1) % 10 == 0:
            print(f"                ... processed chunk {i+1}, eligible rows so far: {total_eligible:,}")

    if not all_chunks:
        raise RuntimeError(
            f"No eligible rows found in {archive} for date window "
            f"{start_date} through {end_date}."
        )

    df = pd.concat(all_chunks, ignore_index=True)
    print(f"[Data Pipeline] Total eligible rows read: {len(df):,}")

    # ------------------------------------------------------------------
    # Step 2 — count raw product distribution before any filtering
    # ------------------------------------------------------------------
    raw_product_counts: dict[str, int] = df["product_category"].value_counts().to_dict()
    print(f"[Data Pipeline] Unique product labels in full eligible window: {df['product_category'].nunique()}")

    # ------------------------------------------------------------------
    # Step 3 — deduplicate by Complaint ID
    # ------------------------------------------------------------------
    n_before_dedup = len(df)
    df = df.drop_duplicates(subset=["complaint_id"], keep="first")
    n_complaint_id_duplicates_removed = n_before_dedup - len(df)
    print(
        f"[Data Pipeline] Rows after Complaint ID deduplication: {len(df):,} "
        f"(removed {n_complaint_id_duplicates_removed:,} duplicate Complaint IDs)"
    )

    # ------------------------------------------------------------------
    # Step 4 — clean narratives
    # ------------------------------------------------------------------
    print("[Data Pipeline] Cleaning narratives ...")
    df["text"] = df["narrative_raw"].map(clean_narrative)

    # Exclude rows where cleaning produced empty text
    mask_empty_text = df["text"].str.strip().eq("")
    n_excluded_empty_text = int(mask_empty_text.sum())
    df = df[~mask_empty_text].copy()
    print(
        f"[Data Pipeline] Rows after empty-text exclusion: {len(df):,} "
        f"(excluded {n_excluded_empty_text:,} rows with empty text post-cleaning)"
    )

    # ------------------------------------------------------------------
    # Step 5 — normalize narrative for duplicate detection & grouping
    # ------------------------------------------------------------------
    print("[Data Pipeline] Normalizing narratives for grouping ...")
    df["norm"] = df["text"].map(normalize_narrative)

    # ------------------------------------------------------------------
    # Step 6 — identify and exclude conflicting-label narrative groups
    # ------------------------------------------------------------------
    # Group by normalized narrative and check distinct Product labels
    label_counts_per_norm = df.groupby("norm")["product_category"].nunique()
    conflicting_norm_groups = label_counts_per_norm[label_counts_per_norm > 1]
    n_conflicting_groups = len(conflicting_norm_groups)

    mask_conflict = df["norm"].isin(conflicting_norm_groups.index)
    n_conflicting_records = int(mask_conflict.sum())
    df_non_conflict = df[~mask_conflict].copy()

    print(
        f"[Data Pipeline] Conflicting-label narrative groups: {n_conflicting_groups:,} "
        f"({n_conflicting_records:,} original records excluded completely)"
    )

    # ------------------------------------------------------------------
    # Step 7 — retain one deterministic canonical representative per group
    # ------------------------------------------------------------------
    # Sort deterministically by numeric complaint_id where available, then string
    cid_numeric = pd.to_numeric(df_non_conflict["complaint_id"], errors="coerce")
    df_non_conflict["_sort_key"] = cid_numeric.fillna(float("inf"))

    df_canonical = (
        df_non_conflict.sort_values(by=["_sort_key", "complaint_id"], ascending=[True, True])
        .drop_duplicates(subset=["norm"], keep="first")
        .drop(columns=["_sort_key"])
    )
    n_duplicate_narratives_removed = len(df_non_conflict) - len(df_canonical)
    print(
        f"[Data Pipeline] Deduplicated identical narratives: {len(df_canonical):,} unique narratives retained "
        f"(removed {n_duplicate_narratives_removed:,} duplicate narrative records)"
    )

    # ------------------------------------------------------------------
    # Step 8 — restrict to approved Product categories
    # ------------------------------------------------------------------
    approved_set = set(APPROVED_LABELS)
    mask_approved = df_canonical["product_category"].isin(approved_set)
    n_excluded_non_approved = int((~mask_approved).sum())
    excluded_label_counts: dict[str, int] = (
        df_canonical.loc[~mask_approved, "product_category"].value_counts().to_dict()
    )
    df_retained = df_canonical[mask_approved].copy()
    print(
        f"[Data Pipeline] Retained in approved categories: {len(df_retained):,} "
        f"(excluded {n_excluded_non_approved:,} records in non-approved categories)"
    )

    # Check for approved labels absent from data
    observed_labels = set(df_retained["product_category"].unique())
    missing_approved = sorted(approved_set - observed_labels)
    if missing_approved:
        print(f"[Data Pipeline] WARNING: Approved labels absent from dataset: {missing_approved}")

    # ------------------------------------------------------------------
    # Step 9 — verify class minimums
    # ------------------------------------------------------------------
    class_counts_retained = df_retained["product_category"].value_counts()
    under_minimum = {
        label: int(count)
        for label, count in class_counts_retained.items()
        if count < MIN_SAMPLES_PER_CLASS
    }
    if under_minimum:
        raise RuntimeError(
            f"The following classes have fewer than {MIN_SAMPLES_PER_CLASS} samples "
            f"after deduplication, which is insufficient for a valid stratified split: "
            f"{under_minimum}."
        )

    # ------------------------------------------------------------------
    # Step 10 — stratified 70/15/15 split (seed=42)
    # ------------------------------------------------------------------
    print(f"[Data Pipeline] Performing stratified 70/15/15 split (seed={RANDOM_SEED}) ...")
    try:
        from sklearn.model_selection import train_test_split  # type: ignore[import]
    except ImportError:
        raise ImportError(
            "scikit-learn is required for the stratified split. "
            "Install it with: pip install scikit-learn"
        )

    try:
        df_train, df_temp = train_test_split(
            df_retained,
            test_size=(1.0 - TRAIN_RATIO),
            random_state=RANDOM_SEED,
            stratify=df_retained["product_category"],
        )
        df_val, df_test = train_test_split(
            df_temp,
            test_size=0.5,  # 15% / 15%
            random_state=RANDOM_SEED,
            stratify=df_temp["product_category"],
        )
    except Exception as exc:
        raise RuntimeError(f"Stratification failed: {exc}") from exc

    # ------------------------------------------------------------------
    # Step 11 — build output DataFrames (only allowed columns)
    # ------------------------------------------------------------------
    # Model features: text only.
    # Target: product_category.
    # Audit ID: complaint_id (must NOT be passed to any model).
    OUTPUT_COLS = ["complaint_id", "text", "product_category"]

    df_train_out = df_train[OUTPUT_COLS].reset_index(drop=True)
    df_val_out = df_val[OUTPUT_COLS].reset_index(drop=True)
    df_test_out = df_test[OUTPUT_COLS].reset_index(drop=True)

    # ------------------------------------------------------------------
    # Step 12 — save split CSVs
    # ------------------------------------------------------------------
    train_path = output_dir / "train.csv"
    val_path = output_dir / "val.csv"
    test_path = output_dir / "test.csv"

    df_train_out.to_csv(train_path, index=False, encoding="utf-8")
    df_val_out.to_csv(val_path, index=False, encoding="utf-8")
    df_test_out.to_csv(test_path, index=False, encoding="utf-8")
    print(f"[Data Pipeline] Splits saved:")
    print(f"                train.csv -> {len(df_train_out):,} rows")
    print(f"                val.csv   -> {len(df_val_out):,} rows")
    print(f"                test.csv  -> {len(df_test_out):,} rows")

    # ------------------------------------------------------------------
    # Step 13 — build manifest
    # ------------------------------------------------------------------
    def _class_dist(series: pd.Series) -> dict[str, int]:
        return series.value_counts().to_dict()

    def _pkg_version(name: str) -> str:
        try:
            return importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            return "unknown"

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_archive": str(archive.resolve()),
        "source_archive_name": archive.name,
        "date_window": {
            "start_inclusive": start_date,
            "end_inclusive": end_date,
        },
        "random_seed": RANDOM_SEED,
        "split_ratios": {
            "train": TRAIN_RATIO,
            "val": VAL_RATIO,
            "test": TEST_RATIO,
        },
        "approved_labels": APPROVED_LABELS,
        "missing_approved_labels": missing_approved,
        "row_counts": {
            "total_eligible_in_window": total_eligible,
            "duplicates_by_complaint_id_removed": n_complaint_id_duplicates_removed,
            "excluded_empty_text_post_clean": n_excluded_empty_text,
            "eligible_after_clean": len(df),
            "conflicting_narrative_groups_excluded": n_conflicting_groups,
            "records_in_conflicting_groups_excluded": n_conflicting_records,
            "records_in_non_conflicting_groups": len(df_non_conflict),
            "unique_canonical_groups_all_products": len(df_canonical),
            "duplicate_narratives_removed": n_duplicate_narratives_removed,
            "excluded_non_approved_label": n_excluded_non_approved,
            "retained_for_splitting": len(df_retained),
            "train": len(df_train_out),
            "val": len(df_val_out),
            "test": len(df_test_out),
        },
        "excluded_label_counts": excluded_label_counts,
        "raw_product_counts_full_eligible_window": raw_product_counts,
        "class_distribution": {
            "full_retained": _class_dist(df_retained["product_category"]),
            "train": _class_dist(df_train_out["product_category"]),
            "val": _class_dist(df_val_out["product_category"]),
            "test": _class_dist(df_test_out["product_category"]),
        },
        "preprocessing": {
            "cleaning_steps": PREPROCESSING_STEPS,
            "xxxx_mask_pattern": r"\bX{4}\b (case-insensitive, whole-word)",
            "normalization_steps": NORMALIZATION_STEPS,
            "canonical_selection_rule": "Deterministic: sorted by complaint_id ascending, lowest complaint_id kept",
            "ambiguous_handling": "Exclude entire narrative group if associated with >1 distinct Product label",
            "original_archive_modified": False,
        },
        "output_columns": {
            "model_feature_X": "text",
            "target_y": "product_category",
            "audit_only_not_model_input": "complaint_id",
        },
        "package_versions": {
            "python": sys.version,
            "pandas": _pkg_version("pandas"),
            "scikit-learn": _pkg_version("scikit-learn"),
        },
        "output_files": {
            "train": str(train_path.resolve()),
            "val": str(val_path.resolve()),
            "test": str(test_path.resolve()),
        },
    }

    manifest_path = output_dir / "split_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[Data Pipeline] Manifest saved: {manifest_path}")
    return manifest


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help="Path to the raw CFPB archive ZIP (never extracted or modified).",
    )
    parser.add_argument(
        "--start-date",
        default=DEFAULT_START,
        metavar="YYYY-MM-DD",
        help="Inclusive start date for the eligible date window.",
    )
    parser.add_argument(
        "--end-date",
        default=DEFAULT_END,
        metavar="YYYY-MM-DD",
        help="Inclusive end date for the eligible date window.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for processed split CSVs and manifest.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=CHUNK_SIZE,
        help="Rows per pandas read_csv chunk (memory tuning).",
    )
    args = parser.parse_args(argv)

    if args.start_date > args.end_date:
        parser.error("--start-date must not be after --end-date")
    if args.chunk_size < 1000:
        parser.error("--chunk-size must be at least 1000")

    try:
        manifest = build_pipeline(
            archive=args.csv,
            start_date=args.start_date,
            end_date=args.end_date,
            output_dir=args.output_dir,
            chunk_size=args.chunk_size,
        )
    except (FileNotFoundError, ValueError, RuntimeError, ImportError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    rc = manifest["row_counts"]
    print()
    print("=" * 65)
    print("CivicResolve AI — Data Pipeline Summary (Pre-Split Deduplication)")
    print("=" * 65)
    print(f"Source archive        : {manifest['source_archive_name']}")
    print(f"Date window           : {manifest['date_window']['start_inclusive']} - {manifest['date_window']['end_inclusive']}")
    print(f"Eligible rows read    : {rc['total_eligible_in_window']:,}")
    print(f"Complaint ID dups rm  : {rc['duplicates_by_complaint_id_removed']:,}")
    print(f"Empty text rm         : {rc['excluded_empty_text_post_clean']:,}")
    print(f"Conflicting groups rm : {rc['conflicting_narrative_groups_excluded']:,} ({rc['records_in_conflicting_groups_excluded']:,} records)")
    print(f"Duplicate narratives  : {rc['duplicate_narratives_removed']:,} records removed")
    print(f"Non-approved labels rm: {rc['excluded_non_approved_label']:,} records")
    print(f"Retained for split    : {rc['retained_for_splitting']:,}")
    print(f"Train (70%)           : {rc['train']:,}")
    print(f"Val (15%)             : {rc['val']:,}")
    print(f"Test (15%)            : {rc['test']:,}")
    print()
    print("Class distribution (retained unique narratives):")
    for label, count in sorted(
        manifest["class_distribution"]["full_retained"].items(),
        key=lambda kv: -kv[1],
    ):
        pct = count / max(1, rc["retained_for_splitting"]) * 100
        print(f"  {label:<55} {count:>7,}  ({pct:.2f}%)")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
