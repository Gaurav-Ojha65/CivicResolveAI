"""CivicResolve AI — Tests for Phase 9 NLP Service Extensions.

Verifies:
1. Probability calibration metrics endpoint (GET /models/calibration).
2. Live Dual-Model Arena endpoint (POST /classify/compare).
3. Semantic precedent ranker endpoint (POST /precedents/rank).
4. Mandatory safety gate: test.csv is strictly sealed and never accessed by Phase 9 code.
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

NLP_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(NLP_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_SERVICE_DIR))

from app.config import APPROVED_LABELS
from app.main import app


@pytest.fixture(scope="module")
def client():
    """Create TestClient with the loaded model in application lifespan."""
    with TestClient(app) as test_client:
        yield test_client


class TestCalibrationEndpoint:
    """Verify probability calibration endpoint and 10-bin reliability curves."""

    def test_get_calibration_metrics(self, client):
        response = client.get("/models/calibration")
        assert response.status_code == 200
        data = response.json()

        assert "val.csv" in data["evaluation_dataset"]
        assert "test.csv" not in data["evaluation_dataset"]
        assert data["total_validation_rows"] == 12726
        assert data["calibration_fit_rows"] == 6363
        assert data["calibration_eval_rows"] == 6363
        assert 0.1 <= data["optimal_temperature"] <= 5.0

        # Calibration improvements
        assert data["uncalibrated_ece"] > 0
        assert data["calibrated_ece"] < data["uncalibrated_ece"]
        assert data["ece_reduction_percent"] > 0
        assert data["calibrated_brier"] <= data["uncalibrated_brier"]

        # 10 bins verification
        assert len(data["uncalibrated_bins"]) == 10
        assert len(data["calibrated_bins"]) == 10

        for b in data["uncalibrated_bins"]:
            assert "bin_index" in b
            assert "sample_count" in b
            assert "empirical_accuracy" in b
            assert "mean_confidence" in b

        assert "disclaimer" in data
        assert "val.csv" in data["disclaimer"]
        assert "test.csv" in data["disclaimer"]  # mentions test.csv was NEVER accessed


class TestDualModelArenaEndpoint:
    """Verify live side-by-side inference of TF-IDF baseline and PyTorch Bi-LSTM."""

    def test_compare_models_credit_reporting(self, client):
        payload = {
            "text": (
                "There are several fraudulent collection accounts listed on my credit report from Equifax. "
                "I sent written dispute notices via certified mail with proof of identity theft, but they "
                "failed to block or delete the unauthorized tradelines within 30 days."
            )
        }
        response = client.post("/classify/compare", json=payload)
        assert response.status_code == 200
        data = response.json()

        # Check baseline output
        base = data["baseline"]
        assert base["model_name"] == "TF-IDF + Logistic Regression (balanced)"
        assert base["model_type"] == "linear_tfidf"
        assert base["predicted_category"] == "Credit reporting or other personal consumer reports"
        assert 0.0 <= base["confidence"] <= 1.0
        assert base["token_or_feature_count"] > 0
        assert base["latency_ms"] >= 0.0

        # Check Bi-LSTM output
        bilstm = data["bilstm"]
        assert bilstm["model_name"] == "BiLSTMClassifier (PyTorch)"
        assert bilstm["model_type"] == "neural_bilstm"
        assert bilstm["predicted_category"] in APPROVED_LABELS
        assert 0.0 <= bilstm["confidence"] <= 1.0
        assert bilstm["token_or_feature_count"] > 0
        assert bilstm["latency_ms"] >= 0.0

        # Check agreement & comparison metadata
        assert isinstance(data["models_agree"], bool)
        assert isinstance(data["confidence_delta"], float)
        assert "disclaimer" in data

    def test_compare_models_validation_error(self, client):
        # Text under 10 chars should produce 422
        response = client.post("/classify/compare", json={"text": "Too short"})
        assert response.status_code == 422


class TestPrecedentRankingEndpoint:
    """Verify TF-IDF cosine similarity ranking and PII sanitization."""

    def test_rank_precedents_relevance_ordering(self, client):
        payload = {
            "query_text": "Bank assessed illegal overdraft fees on my checking account when my balance was positive.",
            "candidates": [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "text": "Overdraft protection fee charged to checking account erroneously by bank branch manager.",
                    "predicted_category": "Checking or savings account",
                    "assigned_category": "Checking or savings account",
                    "status": "APPROVED",
                    "adjudicated_at": "2026-11-08T10:00:00Z",
                },
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "text": "Mortgage escrow calculation mistake led to increased monthly mortgage payment on my house.",
                    "predicted_category": "Mortgage",
                    "assigned_category": "Mortgage",
                    "status": "APPROVED",
                    "adjudicated_at": "2026-11-07T14:00:00Z",
                },
                {
                    "id": "33333333-3333-3333-3333-333333333333",
                    "text": "Student loan servicer failed to apply income-driven repayment plan to federal student loan.",
                    "predicted_category": "Student loan",
                    "assigned_category": "Student loan",
                    "status": "APPROVED",
                    "adjudicated_at": "2026-11-06T09:00:00Z",
                },
            ],
            "top_k": 3,
        }
        response = client.post("/precedents/rank", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["candidates_evaluated"] == 3
        assert data["similarity_metric"] == "Lexical TF-IDF Cosine Similarity"
        assert len(data["precedents"]) == 3

        # Checking account precedent should have the highest similarity score
        top_prec = data["precedents"][0]
        assert top_prec["id"] == "11111111-1111-1111-1111-111111111111"
        assert top_prec["assigned_category"] == "Checking or savings account"
        assert top_prec["similarity_score"] > data["precedents"][1]["similarity_score"]
        assert top_prec["similarity_metric"] == "Lexical TF-IDF Cosine Similarity"

    def test_rank_precedents_pii_sanitization(self, client):
        payload = {
            "query_text": "Disputing improper late fee charges on credit card balance.",
            "candidates": [
                {
                    "id": "44444444-4444-4444-4444-444444444444",
                    "text": (
                        "Customer SSN 123-45-6789 and Card 4111 2222 3333 4444 charged late fees. "
                        "Contact citizen at citizen@example.com or phone 555-123-4567."
                    ),
                    "predicted_category": "Credit card",
                    "assigned_category": "Credit card",
                    "status": "APPROVED",
                }
            ],
            "top_k": 1,
        }
        response = client.post("/precedents/rank", json=payload)
        assert response.status_code == 200
        data = response.json()

        snippet = data["precedents"][0]["sanitized_snippet"]
        assert "123-45-6789" not in snippet
        assert "[SSN-REDACTED]" in snippet
        assert "4111 2222 3333 4444" not in snippet
        assert "[CARD-REDACTED]" in snippet
        assert "citizen@example.com" not in snippet
        assert "[EMAIL-REDACTED]" in snippet
        assert "555-123-4567" not in snippet
        assert "[PHONE-REDACTED]" in snippet


class TestSealedDatasetProtection:
    """Verify that test.csv is never referenced or accessed by Phase 9 code."""

    def test_phase9_code_never_accesses_test_csv(self):
        phase9_files = [
            NLP_SERVICE_DIR / "training" / "evaluate_calibration_val.py",
            NLP_SERVICE_DIR / "app" / "models" / "bilstm.py",
            NLP_SERVICE_DIR / "app" / "services" / "model_manager.py",
            NLP_SERVICE_DIR / "app" / "main.py",
            NLP_SERVICE_DIR / "app" / "schemas.py",
        ]

        for filepath in phase9_files:
            assert filepath.exists(), f"File {filepath} must exist"
            content = filepath.read_text(encoding="utf-8")
            # Disallow any pandas/open call loading test.csv
            assert 'read_csv("test.csv")' not in content
            assert "read_csv('test.csv')" not in content
            assert "test.csv" not in content or "sealed" in content or "never" in content, (
                f"File {filepath} contains unapproved reference to test.csv"
            )
