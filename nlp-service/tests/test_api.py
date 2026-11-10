"""CivicResolve AI — Tests for Phase 5: FastAPI NLP Service."""

import importlib
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

NLP_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(NLP_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_SERVICE_DIR))

from app.config import APPROVED_LABELS, settings
from app.main import app
from app.preprocessing.cleaner import clean_narrative, normalize_narrative
from app.services.model_manager import ModelManager, model_manager
from app.services.triage import (
    determine_review_status,
    evaluate_sentiment,
    evaluate_triage_priority,
)


@pytest.fixture(scope="module")
def client():
    """Create TestClient with the loaded model in application lifespan."""
    with TestClient(app) as test_client:
        yield test_client


class TestHealthAndInfoEndpoints:
    """Verify service health check, model provenance, and benchmark info."""

    def test_health_endpoint_healthy(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["model_loaded"] is True
        assert "baseline_tfidf_logreg.joblib" in data["model_path"]
        assert "timestamp_utc" in data

    def test_models_info_endpoint(self, client):
        response = client.get("/models/info")
        assert response.status_code == 200
        data = response.json()

        # Active serving model verification
        active = data["active_serving_model"]
        assert "TF-IDF" in active["model_name"]
        assert active["artifact_file"] == "baseline_tfidf_logreg.joblib"
        assert len(active["artifact_sha256"]) == 64
        assert active["num_train_samples"] == 59389
        assert active["num_val_samples"] == 12726
        assert active["validation_metrics"]["macro_f1"] == 0.7453
        assert active["validation_metrics"]["accuracy"] == 0.8380

        # Benchmark reference model verification
        benchmark = data["benchmark_model"]
        assert "BiLSTM" in benchmark["model_name"]
        assert benchmark["validation_metrics"]["macro_f1"] == 0.7067
        assert "Benchmark reference only" in benchmark["notice"]
        assert "Not active serving model" in benchmark["notice"]

        # Supported categories and split security
        assert len(data["supported_categories"]) == 8
        assert set(data["supported_categories"]) == set(APPROVED_LABELS)
        assert "sealed" in data["evaluation_split_status"].lower()

    def test_root_endpoint(self, client):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "CivicResolve AI NLP Service"
        assert data["status"] == "online"


class TestClassificationEndpoint:
    """Verify narrative prediction, probability distribution, and output schema."""

    def test_classify_credit_reporting_complaint(self, client):
        payload = {
            "text": (
                "I noticed multiple inaccurate inquiry records on my Equifax credit report from a collection agency. "
                "I submitted a formal dispute letter requesting verification of these derogatory items, but the credit bureau "
                "failed to conduct a reasonable investigation within 30 days under the FCRA."
            )
        }
        response = client.post("/classify", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["product_category"] == "Credit reporting or other personal consumer reports"
        assert data["confidence"] > 0.50
        assert data["margin"] >= 0.0
        assert len(data["probabilities"]) == 8
        assert sum(data["probabilities"].values()) == pytest.approx(1.0, abs=0.01)
        assert data["model_used"] == "baseline_tfidf_logreg"
        assert len(data["model_version"]) > 0
        assert "disclaimer" in data
        assert "recommendation" in data["disclaimer"].lower()

    def test_classify_debt_collection_complaint(self, client):
        payload = {
            "text": (
                "A third party debt collection agency called my employer five times in one day demanding "
                "payment on a zombie debt that is past the legal statute of limitations. They threatened legal action."
            )
        }
        response = client.post("/classify", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["product_category"] in ["Debt collection", "Credit reporting or other personal consumer reports"]
        assert isinstance(data["flag_for_review"], bool)

    def test_classify_checking_account_complaint(self, client):
        payload = {
            "text": (
                "My checking account was hit with multiple surprise overdraft fees totaling $140 even though my "
                "available balance showed funds were present when the debit card transaction was authorized."
            )
        }
        response = client.post("/classify", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["product_category"] == "Checking or savings account"


class TestInputValidationAndErrors:
    """Verify Pydantic schema validation, edge cases, and meaningful HTTP status codes."""

    def test_empty_text_rejected(self, client):
        response = client.post("/classify", json={"text": ""})
        assert response.status_code == 422
        data = response.json()
        assert "errors" in data or "detail" in data

    def test_short_text_rejected(self, client):
        response = client.post("/classify", json={"text": "Too short!"})
        assert response.status_code == 422

    def test_overlong_text_rejected(self, client):
        long_narrative = "Overlong complaint narrative word. " * 400  # > 10,000 chars
        assert len(long_narrative) > 10_000
        response = client.post("/classify", json={"text": long_narrative})
        assert response.status_code == 422

    def test_missing_text_field(self, client):
        response = client.post("/classify", json={})
        assert response.status_code == 422

    def test_wrong_input_type(self, client):
        response = client.post("/classify", json={"text": 12345678901234567890})
        assert response.status_code == 422

    def test_only_mask_words_empty_after_cleaning(self, client):
        # A string of >= 20 chars consisting only of XXXX masks and whitespace
        mask_text = "XXXX XXXX XXXX XXXX XXXX XXXX"
        response = client.post("/classify", json={"text": mask_text})
        assert response.status_code == 422
        data = response.json()
        assert "empty after preprocessing" in data["detail"].lower()


class TestConsistentPreprocessing:
    """Verify cleaning in API exactly matches data pipeline cleaning."""

    def test_clean_narrative_masks_and_spaces(self):
        raw = "I called XXXX bank on    XXXX-XX-XX regarding   my account.\n\n\n\nThey didn't reply."
        cleaned = clean_narrative(raw)
        assert "XXXX" not in cleaned
        assert "   " not in cleaned
        assert "\n\n\n" not in cleaned

    def test_cleaning_preserves_valid_words_ending_in_x(self):
        raw = "I sent a fax to Equifax and the tax office regarding box 40."
        cleaned = clean_narrative(raw)
        assert "fax" in cleaned
        assert "Equifax" in cleaned
        assert "tax" in cleaned
        assert "box" in cleaned


class TestHumanReviewAndUncertaintyFlags:
    """Verify confidence threshold, probability-margin review triggers, and priority-based review."""

    def test_determine_review_status_unit_matrix(self):
        """Unit test the complete decision matrix of determine_review_status."""
        # 1. High confidence, wide margin, LOW priority -> False
        flag, reasons = determine_review_status(False, [], "LOW")
        assert flag is False
        assert reasons == []

        # 2. High confidence, wide margin, MEDIUM priority -> False
        flag, reasons = determine_review_status(False, [], "MEDIUM")
        assert flag is False
        assert reasons == []

        # 3. High confidence, wide margin, CRITICAL priority -> True (Case a)
        flag, reasons = determine_review_status(False, [], "CRITICAL")
        assert flag is True
        assert len(reasons) == 1
        assert "CRITICAL" in reasons[0]
        assert "human review is required" in reasons[0]

        # 4. High confidence, wide margin, HIGH priority -> True (Case b)
        flag, reasons = determine_review_status(False, [], "HIGH")
        assert flag is True
        assert len(reasons) == 1
        assert "HIGH" in reasons[0]
        assert "human review is required" in reasons[0]

        # 5. Low confidence uncertainty, LOW priority -> True (Case d)
        flag, reasons = determine_review_status(True, ["Model score below threshold"], "LOW")
        assert flag is True
        assert reasons == ["Model score below threshold"]

        # 6. Narrow margin uncertainty, LOW priority -> True (Case e)
        flag, reasons = determine_review_status(True, ["Margin below threshold"], "LOW")
        assert flag is True
        assert reasons == ["Margin below threshold"]

        # 7. Low confidence AND CRITICAL priority -> True (both reasons preserved)
        flag, reasons = determine_review_status(True, ["Model score below threshold"], "CRITICAL")
        assert flag is True
        assert len(reasons) == 2
        assert "Model score below threshold" in reasons
        assert any("CRITICAL" in r for r in reasons)

    def test_review_flag_triggered_by_low_confidence(self):
        # Create a model manager with an artificially high confidence threshold
        manager = ModelManager(min_confidence=0.99, min_margin=0.01)
        manager.load()
        result = manager.predict(
            "This is a general narrative about an account dispute with some fees."
        )
        assert result["flag_for_review"] is True
        assert any("below human-review threshold" in r for r in result["review_reasons"])

    def test_review_flag_triggered_by_narrow_margin(self):
        # Create a model manager with an artificially high margin threshold
        manager = ModelManager(min_confidence=0.10, min_margin=0.95)
        manager.load()
        result = manager.predict(
            "This is a general narrative about an account dispute with some fees."
        )
        assert result["flag_for_review"] is True
        assert any("review margin threshold" in r for r in result["review_reasons"])

    def test_case_a_high_confidence_critical_triggers_human_review(self, client):
        """Case a: High-confidence CRITICAL case -> human review required."""
        payload = {
            "text": (
                "My mortgage servicer improperly rejected my escrow payments and initiated an unlawful foreclosure. "
                "The sheriff sale is scheduled and my family faces eviction next week."
            )
        }
        response = client.post("/classify", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["triage_priority"] == "CRITICAL"
        assert data["confidence"] >= 0.55  # Confident classification
        assert data["margin"] >= 0.15      # Clear top-class separation
        assert data["flag_for_review"] is True
        assert any("CRITICAL" in r and "human review is required" in r for r in data["review_reasons"])

    def test_case_b_high_confidence_high_triggers_human_review(self, client):
        """Case b: High-confidence HIGH case -> human review required."""
        payload = {
            "text": (
                "The lender sent a tow truck to perform repossession of my car and seizure of my vehicle "
                "even though all loan payments were made on time and my account is current."
            )
        }
        response = client.post("/classify", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["triage_priority"] == "HIGH"
        assert data["confidence"] >= 0.55  # Confident classification
        assert data["flag_for_review"] is True
        assert any("HIGH" in r and "human review is required" in r for r in data["review_reasons"])

    def test_case_c_high_confidence_low_no_review_required(self, client):
        """Case c: High-confidence LOW case without uncertainty -> review not required."""
        payload = {
            "text": (
                "I am writing to formally request an updated copy of my student loan payment schedule and history "
                "so I can verify the principal balance for my records."
            )
        }
        response = client.post("/classify", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["triage_priority"] == "LOW"
        assert data["confidence"] >= 0.55
        assert data["margin"] >= 0.15
        assert data["flag_for_review"] is False
        assert data["review_reasons"] == []

    def test_case_d_low_confidence_triggers_review(self, client):
        """Case d: Low-confidence classification -> review required."""
        # Artificially raise confidence threshold so that standard confident narrative breaches threshold
        with patch.object(model_manager, "min_confidence", 0.999):
            payload = {
                "text": "I am writing to inquire about the interest rate terms on my student loan account."
            }
            response = client.post("/classify", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["flag_for_review"] is True
            assert any("below human-review threshold" in r for r in data["review_reasons"])

    def test_case_e_narrow_margin_triggers_review(self, client):
        """Case e: Narrow top-two margin -> review required."""
        # Artificially raise margin threshold so that standard clear margin breaches threshold
        with patch.object(model_manager, "min_margin", 0.999):
            payload = {
                "text": "I am writing to inquire about the interest rate terms on my student loan account."
            }
            response = client.post("/classify", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["flag_for_review"] is True
            assert any("review margin threshold" in r for r in data["review_reasons"])

    def test_case_f_negative_sentiment_without_trigger_not_critical(self, client):
        """Case f: Negative sentiment without an explicit high-priority trigger -> no automatic CRITICAL classification."""
        payload = {
            "text": (
                "I am extremely angry, furious, and completely dissatisfied with the horrible customer service, "
                "excessive wait times, and rude representative who hung up on me."
            )
        }
        response = client.post("/classify", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["sentiment_label"] == "NEGATIVE"
        assert data["sentiment_score"] < -0.3
        assert data["triage_priority"] == "LOW"
        assert data["triage_priority"] != "CRITICAL"
        assert data["triage_priority"] != "HIGH"
        # Since triage priority is LOW, it does not trigger priority-based emergency review
        assert not any("CRITICAL" in r for r in data["review_reasons"])
        assert any("no explicit high-priority triggers" in r.lower() for r in data["priority_reasons"])


class TestRuleBasedTriagePriorityAndSentiment:
    """Verify transparent triage rules and negative sentiment constraints."""

    def test_critical_priority_eviction_trigger(self):
        text = "The bank initiated an illegal foreclosure and the sheriff sale is scheduled. We face eviction next week."
        result = evaluate_triage_priority(text)
        assert result["triage_priority"] == "CRITICAL"
        assert any("eviction" in r.lower() or "foreclosure" in r.lower() for r in result["priority_reasons"])

    def test_critical_priority_identity_theft_drain(self):
        text = "I am a victim of severe identity theft. Criminals drained my entire savings account and took everything."
        result = evaluate_triage_priority(text)
        assert result["triage_priority"] == "CRITICAL"

    def test_high_priority_repossession(self):
        text = "The lender sent a tow truck to perform repossession of my car even though all payments were made."
        result = evaluate_triage_priority(text)
        assert result["triage_priority"] == "HIGH"
        assert any("repossession" in r.lower() for r in result["priority_reasons"])

    def test_high_priority_wage_garnishment(self):
        text = "The collector threatened wage garnishment and threatened me with arrest if I did not pay."
        result = evaluate_triage_priority(text)
        assert result["triage_priority"] == "HIGH"

    def test_medium_priority_credit_dispute(self):
        text = "There is an inaccurate reporting balance on my credit report that was disputed last month."
        result = evaluate_triage_priority(text)
        assert result["triage_priority"] == "MEDIUM"

    def test_low_priority_routine_inquiry(self):
        text = "I am writing to inquire about the terms of my loan agreement and request an updated copy."
        result = evaluate_triage_priority(text)
        assert result["triage_priority"] == "LOW"

    def test_negative_sentiment_alone_does_not_trigger_emergency(self):
        """CRITICAL REQUIREMENT: Negative sentiment alone must NOT cause CRITICAL or HIGH triage."""
        negative_text = "I am very dissatisfied, unhappy, and frustrated with the terrible customer service delay."
        score, label = evaluate_sentiment(negative_text)
        assert label == "NEGATIVE"
        assert score < 0.0

        result = evaluate_triage_priority(negative_text)
        # Without eviction, fraud, repossession, or garnishment, it must NOT be CRITICAL or HIGH
        assert result["triage_priority"] in ["LOW", "MEDIUM"]
        assert result["triage_priority"] not in ["CRITICAL", "HIGH"]


class TestFailureHandlingAndNoRetraining:
    """Verify failure handling when model is missing, and verify no retraining on startup."""

    def test_missing_model_artifact_handling(self, tmp_path):
        non_existent_path = tmp_path / "non_existent_model.joblib"
        manager = ModelManager(model_path=non_existent_path)
        loaded = manager.load()
        assert loaded is False
        assert manager.is_loaded is False
        assert "not found" in manager.load_error.lower()

        with pytest.raises(RuntimeError, match="not loaded"):
            manager.predict("Valid complaint narrative text for testing.")

    def test_health_reports_degraded_when_model_missing(self, tmp_path):
        dummy_manager = ModelManager(model_path=tmp_path / "missing.joblib")
        dummy_manager.load()

        with patch("app.main.model_manager", dummy_manager):
            test_client = TestClient(app)
            response = test_client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "degraded"
            assert data["model_loaded"] is False

            # Classify should return 503
            classify_resp = test_client.post(
                "/classify",
                json={"text": "A valid length consumer complaint narrative text for testing."},
            )
            assert classify_resp.status_code == 503

    def test_no_retraining_on_startup(self):
        """Verify startup only deserializes existing artifact and does not retrain."""
        model_file = settings.baseline_model_path
        mtime_before = model_file.stat().st_mtime

        manager = ModelManager(model_path=model_file)
        success = manager.load()
        assert success is True

        mtime_after = model_file.stat().st_mtime
        assert mtime_before == mtime_after  # File timestamp completely unchanged

    def test_no_test_csv_access_in_app(self):
        """Verify app code never imports or accesses test.csv."""
        app_dir = NLP_SERVICE_DIR / "app"
        for py_file in app_dir.rglob("*.py"):
            content = py_file.read_text(encoding="utf-8")
            assert "test.csv" not in content, f"Forbidden reference to test.csv in {py_file}"


class TestClassifyExplanationEndpoint:
    """Verify explainability integration in POST /classify endpoint."""

    SAMPLE_TEXT = (
        "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency. "
        "I submitted a formal dispute letter requesting verification, but they failed to investigate within 30 days."
    )

    def test_classify_includes_explanation_object(self, client):
        """Verify that /classify returns a complete, schema-compliant explanation payload."""
        response = client.post("/classify", json={"text": self.SAMPLE_TEXT})
        assert response.status_code == 200
        data = response.json()

        assert "explanation" in data
        expl = data["explanation"]
        assert expl is not None

        # Verify core schema fields
        assert expl["method"] == "linear_feature_attribution"
        assert expl["version"] == "1.0.0"
        assert expl["predicted_class"] == data["product_category"]
        assert expl["runner_up_class"] in APPROVED_LABELS
        assert expl["runner_up_class"] != expl["predicted_class"]
        assert isinstance(expl["predicted_decision_score"], float)
        assert isinstance(expl["runner_up_decision_score"], float)
        assert isinstance(expl["decision_score_margin"], float)
        assert isinstance(expl["predicted_intercept"], float)
        assert isinstance(expl["predicted_total_feature_contribution"], float)
        assert isinstance(expl["runner_up_intercept"], float)
        assert isinstance(expl["runner_up_total_feature_contribution"], float)
        assert isinstance(expl["intercept_difference"], float)
        assert isinstance(expl["total_difference_contribution"], float)
        assert expl["active_feature_count"] > 0
        assert len(expl["model_artifact_sha256"]) == 64
        assert "CFPB" in expl["disclaimer"]

        # Verify bounded feature lists
        assert isinstance(expl["top_positive_features"], list)
        assert len(expl["top_positive_features"]) <= 5
        assert isinstance(expl["top_negative_features"], list)
        assert len(expl["top_negative_features"]) <= 5
        assert isinstance(expl["top_positive_runner_up_differences"], list)
        assert len(expl["top_positive_runner_up_differences"]) <= 5
        assert isinstance(expl["top_negative_runner_up_differences"], list)
        assert len(expl["top_negative_runner_up_differences"]) <= 5

        # Verify item structure
        for item in expl["top_positive_features"] + expl["top_negative_features"]:
            assert "feature" in item and isinstance(item["feature"], str)
            assert "contribution" in item and isinstance(item["contribution"], float)

        for diff in (
            expl["top_positive_runner_up_differences"] + expl["top_negative_runner_up_differences"]
        ):
            assert "feature" in diff and isinstance(diff["feature"], str)
            assert "difference_contribution" in diff and isinstance(diff["difference_contribution"], float)

    def test_classify_explanation_mathematical_identities(self, client):
        """Verify that returned explanation satisfies all mathematical reconstruction identities."""
        response = client.post("/classify", json={"text": self.SAMPLE_TEXT})
        assert response.status_code == 200
        expl = response.json()["explanation"]
        assert expl is not None

        # Identity 1: predicted_score = predicted_intercept + predicted_total_feature_contribution
        rec_pred = expl["predicted_intercept"] + expl["predicted_total_feature_contribution"]
        assert abs(rec_pred - expl["predicted_decision_score"]) <= 1e-6

        # Identity 2: runner_up_score = runner_up_intercept + runner_up_total_feature_contribution
        rec_runner = expl["runner_up_intercept"] + expl["runner_up_total_feature_contribution"]
        assert abs(rec_runner - expl["runner_up_decision_score"]) <= 1e-6

        # Identity 3: decision_score_margin = intercept_difference + total_difference_contribution
        rec_margin = expl["intercept_difference"] + expl["total_difference_contribution"]
        assert abs(rec_margin - expl["decision_score_margin"]) <= 1e-6

        # Score margin definition
        score_diff = expl["predicted_decision_score"] - expl["runner_up_decision_score"]
        assert abs(score_diff - expl["decision_score_margin"]) <= 1e-6

    def test_classify_graceful_degradation_when_explanation_fails(self, client):
        """Verify that explanation failures do NOT break HTTP 200 classification (returns explanation: null)."""
        with patch.object(model_manager, "explain_with_state", side_effect=RuntimeError("Simulated explainer fault")):
            response = client.post("/classify", json={"text": self.SAMPLE_TEXT})
            assert response.status_code == 200
            data = response.json()

            # Classification must still succeed cleanly
            assert data["product_category"] == "Credit reporting or other personal consumer reports"
            assert data["confidence"] > 0.0
            assert data["margin"] >= 0.0
            assert "flag_for_review" in data
            assert data["explanation"] is None

    def test_classify_runner_up_agreement_with_engine(self, client):
        """Verify that predicted class and runner-up class agree with model_manager.explain."""
        response = client.post("/classify", json={"text": self.SAMPLE_TEXT})
        assert response.status_code == 200
        data = response.json()

        expl_direct = model_manager.explain(self.SAMPLE_TEXT)
        assert data["explanation"]["predicted_class"] == expl_direct.predicted_class
        assert data["explanation"]["runner_up_class"] == expl_direct.runner_up_class
