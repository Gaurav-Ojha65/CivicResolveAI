#!/usr/bin/env python3
"""CivicResolve AI — Controlled Probability Calibration Evaluation (Validation Split Only).

Evaluates baseline model calibration on a deterministic 50/50 stratified split of val.csv.
Fits a Temperature Scaling parameter T > 0 on calib_fit (6,363 rows) and evaluates
Expected Calibration Error (ECE), Maximum Calibration Error (MCE), Multi-Class Brier Score,
and 10-bin Reliability Diagrams on calib_eval (6,363 rows).

NON-NEGOTIABLE SAFETY GATE:
The test set (test.csv) is strictly sealed and must NEVER be loaded or evaluated.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from scipy.special import softmax
from sklearn.model_selection import train_test_split

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("civicresolve.calibration")

BASE_DIR = Path(__file__).resolve().parents[1]
VAL_CSV_PATH = BASE_DIR / "data" / "processed" / "val.csv"
MODEL_PATH = BASE_DIR / "models_saved" / "baseline_tfidf_logreg.joblib"
OUTPUT_JSON_PATH = BASE_DIR / "models_saved" / "calibration_eval_val.json"
OUTPUT_REPORT_PATH = BASE_DIR / "models_saved" / "calibration_report_val.md"

RANDOM_SEED = 42
N_BINS = 10


def run_calibration_evaluation() -> dict:
    """Run temperature scaling calibration on validation split and export artifacts."""
    logger.info("Verifying data paths...")
    if not VAL_CSV_PATH.exists():
        raise FileNotFoundError(f"Validation dataset not found at {VAL_CSV_PATH}")
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Baseline model not found at {MODEL_PATH}")

    # 1. Load validation complaints (strictly val.csv)
    logger.info(f"Loading validation complaints from {VAL_CSV_PATH}...")
    val_df = pd.read_csv(VAL_CSV_PATH)
    total_val_rows = len(val_df)
    if total_val_rows != 12726:
        logger.warning(f"Expected 12,726 validation rows, found {total_val_rows}")

    # 2. Deterministic 50/50 stratified split
    logger.info("Performing 50/50 stratified split with seed 42...")
    fit_df, eval_df = train_test_split(
        val_df,
        test_size=0.5,
        random_state=RANDOM_SEED,
        stratify=val_df["product_category"],
    )
    n_fit = len(fit_df)
    n_eval = len(eval_df)
    logger.info(f"Calibration splits: fit={n_fit} rows, eval={n_eval} rows")

    # 3. Load baseline model pipeline
    logger.info(f"Loading baseline pipeline from {MODEL_PATH}...")
    pipeline = joblib.load(MODEL_PATH)
    classes = list(pipeline.classes_)
    label_to_idx = {c: i for i, c in enumerate(classes)}

    # 4. Extract decision scores on calibration-fit set
    logger.info("Computing decision scores on calibration-fit split...")
    z_fit = pipeline.decision_function(fit_df["text"])
    y_fit = np.array([label_to_idx[c] for c in fit_df["product_category"]])

    # 5. Optimize temperature T via NLL minimization
    logger.info("Optimizing temperature scaling parameter T...")

    def nll(temp: float) -> float:
        scaled_z = z_fit / temp
        p = softmax(scaled_z, axis=1)
        loss = -np.mean(np.log(np.clip(p[np.arange(len(y_fit)), y_fit], 1e-15, 1.0)))
        return float(loss)

    res = minimize_scalar(nll, bounds=(0.05, 10.0), method="bounded")
    optimal_temperature = float(res.x)
    logger.info(f"Optimal Temperature T = {optimal_temperature:.4f}")

    # 6. Evaluate on calibration-eval split
    logger.info("Evaluating calibration on calibration-eval split...")
    z_eval = pipeline.decision_function(eval_df["text"])
    y_eval = np.array([label_to_idx[c] for c in eval_df["product_category"]])

    def compute_calibration_metrics(z: np.ndarray, y: np.ndarray, temp: float):
        p = softmax(z / temp, axis=1)
        top_conf = np.max(p, axis=1)
        top_pred = np.argmax(p, axis=1)
        acc_arr = (top_pred == y).astype(float)

        bins = np.linspace(0.0, 1.0, N_BINS + 1)
        bin_records = []
        ece = 0.0
        mce = 0.0

        for i in range(N_BINS):
            low, high = bins[i], bins[i + 1]
            mask = (top_conf >= low) & (top_conf <= high if i == (N_BINS - 1) else top_conf < high)
            count = int(np.sum(mask))
            if count > 0:
                bin_acc = float(np.mean(acc_arr[mask]))
                bin_conf = float(np.mean(top_conf[mask]))
                diff = abs(bin_acc - bin_conf)
                ece += (count / len(y)) * diff
                if diff > mce:
                    mce = diff
            else:
                bin_acc = 0.0
                bin_conf = (low + high) / 2.0

            bin_records.append({
                "bin_index": i + 1,
                "bin_lower": round(float(low), 2),
                "bin_upper": round(float(high), 2),
                "bin_center": round(float((low + high) / 2.0), 2),
                "sample_count": count,
                "empirical_accuracy": round(float(bin_acc), 4),
                "mean_confidence": round(float(bin_conf), 4),
            })

        one_hot = np.zeros_like(p)
        one_hot[np.arange(len(y)), y] = 1.0
        brier = float(np.mean(np.sum((p - one_hot) ** 2, axis=1)))

        return round(float(ece), 4), round(float(mce), 4), round(float(brier), 4), bin_records

    ece_uncal, mce_uncal, brier_uncal, bins_uncal = compute_calibration_metrics(z_eval, y_eval, 1.0)
    ece_cal, mce_cal, brier_cal, bins_cal = compute_calibration_metrics(z_eval, y_eval, optimal_temperature)

    ece_reduction_pct = round(((ece_uncal - ece_cal) / ece_uncal) * 100.0, 2)
    brier_reduction_pct = round(((brier_uncal - brier_cal) / brier_uncal) * 100.0, 2)

    logger.info(f"Uncalibrated: ECE={ece_uncal:.4f}, MCE={mce_uncal:.4f}, Brier={brier_uncal:.4f}")
    logger.info(f"Calibrated (T={optimal_temperature:.4f}): ECE={ece_cal:.4f}, MCE={mce_cal:.4f}, Brier={brier_cal:.4f}")
    logger.info(f"ECE Reduction: {ece_reduction_pct}%")

    output_payload = {
        "evaluation_dataset": "val.csv (50/50 Stratified Split, random_state=42)",
        "evaluation_date_utc": datetime.now(timezone.utc).isoformat(),
        "total_validation_rows": total_val_rows,
        "calibration_fit_rows": n_fit,
        "calibration_eval_rows": n_eval,
        "classes": classes,
        "optimal_temperature": round(optimal_temperature, 4),
        "uncalibrated_ece": ece_uncal,
        "calibrated_ece": ece_cal,
        "ece_reduction_percent": ece_reduction_pct,
        "uncalibrated_mce": mce_uncal,
        "calibrated_mce": mce_cal,
        "uncalibrated_brier": brier_uncal,
        "calibrated_brier": brier_cal,
        "brier_reduction_percent": brier_reduction_pct,
        "uncalibrated_bins": bins_uncal,
        "calibrated_bins": bins_cal,
        "disclaimer": (
            "Probability calibration metrics and temperature scaling parameters are evaluated "
            "exclusively on a 50/50 stratified partition of the validation dataset (val.csv). "
            "The final test dataset (test.csv) was never accessed or evaluated."
        ),
    }

    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2)
    logger.info(f"Saved calibration metrics JSON to {OUTPUT_JSON_PATH}")

    # Markdown report
    report_md = f"""# CivicResolve AI — Validation Split Probability Calibration Report

**Generated UTC:** {output_payload['evaluation_date_utc']}  
**Evaluation Scope:** Strictly validation split (`val.csv`, $n=12,726$) — `test.csv` sealed and never accessed.  
**Splitting Strategy:** 50/50 stratified partition with `random_state=42` ($n_{{\\text{{fit}}}} = {n_fit}$, $n_{{\\text{{eval}}}} = {n_eval}$).

## Summary Metrics

| Metric | Uncalibrated (Baseline $T=1.0$) | Calibrated (Temperature Scaled $T={optimal_temperature:.4f}$) | Relative Delta |
| :--- | :--- | :--- | :--- |
| **Expected Calibration Error (ECE)** | **{ece_uncal:.4f}** | **{ece_cal:.4f}** | **-{ece_reduction_pct}%** |
| **Maximum Calibration Error (MCE)** | **{mce_uncal:.4f}** | **{mce_cal:.4f}** | **-{(mce_uncal - mce_cal)/mce_uncal*100:.1f}%** |
| **Multi-Class Brier Score** | **{brier_uncal:.4f}** | **{brier_cal:.4f}** | **-{brier_reduction_pct}%** |
| **Optimal Temperature Parameter $T$** | 1.0000 | {optimal_temperature:.4f} | — |

## 10-Bin Reliability Diagram Data (Evaluation Split $n={n_eval}$)

| Bin Range | Sample Count | Mean Confidence (Uncal) | Empirical Accuracy | Mean Confidence (Calibrated) |
| :--- | :--- | :--- | :--- | :--- |
"""
    for u_bin, c_bin in zip(bins_uncal, bins_cal):
        report_md += (
            f"| `[{u_bin['bin_lower']}, {u_bin['bin_upper']}]` | {u_bin['sample_count']} | "
            f"{u_bin['mean_confidence']:.4f} | {u_bin['empirical_accuracy']:.4f} | "
            f"{c_bin['mean_confidence']:.4f} |\n"
        )

    report_md += f"\n> [!NOTE]\n> {output_payload['disclaimer']}\n"

    with open(OUTPUT_REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report_md)
    logger.info(f"Saved calibration markdown report to {OUTPUT_REPORT_PATH}")

    return output_payload


if __name__ == "__main__":
    run_calibration_evaluation()
