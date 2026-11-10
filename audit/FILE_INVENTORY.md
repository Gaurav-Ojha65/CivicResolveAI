# CivicResolve AI — Audit Bundle File Inventory

> **Reviewer Target:** Argon (Independent AI Reviewer)  
> **Package Name:** `CivicResolveAI_Audit_Bundle.zip`  
> **Generated:** 2026-10-21  
> **Status:** Verified Read-Only Evidence Package  

---

## 1. Included Files Manifest

Total Included Files: 44

| # | Relative Path | Size (Bytes) | SHA-256 Checksum | Category / Purpose |
|---|---|---|---|---|
| 1 | `.gitignore` | 492 | `0322ffda9a1d9ef5e2f9ad1b4c085a5d7163e7d0df8b8778e10688afd140c787` | Configuration / Git exclusions |
| 2 | `MASTER_PLAN.md` | 25,562 | `74e587ee8cd5fd61da49f91bfd9b4c45fc19a1fb85e905445a2b50bf3ac37697` | Architecture & System Specification (v7) |
| 3 | `README.md` | 1,450 | `a869d00f83e8c4017f3a971d7658c874e1fc682c8ab03184593215ef05b04c6e` | Project Overview & Execution Starter |
| 4 | `EVIDENCE_INDEX.md` | 22,952 | `cb8a80c779a5d59e8447dbd56f4cc3a9a7e335160ca6967fcb9e56af4b065cdd` | Audit Evidence Index & Claims Traceability Matrix |
| 5 | `nlp-service/requirements.txt` | 177 | `e8071b91f2178084a37f8d98581c976f012f2486900d46796fe249b890da4231` | Python Dependencies Specification |
| 6 | `nlp-service/README.md` | 8,823 | `a58de7b14229977d2dfdaee161dff2c555f682879030381ab32f87bb783558fc` | FastAPI Microservice Documentation & Smoke Test Guide |
| 7 | `nlp-service/data/README.md` | 1,505 | `ef085d7bc89135b220e80cbbcae8751aa7218da42022a000f2671df1166ea633` | Dataset Provenance & Schema Documentation |
| 8 | `nlp-service/data/processed/.gitkeep` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Directory Anchor |
| 9 | `nlp-service/data/processed/split_manifest.json` | 5,259 | `5830218d7eb7d4d93afaa613b3239f48c8cb5a99736cf7560a05075af16f2601` | Deduplication & Split Accounting Manifest |
| 10 | `nlp-service/data/raw/dataset_report.txt` | 3,208 | `90fa94dff1329e5c72f3f61968a64897747faec0c98858ae5095cefd8744b149` | Phase 1 Dataset Inspection Report (25,000 Sample) |
| 11 | `nlp-service/app/__init__.py` | 59 | `70358603c58bfe0bd5b3c64fd6d239984279b7008f77432a97f173d187209746` | FastAPI App Package Initialization |
| 12 | `nlp-service/app/config.py` | 1,849 | `6c8381303cb03e88dfbfe2762b2e18e62e698f4f64a09be4fcf3844a0a5c820e` | Pydantic Settings & Hyperparameter Configuration |
| 13 | `nlp-service/app/main.py` | 9,963 | `48b8895b1bece45117c0ddc5a4fc544455e364179ba291f29446b15a042d8154` | FastAPI Application & Endpoints Definition |
| 14 | `nlp-service/app/schemas.py` | 4,591 | `e6717a41fd6d784bc614141f507013c3bf6127fdf23f6a903bda1f648169ed0f` | Pydantic Request & Response Schemas |
| 15 | `nlp-service/app/models/.gitkeep` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Directory Anchor |
| 16 | `nlp-service/app/preprocessing/__init__.py` | 179 | `b7bebb2ae5b961de3fe8c5a8a6dbdea4b9552a2136be6ab2c9866a661e01e678` | Preprocessing Package Initialization |
| 17 | `nlp-service/app/preprocessing/.gitkeep` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Directory Anchor |
| 18 | `nlp-service/app/preprocessing/cleaner.py` | 1,320 | `6e0ce5c2975179d6d248ec59304c1f24db5cd5f8a70a50a41e9ad3b2c1e09c67` | Text Cleaning & Redaction-Mask Normalization |
| 19 | `nlp-service/app/services/__init__.py` | 376 | `ff53b9d2ebd6bf1870a2419244d16a96b4a1aa6bd7ce72348c929dbded69f6d4` | Services Package Initialization |
| 20 | `nlp-service/app/services/model_manager.py` | 7,782 | `1a93e6325066582248cecae1d51a4174f3e5ceac226bfd9ae9de1456ab5d9d78` | Serving Model Lifecycle & Inference Manager |
| 21 | `nlp-service/app/services/triage.py` | 8,628 | `bf5b4ecdb2ca1fb2c10855400b3b51d4b0beae976d90c04fb7ab9778e53adb8b` | Rule-Based Triage Priority & Dual-Trigger Review Engine |
| 22 | `nlp-service/training/data_split.py` | 24,387 | `f197d89d68b97872974922601560fa12ef8a08b81242dba8c80a1772dc94f5a8` | Pre-Split Deduplication & Stratified Split Pipeline |
| 23 | `nlp-service/training/inspect_dataset.py` | 21,589 | `7c4cf2165efd8f1a647c4d7a59f9cf3afa67dc8cb0da880d5b99e1b97acb6deb` | Phase 1 Dataset Inspection & Archive Scanner |
| 24 | `nlp-service/training/train_baseline.py` | 16,914 | `5557f1a835590e4f6833cc74b3821c71414777efa2128607dc9fcf7c31e4a70f` | TF-IDF + Logistic Regression Training Pipeline |
| 25 | `nlp-service/training/train_bilstm.py` | 36,139 | `960e63a628cab48a9e6e940ddceb6d84b1dfb1e44c3b25d8aa6ac0db6ca6141e` | PyTorch Bi-LSTM Training & Evaluation Pipeline |
| 26 | `nlp-service/tests/test_api.py` | 20,680 | `17564e0eabc9ce58b017a34d4850865d691b2a93b7cf06b6f6b364eeb5882c80` | FastAPI Endpoints, Human-Review & Safety Tests (34 tests) |
| 27 | `nlp-service/tests/test_baseline.py` | 4,310 | `0df1862544cb3f27718e9d874651201dc8fbcb5e2b123adbf3cea72b1c111a91` | Baseline Model Artifact & Evaluation Tests (5 tests) |
| 28 | `nlp-service/tests/test_bilstm.py` | 11,110 | `437d9311e5ecbe59c2c822f577393310d81f4fce60ec3d2da3b9f41f7999e892` | Bi-LSTM Architecture & Safety Gate Tests (15 tests) |
| 29 | `nlp-service/tests/test_data_pipeline.py` | 22,281 | `0c06da1c166edd6f3ab37b07135d8710d585707dd6b0ac8047dd11f6925fd6b2` | Pipeline Deduplication & Leakage Tests (27 tests) |
| 30 | `nlp-service/tests/test_inspect.py` | 5,167 | `93e7b67118af92315b0a253409e6c4594bdcb98024f0a1cebdfb2ac67777ff67` | Phase 1 Dataset Inspection Tests (6 tests) |
| 31 | `nlp-service/models_saved/baseline_confusion_matrix_val.csv` | 595 | `abf56f59ec4c5bffcd64d07c89a0ac42819d0a1c1aff4da8e5378a5fe7d2e963` | TF-IDF Baseline Validation Confusion Matrix CSV |
| 32 | `nlp-service/models_saved/baseline_confusion_matrix_val.png` | 110,485 | `f787aa560a8f397356fe716f156bd1551e58b3dd9566bc7625a63c2c058f1042` | TF-IDF Baseline Confusion Matrix Visualization Plot |
| 33 | `nlp-service/models_saved/baseline_eval_val.json` | 4,379 | `3a1acf8c6583d2867a6edf3a24acabe70580c70b35c5b491c5e34b6ac99347ef` | TF-IDF Baseline Validation Evaluation Metrics JSON |
| 34 | `nlp-service/models_saved/bilstm_config.json` | 900 | `ee3fdaade0dba5c7c42772af6e99471bbf74d011b6a9a395ee6b7fe0f879736c` | Bi-LSTM Architecture Hyperparameter Configuration JSON |
| 35 | `nlp-service/models_saved/bilstm_eval_val.json` | 6,128 | `3350cd45d6d6a772520f6c50e17f56e4f58c63bf8b3c0bc1cf0a4480fc2c5ff0` | Bi-LSTM Benchmark Validation Evaluation Metrics JSON |
| 36 | `nlp-service/models_saved/model_comparison_val.md` | 3,748 | `25b33341a6e03cdf8c36dc0220269670b3ceb4bfda819ae7f4f41fe11ba0d13f` | Validation Split Model Comparison Report (Baseline vs Bi-LSTM) |
| 37 | `nlp-service/models_saved/vocab.json` | 487,049 | `9dd8deea24737f7c320ba5a401b0a31acfdd53762aca10fac682a39c387a7417` | Bi-LSTM Tokenizer Vocabulary Mapping (21,100 tokens) |
| 38 | `audit/EVIDENCE_INDEX.md` | 22,952 | `cb8a80c779a5d59e8447dbd56f4cc3a9a7e335160ca6967fcb9e56af4b065cdd` | Audit Evidence Index (Duplicate copy under audit/) |
| 39 | `audit/logs/fastapi_uvicorn_smoke_tests.log` | 1,839 | `5ec7a420703ed57e05d92d6b0b9dc913a0c8cb38b3b636c1e04ee02c2ebcb89f` | Live FastAPI Uvicorn Server Operational & HTTP Audit Log |
| 40 | `audit/logs/http_smoke_test_results.json` | 14,505 | `930ebbaa165d4163a3d1eed631286430f415112fe1ad5f72c1292451f04285ef` | Documented Live HTTP Smoke Test Payloads & Responses JSON |
| 41 | `audit/logs/pytest_api_suite_34_passed.log` | 6,788 | `d15f6cf6331ae3d1fdec85df746c83d4f7dd8c5f22d4caae765d69587021368d` | Pytest API Test Suite Execution Console Log (34 passed) |
| 42 | `audit/logs/pytest_full_suite_87_passed.log` | 12,810 | `1f36594df08e4f201197248b3b74586f6e9f99154832e66b76d0e788ad351d85` | Pytest Full Test Suite Execution Console Log (87 passed) |
| 43 | `audit/logs/pytest_pre_correction_80_passed.log` | 11,885 | `5879c0910d659623b6eabc17db7f7c2202d6d9402e46c1883ec2c29048aa449f` | Pytest Pre-Correction Test Suite Console Log (80 passed) |
| 44 | `audit/FILE_INVENTORY.md` | *(Self-referential inventory)* | *(Documented in manifest)* | Package Inventory and Checksums |

---

## 2. Excluded Large Model Binaries and Datasets Reference

In accordance with audit packaging guidelines, large raw datasets, processed split CSVs, and serialized model binary weights are excluded from the zip bundle to keep it compact and portable. Their actual sizes and SHA-256 checksums are recorded below for independent verification against runtime logs and manifests:

| # | Relative Path | Size (Bytes) | SHA-256 Checksum | Purpose / Description | Exclusion Rationale |
|---|---|---|---|---|---|
| 1 | `nlp-service/models_saved/baseline_tfidf_logreg.joblib` | 5,263,036 | `7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0` | Active TF-IDF + Logistic Regression Model Binary | Excluded due to binary size (5.0 MB). SHA-256 verified in inventory and matches runtime log. |
| 2 | `nlp-service/models_saved/bilstm_best.pt` | 36,002,280 | `d97febad4388fd5307fed993472c172b5fa9c94017383c1c2cbc11def3451890` | PyTorch Bi-LSTM Trained Weights Checkpoint | Excluded due to binary size (34.3 MB). SHA-256 verified in inventory. |
| 3 | `nlp-service/data/raw/cfpb_2025_may_june.zip` | 74,546,009 | `b7c8475a183e5a01f72aec794d6bc9d8a12a98cce272b3b406d9a0b067479adb` | Raw CFPB Complaints Historical ZIP Archive | Excluded due to archive size (71.1 MB uncompressed: 460.4 MB CSV). |
| 4 | `nlp-service/data/processed/train.csv` | 72,985,772 | `1cbca2213e6a0724abd34aef50be4061b2b6c52d98bbcf4ebf54538826a93d4f` | Processed Training Set (59,389 records) | Excluded due to dataset size (69.6 MB). Provenance recorded in `split_manifest.json`. |
| 5 | `nlp-service/data/processed/val.csv` | 15,441,980 | `f7fc1e0912a51cd4c41e9e5ca0db2b682ec99f693256d1b433c3e1911c1c9ac7` | Processed Validation Set (12,726 records) | Excluded due to dataset size (14.7 MB). Provenance recorded in `split_manifest.json`. |
| 6 | `nlp-service/data/processed/test.csv` | 15,819,918 | `10796f7f979a9380b1f7672999fbf0a11b445be95eaaf2256a06c0a91660b6c3` | Processed Test Set (12,727 records) — SEALED | Excluded to protect sealed test split integrity (15.1 MB). Strictly unread and unevaluated. |

---

## 3. Explicit Evidence Gaps

1. **`nlp-service/models_saved/bilstm_confusion_matrix_val.csv`**: **MISSING / UNAVAILABLE**  
   - *Rationale:* During Phase 4 model training, `train_bilstm.py` computed and recorded complete validation metrics, loss, per-class metrics, support, and the top misclassification pairs directly into `bilstm_eval_val.json` and `model_comparison_val.md`. A standalone raw $8 \times 8$ confusion matrix CSV was not written to disk for Bi-LSTM.
2. **`nlp-service/data/processed/test.csv` Evaluation Results**: **INTENTIONALLY SEALED / NOT EVALUATED**  
   - *Rationale:* In accordance with strict ML governance rules, the final test set remains unread and sealed. No test set predictions or metrics were computed.
3. **Phases 7–9 Components**: **NOT IMPLEMENTED**  
   - *Rationale:* Spring Boot REST API, PostgreSQL database, React frontend, and Docker Compose deployment are planned for future phases and do not exist in this bundle.

---

## 4. Verification Instructions for Argon

To verify the bundle after extraction:
1. Verify SHA-256 checksums of included files against Table 1.
2. Check `split_manifest.json` against `train.csv`, `val.csv`, and `test.csv` hashes in Table 2.
3. Check `audit/logs/fastapi_uvicorn_smoke_tests.log` line 4–5 to verify that `baseline_tfidf_logreg.joblib` loaded with SHA-256 `7a9964e0ef15...`.
4. Verify `audit/logs/pytest_full_suite_87_passed.log` confirming that all 87 automated tests passed on Python 3.14.7.
5. Consult `EVIDENCE_INDEX.md` for claim-by-claim verification mappings.
