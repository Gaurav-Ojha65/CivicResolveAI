# CivicResolve AI — Independent Audit Evidence Index

> **Reviewer Target:** Argon (Independent AI Reviewer)  
> **Date Generated:** 2026-10-21  
> **Project Scope:** Phases 1–6 Complete (NLP Microservice, Pre-Split Deduplication, Baseline TF-IDF Model, Bi-LSTM Benchmark, Dual-Trigger Human Review & Triage Engine, Probability Calibration Clarification).  
> **Repository Baseline:** Classical TF-IDF Baseline serving in FastAPI (`:8000`). Test split remains strictly sealed.

---

## 1. Executive Summary & Verification Taxonomy

Argon, this document indexes all verified claims made in `MASTER_PLAN.md` to their corresponding source code, automated regression tests, serialized validation artifacts, and live runtime logs.

Evidence is categorized into four strict verification levels:
1. **Verified Runtime Execution:** Backed by real execution logs from `pytest` runs (87/87 passed) or live HTTP server audit logs (`GET /health`, `GET /models/info`, `POST /classify`).
2. **Verified Artifact:** Backed by static, serialized JSON/CSV/PNG/MD data files produced during dataset splitting and model training.
3. **Verified Static Code:** Backed by inspectable Python source code, schemas, and rule engines.
4. **Planned / Unimplemented:** Features scheduled for future phases (Phase 7: Spring Boot, Phase 8: React, Phase 9: Docker/Production Security) that are explicitly not yet created.

---

## 2. Master Plan Claims to Evidence Mapping

### Claim 1: Task Definition & Supervised Label Contract
- **Claim:** CivicResolve AI classifies genuine natural-language consumer complaint narratives into an approved consumer-financial product category (`product_category`). The target is a financial product, NOT a government agency. A blank or missing narrative is rejected with HTTP 422. Exclude all metadata from model inputs.
- **Source Files:**
  - `nlp-service/app/schemas.py` (`ClassifyRequest`, `ClassifyResponse`)
  - `nlp-service/app/main.py` (`classify_complaint`, `validation_exception_handler`)
  - `nlp-service/app/preprocessing/cleaner.py` (`clean_narrative`, `normalize_narrative`)
- **Automated Tests:**
  - `nlp-service/tests/test_api.py::TestInputValidationAndErrors::test_empty_text_rejected`
  - `nlp-service/tests/test_api.py::TestInputValidationAndErrors::test_short_text_rejected`
  - `nlp-service/tests/test_api.py::TestInputValidationAndErrors::test_overlong_text_rejected`
  - `nlp-service/tests/test_api.py::TestInputValidationAndErrors::test_missing_text_field`
  - `nlp-service/tests/test_api.py::TestInputValidationAndErrors::test_wrong_input_type`
  - `nlp-service/tests/test_api.py::TestInputValidationAndErrors::test_only_mask_words_empty_after_cleaning`
- **Metric Artifact:**
  - `nlp-service/data/processed/split_manifest.json` (`output_columns`: `model_feature_X: "text"`, `target_y: "product_category"`, `audit_only_not_model_input: "complaint_id"`)
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 14–19)
- **Verification Level:** Verified Static Code & Verified Runtime Execution

---

### Claim 2: Narrative Source & September 2026 CFPB API Deprecation
- **Claim:** The official CFPB API removed public consumer complaint narratives in September 2026. Live APIs cannot provide narratives. A local historical snapshot (`cfpb_2025_may_june.zip`, May 11–June 30, 2025) was used. The script inspects real archives and never fabricates metrics.
- **Source Files:**
  - `nlp-service/training/inspect_dataset.py`
  - `nlp-service/data/README.md`
- **Automated Tests:**
  - `nlp-service/tests/test_inspect.py::test_api_failure_report_does_not_fabricate_metrics`
  - `nlp-service/tests/test_inspect.py::test_missing_narrative_field_is_rejected`
  - `nlp-service/tests/test_inspect.py::test_limit_validation`
  - `nlp-service/tests/test_inspect.py::test_local_csv_archive_filters_dates_and_uses_seeded_limit`
  - `nlp-service/tests/test_inspect.py::test_historical_snapshot_viewer_parser_with_mocked_response`
- **Metric Artifact:**
  - `nlp-service/data/raw/dataset_report.txt` (recorded 185,370 eligible records, 25,000 inspected sample, 58.16% XXXX masks, 11 unique products)
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 89–94)
- **Verification Level:** Verified Artifact & Verified Runtime Execution

---

### Claim 3: Pre-Split Narrative Deduplication & Zero Cross-Split Leakage
- **Claim:** Row-level splitting in consumer complaint datasets causes massive leakage due to identical boilerplate form letters across splits and multi-label conflicts. CivicResolve AI applied deterministic Pre-Split Deduplication:
  1. Excluded 102 conflicting multi-label narrative groups (10,787 rows).
  2. For non-conflicting duplicate narratives, retained 1 canonical record with the lowest numeric `complaint_id`.
  3. Filtered out non-approved labels (1,861 rows).
  4. Yielded zero cross-split normalized narrative overlap, zero intra-split duplicate narratives, and zero overlapping Complaint IDs.
- **Source Files:**
  - `nlp-service/training/data_split.py` (`build_deduplicated_splits`, `clean_narrative`, `normalize_narrative`)
  - `nlp-service/app/preprocessing/cleaner.py`
- **Automated Tests:**
  - `nlp-service/tests/test_data_pipeline.py::TestCleanAndNormalizeNarrative` (8 tests)
  - `nlp-service/tests/test_data_pipeline.py::TestBuildPipeline::test_no_cross_split_normalized_narrative_overlap`
  - `nlp-service/tests/test_data_pipeline.py::TestBuildPipeline::test_no_duplicate_normalized_narratives_within_any_split`
  - `nlp-service/tests/test_data_pipeline.py::TestBuildPipeline::test_no_ambiguous_label_narrative_groups_remain`
  - `nlp-service/tests/test_data_pipeline.py::TestBuildPipeline::test_no_overlapping_complaint_ids`
  - `nlp-service/tests/test_data_pipeline.py::TestRealProcessedDataset::test_real_splits_zero_cross_split_leakage`
  - `nlp-service/tests/test_data_pipeline.py::TestRealProcessedDataset::test_real_splits_zero_duplicate_narratives_within_split`
  - `nlp-service/tests/test_data_pipeline.py::TestRealProcessedDataset::test_real_splits_zero_ambiguous_label_narratives`
  - `nlp-service/tests/test_data_pipeline.py::TestRealProcessedDataset::test_real_splits_zero_overlapping_complaint_ids`
- **Metric Artifact:**
  - `nlp-service/data/processed/split_manifest.json` (`row_counts`, `class_distribution`, `preprocessing`)
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 62–88)
- **Verification Level:** Verified Artifact & Verified Runtime Execution

---

### Claim 4: Stratified 70/15/15 Data Accounting
- **Claim:** Total retained canonical complaints for splitting = 84,842.
  - Train (70%): 59,389
  - Validation (15%): 12,726
  - Test (15%): 12,727
  - Stratified across 8 approved product categories within $\pm 5\%$ relative tolerance.
- **Source Files:**
  - `nlp-service/training/data_split.py`
- **Automated Tests:**
  - `nlp-service/tests/test_data_pipeline.py::TestRealProcessedDataset::test_manifest_row_counts_match_csvs`
  - `nlp-service/tests/test_data_pipeline.py::TestBuildPipeline::test_stratification_within_tolerance`
  - `nlp-service/tests/test_data_pipeline.py::TestRealProcessedDataset::test_real_splits_class_distribution_matches_manifest`
  - `nlp-service/tests/test_data_pipeline.py::TestRealProcessedDataset::test_real_splits_only_approved_labels`
- **Metric Artifact:**
  - `nlp-service/data/processed/split_manifest.json`
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 78–88)
- **Verification Level:** Verified Artifact & Verified Runtime Execution

---

### Claim 5: Sealed Test Split Protocol
- **Claim:** `test.csv` (12,727 rows) remains strictly sealed. Neither Phase 3/4 model training nor the Phase 5/6 serving API ever reads, evaluates, or imports `test.csv`.
- **Source Files:**
  - `nlp-service/training/train_baseline.py` (loads `train.csv` and `val.csv` only)
  - `nlp-service/training/train_bilstm.py` (loads `train.csv` and `val.csv` only; explicitly rejects `test.csv`)
  - `nlp-service/app/main.py`
- **Automated Tests:**
  - `nlp-service/tests/test_api.py::TestFailureHandlingAndNoRetraining::test_no_test_csv_access_in_app`
  - `nlp-service/tests/test_bilstm.py::TestClassWeightsAndDataQuality::test_test_csv_strictly_rejected`
- **Metric Artifact:**
  - `nlp-service/models_saved/baseline_eval_val.json` (`num_val_samples: 12726`)
  - `nlp-service/models_saved/bilstm_eval_val.json` (`num_val_samples: 12726`)
  - `nlp-service/models_saved/model_comparison_val.md` (Section 1 & 5 explicitly confirm `test.csv` was never evaluated)
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (line 41, line 60)
- **Verification Level:** Verified Static Code, Verified Artifact & Verified Runtime Execution

---

### Claim 6: TF-IDF + Logistic Regression Baseline Metrics
- **Claim:** TF-IDF (1,2-gram, max 50,000 features) + Logistic Regression (balanced class weights, L-BFGS, `max_iter=1000`). Evaluated strictly on `val.csv` (12,726 samples):
  - Accuracy: **0.8380** (vs Majority Baseline: 0.6469)
  - Macro F1: **0.7453** (vs Majority Baseline: 0.0982)
  - Weighted F1: **0.8455** (vs Majority Baseline: 0.5082)
- **Source Files:**
  - `nlp-service/training/train_baseline.py`
  - `nlp-service/app/services/model_manager.py`
- **Automated Tests:**
  - `nlp-service/tests/test_baseline.py::TestBaselinePipeline::test_pipeline_structure`
  - `nlp-service/tests/test_baseline.py::TestBaselinePipeline::test_pipeline_fit_and_predict`
  - `nlp-service/tests/test_baseline.py::TestBaselinePipeline::test_evaluate_baseline_structure`
  - `nlp-service/tests/test_baseline.py::TestBaselinePipeline::test_saved_baseline_model_artifact`
  - `nlp-service/tests/test_baseline.py::TestBaselinePipeline::test_saved_baseline_eval_json`
- **Metric Artifacts:**
  - `nlp-service/models_saved/baseline_eval_val.json` (exact metrics, per-class table, top errors)
  - `nlp-service/models_saved/baseline_confusion_matrix_val.csv` (full $8 \times 8$ confusion matrix)
  - `nlp-service/models_saved/baseline_confusion_matrix_val.png` (confusion matrix plot)
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 42–46)
  - `audit/logs/http_smoke_test_results.json` (test `ST-02`)
- **Verification Level:** Verified Artifact & Verified Runtime Execution

---

### Claim 7: PyTorch Bi-LSTM Classifier Benchmark
- **Claim:** Bidirectional LSTM with length-aware masked pooling, custom regex tokenizer, closed vocabulary of 21,100 tokens (`<PAD>`=0, `<UNK>`=1), 2,998,920 parameters. No `torchtext`. Trained on CUDA (RTX 4050, 88.61s). Evaluated on identical `val.csv` (12,726 samples):
  - Accuracy: **0.8124**
  - Macro F1: **0.7067**
  - Weighted F1: **0.8230**
  - Validation Loss: **0.6274**
- **Source Files:**
  - `nlp-service/training/train_bilstm.py`
- **Automated Tests:**
  - `nlp-service/tests/test_bilstm.py` (all 15 tests: tokenizer, vocab, truncation, collate batch, forward/backward, checkpoint, weights, report)
- **Metric Artifacts:**
  - `nlp-service/models_saved/bilstm_eval_val.json` (per-class precision, recall, F1, loss, hardware)
  - `nlp-service/models_saved/bilstm_config.json` (hyperparameters and layer dimensions)
  - `nlp-service/models_saved/vocab.json` (21,100 token vocabulary mapping)
  - `nlp-service/models_saved/model_comparison_val.md`
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 47–61)
  - `audit/logs/http_smoke_test_results.json` (test `ST-02`)
- **Evidence Gap Note:** `bilstm_confusion_matrix_val.csv` is not present; Bi-LSTM evaluation was stored in JSON and Markdown format.
- **Verification Level:** Verified Artifact & Verified Runtime Execution

---

### Claim 8: Model Selection & Serving Decision
- **Claim:** Classical TF-IDF baseline was selected for live serving because it outperformed the Bi-LSTM by +0.0386 Macro F1 (0.7453 vs 0.7067) and had superior zero-truncation vocabulary coverage on long legal/financial complaint narratives. The Bi-LSTM checkpoint is preserved for benchmark comparison and is not loaded into the active serving pipeline.
- **Source Files:**
  - `nlp-service/app/services/model_manager.py` (`model_manager.load`, `model_manager.get_info`)
  - `nlp-service/models_saved/model_comparison_val.md`
- **Automated Tests:**
  - `nlp-service/tests/test_api.py::TestHealthAndInfoEndpoints::test_models_info_endpoint`
- **Metric Artifact:**
  - `nlp-service/models_saved/model_comparison_val.md`
- **Runtime Log Evidence:**
  - `audit/logs/http_smoke_test_results.json` (`GET /models/info` response includes explicit notice: `"Benchmark reference only. Not active serving model."`)
- **Verification Level:** Verified Artifact & Verified Runtime Execution

---

### Claim 9: FastAPI Microservice Lifecycle & Operational Safeguards
- **Claim:** Model pipeline deserializes once during lifespan startup without retraining. Returns HTTP 503 if model artifact is unavailable. Operational logging middleware logs request metadata (method, path, status, latency) while strictly excluding raw complaint narratives or consumer PII.
- **Source Files:**
  - `nlp-service/app/main.py` (`lifespan`, `audit_logging_middleware`, `health_check`)
  - `nlp-service/app/config.py`
  - `nlp-service/app/services/model_manager.py`
- **Automated Tests:**
  - `nlp-service/tests/test_api.py::TestFailureHandlingAndNoRetraining::test_no_retraining_on_startup`
  - `nlp-service/tests/test_api.py::TestFailureHandlingAndNoRetraining::test_missing_model_artifact_handling`
  - `nlp-service/tests/test_api.py::TestFailureHandlingAndNoRetraining::test_health_reports_degraded_when_model_missing`
  - `nlp-service/tests/test_api.py::TestHealthAndInfoEndpoints::test_health_endpoint_healthy`
- **Runtime Log Evidence:**
  - `audit/logs/fastapi_uvicorn_smoke_tests.log` (shows model loaded once on startup, subsequent requests logged with status, latency, and client IP without narrative leaks)
  - `audit/logs/http_smoke_test_results.json` (tests `ST-01` and `ST-02`)
- **Verification Level:** Verified Static Code, Verified Runtime Log & Verified Runtime Execution

---

### Claim 10: Rule-Based Triage Priority & Sentiment Guardrails
- **Claim:** Transparent heuristic triage engine evaluates narratives into four tiers:
  - `CRITICAL`: Imminent loss of shelter (eviction, foreclosure, sheriff sale) or active severe identity theft fund drain.
  - `HIGH`: Repossession, wage garnishment, unauthorized transfers, or severe personal distress supported by negative sentiment.
  - `MEDIUM`: Disputed credit reporting inaccuracies, billing fee errors, escrow discrepancies.
  - `LOW`: Routine administrative inquiries, neutral requests, or disputes without explicit emergency triggers.
  - **Constraint:** Negative sentiment alone does NOT cause `CRITICAL` or `HIGH` triage, and does not automatically imply an emergency.
- **Source Files:**
  - `nlp-service/app/services/triage.py` (`evaluate_triage_priority`, `evaluate_sentiment`, `CRITICAL_PATTERNS`, `HIGH_PATTERNS`, `DISTRESS_PATTERNS`, `MEDIUM_PATTERNS`)
- **Automated Tests:**
  - `nlp-service/tests/test_api.py::TestRuleBasedTriagePriorityAndSentiment::test_critical_priority_eviction_trigger`
  - `nlp-service/tests/test_api.py::TestRuleBasedTriagePriorityAndSentiment::test_critical_priority_identity_theft_drain`
  - `nlp-service/tests/test_api.py::TestRuleBasedTriagePriorityAndSentiment::test_high_priority_repossession`
  - `nlp-service/tests/test_api.py::TestRuleBasedTriagePriorityAndSentiment::test_high_priority_wage_garnishment`
  - `nlp-service/tests/test_api.py::TestRuleBasedTriagePriorityAndSentiment::test_medium_priority_credit_dispute`
  - `nlp-service/tests/test_api.py::TestRuleBasedTriagePriorityAndSentiment::test_low_priority_routine_inquiry`
  - `nlp-service/tests/test_api.py::TestRuleBasedTriagePriorityAndSentiment::test_negative_sentiment_alone_does_not_trigger_emergency`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_case_f_negative_sentiment_without_trigger_not_critical`
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 30–37)
  - `audit/logs/http_smoke_test_results.json` (test `ST-04`: compound `-0.9514` yields `triage_priority: "LOW"`, `priority_reasons: ["No critical distress, severe enforcement, or active fraud keywords detected.", "Note: Narrative contains negative sentiment (-0.9514), but no explicit high-priority triggers."]`)
- **Verification Level:** Verified Static Code, Runtime Log & Verified Runtime Execution

---

### Claim 11: Dual-Trigger Human Review Architecture
- **Claim:** A complaint narrative is flagged for human review (`flag_for_review: true`) if EITHER:
  1. Classification uncertainty threshold is breached: top predicted class probability estimate $< 0.55$ (`min_confidence`) OR runner-up margin $< 0.15$ (`min_margin`).
  2. Triage priority is `HIGH` or `CRITICAL`, **regardless of classification confidence**.
  - All triggering conditions are explained in `review_reasons`.
- **Source Files:**
  - `nlp-service/app/services/triage.py` (`determine_review_status`)
  - `nlp-service/app/main.py` (`classify_complaint`)
  - `nlp-service/app/schemas.py` (`ClassifyResponse`)
- **Automated Tests:**
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_determine_review_status_unit_matrix`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_review_flag_triggered_by_low_confidence`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_review_flag_triggered_by_narrow_margin`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_case_a_high_confidence_critical_triggers_human_review`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_case_b_high_confidence_high_triggers_human_review`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_case_c_high_confidence_low_no_review_required`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_case_d_low_confidence_triggers_review`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_case_e_narrow_margin_triggers_review`
  - `nlp-service/tests/test_api.py::TestHumanReviewAndUncertaintyFlags::test_case_f_negative_sentiment_without_trigger_not_critical`
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (lines 22–30)
  - `audit/logs/http_smoke_test_results.json`:
    - `ST-03` (Foreclosure): `confidence: 0.9959`, `margin: 0.9942`, `flag_for_review: true`, `review_reasons: ["Triage priority is CRITICAL; human review is required regardless of classification confidence."]`
    - `ST-07` (Repossession): `confidence: 0.9939`, `margin: 0.9913`, `flag_for_review: true`, `review_reasons: ["Triage priority is HIGH; human review is required regardless of classification confidence."]`
    - `ST-05` (Credit Dispute): `confidence: 0.8748`, `margin: 0.8247`, `flag_for_review: false`, `review_reasons: []`
    - `ST-06` (Routine Inquiry): `confidence: 0.6250`, `margin: 0.3976`, `flag_for_review: false`, `review_reasons: []`
- **Verification Level:** Verified Static Code, Runtime Log & Verified Runtime Execution

---

### Claim 12: Uncalibrated Model Probability Estimates Disclosure
- **Claim:** The model's `predict_proba` outputs are uncalibrated model probability estimates produced by `LogisticRegression`. No probability calibration procedure (Platt scaling, isotonic regression, temperature scaling) was performed or validated. These outputs are relative model scoring estimates and are not guaranteed to match empirical correctness rates. This limitation is explicitly documented in API schemas, endpoint docstrings, and response disclaimers.
- **Source Files:**
  - `nlp-service/app/schemas.py` (`ClassifyResponse` field descriptions for `confidence`, `probabilities`, and `disclaimer`)
  - `nlp-service/app/services/model_manager.py` (module docstring and comments)
  - `nlp-service/app/main.py` (`classify_complaint` docstring and disclaimer)
  - `nlp-service/README.md` (Section 5 & 7)
- **Automated Tests:**
  - `nlp-service/tests/test_api.py::TestClassificationEndpoint::test_classify_credit_reporting_complaint`
- **Runtime Log Evidence:**
  - `audit/logs/http_smoke_test_results.json` (all classification responses return disclaimer: `"Category prediction is an automated recommendation for human triage. Class probabilities are uncalibrated model probability estimates and are not guaranteed to match empirical correctness rates. Triage priority is a heuristic rule-based score and has not been validated against labeled urgency outcomes. Human review is required."`)
- **Verification Level:** Verified Static Code & Verified Runtime Log

---

### Claim 13: Test Suite Integrity & Regression Status
- **Claim:** The full automated test suite consists of 87 tests across 5 test modules. All 87 tests execute and pass without failure.
- **Source Files:**
  - `nlp-service/tests/test_api.py` (34 tests)
  - `nlp-service/tests/test_bilstm.py` (15 tests)
  - `nlp-service/tests/test_baseline.py` (5 tests)
  - `nlp-service/tests/test_data_pipeline.py` (27 tests)
  - `nlp-service/tests/test_inspect.py` (6 tests)
- **Runtime Log Evidence:**
  - `audit/logs/pytest_full_suite_87_passed.log` (`======================= 87 passed, 9 warnings in 44.39s =======================`)
  - `audit/logs/pytest_pre_correction_80_passed.log` (prior session log: `80 passed, 9 warnings in 54.39s`)
  - `audit/logs/pytest_api_suite_34_passed.log` (`34 passed, 9 warnings in 29.71s`)
- **Verification Level:** Verified Runtime Execution

---

### Claim 14: Phase Progression Sequence
- **Claim:** Phases 1–6 are complete. The intended next phase is Phase 7 (Spring Boot REST API & PostgreSQL Integration). Zero phases were skipped.
- **Source Files:**
  - `MASTER_PLAN.md` (Sections 7 and 9)
  - `nlp-service/README.md`
- **Verification Level:** Verified Documentation & Roadmap

---

## 3. Explicit Evidence Gaps and Limitations

1. **Bi-LSTM Confusion Matrix CSV:**
   - `bilstm_confusion_matrix_val.csv` is **not present** in the repository.
   - *Impact:* During Phase 4, the Bi-LSTM training script (`train_bilstm.py`) generated per-class metrics, support, validation loss, and top misclassification error pairs into `bilstm_eval_val.json` and `model_comparison_val.md` rather than writing out a standalone raw $8 \times 8$ confusion matrix CSV.
2. **Sealed Test Set Evaluation:**
   - No test set evaluation was performed. `test.csv` (12,727 rows) remains unread and sealed.
   - *Impact:* No empirical test-set F1 or accuracy metrics exist. All reported metrics are validation-split evaluations on `val.csv` (12,726 rows).
3. **Phases 7–9 (Future Work):**
   - Spring Boot REST API, PostgreSQL database, React frontend, Docker Compose configuration, and end-to-end integration tests are **not yet implemented**.
