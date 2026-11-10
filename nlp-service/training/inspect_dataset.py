#!/usr/bin/env python3
"""Inspect CFPB complaint narratives for CivicResolve AI Phase 1.

The official CFPB search API removed complaint narratives in September 2026.
The script tries the requested official API first, but fails safely if the
narrative field is absent. A pre-removal CFPB archive can be inspected with
--csv PATH (CSV, CSV.GZ, or a ZIP containing a CSV). No data is fabricated.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import pandas as pd

API_URL = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"
CURRENT_CFPB_RELEASE_NOTES = "https://cfpb.github.io/api/ccdb/release-notes.html"
HISTORICAL_SNAPSHOT_URL = "https://huggingface.co/datasets/vivekkopthsd/cfpb-consumer-complaints"
DEFAULT_START = "2025-01-01"
DEFAULT_END = "2025-06-30"
DEFAULT_LIMIT = 25_000

# Column names vary slightly between official exports and archived mirrors.
COLUMN_ALIASES = {
    "narrative": {
        "consumer complaint narrative",
        "consumer_complaint_narrative",
        "consumer narrative",
        "consumer_narrative",
        "narrative",
    },
    "product": {"product"},
    "date_received": {"date received", "date_received", "date"},
}


class DatasetUnavailableError(RuntimeError):
    """Raised when no usable narrative data can be obtained."""


def normalize_column_name(name: object) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def resolve_columns(columns: Iterable[object]) -> dict[str, str]:
    """Map logical field names to real dataframe column names."""
    normalized = {normalize_column_name(c): str(c) for c in columns}
    found: dict[str, str] = {}
    aliases_by_norm = {
        key: {normalize_column_name(alias) for alias in aliases}
        for key, aliases in COLUMN_ALIASES.items()
    }
    for logical, aliases in aliases_by_norm.items():
        for alias in aliases:
            if alias in normalized:
                found[logical] = normalized[alias]
                break
    return found


def fetch_official_api(start_date: str, end_date: str, limit: int) -> pd.DataFrame:
    """Attempt the official API. Raises a clear error if narratives are gone."""
    if limit < 1 or limit > 100_000:
        raise ValueError("limit must be between 1 and 100000 (current CFPB export cap).")

    params = {
        "date_received_min": start_date,
        "date_received_max": end_date,
        "field": "all",
        "format": "csv",
        "has_narrative": "true",
        "no_aggs": "true",
        "size": str(limit),
    }
    url = API_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "CivicResolveAI-Phase1/1.0", "Accept": "text/csv,*/*;q=0.8"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise DatasetUnavailableError(
            f"Official CFPB API request failed: {type(exc).__name__}: {exc}. "
            "No dataset metrics were computed."
        ) from exc

    if not payload.strip():
        raise DatasetUnavailableError("Official CFPB API returned an empty response; no metrics computed.")

    try:
        data = pd.read_csv(io.BytesIO(payload), low_memory=False)
    except Exception as exc:  # malformed response / HTML error page
        preview = payload[:160].decode("utf-8", errors="replace").replace("\n", " ")
        raise DatasetUnavailableError(
            f"Could not parse official CFPB response as CSV ({type(exc).__name__}). Preview: {preview!r}"
        ) from exc

    fields = resolve_columns(data.columns)
    narrative_col = fields.get("narrative")
    if not narrative_col:
        raise DatasetUnavailableError(
            "The live CFPB API response has no consumer complaint narrative column. "
            "CFPB Release 24 (September 2026) says consumer complaint narratives were removed "
            f"from the database. Use a documented pre-removal snapshot instead: {HISTORICAL_SNAPSHOT_URL}. "
            f"Current source note: {CURRENT_CFPB_RELEASE_NOTES}. No dataset metrics were computed."
        )

    data = data[data[narrative_col].notna()].copy()
    data = data[data[narrative_col].astype(str).str.strip().ne("")].copy()
    if data.empty:
        raise DatasetUnavailableError(
            "The official API response contained a narrative column but zero non-empty narratives. "
            "No dataset metrics were computed."
        )
    data.attrs["source_description"] = f"Official CFPB API: {url}"
    data.attrs["sample_method"] = f"API response, capped at {limit} rows; non-empty narratives retained."
    return data



def fetch_historical_snapshot_hf(start_date: str, end_date: str, limit: int) -> pd.DataFrame:
    """Fetch a seeded page sample from the pre-removal CFPB snapshot on Hugging Face.

    This uses the public dataset-viewer filter API rather than downloading a ~1 GB
    archive. The source is a third-party mirror, so its snapshot metadata must be
    recorded and checked before training. The server's filtered row count is
    recorded separately from the sampled row count.
    """
    if limit < 1 or limit > 100_000:
        raise ValueError("limit must be between 1 and 100000.")
    endpoint = "https://datasets-server.huggingface.co/filter"
    dataset_name = "vivekkopthsd/cfpb-consumer-complaints"
    where = (
        f"\"narrative\" > '' AND \"date_received\" >= '{start_date}' "
        f"AND \"date_received\" <= '{end_date}' AND \"product\" != ''"
    )

    def get_page(offset: int, length: int) -> dict:
        params = {
            "dataset": dataset_name,
            "config": "default",
            "split": "train",
            "where": where,
            "offset": str(offset),
            "length": str(length),
        }
        url = endpoint + "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(
            url, headers={"User-Agent": "CivicResolveAI-Phase1/1.0", "Accept": "application/json"}
        )
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return __import__("json").loads(response.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                last_error = exc
        raise DatasetUnavailableError(
            f"Historical snapshot viewer request failed at offset={offset}: "
            f"{type(last_error).__name__}: {last_error}"
        )

    try:
        first = get_page(0, 1)
    except DatasetUnavailableError:
        raise
    total = int(first.get("num_rows_total", 0))
    if total <= 0:
        raise DatasetUnavailableError(
            "The historical snapshot filter returned zero rows. Check the dataset column names/date filter "
            "or use a local archive with --csv."
        )
    if first.get("partial") is True:
        raise DatasetUnavailableError(
            "The dataset viewer reports partial filtering; refusing to call a partial count the full population. "
            "Use --csv with a complete pre-removal archive instead."
        )

    page_size = 100  # dataset-viewer API maximum per request
    page_count = (total + page_size - 1) // page_size
    pages_needed = min(page_count, (limit + page_size - 1) // page_size)
    import random
    rng = random.Random(42)
    page_numbers = sorted(rng.sample(range(page_count), pages_needed)) if pages_needed < page_count else list(range(page_count))
    rows: list[dict] = []
    sampled_indices: set[int] = set()
    for page_number in page_numbers:
        offset = page_number * page_size
        result = get_page(offset, min(page_size, total - offset))
        for item in result.get("rows", []):
            row_idx = int(item.get("row_idx", -1))
            if row_idx in sampled_indices:
                continue
            sampled_indices.add(row_idx)
            rows.append(item.get("row", {}))
            if len(rows) >= limit:
                break
        if len(rows) >= limit:
            break

    if not rows:
        raise DatasetUnavailableError("Historical snapshot viewer returned no rows after filtering.")
    data = pd.DataFrame(rows)
    fields = resolve_columns(data.columns)
    if "narrative" not in fields or "product" not in fields:
        raise DatasetUnavailableError(
            f"Historical snapshot response lacks required narrative/Product fields. Columns: {list(data.columns)}"
        )
    data = data[data[fields["narrative"]].notna()].copy()
    data = data[data[fields["narrative"]].astype(str).str.strip().ne("")].copy()
    data.attrs["source_description"] = (
        f"Pre-removal CFPB snapshot via Hugging Face dataset viewer API: {dataset_name}; "
        "third-party mirror of CFPB public complaint data, snapshot described as through 2026-08-11"
    )
    data.attrs["sample_method"] = (
        f"Seeded random sample (seed=42) of {len(data):,} records from {total:,} matching records "
        "reported by the dataset-viewer filter; pages of up to 100 rows sampled without replacement. "
        "For strict reproducibility, record the mirror revision/hash when downloading/training."
    )
    data.attrs["eligible_records_seen"] = total
    return data

def _read_archive_chunks(path: Path, start_date: str, end_date: str, limit: int, chunksize: int = 100_000) -> pd.DataFrame:
    """Read a local historical CFPB export in chunks and reservoir-sample eligible narratives.

    This inspects every chunk so class counts are not restricted to the first
    chunk; the returned rows are a reproducible reservoir sample of eligible
    narratives within the requested date interval.
    """
    if not path.exists():
        raise FileNotFoundError(f"Archive path does not exist: {path}")

    start = pd.Timestamp(start_date)
    end = pd.Timestamp(end_date) + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1)
    rng_seed = 42
    import random
    rng = random.Random(rng_seed)

    fields: dict[str, str] | None = None
    sample: list[dict] = []
    eligible_seen = 0
    all_columns: list[str] = []
    compression = "zip" if path.suffix.lower() == ".zip" else "infer"

    try:
        chunks = pd.read_csv(path, compression=compression, chunksize=chunksize, low_memory=False)
        for chunk in chunks:
            if fields is None:
                fields = resolve_columns(chunk.columns)
                all_columns = [str(c) for c in chunk.columns]
                missing = [name for name in ("narrative", "product", "date_received") if name not in fields]
                if missing:
                    raise DatasetUnavailableError(
                        f"Archive is missing required fields {missing}; available columns: {list(chunk.columns)}"
                    )
            dcol, ncol = fields["date_received"], fields["narrative"]
            pcol = fields["product"]
            dates = pd.to_datetime(chunk[dcol], errors="coerce", utc=True).dt.tz_convert(None)
            narrative = chunk[ncol].fillna("").astype(str).str.strip()
            products = chunk[pcol].fillna("").astype(str).str.strip()
            mask = dates.between(start, end) & narrative.ne("") & products.ne("")
            eligible = chunk.loc[mask].copy()
            if eligible.empty:
                continue
            for record in eligible.to_dict(orient="records"):
                eligible_seen += 1
                if len(sample) < limit:
                    sample.append(record)
                else:
                    replacement = rng.randrange(eligible_seen)
                    if replacement < limit:
                        sample[replacement] = record
    except DatasetUnavailableError:
        raise
    except Exception as exc:
        raise DatasetUnavailableError(f"Could not read archive {path}: {type(exc).__name__}: {exc}") from exc

    if not sample:
        raise DatasetUnavailableError(
            f"No rows with non-empty narrative and Product found between {start_date} and {end_date}."
        )
    result = pd.DataFrame(sample, columns=all_columns)
    result.attrs["source_description"] = f"Local historical CFPB archive: {path.resolve()}"
    result.attrs["sample_method"] = (
        f"Reproducible reservoir sample (seed={rng_seed}) of up to {limit} eligible records; "
        f"scanned and counted {eligible_seen:,} eligible records in the date interval."
    )
    result.attrs["eligible_records_seen"] = eligible_seen
    return result


def inspect_dataframe(data: pd.DataFrame, start_date: str, end_date: str, limit: int) -> str:
    """Return a human-readable report. Raises if core fields are absent."""
    fields = resolve_columns(data.columns)
    missing = [name for name in ("narrative", "product") if name not in fields]
    if missing:
        raise DatasetUnavailableError(f"Missing required fields {missing}. Available columns: {list(data.columns)}")

    narrative_col = fields["narrative"]
    product_col = fields["product"]
    date_col = fields.get("date_received")

    narratives = data[narrative_col].fillna("").astype(str).str.strip()
    products = data[product_col].fillna("").astype(str).str.strip()
    usable_mask = narratives.ne("") & products.ne("")
    usable_narratives = narratives[usable_mask]
    usable_products = products[usable_mask]
    if usable_narratives.empty:
        raise DatasetUnavailableError("No non-empty narrative rows with a non-empty Product label. No metrics computed.")

    word_counts = usable_narratives.map(lambda value: len(re.findall(r"\b[\w']+\b", value)))
    mask_counts = usable_narratives.str.count(r"(?i)XXXX")
    rows_with_xxxx = int(mask_counts.gt(0).sum())
    total_xxxx = int(mask_counts.sum())
    product_counts = usable_products.value_counts(dropna=False)
    top8_coverage = float(product_counts.head(8).sum() / max(1, product_counts.sum()) * 100)

    lines = [
        "CivicResolve AI — Phase 1 CFPB Dataset Inspection",
        "=" * 54,
        f"Report generated (UTC): {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"Date window requested: {start_date} through {end_date} (inclusive)",
        f"Source: {data.attrs.get('source_description', 'Provided dataframe; source not recorded')}",
        f"Sample method: {data.attrs.get('sample_method', f'Input sample capped at {limit} rows; sampling method not recorded')}",
        "",
        "ROW COUNTS",
        f"Rows inspected in sample: {len(data):,}",
        f"Rows with non-empty narrative AND Product: {int(usable_mask.sum()):,}",
        f"Rows excluded for empty narrative or Product in inspected sample: {int((~usable_mask).sum()):,}",
    ]
    if "eligible_records_seen" in data.attrs:
        lines.append(f"Total eligible archive rows found in date window: {data.attrs['eligible_records_seen']:,}")

    lines.extend(["", "NULL / EMPTY RATES BY COLUMN"])
    for col in data.columns:
        series = data[col]
        null_count = int(series.isna().sum())
        empty_count = int(series.astype("string").fillna("").str.strip().eq("").sum())
        lines.append(
            f"{col}: null={null_count:,} ({null_count / max(1, len(data)) * 100:.2f}%), "
            f"empty_or_null={empty_count:,} ({empty_count / max(1, len(data)) * 100:.2f}%)"
        )

    lines.extend([
        "",
        "NARRATIVE WORD-LENGTH DISTRIBUTION (non-empty narratives with Product labels)",
        f"Count: {len(word_counts):,}",
        f"Min: {int(word_counts.min())}",
        f"Median: {float(word_counts.median()):.2f}",
        f"Mean: {float(word_counts.mean()):.2f}",
        f"95th percentile: {float(word_counts.quantile(0.95)):.2f}",
        f"Max: {int(word_counts.max())}",
        "",
        "XXXX REDACTION-MASK FREQUENCY (case-insensitive literal XXXX occurrences)",
        f"Narratives containing at least one XXXX mask: {rows_with_xxxx:,} ({rows_with_xxxx / max(1, len(usable_narratives)) * 100:.2f}%)",
        f"Total XXXX occurrences: {total_xxxx:,}",
        "",
        "PRODUCT CLASS DISTRIBUTION (top 30 in inspected sample)",
        f"Unique Product labels in usable sample: {int(usable_products.nunique()):,}",
        f"Coverage of top 8 Product labels: {top8_coverage:.2f}%",
    ])
    for label, count in product_counts.head(30).items():
        lines.append(f"{label}: {int(count):,} ({int(count) / max(1, int(product_counts.sum())) * 100:.2f}%)")

    if date_col:
        parsed_dates = pd.to_datetime(data[date_col], errors="coerce", utc=True).dropna()
        lines.extend(["", "DATE COVERAGE IN INSPECTED SAMPLE"])
        if len(parsed_dates):
            lines.append(f"Earliest: {parsed_dates.min().isoformat()}")
            lines.append(f"Latest: {parsed_dates.max().isoformat()}")
        else:
            lines.append("No parseable date values found.")

    lines.extend([
        "",
        "DATA-SCOPE / INTERPRETATION NOTES",
        "- Product is a consumer financial product category, not a government department label.",
        "- Public narratives are a self-selected subset; results do not represent all complaints or all consumers.",
        "- Treat XXXX-mask removal as a preprocessing transformation; preserve the original archive unchanged.",
        "- This report describes the inspected sample, not model performance. No model has been trained in Phase 1.",
    ])
    return "\n".join(lines) + "\n"


def blocked_report(message: str, start_date: str, end_date: str, limit: int) -> str:
    return "\n".join([
        "CivicResolve AI — Phase 1 CFPB Dataset Inspection",
        "=" * 54,
        f"Report generated (UTC): {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"Date window requested: {start_date} through {end_date} (inclusive)",
        f"Requested sample cap: {limit:,}",
        "",
        "STATUS: BLOCKED — no narrative dataset was inspected.",
        f"Reason: {message}",
        "",
        "METRICS STATUS",
        "Row counts: NOT COMPUTED",
        "Null rates: NOT COMPUTED",
        "Narrative word-length distribution: NOT COMPUTED",
        "XXXX mask frequency: NOT COMPUTED",
        "Product class distribution: NOT COMPUTED",
        "",
        "SOURCE VERIFICATION",
        f"CFPB release notes: {CURRENT_CFPB_RELEASE_NOTES}",
        "The official CFPB release notes state that consumer complaint narratives were removed in September 2026.",
        f"Candidate pre-removal snapshot (third-party mirror): {HISTORICAL_SNAPSHOT_URL}",
        "The archive must be obtained and its provenance, snapshot date, schema, and terms checked before training.",
        "Do not fill these metrics with estimates from a dataset card or web search.",
        "",
    ])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, help="Path to a pre-removal CFPB CSV/CSV.GZ/ZIP archive")
    parser.add_argument("--start-date", default=DEFAULT_START, help="Inclusive received-date start, YYYY-MM-DD")
    parser.add_argument("--end-date", default=DEFAULT_END, help="Inclusive received-date end, YYYY-MM-DD")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Maximum inspected narratives (1–100000)")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "raw" / "dataset_report.txt")
    args = parser.parse_args(argv)

    if args.start_date > args.end_date:
        parser.error("--start-date must be on or before --end-date")
    if not 1 <= args.limit <= 100_000:
        parser.error("--limit must be between 1 and 100000")

    try:
        if args.csv:
            data = _read_archive_chunks(args.csv, args.start_date, args.end_date, args.limit)
        else:
            official_error: Exception | None = None
            try:
                data = fetch_official_api(args.start_date, args.end_date, args.limit)
            except (DatasetUnavailableError, ValueError) as exc:
                official_error = exc
                # The official API has removed narratives as of September 2026;
                # attempt an explicitly labelled historical mirror instead.
                try:
                    data = fetch_historical_snapshot_hf(args.start_date, args.end_date, args.limit)
                except (DatasetUnavailableError, ValueError) as mirror_exc:
                    raise DatasetUnavailableError(
                        f"Official CFPB API attempt failed: {official_error}\n"
                        f"Historical snapshot fallback failed: {mirror_exc}"
                    ) from mirror_exc
        report = inspect_dataframe(data, args.start_date, args.end_date, args.limit)
        status = 0
    except (DatasetUnavailableError, FileNotFoundError, ValueError) as exc:
        report = blocked_report(str(exc), args.start_date, args.end_date, args.limit)
        status = 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report, encoding="utf-8")
    print(report)
    print(f"Report written to: {args.output.resolve()}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
