# CivicResolve AI — NLP Service (FastAPI)

FastAPI microservice providing automated text classification and heuristic triage recommendations for consumer financial complaints.

---

## 1. Overview & Active Serving Model

The service loads the validated classical baseline:
- **Active Serving Model:** TF-IDF (1,2-gram, max 50,000 features) + Logistic Regression (balanced class weights, L-BFGS).
- **Artifact Path:** `models_saved/baseline_tfidf_logreg.joblib`
- **Validation Performance:** Macro F1: **0.7453**, Weighted F1: **0.8455**, Accuracy: **0.8380** (on 12,726 deduplicated validation complaints).
- **Benchmark Model (Reference Only):** PyTorch Bi-LSTM (`models_saved/bilstm_best.pt`, Macro F1: 0.7067).
- **Test Set Status:** `test.csv` (12,727 rows) remains strictly **sealed**.

### Supported Product Categories (8)
1. `Credit reporting or other personal consumer reports`
2. `Debt collection`
3. `Credit card`
4. `Checking or savings account`
5. `Money transfer, virtual currency, or money service`
6. `Mortgage`
7. `Student loan`
8. `Vehicle loan or lease`

---

## 2. Environment & Installation

The project uses Python 3.14 inside `.venv`.

```powershell
# Activate project virtual environment
.\.venv\Scripts\Activate.ps1

# Install requirements
.\.venv\Scripts\python.exe -m pip install -r nlp-service/requirements.txt
```

### Exact Core Package Versions
- `python`: 3.14.7
- `fastapi`: 0.156.1
- `uvicorn`: 0.54.0
- `pydantic`: 2.14.1
- `scikit-learn`: 1.9.1
- `torch`: 2.14.1+cu126 (CUDA 12.6)
- `pandas`: 3.0.6
- `vaderSentiment`: 3.3.2
- `httpx`: 0.28.1
- `pytest`: 9.1.1

---

## 3. Running the Service & Network Deployment Boundary

### 3.1 Local Development Binding
Start Uvicorn using the project interpreter:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir nlp-service
```

Interactive OpenAPI documentation is available locally at: `http://127.0.0.1:8000/docs`

### 3.2 Network Deployment Boundary & Security Notice
- **Intended Architecture**: `Browser -> Spring Boot Backend (:8080) -> FastAPI NLP Service (:8000)`. The browser-facing frontend code communicates exclusively with the Spring Boot API (`/api/*`). It does not and must not call FastAPI directly.
- **Internal Service Only**: The `/classify` and `/models/info` endpoints are designed strictly for private server-to-server consumption by the Spring Boot backend (`NlpClientService`). They must never be exposed to public networks or untrusted clients.
- **CORS Clarification**: Wildcard CORS (`allow_origins=["*"]`) was removed because browser clients do not access this service. However, removing CORS headers does *not* provide network security (CORS is purely a browser-side mechanism and offers zero transport or network-level protection).
- **Mandatory Isolation Requirements**: Before production deployment, private network isolation (e.g. binding to 127.0.0.1 or an isolated VPC subnet), ingress firewall restrictions, and authenticated mutual TLS (mTLS) or shared service tokens are mandatory.
- **Deployment Status**: Production network isolation remains an unresolved deployment requirement until container orchestration manifests (Docker Compose, Kubernetes, or reverse proxy policies) are formally implemented.

---

## 4. Endpoints & Examples

### 4.1 Health Check — `GET /health`

Returns service status and indicates whether the model pipeline loaded successfully into memory.

```bash
curl http://127.0.0.1:8000/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "model_loaded": true,
  "model_path": "C:\\...\\nlp-service\\models_saved\\baseline_tfidf_logreg.joblib",
  "timestamp_utc": "2026-10-20T18:56:27+00:00",
  "error": null
}
```

---

### 4.2 Model Provenance & Benchmarks — `GET /models/info`

Returns active model metadata, SHA-256 artifact checksum, validation metrics, and preserved Bi-LSTM benchmark numbers.

```bash
curl http://127.0.0.1:8000/models/info
```

**Response (200 OK):**
```json
{
  "active_serving_model": {
    "model_name": "TF-IDF (1,2-gram) + Logistic Regression (balanced)",
    "artifact_file": "baseline_tfidf_logreg.joblib",
    "artifact_sha256": "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0",
    "is_loaded": true,
    "min_confidence_threshold": 0.55,
    "min_margin_threshold": 0.15,
    "num_train_samples": 59389,
    "num_val_samples": 12726,
    "validation_metrics": {
      "accuracy": 0.838,
      "macro_f1": 0.7453,
      "weighted_f1": 0.8455
    }
  },
  "benchmark_model": {
    "model_name": "BiLSTMClassifier (PyTorch)",
    "validation_metrics": {
      "accuracy": 0.8124,
      "macro_f1": 0.7067,
      "weighted_f1": 0.823,
      "val_loss": 0.6274
    },
    "notice": "Benchmark reference only. Not active serving model."
  },
  "supported_categories": [
    "Checking or savings account",
    "Credit card",
    "Credit reporting or other personal consumer reports",
    "Debt collection",
    "Money transfer, virtual currency, or money service",
    "Mortgage",
    "Student loan",
    "Vehicle loan or lease"
  ],
  "evaluation_split_status": "Validation split evaluated (12,726 samples, 0 leakage). Final test split (12,727 samples) remains sealed."
}
```

---

### 4.3 Classification & Triage — `POST /classify`

Classifies a genuine consumer complaint narrative into one of the 8 approved categories, checks uncertainty review thresholds, and calculates transparent rule-based triage priority.

#### Input Constraints:
- `text`: string (min 20 characters, max 10,000 characters).
- Metadata fields (`product`, `company`, `complaint_id`) are **strictly prohibited** from entering the inference pipeline.

```bash
curl -X POST http://127.0.0.1:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "My mortgage servicer improperly rejected my escrow payments and initiated an unlawful foreclosure. The sheriff sale is scheduled and my family faces eviction next week."}'
```

**Response (200 OK):**
```json
{
  "product_category": "Mortgage",
  "confidence": 0.9959,
  "margin": 0.9942,
  "probabilities": {
    "Checking or savings account": 0.0005,
    "Credit card": 0.0002,
    "Credit reporting or other personal consumer reports": 0.0017,
    "Debt collection": 0.0008,
    "Money transfer, virtual currency, or money service": 0.0003,
    "Mortgage": 0.9959,
    "Student loan": 0.0004,
    "Vehicle loan or lease": 0.0002
  },
  "model_used": "baseline_tfidf_logreg",
  "model_version": "7a9964e0ef15514d",
  "flag_for_review": true,
  "review_reasons": [
    "Triage priority is CRITICAL; human review is required regardless of classification confidence."
  ],
  "triage_priority": "CRITICAL",
  "priority_reasons": [
    "Imminent risk of eviction, foreclosure, or loss of primary shelter",
    "Negative sentiment (-0.7783) reinforces urgent review."
  ],
  "sentiment_score": -0.7783,
  "sentiment_label": "NEGATIVE",
  "disclaimer": "Category prediction is an automated recommendation for human triage. Class probabilities are uncalibrated model probability estimates and are not guaranteed to match empirical correctness rates. Triage priority is a heuristic rule-based score and has not been validated against labeled urgency outcomes. Human review is required."
}
```

---

## 5. Human Review Architecture & Triage Rules

### 5.1 Dual-Trigger Human Review Logic
A complaint narrative is flagged for human review (`flag_for_review: true`) if **EITHER** of the following independent criteria is met:
1. **Classification Uncertainty Trigger:**
   - **Confidence Threshold (`min_confidence` = 0.55):** Top predicted class probability estimate is `< 0.55`.
   - **Top-2 Margin Threshold (`min_margin` = 0.15):** The difference between the top prediction probability estimate and the runner-up is `< 0.15`.
2. **Priority-Based Review Trigger:**
   - Any narrative assigned a **`HIGH`** or **`CRITICAL`** triage priority independently triggers human review, **regardless of classification confidence**.
   - The response includes explicit explanatory entries in `review_reasons` identifying all triggering conditions.

### 5.2 Triage Priority Tiers
- **`CRITICAL`:** Imminent loss of shelter (eviction, foreclosure, sheriff sale) or active severe identity theft / account drainage.
- **`HIGH`:** Vehicle repossession, wage garnishment, unauthorized wire/fund transfers, or acute personal hardship with strong negative sentiment.
- **`MEDIUM`:** Disputed credit reporting inaccuracies, billing fee errors, escrow discrepancies.
- **`LOW`:** Routine administrative clarification, neutral inquiries, or disputes without critical triggers.
- **Rule on Negative Sentiment:** *Negative sentiment alone does NOT cause CRITICAL or HIGH triage, and does not automatically imply an emergency.* Explicit trigger patterns are required.

---

## 6. Testing

Run the automated test suite using the project interpreter:

```powershell
.\.venv\Scripts\python.exe -m pytest nlp-service/tests/ -v
```

87 tests verify:
- Pipeline preprocessing and deduplication integrity (33 tests).
- Model artifact loading and Bi-LSTM architecture (20 tests).
- FastAPI endpoints, input validation, human review dual triggers, triage priority, uncalibrated probability estimates, and test split security (34 tests).

---

## 7. Limitations, Calibration & Scope

1. **Probability Calibration Disclosure:** Class probabilities returned by `POST /classify` are uncalibrated model probability estimates produced by `LogisticRegression.predict_proba`. No calibration procedure (e.g., Platt scaling, isotonic regression, or temperature scaling) was implemented or evaluated. These estimates are relative scoring metrics and are not guaranteed to match empirical correctness rates.
2. **Prototype Recommendation Only:** All category predictions and triage priority levels are recommendations for human caseworkers; they are never authoritative decisions.
3. **Urgency Disclaimer:** Priority rules are heuristic keyword/sentiment combinations and have not been validated against labeled ground-truth urgency outcomes.
4. **Sealed Test Set:** The final test set (`test.csv`, 12,727 rows) remains unread and sealed for independent post-pipeline evaluation.
