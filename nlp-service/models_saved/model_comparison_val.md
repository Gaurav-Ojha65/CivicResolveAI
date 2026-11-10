# CivicResolve AI — Validation Model Comparison Report

> **Generated at:** 2026-10-20 18:46:20 UTC
> **Dataset:** Deduplicated CFPB Complaint Dataset (59,389 train, 12,726 validation, 0 cross-split leakage)
> **Evaluation Split:** Validation Set (`val.csv` — exactly identical 12,726 examples for both models)
> **Test Split Status:** **SEALED** (`test.csv` was never accessed or evaluated)

## 1. Overall Validation Metrics

| Metric | Baseline (TF-IDF + LogReg) | Bi-LSTM (PyTorch) | Delta (Bi-LSTM - Baseline) |
|---|---|---|---|
| **Macro F1** | **0.7453** | **0.7067** | **-0.0386** |
| **Weighted F1** | **0.8455** | **0.8230** | **-0.0225** |
| **Accuracy** | **0.8380** | **0.8124** | **-0.0256** |

## 2. Per-Class Performance Comparison

| Product Category | Baseline Prec | Bi-LSTM Prec | Baseline Rec | Bi-LSTM Rec | Baseline F1 | Bi-LSTM F1 | Delta F1 | Support |
|---|---|---|---|---|---|---|---|---|
| Credit reporting or other personal consumer reports | 0.9670 | 0.9621 | 0.8514 | 0.8291 | 0.9056 | 0.8906 | -0.0150 | 8,232 |
| Debt collection | 0.6737 | 0.6495 | 0.8302 | 0.7932 | 0.7438 | 0.7142 | -0.0296 | 1,649 |
| Credit card | 0.6452 | 0.6054 | 0.7909 | 0.7551 | 0.7107 | 0.6720 | -0.0387 | 837 |
| Checking or savings account | 0.7477 | 0.7292 | 0.7943 | 0.7249 | 0.7703 | 0.7271 | -0.0432 | 836 |
| Money transfer, virtual currency, or money service | 0.7065 | 0.6773 | 0.7488 | 0.7632 | 0.7271 | 0.7177 | -0.0094 | 418 |
| Mortgage | 0.7722 | 0.7265 | 0.8969 | 0.9038 | 0.8299 | 0.8055 | -0.0244 | 291 |
| Student loan | 0.5013 | 0.4385 | 0.8972 | 0.9159 | 0.6432 | 0.5930 | -0.0502 | 214 |
| Vehicle loan or lease | 0.5299 | 0.4104 | 0.7831 | 0.7631 | 0.6321 | 0.5337 | -0.0984 | 249 |

## 3. Training & Hardware Configuration

| Property | Value |
|---|---|
| Model Architecture | BiLSTMClassifier (Bidirectional LSTM with Masked Pooling) |
| Vocabulary Size | 21,100 tokens |
| Max Sequence Length | 250 tokens |
| Train Narrative Truncation Rate | 23.80% |
| Validation Narrative Truncation Rate | 23.41% |
| Embedding Dimension | 128 |
| Hidden Dimension | 128 |
| Total Trainable Parameters | 2,998,920 |
| Best Epoch | 5 of 8 |
| Hardware / Device | cuda (NVIDIA GeForce RTX 4050 Laptop GPU) |
| Total Training Duration | 88.61s |

## 4. Top Misclassification Pairs

### Bi-LSTM Top Errors (True Category -> Predicted Category)

| True Category | Predicted Category | Error Count |
|---|---|---|
| Credit reporting or other personal consumer reports | Debt collection | 637 |
| Credit reporting or other personal consumer reports | Credit card | 247 |
| Credit reporting or other personal consumer reports | Student loan | 223 |
| Credit reporting or other personal consumer reports | Vehicle loan or lease | 194 |
| Debt collection | Credit reporting or other personal consumer reports | 174 |
| Checking or savings account | Money transfer, virtual currency, or money service | 122 |
| Money transfer, virtual currency, or money service | Checking or savings account | 81 |
| Checking or savings account | Credit card | 77 |

## 5. Architectural & Practical Observations

1. **Imbalance Handling:** Both models used balanced class weighting computed exclusively from training labels.
2. **Vocabulary Generalization:** Bi-LSTM uses a closed vocabulary fitted on training narratives only with reserved `<PAD>` (0) and `<UNK>` (1) tokens. Out-of-vocabulary words are safely mapped to `<UNK>` without crashes.
3. **Inference Footprint:** The PyTorch Bi-LSTM checkpoint is compact, using length-aware masked pooling to avoid pad dilution.
4. **Strict Safety Protocol:** The test split (`test.csv` — 12,727 rows) remains unread and fully sealed.
