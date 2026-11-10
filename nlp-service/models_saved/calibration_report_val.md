# CivicResolve AI — Validation Split Probability Calibration Report

**Generated UTC:** 2026-11-09T19:49:18.378007+00:00  
**Evaluation Scope:** Strictly validation split (`val.csv`, $n=12,726$) — `test.csv` sealed and never accessed.  
**Splitting Strategy:** 50/50 stratified partition with `random_state=42` ($n_{\text{fit}} = 6363$, $n_{\text{eval}} = 6363$).

## Summary Metrics

| Metric | Uncalibrated (Baseline $T=1.0$) | Calibrated (Temperature Scaled $T=0.7866$) | Relative Delta |
| :--- | :--- | :--- | :--- |
| **Expected Calibration Error (ECE)** | **0.0609** | **0.0306** | **-49.75%** |
| **Maximum Calibration Error (MCE)** | **0.1999** | **0.0814** | **-59.3%** |
| **Multi-Class Brier Score** | **0.2590** | **0.2512** | **-3.01%** |
| **Optimal Temperature Parameter $T$** | 1.0000 | 0.7866 | — |

## 10-Bin Reliability Diagram Data (Evaluation Split $n=6363$)

| Bin Range | Sample Count | Mean Confidence (Uncal) | Empirical Accuracy | Mean Confidence (Calibrated) |
| :--- | :--- | :--- | :--- | :--- |
| `[0.0, 0.1]` | 0 | 0.0500 | 0.0000 | 0.0500 |
| `[0.1, 0.2]` | 1 | 0.1999 | 0.0000 | 0.1500 |
| `[0.2, 0.3]` | 129 | 0.2642 | 0.2868 | 0.2694 |
| `[0.3, 0.4]` | 275 | 0.3530 | 0.5127 | 0.3510 |
| `[0.4, 0.5]` | 403 | 0.4543 | 0.5806 | 0.4550 |
| `[0.5, 0.6]` | 531 | 0.5543 | 0.6761 | 0.5495 |
| `[0.6, 0.7]` | 608 | 0.6524 | 0.7845 | 0.6515 |
| `[0.7, 0.8]` | 789 | 0.7538 | 0.8504 | 0.7529 |
| `[0.8, 0.9]` | 1204 | 0.8543 | 0.9028 | 0.8562 |
| `[0.9, 1.0]` | 2423 | 0.9563 | 0.9521 | 0.9682 |

> [!NOTE]
> Probability calibration metrics and temperature scaling parameters are evaluated exclusively on a 50/50 stratified partition of the validation dataset (val.csv). The final test dataset (test.csv) was never accessed or evaluated.
