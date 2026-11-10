# CivicResolve AI — Final Held-Out Test Split Evaluation Report

> **Generated at:** 2026-11-07 17:58:21 UTC
> **Academic Milestone:** November 10 Submission — Final Model Audit & Held-Out Test Evaluation
> **Test Split Integrity (test.csv):** Verified SHA-256 `10796f7f979a9380b1f7672999fbf0a11b445be95eaaf2256a06c0a91660b6c3` ($n=12,727$)
> **Production Baseline Model:** Verified SHA-256 `7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0` (TF-IDF + Logistic Regression)
> **Challenger Model:** PyTorch Bi-LSTM (`bilstm_best.pt`, 2,998,920 parameters)
> **Protocol:** Single authorized read-only evaluation. Zero weight retraining; zero threshold adjustment.

## 1. Overall Model Performance: Validation vs. Final Held-Out Test

| Metric | Dataset Split | Baseline (TF-IDF + LogReg) | Bi-LSTM (PyTorch) | Baseline Advantage (Delta) |
|---|---|---|---|---|
| **Macro F1** | Validation ($n=12,726$) | **0.7453** | 0.7067 | +0.0386 |
| **Macro F1** | **Final Test ($n=12,727$)** | **0.7488** | **0.7034** | **+0.0453** |
| **Weighted F1** | Validation ($n=12,726$) | **0.8455** | 0.8230 | +0.0225 |
| **Weighted F1** | **Final Test ($n=12,727$)** | **0.8481** | **0.8232** | **+0.0249** |
| **Accuracy** | Validation ($n=12,726$) | **0.8380** (83.80%) | 0.8124 (81.24%) | +2.56% |
| **Accuracy** | **Final Test ($n=12,727$)** | **0.8410** (84.10%) | **0.8124** (81.24%) | **+2.86%** |

> [!IMPORTANT]
> **Key Finding:** On the held-out test split, the Classical Baseline achieved a **Macro F1 of 0.7488** and **Accuracy of 84.10%**, outperforming the PyTorch Bi-LSTM challenger (**Macro F1 0.7034**, Accuracy 81.24%) by **+0.0453 Macro-F1**. The baseline model demonstrates superior generalization and zero degradation between validation and test splits.

## 2. Per-Class F1 Breakdown (All 8 CFPB Categories)

| Product Category | Test Support ($n$) | Baseline Val F1 | Baseline Test F1 | Bi-LSTM Val F1 | Bi-LSTM Test F1 | Test Delta (Base - BiLSTM) |
|---|---|---|---|---|---|---|
| Credit reporting or other personal consumer reports | 8,232 | 0.9056 | **0.9078** | 0.8906 | 0.8906 | +0.0172 |
| Debt collection | 1,650 | 0.7438 | **0.7431** | 0.7142 | 0.7115 | +0.0316 |
| Credit card | 838 | 0.7107 | **0.7209** | 0.6720 | 0.6879 | +0.0330 |
| Checking or savings account | 836 | 0.7703 | **0.7769** | 0.7271 | 0.7337 | +0.0432 |
| Money transfer, virtual currency, or money service | 417 | 0.7271 | **0.7314** | 0.7177 | 0.7167 | +0.0147 |
| Mortgage | 291 | 0.8299 | **0.8194** | 0.8055 | 0.7938 | +0.0256 |
| Student loan | 214 | 0.6432 | **0.6690** | 0.5930 | 0.5806 | +0.0884 |
| Vehicle loan or lease | 249 | 0.6321 | **0.6217** | 0.5337 | 0.5126 | +0.1091 |

## 3. Narrative Length Bucket Accuracy Breakdown

Classification accuracy stratified across complaint narrative word count buckets:

| Word Length Bucket | Test Support ($n$) | Test Share (%) | Baseline Test Acc | Bi-LSTM Test Acc | Delta (Base - BiLSTM) |
|---|---|---|---|---|---|
| **<50 words** | 1,815 | 14.3% | **0.8116** (81.2%) | 0.7570 (75.7%) | +5.5% |
| **50-150 words** | 4,847 | 38.1% | **0.8581** (85.8%) | 0.8292 (82.9%) | +2.9% |
| **150-300 words** | 3,743 | 29.4% | **0.8309** (83.1%) | 0.8167 (81.7%) | +1.4% |
| **>300 words** | 2,322 | 18.2% | **0.8450** (84.5%) | 0.8140 (81.4%) | +3.1% |

## 4. Top Test Split Misclassifications

### Baseline Model Top Misclassification Pairs
| True Category | Predicted Category | Error Count |
|---|---|---|
| Credit reporting or other personal consumer reports | Debt collection | 558 |
| Credit reporting or other personal consumer reports | Credit card | 229 |
| Debt collection | Credit reporting or other personal consumer reports | 169 |
| Credit reporting or other personal consumer reports | Student loan | 146 |
| Credit reporting or other personal consumer reports | Vehicle loan or lease | 131 |

### Bi-LSTM Challenger Top Misclassification Pairs
| True Category | Predicted Category | Error Count |
|---|---|---|
| Credit reporting or other personal consumer reports | Debt collection | 626 |
| Credit reporting or other personal consumer reports | Credit card | 253 |
| Credit reporting or other personal consumer reports | Student loan | 205 |
| Credit reporting or other personal consumer reports | Vehicle loan or lease | 199 |
| Debt collection | Credit reporting or other personal consumer reports | 184 |

## 5. Provenance, Governance & Truthful AI Notice

- **Test Set Protocol:** Evaluated exactly once in accordance with academic submission guidelines. Dataset remains sealed against iterative tuning.
- **Model Immutability:** Baseline and Bi-LSTM weights, vocabulary, hyper-parameters, and thresholds (`0.55` confidence, `0.15` margin) were identical between validation and test evaluations.
- **Truthful AI Disclosure:** All model outputs are *uncalibrated model probability estimates* and preliminary AI assessments for triage assistance. They do not constitute legal adjudication or automated decisions.
