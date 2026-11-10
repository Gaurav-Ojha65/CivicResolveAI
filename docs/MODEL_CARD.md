# CivicResolve AI — Model Card

This Model Card documents the natural language processing pipelines deployed in CivicResolve AI, following standard machine learning reporting guidelines.

---

## 1. Model Overview

| Attribute | Authoritative Production Classifier | Reviewer Challenger Benchmark |
| :--- | :--- | :--- |
| **Model Name** | `baseline_tfidf_logreg.joblib` | `bilstm_best.pt` |
| **Model Type** | TF-IDF (1,2-gram) + Balanced Logistic Regression | 2-Layer Bidirectional LSTM with Masked Pooling |
| **Framework** | Scikit-learn 1.3+ / Joblib | PyTorch 2.0+ |
| **Artifact Size** | 5.02 MB | 34.33 MB |
| **Inference Latency** | $< 15\text{ ms}$ (CPU) | $\sim 50\text{ ms}$ (CPU) |
| **Operational Role** | **Authoritative Classifier** for automated intake and persistence | **Reviewer-only challenger** for comparative audit and what-if simulation |
| **Input Representation** | Sublinear TF n-grams (50,000 max features) | Token sequence IDs, max length 250 (20,000 vocab) |
| **Output Target** | 8 Standardized CFPB Financial Categories | 8 Standardized CFPB Financial Categories |

---

## 2. Intended Use & Operational Scope

- **Intended Application**: Automated triage and preliminary product category assignment for consumer financial grievance narratives.
- **Target Users**: Regulated financial institution compliance officers, regulatory triage staff, and consumer ombudsman teams.
- **Out-of-Scope Use**: CivicResolve AI models must **not** be used to make autonomous binding legal determinations, deny consumer statutory rights, or execute automated dispute dismissals without human reviewer adjudication.

---

## 3. Dataset & Pre-Split Deduplication

### A. Training & Validation Corpus
The models were trained on historical consumer complaint narratives sourced from the public Consumer Financial Protection Bureau (CFPB) complaint database (pre-September 2026 historical snapshot).

- **Total Curated Dataset**: 84,842 clean consumer grievance narratives.
- **Deduplication & Hygiene**: Exact and near-duplicate narratives were resolved prior to splitting. Masked tokens (e.g., `XXXX`, `XX/XX/XXXX`) were preserved without token corruption.
- **Stratified Split**:
  - **Training Set**: 59,389 records (70%)
  - **Validation Set**: 12,726 records (15%)
  - **Sealed Test Set**: 12,727 records (15%) — **Strictly sealed; excluded from all public repositories and live runtime pipelines**.

### B. Target Category Distribution (8 CFPB Product Categories)
1. `Credit reporting or other personal consumer reports` (Majority class, ~64.7%)
2. `Debt collection` (~13.0%)
3. `Credit card` (~6.6%)
4. `Checking or savings account` (~6.6%)
5. `Mortgage` (~3.5%)
6. `Money transfer, virtual currency, or money service` (~2.8%)
7. `Vehicle loan or lease` (~1.7%)
8. `Student loan` (~1.1%)

---

## 4. Validation Results (Stratified Validation Set, N=12,726)

All documented evaluation metrics are computed on the fixed validation split (`nlp-service/models_saved/baseline_eval_val.json` and `bilstm_eval_val.json`):

### Overall Performance Comparison
| Metric | Majority Baseline | Production TF-IDF + LogReg | Challenger Bi-LSTM |
| :--- | :--- | :--- | :--- |
| **Overall Accuracy** | 64.69% | **83.80%** | 81.24% |
| **Macro-Averaged F1** | 0.0982 | **0.7453** | 0.7067 |
| **Weighted-Averaged F1**| 0.5082 | **0.8455** | 0.8230 |

### Per-Category Validation Breakdown (Production Classifier)
| Category | Precision | Recall | F1-Score | Support |
| :--- | :--- | :--- | :--- | :--- |
| Credit reporting or other consumer reports | 0.9670 | 0.8514 | 0.9056 | 8,232 |
| Debt collection | 0.6737 | 0.8302 | 0.7438 | 1,649 |
| Credit card | 0.6452 | 0.7909 | 0.7107 | 837 |
| Checking or savings account | 0.7477 | 0.7943 | 0.7703 | 836 |
| Money transfer, virtual currency, or money service | 0.6698 | 0.7983 | 0.7285 | 357 |
| Mortgage | 0.7788 | 0.8711 | 0.8224 | 450 |
| Student loan | 0.7006 | 0.8143 | 0.7532 | 140 |
| Vehicle loan or lease | 0.4468 | 0.7178 | 0.5509 | 225 |

---

## 5. Explainability & Feature Attribution

### Mathematical Linear Attribution
The production model utilizes multi-class Logistic Regression with deterministic feature attribution. For an input vector $\mathbf{x} \in \mathbb{R}^{50,000}$ and target category $c$:
$$\text{logit}_c = b_c + \sum_{j=1}^{50,000} w_{c,j} x_j$$

- Each n-gram token $j$ present in the complaint narrative exerts an exact linear force $w_{c,j} x_j$ pushing either toward or away from category $c$.
- In the reviewer interface, positive weights are highlighted in teal and negative weights in rose, accompanied by a diverging horizontal bar chart of top positive and negative features.
- Unlike perturbation-based explainers (e.g., LIME, KernelSHAP), this attribution is **instantaneous, mathematically exact, and non-stochastic**.

---

## 6. Precedent Retrieval via Lexical TF-IDF Cosine Similarity

To support institutional consistency during manual review:
- Historical adjudicated complaints are vectorized across the 50,000 n-gram TF-IDF vocabulary.
- Incoming or simulated complaints are compared using standard cosine similarity:
  $$\text{sim}(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2}$$
- Top-3 historical precedents are returned with explicit PII redaction (SSN, credit card, phone numbers masked as `XXXX`).
- Precedent similarity is strictly labeled as **Lexical TF-IDF Cosine Similarity** to prevent misleading users into conflating lexical overlap with semantic dense-embedding similarity.

---

## 7. Model Provenance & Checksum Verification

To ensure tamper-evident governance in compliance environments, model artifact hashes are published at service startup and verified against simulation requests:

| Artifact | File Path | SHA-256 Digest |
| :--- | :--- | :--- |
| Production Baseline | `nlp-service/models_saved/baseline_tfidf_logreg.joblib` | `7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0` |
| Challenger Bi-LSTM | `nlp-service/models_saved/bilstm_best.pt` | `d97febad4388fd5307fed993472c172b5fa9c94017383c1c2cbc11def3451890` |

---

## 8. Limitations & Ethical Considerations

1. **Uncalibrated Probability Estimates**: Model confidence scores represent softmax outputs and are explicitly documented in all UI components as *"uncalibrated probability estimates"*. Reviewers must evaluate probability margins ($P_1 - P_2$) rather than absolute values.
2. **Class Imbalance & Long-Tail Categories**: Credit reporting complaints represent ~64.7% of the training distribution. While balanced class weighting mitigates majority bias, lower-volume categories (e.g., Vehicle loans at 1.7%) exhibit lower precision (44.7%).
3. **Data Protection & Sealed Evaluation**: The held-out evaluation dataset (`test.csv`) remains sealed to prevent data leakage and preserve benchmark integrity.
