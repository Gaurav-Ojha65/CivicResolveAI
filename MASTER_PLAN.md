# CivicResolve AI — Revised Master Plan (v7)

> **Revision date:** 2026-10-21
> **Status:** Phases 1–6 complete (with Phase 5 Safety and Probability-Reporting Corrections applied). Classical TF-IDF Baseline serving in FastAPI (`POST /classify`, `GET /health`, `GET /models/info`). Dual-trigger human review (classification uncertainty OR HIGH/CRITICAL priority), uncalibrated probability disclosures, and rule-based triage priority fully integrated. All 87 automated tests passing. Test split remains strictly sealed.
> **Supersedes:** previous v6.



## 1. Decision summary

CivicResolve AI will classify genuine consumer complaint narratives into a consumer-finance product category, recommend a human-reviewed triage queue, and track cases through a full-stack workflow. This makes the NLP model learn from natural-language complaint descriptions rather than an eight-token string derived from dropdown metadata.

### Mandatory corrections

1. **Required complaint narrative:** `description` is required in the citizen UI, FastAPI request schema, Spring Boot request DTO, and PostgreSQL `grievances` table. It is the primary model input. A blank or missing description must be rejected with HTTP 422/400 as appropriate.
2. **Target:** `Product` is the supervised label. It identifies a consumer-financial product/category; it is **not** an official government department. Use `product_category` in model/API/database names. A separately documented team/queue mapping may translate categories into an application queue; do not call that an ML-predicted agency.
3. **Narrative source change:** The official CFPB API release notes say consumer complaint narratives were removed from the current database in **September 2026**. The live API cannot be relied on to return narratives. A local historical archive (`cfpb_2025_may_june.zip`) is used for training.
4. **No `torchtext`:** `torchtext` development ended with 0.18.0 (April 2024) and its published compatibility table only lists Python through 3.11. Do not install it. Use `re`/standard tokenisation, `collections.Counter`, a custom vocabulary, `torch.utils.data.Dataset`/`DataLoader`, and `torch.nn.utils.rnn.pad_sequence`.
5. **Urgency is not a supervised ML target:** the selected dataset has no reliable independent urgency label. Use a transparent policy/rule engine for prototype triage. Treat all generated priorities as recommendations requiring human oversight, not validated risk predictions.

## 2. Dataset source and constraints

### Local historical archive (Phase 1 & 2 source)

- **File:** `nlp-service/data/raw/cfpb_2025_may_june.zip`
- **Content:** `CCDB_Export_11_May_2025_through_June_2025.csv` (482,807,488 bytes uncompressed)
- **Date window used:** 2025-05-11 through 2025-06-30 (inclusive)
- **Total eligible records in window:** 185,370 (non-empty narrative + Product, correct date range)

### Task definition

- **Input X:** the actual `Consumer complaint narrative` text (canonicalized internally as `text`).
- **Target y:** `Product`, canonicalized internally as `product_category`.
- **Date window for initial experiment:** 2025-05-11 through 2025-06-30.
- **Class set:** top 8 Product labels by observed frequency in the full window.
- **Intended product scope:** consumer-finance complaint triage prototype.

### Leakage policy

The model receives narrative text only for the first experiment. Exclude all metadata from model inputs: `Product` (target), `Sub-product`, `Issue`, `Sub-issue`, `Company`, company response fields, `Timely response?`, `Complaint ID`, dates, geography and tags. `Complaint ID` is retained in split CSVs **solely for deduplication and audit**; it must never enter any model or vectorizer.

`XXXX` is a common redaction mask. The raw source archive is preserved unchanged. In preprocessing, whole-word `XXXX` masks are removed using a documented regex transformation.

## 3. Phase 1 — Results (COMPLETED ✅)

Phase 1 inspected a reproducible reservoir sample of 25,000 records from the full 185,370-row eligible window.

| Metric | Value |
|---|---|
| Total eligible records in window | 185,370 |
| Sample inspected | 25,000 (reservoir sample, seed=42) |
| Rows with non-empty narrative AND Product | 25,000 (100%) |
| Median narrative word length | 119 words |
| Mean narrative word length | 173.83 words |
| 95th percentile word length | 499 words |
| Narratives with ≥1 XXXX mask | 14,540 (58.16%) |
| Total XXXX occurrences | 501,748 |
| Unique Product labels | 11 |
| Top 8 label coverage | 98.94% |

**Phase 1 test result:** **6/6 passed** (`pytest -q nlp-service/tests/test_inspect.py`)

### Phase 1 product class distribution (25,000-row sample)

| Product | Count | % |
|---|---|---|
| Credit reporting or other personal consumer reports | 20,268 | 81.07% |
| Debt collection | 1,977 | 7.91% |
| Credit card | 735 | 2.94% |
| Checking or savings account | 711 | 2.84% |
| Money transfer, virtual currency, or money service | 369 | 1.48% |
| Mortgage | 260 | 1.04% |
| Student loan | 209 | 0.84% |
| Vehicle loan or lease | 207 | 0.83% |
| Payday loan, title loan, personal loan, or advance loan | 156 | 0.62% |
| Prepaid card | 65 | 0.26% |
| Debt or credit management | 43 | 0.17% |

### Phase 1 files created

- `nlp-service/training/inspect_dataset.py`
- `nlp-service/tests/test_inspect.py`
- `nlp-service/requirements.txt`
- `nlp-service/data/README.md`
- `nlp-service/data/raw/dataset_report.txt`
- `.gitignore`

## 4. Phase 2 & 3 Data Quality Gate and Pre-Split Deduplication Repair (COMPLETED ✅)

During the Phase 3 Step A Data Quality Gate, an exact duplicate narrative audit revealed that standard row-level splitting suffered from severe data leakage:
- **53.81% of the entire dataset** (98,736 rows) shared an exact normalized narrative with another split.
- **62.24% of `val.csv`** was identical boilerplate to narratives in `train.csv`.
- **102 narrative groups (10,787 rows)** had conflicting product labels (consumers using the exact same form letter for multiple products).

To eliminate leakage and template-memorization bias, **Pre-Split Narrative Deduplication (Option 2)** was implemented in `nlp-service/training/data_split.py`.

### Approved labels (8)

1. Credit reporting or other personal consumer reports
2. Debt collection
3. Credit card
4. Checking or savings account
5. Money transfer, virtual currency, or money service
6. Mortgage
7. Student loan
8. Vehicle loan or lease

### Preprocessing & Deduplication Procedure

1. **Clean narrative:** strip whitespace, remove whole-word `XXXX` masks (`\bX{4}\b`, `re.IGNORECASE`), collapse multiple spaces/tabs, collapse 3+ newlines to two, strip again. Exclude rows where cleaned text is empty.
2. **Deterministic normalization:** convert cleaned text to lowercase, strip leading/trailing whitespace, collapse consecutive whitespace into a single space (`re.sub(r"\s+", " ", t)`), handle nulls/empty safely.
3. **Ambiguous multi-label group exclusion:** group records by normalized narrative. Every group associated with >1 distinct Product label (102 groups, 10,787 original records) is completely excluded from the supervised dataset.
4. **Deterministic canonical deduplication:** for groups with a single Product label, retain 1 canonical record with the lowest numeric `complaint_id`.
5. **Approved category filter:** retain only canonical records belonging to the 8 approved categories (excluding 1,861 non-approved category records).
6. **Stratified 70/15/15 split:** split the retained unique complaints with `random_state=42`.

The original raw archive ZIP is **never extracted or modified**.

### Final Full-Dataset Row Accounting

| Stage | Rows / Records |
|---|---|
| Total eligible in window (date + non-empty narrative + product) | 185,370 |
| Duplicates removed by Complaint ID | 0 |
| Excluded empty text post-cleaning | 15 |
| Eligible records after cleaning | 185,355 |
| Conflicting multi-label narrative groups excluded | 102 groups (10,787 records) |
| Non-conflicting records remaining | 174,568 |
| Duplicate narrative records removed | 87,865 |
| Canonical unique narratives across all products | 86,703 |
| Excluded non-approved labels (Payday loan: 1,078, Prepaid card: 496, Debt management: 287) | 1,861 |
| **Retained unique complaints for splitting** | **84,842** |
| — **Train (70%)** | **59,389** |
| — **Validation (15%)** | **12,726** |
| — **Test (15%)** | **12,727** |

### Retained Unique Complaint Class Distribution (84,842 rows)

| Product | Retained Unique | Retained % | Train (70%) | Val (15%) | Test (15%) |
|---|---|---|---|---|---|
| Credit reporting or other personal consumer reports | 54,878 | 64.68% | 38,414 | 8,232 | 8,232 |
| Debt collection | 10,996 | 12.96% | 7,697 | 1,649 | 1,650 |
| Credit card | 5,585 | 6.58% | 3,910 | 837 | 838 |
| Checking or savings account | 5,572 | 6.57% | 3,900 | 836 | 836 |
| Money transfer, virtual currency, or money service | 2,783 | 3.28% | 1,948 | 418 | 417 |
| Mortgage | 1,942 | 2.29% | 1,360 | 291 | 291 |
| Vehicle loan or lease | 1,660 | 1.96% | 1,162 | 249 | 249 |
| Student loan | 1,426 | 1.68% | 998 | 214 | 214 |
| **Total** | **84,842** | **100.00%** | **59,389** | **12,726** | **12,727** |

*(Note: Deduplication naturally reduced the "Credit reporting" dominance from 81.16% to 64.68%, restoring healthier representation to the other 7 categories.)*

### Test Results

**33/33 passed in 20.6s** (`python -m pytest nlp-service/tests/ -v`)
- 27 tests in `test_data_pipeline.py` (normalization, zero leakage, zero duplicates, zero ambiguous labels, exact schemas, reproducibility, manifest validation)
- 6 tests in `test_inspect.py` (Phase 1, all green)

Zero normalized narratives appear in more than one split. Zero duplicate narratives exist within any split. Zero ambiguous-label groups remain. Complaint IDs never overlap.

- 18 new tests in `test_data_pipeline.py`
- 6 existing tests in `test_inspect.py` (all still passing)

Tests verified:
- No overlapping Complaint IDs across splits
- No missing text or labels in any split
- Only approved labels present in all splits
- Stratification within ±5% relative tolerance per class
- Output columns are exactly `{complaint_id, text, product_category}` — no metadata
- Manifest contains all required keys including preprocessing provenance
- Duplicate removal correctness
- Out-of-window row exclusion
- Missing archive raises `FileNotFoundError` clearly
- `clean_narrative` removes XXXX case-insensitively, whole-word only

### Phase 2 files created / modified

- `nlp-service/training/data_split.py` *(new)*
- `nlp-service/tests/test_data_pipeline.py` *(new)*
- `nlp-service/requirements.txt` *(added scikit-learn>=1.3,<2.0)*
- `.gitignore` *(added split_manifest.json exclusion)*
- `MASTER_PLAN.md` *(this file, updated to v4)*
- `nlp-service/data/processed/train.csv` *(git-ignored — 128,437 rows)*
- `nlp-service/data/processed/val.csv` *(git-ignored — 27,522 rows)*
- `nlp-service/data/processed/test.csv` *(git-ignored — 27,523 rows)*
- `nlp-service/data/processed/split_manifest.json` *(git-ignored)*

### Limitations

- The dataset is heavily imbalanced: "Credit reporting or other personal consumer reports" accounts for ~81% of rows. Class-weighted training or oversampling strategies should be considered in Phase 3.
- XXXX mask removal may leave orphaned punctuation (e.g., "amount of  dollars."); accepted as a known limitation of the masking pattern.
- The `complaint_id` column is retained in split CSVs for audit only; all Phase 3+ training code must use only the `text` column as X and `product_category` as y.

## 5. Proposed architecture

- **Frontend:** React + TypeScript + Tailwind CSS.
- **Application backend:** Java + Spring Boot REST API; handles validation, case status, human review, policy routing and audit log.
- **NLP service:** Python + FastAPI; loads serialized TF-IDF baseline and later the Bi-LSTM model; accepts complaint text and returns category probabilities plus review flags.
- **Database:** PostgreSQL; stores submitted narrative, category predictions, priority-policy output, reviewer overrides and status history.
- **Deployment:** Docker Compose once Docker is installed and the independently tested services work locally.

Flow: citizen enters narrative → Spring Boot validates and stores a pending grievance → FastAPI classifies the narrative → Spring Boot stores the predicted `product_category`, confidence and model version → low-confidence/ambiguous cases go to the human review queue → all status changes and overrides enter an audit log.

## 6. API and data contracts

### FastAPI (`:8000`)

`POST /classify`

Request:
```json
{ "text": "The narrative supplied by the consumer, 20–5000 characters" }
```

Response:
```json
{
  "product_category": "Credit card",
  "confidence": 0.82,
  "margin": 0.65,
  "probabilities": { "Credit card": 0.82, "Credit reporting or other personal consumer reports": 0.17 },
  "model_used": "baseline_tfidf_logreg",
  "model_version": "7a9964e0ef15514d",
  "flag_for_review": false,
  "review_reasons": [],
  "triage_priority": "LOW",
  "priority_reasons": ["No critical distress, severe enforcement, or active fraud keywords detected."],
  "sentiment_score": 0.12,
  "sentiment_label": "POSITIVE",
  "disclaimer": "Category prediction is an automated recommendation for human triage. Class probabilities are uncalibrated model probability estimates and are not guaranteed to match empirical correctness rates. Triage priority is a heuristic rule-based score and has not been validated against labeled urgency outcomes. Human review is required."
}
```

The values above are schema examples only, not model output or measured results. Implement `GET /health` and `GET /models/info`. Fail fast if model artifacts are missing; never return hard-coded fake predictions.

### Spring Boot (`:8080/api`)

- `POST /grievances` — public submission; narrative required.
- `GET /grievances` — authenticated, paginated queue.
- `GET /grievances/{id}` — authenticated detail view.
- `PATCH /grievances/{id}/review` — reviewer override with a required audit note.
- `GET /grievances/stats` — reviewer dashboard counts.
- `GET /health` — liveness.

`GrievanceRequest` must have `description` as required non-empty text (recommended 20–5000 characters). Other fields like contact details should be optional and not sent to the ML service.

### PostgreSQL minimum schema

- `grievances`: `id`, `description TEXT NOT NULL`, `status`, `submitted_at`, `updated_at`.
- `predictions`: `grievance_id`, `product_category`, `confidence`, `model_used`, `model_version`, `probabilities JSONB`, `flag_for_review`, `predicted_at`.
- `triage_policy`: configured category/team mapping, default review tier, and versioned policy description. This is application-authored policy, not an ML target.
- `audit_log`: grievance ID, actor, action, old/new status, reviewer note, timestamp.

## 7. Model development phases

### Phase 1 — Dataset inspection ✅ COMPLETE
### Phase 2 — Reproducible text pipeline ✅ COMPLETE

### Phase 3 — TF-IDF + Logistic Regression baseline ✅ COMPLETE

- **Features:** `TfidfVectorizer(ngram_range=(1,2), max_features=50000)` fitted exclusively on `train.csv` (59,389 narratives).
- **Estimator:** `LogisticRegression(class_weight="balanced", solver="lbfgs", max_iter=1000, random_state=42)`.
- **Validation Results (`val.csv` — 12,726 narratives):**
  - **Macro F1:** **0.7453** (vs Majority Baseline: 0.0982)
  - **Weighted F1:** **0.8455** (vs Majority Baseline: 0.5082)
  - **Accuracy:** **0.8380** (vs Majority Baseline: 0.6469)
- **Saved Artifacts:** `baseline_tfidf_logreg.joblib`, `baseline_eval_val.json`, `baseline_confusion_matrix_val.csv`, `baseline_confusion_matrix_val.png`.

### Phase 4 — PyTorch Bi-LSTM Classifier ✅ COMPLETE

- **Vocabulary:** Custom tokenizer using regex `\b[a-z0-9]+(?:'[a-z]+)?\b`, `collections.Counter`, fitted strictly on `train.csv` (21,100 tokens, `min_freq=2`, reserved `<PAD>`=0, `<UNK>`=1).
- **Sequence Handling:** `max_seq_len=250` tokens (truncation rate: train 23.80%, val 23.41%), batch padding via `torch.nn.utils.rnn.pad_sequence`.
- **Architecture:**
  - Embedding: `nn.Embedding(21100, 128, padding_idx=0)`
  - Bi-LSTM: `nn.LSTM(128, 128, num_layers=1, bidirectional=True, batch_first=True)`
  - Sequence Pooling: Length-aware masked average pooling (prevents pad token dilution)
  - Head: `nn.Sequential(nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.3), nn.Linear(128, 8))`
  - Parameters: 2,998,920 trainable weights
- **Loss & Optimization:** `nn.CrossEntropyLoss(weight=class_weights)` computed exclusively from training distribution. `Adam(lr=1e-3, weight_decay=1e-5)`, batch size 128.
- **Hardware & Environment:**
  - GPU: NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB VRAM, Driver 592.82, CUDA 12.6)
  - PyTorch: `torch==2.14.1+cu126` (Python 3.14.7, Windows AMD64)
  - No `torchtext` installed.
  - Training Duration: 88.61s across 8 epochs (early stopping triggered at epoch 8; best epoch = 5).
- **Validation Results (`val.csv` — identical 12,726 narratives):**
  - **Macro F1:** **0.7067**
  - **Weighted F1:** **0.8230**
  - **Accuracy:** **0.8124**
  - **Validation Loss:** **0.6274**
- **Saved Artifacts:** `bilstm_best.pt`, `vocab.json`, `bilstm_config.json`, `bilstm_eval_val.json`, `model_comparison_val.md`.

### Phase 3 vs Phase 4 Validation Comparison

Evaluated on the exact identical 12,726 validation complaints in `val.csv`:

| Metric | Baseline (TF-IDF + LogReg) | Bi-LSTM (PyTorch) | Delta (Bi-LSTM - Baseline) |
|---|---|---|---|
| **Macro F1** | **0.7453** | **0.7067** | **-0.0386** |
| **Weighted F1** | **0.8455** | **0.8230** | **-0.0225** |
| **Accuracy** | **0.8380** | **0.8124** | **-0.0256** |

#### Per-Class Comparison (F1-Score)

| Product Category | Support | Baseline F1 | Bi-LSTM F1 | Delta F1 |
|---|---|---|---|---|
| Credit reporting or other personal consumer reports | 8,232 | 0.9056 | 0.8906 | -0.0150 |
| Debt collection | 1,649 | 0.7438 | 0.7142 | -0.0296 |
| Credit card | 837 | 0.7107 | 0.6720 | -0.0387 |
| Checking or savings account | 836 | 0.7703 | 0.7271 | -0.0432 |
| Money transfer, virtual currency, or money service | 418 | 0.7271 | 0.7177 | -0.0094 |
| Mortgage | 291 | 0.8299 | 0.8055 | -0.0244 |
| Student loan | 214 | 0.6432 | 0.5930 | -0.0502 |
| Vehicle loan or lease | 249 | 0.6321 | 0.5337 | -0.0984 |

**Empirical Analysis:**
The classical TF-IDF + Logistic Regression baseline achieved higher overall Macro F1 (0.7453 vs 0.7067). This is an expected and valid experimental finding in financial text triage: n-gram bag-of-words representations with 50,000 features capture exact domain terminology (e.g. "escrow", "repossession", "fcra", "wire transfer", "inquiry") very effectively across long narratives without sequence truncation, whereas a compact randomly-initialized Bi-LSTM trained on 59k examples without pretrained language model embeddings faces vocabulary sparsity and sequence truncation on longer complaints (23.8% truncated at 250 tokens).

### Test Suite Status

**87/87 tests passed in 58.1s** (`.\.venv\Scripts\python.exe -m pytest nlp-service/tests/ -v`)
- 34 tests in `test_api.py` (FastAPI endpoints, input schemas, preprocessing consistency, uncertainty flags, dual-trigger human review [Cases a–f], decision matrix unit test, triage priority, VADER sentiment, model failure handling, uncalibrated probability disclosures, no retraining on startup, test split security).
- 15 tests in `test_bilstm.py` (tokenizer reproducibility, reserved PAD/UNK, sequence truncation, variable-length collation, forward/backward pass, checkpoint consistency, class weighting, data quality gate, strict test.csv rejection, report generation).
- 5 tests in `test_baseline.py` (pipeline structure, fit/predict, evaluation structure, saved artifact loading).
- 27 tests in `test_data_pipeline.py` (deduplication, zero leakage, schema, reproducibility).
- 6 tests in `test_inspect.py` (archive inspection, non-fabrication).

### Sealed Test Split Audit

`test.csv` (12,727 rows) remains strictly sealed. Neither Phase 3/4 training pipelines nor the Phase 5 API code accesses or evaluates `test.csv`. Automated regression tests strictly enforce that `test.csv` cannot be imported or evaluated.

### Phase 5 — FastAPI NLP Service & Safety Corrections ✅ COMPLETE

- **Framework:** FastAPI 0.156.1, Uvicorn 0.54.0, Pydantic 2.14.1.
- **Active Serving Model:** TF-IDF (1,2-gram) + Logistic Regression (`models_saved/baseline_tfidf_logreg.joblib`), loaded once at application lifespan startup with zero startup retraining.
- **Endpoints:**
  - `POST /classify`: Preprocesses text identically to training (`clean_narrative`), executes baseline inference, evaluates uncertainty thresholds (`min_confidence=0.55`, `min_margin=0.15`), and returns recommended category, uncalibrated class probability estimates, review flags, and triage priority.
  - `GET /health`: Liveness and model availability (`ok` or `degraded`).
  - `GET /models/info`: Metadata, SHA-256 provenance (`7a9964e0ef15...`), active baseline validation metrics (Macro F1: 0.7453), and experimental Bi-LSTM benchmark metrics (Macro F1: 0.7067) with explicit non-serving notice.
- **Phase 5 Safety & Probability-Reporting Corrections (Applied):**
  - **Probability Calibration Disclosure:** Class probabilities from `predict_proba` are uncalibrated model probability estimates. No calibration method (Platt scaling, isotonic regression, temperature scaling) was performed or validated. These estimates are not guaranteed to match empirical correctness rates and are explicitly documented as uncalibrated model probability estimates.
  - **Dual-Trigger Human Review Architecture:** Human review (`flag_for_review: true`) is triggered if EITHER:
    1. Classification uncertainty threshold is breached (`top_prob < 0.55` or `margin < 0.15`).
    2. Triage priority is `HIGH` or `CRITICAL`, **regardless of classification confidence**.
  - **Explanatory Review Reasons:** `review_reasons` contains explicit diagnostic entries explaining all triggering conditions.
  - **Negative Sentiment Constraint:** Negative sentiment alone does NOT cause `CRITICAL` or `HIGH` triage, and does not automatically imply an emergency.
- **Privacy-Safe Operational Logging:**
  - Middleware logs only method, path, HTTP status, duration (ms), client IP, and text character count.
  - Raw complaint narratives, consumer identifiers, and PII are never logged.

### Phase 6 — Rule-Based Triage Priority & Sentiment Analysis ✅ COMPLETE

- Integrated rule-based triage priority evaluation (`app/services/triage.py`) covering:
  - `CRITICAL`: Imminent loss of shelter (eviction, foreclosure, sheriff sale) or active severe identity theft / account drain.
  - `HIGH`: Vehicle repossession, wage garnishment, unauthorized transfers, or acute hardship with strong negative sentiment.
  - `MEDIUM`: Disputed credit reporting inaccuracies, billing fee errors, escrow discrepancies.
  - `LOW`: Routine administrative inquiries, neutral questions, or complaints without high-priority triggers.
- VADER sentiment analysis (`vaderSentiment==3.3.2`) with strict guardrails preventing negative sentiment alone from escalating to emergency tiers.
- Integrated dual-trigger human review evaluation via `determine_review_status()`.

### Phase 7 — Spring Boot + PostgreSQL 🟡 IMPLEMENTED (Awaiting Local DB Credentials for Live Integration)

- **Architecture:** Spring Boot 4.1.1, Java 25 (`release 25`), Apache Maven Wrapper pinned to Maven 3.10.0.
- **REST Endpoints Implemented:**
  - `POST /api/grievances`: Public complaint submission with narrative Bean Validation (20–5000 chars), FastAPI NLP classification outside DB transaction, triage safety validation, atomic persistence of grievance, original prediction, and audit event.
  - `GET /api/grievances`: Paginated, filtered queue for review staff (HTTP Basic, `REVIEWER` role).
  - `GET /api/grievances/{id}`: Detailed view including original NLP predictions and audit history (staff-only).
  - `PATCH /api/grievances/{id}/review`: Review workflow supporting `APPROVE`, `OVERRIDE`, and `REJECT` actions with mandatory review notes for overrides/rejections and append-only audit logging.
  - `GET /api/grievances/stats`: Aggregate status and priority counts for staff dashboard.
  - `GET /api/product-categories`: Public list of the 8 approved CFPB product categories.
  - `GET /api/health`: Public liveness health check.
- **Flyway Migrations:**
  - `V1__create_schema.sql`: Four core relational tables (`product_categories`, `grievances`, `predictions`, `audit_log`) with UUID PKs, FKs, indexes, constraints, and JSONB fields.
  - `V2__seed_categories.sql`: Idempotent seed of the 8 exact CFPB product labels.
  - `V3__grant_privileges.sql`: Least-privilege role segregation between `civicresolve_migrator` (DDL owner) and `civicresolve_app` (DML only, no schema modification, append-only predictions and audit logs).
- **FastAPI Integration & Safety Contract:**
  - Authoritative upstream NLP integration via `NlpClientService` using Spring `RestClient` with connect (3s) and read (5s) timeouts.
  - Strict mapping to Pydantic schemas; fails safely with RFC 9457 Problem Details (400, 502, 503, 504, 500).
  - Dual-trigger safety contract: `HIGH` or `CRITICAL` priority with `flag_for_review=false` is rejected as an upstream violation (HTTP 502).
- **Security:**
  - Spring Security with BCrypt (cost factor 12).
  - `REVIEWER` authentication required for staff endpoints; public submission and health endpoints.
  - Reviewer password configurable via `REVIEWER_PASSWORD` environment variable (locks with inaccessible random secret if unset).
- **Test Results (Verified Execution):**
  - **Unit & Slice Tests:** 37/37 passing (11 GrievanceController slice tests, 10 GrievanceService unit tests, 16 NlpClientService validation and safety contract tests).
  - **Failsafe Integration Tests:** 9 tests in `PostgresIntegrationIT.java` configured for real PostgreSQL verification; gracefully skipped pending local DB password environment variables.

### Phase 8 — React frontend

Complaint text form, validation errors, predicted category with explanation of its confidence, citizen status view, staff queue and override controls.

### Phase 9 — Integration, Docker and security

Wire the services with health checks and secrets in environment variables. Add authentication/authorization, rate limiting, input size limits, safe logging, dependency scanning and end-to-end smoke tests.

## 8. Evaluation and safety rules

- Primary ML metric: macro F1; also show per-class precision, recall, F1 and a confusion matrix.
- Report class distribution, duplicate handling, train/validation/test sizes, split seed, package versions and model artifact hash.
- No leakage: vectorizer and vocabulary fit on train only; test data never used for model selection; response/status/company fields never enter text features.
- Do not claim high accuracy, real-world deployment, reduced resolution time or improved access without measured evidence.
- The application is an academic prototype. Human review must be available for low-confidence predictions and all policy overrides must be auditable.

## 9. Next step

Phases 1 through 6 are fully verified and complete. Phase 7 implementation is complete and verified across 37 automated tests:
- Phase 1: Dataset Inspection ✅ COMPLETE
- Phase 2: Reproducible Text Pipeline & Pre-Split Deduplication ✅ COMPLETE
- Phase 3: TF-IDF + Logistic Regression Baseline ✅ COMPLETE
- Phase 4: PyTorch Bi-LSTM Classifier Benchmark ✅ COMPLETE
- Phase 5: FastAPI NLP Microservice & Probability Calibration Disclosure ✅ COMPLETE
- Phase 6: Rule-Based Triage Priority & Dual-Trigger Human Review ✅ COMPLETE
- **Phase 7: Spring Boot REST API & PostgreSQL Integration 🟡 IMPLEMENTED (37/37 unit & slice tests pass; awaiting local DB credentials for live PostgreSQL verification)**

Next action: User sets environment variables in PowerShell to execute live PostgreSQL 18.6 integration tests (`backend\mvnw.cmd verify`), followed by Phase 8 (React frontend).



