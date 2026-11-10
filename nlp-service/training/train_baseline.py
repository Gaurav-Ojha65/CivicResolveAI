#!/usr/bin/env python3
"""CivicResolve AI — Phase 3: Train and Evaluate the Classical NLP Baseline.

Trains a TF-IDF (word unigrams + bigrams, max_features=50000) + Logistic Regression
(class_weight="balanced", solver="lbfgs", max_iter=1000, seed=42) pipeline on the
clean deduplicated training set (train.csv).

Evaluates strictly on the validation set (val.csv).
The test set (test.csv) is strictly sealed and must never be loaded or evaluated here.

Usage
-----
python nlp-service/training/train_baseline.py \\
    --train-path nlp-service/data/processed/train.csv \\
    --val-path nlp-service/data/processed/val.csv \\
    --output-dir nlp-service/models_saved
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.pipeline import Pipeline

# ---------------------------------------------------------------------------
# Default paths and constants
# ---------------------------------------------------------------------------

DEFAULT_TRAIN = Path(__file__).resolve().parents[1] / "data" / "processed" / "train.csv"
DEFAULT_VAL = Path(__file__).resolve().parents[1] / "data" / "processed" / "val.csv"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "models_saved"

RANDOM_SEED = 42
MAX_FEATURES = 50_000
MAX_ITER = 1000

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

_NORMALIZE_WS_RE = re.compile(r"\s+")


def normalize_narrative(text: object) -> str:
    """Deterministic normalization for duplicate and leakage auditing."""
    if text is None or pd.isna(text):
        return ""
    t = str(text).strip().lower()
    return _NORMALIZE_WS_RE.sub(" ", t)


# ---------------------------------------------------------------------------
# Data Quality Gate
# ---------------------------------------------------------------------------

def verify_data_quality(
    df_train: pd.DataFrame,
    df_val: pd.DataFrame,
    approved_labels: list[str] | None = None,
) -> None:
    """Verify data cleanliness, column integrity, and absence of cross-split leakage."""
    if approved_labels is None:
        approved_labels = APPROVED_LABELS
    approved_set = set(approved_labels)

    required_cols = {"text", "product_category"}
    for name, df in [("train", df_train), ("val", df_val)]:
        if df.empty:
            raise ValueError(f"{name} split is empty.")
        missing_cols = required_cols - set(df.columns)
        if missing_cols:
            raise ValueError(f"{name} split is missing required columns: {missing_cols}")

        # Check for null / blank entries in text or product_category
        blank_text = df["text"].isna() | df["text"].astype(str).str.strip().eq("")
        if blank_text.any():
            raise ValueError(f"{name} split contains {blank_text.sum()} blank text entries.")

        blank_prod = df["product_category"].isna() | df["product_category"].astype(str).str.strip().eq("")
        if blank_prod.any():
            raise ValueError(f"{name} split contains {blank_prod.sum()} blank product_category entries.")

        # Check only approved labels exist
        unapproved = set(df["product_category"].unique()) - approved_set
        if unapproved:
            raise ValueError(f"{name} split contains unapproved labels: {unapproved}")

    # Recheck normalized narrative duplicates and cross-split leakage
    train_norms = df_train["text"].map(normalize_narrative)
    val_norms = df_val["text"].map(normalize_narrative)

    dup_train = train_norms.duplicated().sum()
    if dup_train > 0:
        raise ValueError(f"train split contains {dup_train} duplicate normalized narratives.")

    dup_val = val_norms.duplicated().sum()
    if dup_val > 0:
        raise ValueError(f"val split contains {dup_val} duplicate normalized narratives.")

    overlap = set(train_norms) & set(val_norms)
    if overlap:
        raise ValueError(
            f"DATA LEAKAGE DETECTED: {len(overlap)} normalized narratives appear in both train and val."
        )


# ---------------------------------------------------------------------------
# Pipeline Construction & Training
# ---------------------------------------------------------------------------

def build_baseline_pipeline(
    max_features: int = MAX_FEATURES,
    max_iter: int = MAX_ITER,
    random_state: int = RANDOM_SEED,
) -> Pipeline:
    """Build the scikit-learn TF-IDF + Logistic Regression pipeline."""
    tfidf = TfidfVectorizer(
        ngram_range=(1, 2),
        max_features=max_features,
    )
    clf = LogisticRegression(
        class_weight="balanced",
        solver="lbfgs",
        max_iter=max_iter,
        random_state=random_state,
    )
    return Pipeline([("tfidf", tfidf), ("classifier", clf)])


def train_baseline(
    df_train: pd.DataFrame,
    max_features: int = MAX_FEATURES,
    max_iter: int = MAX_ITER,
    random_state: int = RANDOM_SEED,
) -> Pipeline:
    """Fit baseline pipeline exclusively on training narrative text and labels."""
    # Ensure ONLY text is used as X and product_category as y.
    # complaint_id and any other metadata are strictly excluded.
    X_train = df_train["text"]
    y_train = df_train["product_category"]

    pipeline = build_baseline_pipeline(
        max_features=max_features,
        max_iter=max_iter,
        random_state=random_state,
    )

    print(f"[Training] Fitting TF-IDF (1-2 grams, max_features={max_features:,}) and "
          f"LogisticRegression (balanced, lbfgs, max_iter={max_iter}) on {len(X_train):,} rows ...")
    pipeline.fit(X_train, y_train)
    print("[Training] Fitting complete.")
    return pipeline


# ---------------------------------------------------------------------------
# Validation Evaluation
# ---------------------------------------------------------------------------

def evaluate_baseline(
    pipeline: Pipeline,
    df_train: pd.DataFrame,
    df_val: pd.DataFrame,
    labels: list[str] | None = None,
) -> dict:
    """Evaluate pipeline on validation split and compute required baseline metrics."""
    if labels is None:
        labels = APPROVED_LABELS

    # Predict exclusively on validation text
    X_val = df_val["text"]
    y_val = df_val["product_category"]
    y_pred = pipeline.predict(X_val)

    # Primary metrics
    acc = float(accuracy_score(y_val, y_pred))
    macro_f1 = float(f1_score(y_val, y_pred, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_val, y_pred, average="weighted", zero_division=0))

    # Per-class metrics
    p, r, f, s = precision_recall_fscore_support(
        y_val, y_pred, labels=labels, zero_division=0
    )
    per_class = {
        label: {
            "precision": round(float(p[i]), 4),
            "recall": round(float(r[i]), 4),
            "f1_score": round(float(f[i]), 4),
            "support": int(s[i]),
        }
        for i, label in enumerate(labels)
    }

    # Confusion matrix
    cm = confusion_matrix(y_val, y_pred, labels=labels)
    cm_list = cm.tolist()

    # Most frequent misclassifications (true != pred)
    misclass_pairs = []
    for i, true_lbl in enumerate(labels):
        for j, pred_lbl in enumerate(labels):
            if i != j and cm[i, j] > 0:
                misclass_pairs.append({
                    "true_category": true_lbl,
                    "predicted_category": pred_lbl,
                    "count": int(cm[i, j]),
                })
    misclass_pairs.sort(key=lambda x: -x["count"])

    # Majority-class baseline (predict training majority class on all validation examples)
    majority_class = str(df_train["product_category"].value_counts().idxmax())
    majority_pred = [majority_class] * len(y_val)
    majority_acc = float(accuracy_score(y_val, majority_pred))
    majority_macro_f1 = float(f1_score(y_val, majority_pred, average="macro", zero_division=0))
    majority_weighted_f1 = float(f1_score(y_val, majority_pred, average="weighted", zero_division=0))

    eval_results = {
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model_architecture": "TF-IDF (1,2-gram, 50k) + Logistic Regression (balanced)",
        "num_train_samples": len(df_train),
        "num_val_samples": len(df_val),
        "labels": labels,
        "metrics": {
            "accuracy": round(acc, 4),
            "macro_f1": round(macro_f1, 4),
            "weighted_f1": round(weighted_f1, 4),
        },
        "majority_class_baseline": {
            "majority_class": majority_class,
            "accuracy": round(majority_acc, 4),
            "macro_f1": round(majority_macro_f1, 4),
            "weighted_f1": round(majority_weighted_f1, 4),
        },
        "per_class": per_class,
        "most_frequent_misclassifications": misclass_pairs[:10],
        "confusion_matrix": cm_list,
    }
    return eval_results


# ---------------------------------------------------------------------------
# Artifact Saving
# ---------------------------------------------------------------------------

def save_artifacts(
    pipeline: Pipeline,
    eval_results: dict,
    output_dir: Path,
    labels: list[str] | None = None,
) -> dict[str, Path]:
    """Save trained pipeline, validation metrics JSON, and confusion matrix CSV/PNG."""
    if labels is None:
        labels = APPROVED_LABELS

    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Save pipeline via joblib
    model_path = output_dir / "baseline_tfidf_logreg.joblib"
    joblib.dump(pipeline, model_path)
    print(f"[Artifacts] Model pipeline saved: {model_path}")

    # 2. Save validation metrics JSON
    metrics_path = output_dir / "baseline_eval_val.json"
    metrics_path.write_text(
        json.dumps(eval_results, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[Artifacts] Validation metrics saved: {metrics_path}")

    # 3. Save confusion matrix CSV
    cm_path = output_dir / "baseline_confusion_matrix_val.csv"
    cm_df = pd.DataFrame(eval_results["confusion_matrix"], index=labels, columns=labels)
    cm_df.to_csv(cm_path, encoding="utf-8")
    print(f"[Artifacts] Confusion matrix CSV saved: {cm_path}")

    saved = {
        "model": model_path,
        "metrics_json": metrics_path,
        "confusion_matrix_csv": cm_path,
    }

    # 4. Optional PNG visualization if matplotlib is available
    try:
        import matplotlib.pyplot as plt  # type: ignore[import]
        fig, ax = plt.subplots(figsize=(10, 8))
        im = ax.imshow(eval_results["confusion_matrix"], interpolation="nearest", cmap="Blues")
        ax.figure.colorbar(im, ax=ax)
        ax.set(
            xticks=range(len(labels)),
            yticks=range(len(labels)),
            xticklabels=labels,
            yticklabels=labels,
            title="Validation Confusion Matrix — Baseline Logistic Regression",
            ylabel="True Category",
            xlabel="Predicted Category",
        )
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")
        plt.tight_layout()
        png_path = output_dir / "baseline_confusion_matrix_val.png"
        fig.savefig(png_path, dpi=150)
        plt.close(fig)
        saved["confusion_matrix_png"] = png_path
        print(f"[Artifacts] Confusion matrix PNG saved: {png_path}")
    except (ImportError, ModuleNotFoundError):
        print("[Artifacts] Note: matplotlib is not installed; PNG visualization skipped.")

    return saved


# ---------------------------------------------------------------------------
# Runner & CLI
# ---------------------------------------------------------------------------

def run_pipeline(
    train_path: Path,
    val_path: Path,
    output_dir: Path,
    max_features: int = MAX_FEATURES,
    max_iter: int = MAX_ITER,
    random_state: int = RANDOM_SEED,
) -> dict:
    """Execute full baseline training and validation evaluation workflow."""
    # Strict gate: test set must never be loaded in this workflow
    if "test.csv" in str(train_path).lower() or "test.csv" in str(val_path).lower():
        raise ValueError(
            "SAFETY VIOLATION: test.csv must remain sealed and cannot be loaded in training or validation evaluation."
        )

    if not train_path.exists():
        raise FileNotFoundError(f"Training file not found: {train_path}")
    if not val_path.exists():
        raise FileNotFoundError(f"Validation file not found: {val_path}")

    print(f"[Phase 3 Baseline] Loading training data: {train_path}")
    df_train = pd.read_csv(train_path)
    print(f"[Phase 3 Baseline] Loading validation data: {val_path}")
    df_val = pd.read_csv(val_path)

    print("[Phase 3 Baseline] Verifying data quality and zero-leakage gate ...")
    verify_data_quality(df_train, df_val, APPROVED_LABELS)
    print("[Phase 3 Baseline] Data quality gate PASSED (zero cross-split leakage, zero duplicates).")

    pipeline = train_baseline(
        df_train=df_train,
        max_features=max_features,
        max_iter=max_iter,
        random_state=random_state,
    )

    print("[Phase 3 Baseline] Evaluating on validation set ...")
    eval_results = evaluate_baseline(
        pipeline=pipeline,
        df_train=df_train,
        df_val=df_val,
        labels=APPROVED_LABELS,
    )

    save_artifacts(pipeline, eval_results, output_dir, APPROVED_LABELS)
    return eval_results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--train-path",
        type=Path,
        default=DEFAULT_TRAIN,
        help="Path to processed train.csv.",
    )
    parser.add_argument(
        "--val-path",
        type=Path,
        default=DEFAULT_VAL,
        help="Path to processed val.csv.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory to save fitted model and evaluation artifacts.",
    )
    parser.add_argument(
        "--max-features",
        type=int,
        default=MAX_FEATURES,
        help="Max n-gram features for TF-IDF (default: 50,000).",
    )
    parser.add_argument(
        "--max-iter",
        type=int,
        default=MAX_ITER,
        help="Max iterations for Logistic Regression solver (default: 1,000).",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=RANDOM_SEED,
        help="Random seed for reproducibility (default: 42).",
    )
    args = parser.parse_args(argv)

    try:
        results = run_pipeline(
            train_path=args.train_path,
            val_path=args.val_path,
            output_dir=args.output_dir,
            max_features=args.max_features,
            max_iter=args.max_iter,
            random_state=args.random_state,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    m = results["metrics"]
    maj = results["majority_class_baseline"]

    print()
    print("=" * 65)
    print("CivicResolve AI — Baseline Model Validation Results")
    print("=" * 65)
    print(f"Model architecture   : {results['model_architecture']}")
    print(f"Training samples     : {results['num_train_samples']:,}")
    print(f"Validation samples   : {results['num_val_samples']:,}")
    print()
    print("Overall Validation Metrics:")
    print(f"  Macro F1           : {m['macro_f1']:.4f}  (Majority Baseline: {maj['macro_f1']:.4f})")
    print(f"  Weighted F1        : {m['weighted_f1']:.4f}  (Majority Baseline: {maj['weighted_f1']:.4f})")
    print(f"  Accuracy           : {m['accuracy']:.4f}  (Majority Baseline: {maj['accuracy']:.4f})")
    print()
    print("Per-Class Validation Performance:")
    print(f"  {'Product Category':<52} {'Prec':>6} {'Rec':>6} {'F1':>6} {'Support':>7}")
    print("  " + "-" * 79)
    for cat, p_data in results["per_class"].items():
        print(f"  {cat:<52} {p_data['precision']:>6.4f} {p_data['recall']:>6.4f} {p_data['f1_score']:>6.4f} {p_data['support']:>7,}")
    print()
    print("Top Misclassification Pairs (True -> Predicted):")
    for pair in results["most_frequent_misclassifications"][:5]:
        print(f"  {pair['true_category']} -> {pair['predicted_category']}: {pair['count']:,} errors")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
