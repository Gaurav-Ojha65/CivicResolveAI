"""CivicResolve AI — Tests for Stage 3.2: Ranking, Concurrency, and Snapshots.

Verifies:
1. Authoritative decision-score ranking under synthetic underflow and exact ties.
2. Immutable ModelState snapshot publication and acquisition.
3. Thread-safe concurrency and controlled thread coordination.
4. Preserved last-known-good snapshot on failed reload.
5. In-flight request completion using captured snapshot across unload/reload.
6. 2,000 validation samples ranking consistency between predict and explain.
"""

from __future__ import annotations

import copy
import sys
import threading
from pathlib import Path
from unittest.mock import MagicMock

NLP_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(NLP_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_SERVICE_DIR))

import numpy as np
import pytest
from scipy.special import softmax

from app.config import APPROVED_LABELS
from app.preprocessing.cleaner import clean_narrative
from app.services.explainer import explain_prediction
from app.services.model_manager import ModelManager, ModelState, model_manager


@pytest.fixture(scope="module")
def loaded_manager():
    """Ensure global model manager is loaded with primary serving artifact."""
    if not model_manager.is_loaded:
        success = model_manager.load()
        assert success, f"Failed to load serving model: {model_manager.load_error}"
    return model_manager


class TestAuthoritativeDecisionScoreRanking:
    """Verify that decision_function() is authoritative for ranking, eliminating underflow flaws."""

    def test_synthetic_extreme_underflow_ranking(self, loaded_manager):
        """Under extreme negative logits, float64 predict_proba underflows to 0.0.

        Decision scores MUST govern class ranking, correctly ordering Class 1 (-800)
        ahead of Class 0 (-900) rather than falling back to alphabetical class index.
        """
        state = loaded_manager.get_state()

        # Construct synthetic logits with severe underflow
        # idx 2: Credit reporting (50.0)
        # idx 1: Credit card (-800.0) -> Runner-up
        # idx 0: Checking (-900.0) -> Third
        # idx 3..7: -1000.0
        synthetic_logits = np.array([
            -900.0,   # idx 0: Checking or savings account
            -800.0,   # idx 1: Credit card
              50.0,   # idx 2: Credit reporting or other personal consumer reports
            -1000.0,  # idx 3: Debt collection
            -1000.0,  # idx 4: Money transfer...
            -1000.0,  # idx 5: Mortgage
            -1000.0,  # idx 6: Student loan
            -1000.0,  # idx 7: Vehicle loan or lease
        ])
        synthetic_probs = softmax(synthetic_logits)
        assert synthetic_probs[0] == 0.0  # Underflowed to zero
        assert synthetic_probs[1] == 0.0  # Underflowed to zero

        mock_pipe = copy.deepcopy(state.model)
        clf = mock_pipe.named_steps["classifier"]
        clf.intercept_ = synthetic_logits
        clf.coef_ = np.zeros_like(clf.coef_)
        clf.decision_function = MagicMock(return_value=np.array([synthetic_logits]))
        clf.predict_proba = MagicMock(return_value=np.array([synthetic_probs]))

        underflow_state = ModelState(
            model=mock_pipe,
            classes=state.classes,
            feature_names=state.feature_names,
            model_sha256="synthetic-underflow-sha256",
            metadata={},
        )

        test_text = "I am disputing an unauthorized charge on my account with the bank."
        pred_res = loaded_manager.predict_with_state(underflow_state, test_text)

        # Predicted class must be Credit reporting (logit 50.0)
        assert pred_res["product_category"] == "Credit reporting or other personal consumer reports"

        # AUTHORITATIVE CHECK: Runner-up category in prob_dict
        # With decision_function ranking, runner-up is Credit card (logit -800.0), NOT Checking (idx 0)
        # In predict_with_state, top_cat is idx 2, second_cat is idx 1
        assert pred_res["probabilities"]["Credit card"] == 0.0
        assert pred_res["probabilities"]["Checking or savings account"] == 0.0
        assert pred_res["confidence"] == 1.0
        assert pred_res["margin"] == 1.0

        # Now verify explainer produces the exact same top and runner-up
        expl_res = loaded_manager.explain_with_state(underflow_state, test_text)
        assert expl_res.predicted_class == "Credit reporting or other personal consumer reports"
        assert expl_res.runner_up_class == "Credit card"

    def test_exact_decision_score_ties_use_index_tiebreaker(self, loaded_manager):
        """When two classes have identical decision scores, index tie-breaker must be deterministic."""
        state = loaded_manager.get_state()

        # Class 1 and Class 3 tie at 10.0, all others -10.0
        tied_logits = np.array([-10.0, 10.0, -10.0, 10.0, -10.0, -10.0, -10.0, -10.0])
        tied_probs = softmax(tied_logits)

        mock_pipe = copy.deepcopy(state.model)
        clf = mock_pipe.named_steps["classifier"]
        clf.intercept_ = tied_logits
        clf.coef_ = np.zeros_like(clf.coef_)
        clf.decision_function = MagicMock(return_value=np.array([tied_logits]))
        clf.predict_proba = MagicMock(return_value=np.array([tied_probs]))

        tied_state = ModelState(
            model=mock_pipe,
            classes=state.classes,
            feature_names=state.feature_names,
            model_sha256="tied-sha256",
            metadata={},
        )

        text = "Disputed credit card charge and debt collection notice."
        pred_res = loaded_manager.predict_with_state(tied_state, text)
        expl_res = loaded_manager.explain_with_state(tied_state, text)

        # Class 1 (Credit card) beats Class 3 (Debt collection) by lower index
        assert pred_res["product_category"] == state.classes[1]
        assert expl_res.predicted_class == state.classes[1]
        assert expl_res.runner_up_class == state.classes[3]

    def test_validation_2000_samples_exact_agreement(self, loaded_manager):
        """Verify 100% agreement between predict() and explain() across 2,000 real validation complaints."""
        val_csv = NLP_SERVICE_DIR / "data" / "processed" / "val.csv"
        if not val_csv.exists():
            pytest.skip("val.csv not available for regression test.")

        import pandas as pd
        df = pd.read_csv(val_csv)
        total_tested = min(2000, len(df))
        state = loaded_manager.get_state()

        mismatches = 0
        for i in range(total_tested):
            raw_text = str(df.iloc[i]["text"])
            cleaned = clean_narrative(raw_text)
            if not cleaned:
                continue

            pred = loaded_manager.predict_with_state(state, raw_text)
            expl = loaded_manager.explain_with_state(state, raw_text)

            if pred["product_category"] != expl.predicted_class:
                mismatches += 1
            # Derive second category from raw_scores
            raw_scores = state.model.decision_function([cleaned])[0]
            ranked = sorted(range(len(state.classes)), key=lambda idx: (-raw_scores[idx], idx))
            expected_runner = state.classes[ranked[1]]
            if expl.runner_up_class != expected_runner:
                mismatches += 1

        assert mismatches == 0, f"Found {mismatches} ranking mismatches across {total_tested} samples."


class TestModelStateSnapshotAndConcurrency:
    """Verify thread-safe publication, immutability, and controlled thread coordination."""

    def test_feature_names_array_is_immutable(self, loaded_manager):
        """ModelState must enforce read-only immutability on feature_names."""
        state = loaded_manager.get_state()
        assert not state.feature_names.flags.writeable
        with pytest.raises(ValueError, match="read-only"):
            state.feature_names[0] = "illegal_mutation"

    def test_failed_reload_preserves_last_known_good_snapshot(self, tmp_path):
        """A failed reload from a missing or corrupted file must NOT unload the manager."""
        mgr = ModelManager()
        success = mgr.load()
        assert success is True
        initial_sha = mgr.model_sha256
        assert mgr.is_loaded is True

        # Attempt reload from non-existent path
        fail_reload = mgr.load(model_path=tmp_path / "does_not_exist.joblib")
        assert fail_reload is False

        # Must preserve last-known-good state
        assert mgr.is_loaded is True
        assert mgr.model_sha256 == initial_sha
        assert mgr.get_state().model_sha256 == initial_sha

    def test_explicit_unload_clears_snapshot(self):
        """Calling unload() must atomically clear the active snapshot."""
        mgr = ModelManager()
        mgr.load()
        assert mgr.is_loaded is True

        mgr.unload()
        assert mgr.is_loaded is False
        with pytest.raises(RuntimeError, match="not loaded|unloaded"):
            mgr.get_state()
        with pytest.raises(RuntimeError, match="not loaded|unloaded"):
            mgr.predict("A valid complaint narrative for testing.")

    def test_in_flight_request_completes_with_captured_snapshot_after_unload(self, loaded_manager):
        """An in-flight request holding a captured ModelState completes successfully even if manager is unloaded."""
        mgr = ModelManager()
        mgr.load()
        # Capture snapshot for request
        in_flight_state = mgr.get_state()

        # Concurrently unload manager
        mgr.unload()
        assert mgr.is_loaded is False

        # In-flight request executes against captured snapshot
        text = "I noticed multiple unauthorized inquiry items on my Equifax credit report."
        pred = mgr.predict_with_state(in_flight_state, text)
        expl = mgr.explain_with_state(in_flight_state, text)

        assert pred["product_category"] == expl.predicted_class
        assert pred["model_version"] == in_flight_state.model_sha256[:16]

    def test_concurrent_inference_and_reload_thread_coordination(self):
        """Controlled thread coordination verifying no request observes mixed model/feature_names state."""
        mgr = ModelManager()
        mgr.load()

        num_threads = 6
        num_requests_per_thread = 20
        barrier = threading.Barrier(num_threads + 1)
        errors = []

        def worker_task(thread_id: int):
            barrier.wait()  # Synchronize start across all threads
            for req_id in range(num_requests_per_thread):
                try:
                    state = mgr.get_state()
                    # Verify coherence: feature names length must equal classifier coefficients columns
                    clf = state.model.named_steps["classifier"]
                    assert len(state.feature_names) == clf.coef_.shape[1]
                    assert state.model_sha256 != ""

                    # Run inference using snapshot
                    text = f"Credit card transaction dispute inquiry letter number {req_id}."
                    pred = mgr.predict_with_state(state, text)
                    expl = mgr.explain_with_state(state, text)
                    assert pred["product_category"] == expl.predicted_class
                except Exception as ex:
                    errors.append((thread_id, req_id, ex))

        def reloader_task():
            barrier.wait()
            for _ in range(5):
                success = mgr.load()
                assert success is True

        threads = [
            threading.Thread(target=worker_task, args=(i,))
            for i in range(num_threads)
        ]
        reloader = threading.Thread(target=reloader_task)

        for t in threads:
            t.start()
        reloader.start()

        for t in threads:
            t.join()
        reloader.join()

        assert len(errors) == 0, f"Concurrent execution errors encountered: {errors}"

    def test_classify_endpoint_uses_same_snapshot_for_prediction_and_explanation(self, loaded_manager):
        """FastAPI /classify acquires one ModelState snapshot and uses it for both prediction and explanation."""
        from fastapi.testclient import TestClient
        from app.main import app

        with TestClient(app) as client:
            resp = client.post(
                "/classify",
                json={
                    "text": "I noticed inaccurate inquiry records on my Equifax credit report from a collection agency."
                },
            )
            assert resp.status_code == 200
            data = resp.json()

            # The prediction model_version and explanation model_artifact_sha256 must match exactly
            assert data["model_version"] == data["explanation"]["model_artifact_sha256"][:16]
            assert data["explanation"]["model_artifact_sha256"] == loaded_manager.model_sha256
            assert data["product_category"] == data["explanation"]["predicted_class"]

    def test_classes_collection_is_immutable_tuple(self, loaded_manager):
        """Classes in ModelState snapshot and ModelManager property must be an immutable tuple."""
        state = loaded_manager.get_state()
        assert isinstance(state.classes, tuple)
        assert isinstance(loaded_manager.classes, tuple)
        assert len(state.classes) == 8

        # Verify callers cannot mutate classes elements
        with pytest.raises(TypeError, match="does not support item assignment"):
            state.classes[0] = "ModifiedCategory"

        # Verify callers cannot append or remove items
        assert not hasattr(state.classes, "append")
        assert not hasattr(state.classes, "pop")

        # Verify ModelState dataclass itself is frozen
        with pytest.raises((AttributeError, TypeError)):
            state.classes = ("NewCategory",)

    def test_fitted_sklearn_pipeline_unmodified_after_publication_and_inference(self, loaded_manager):
        """Fitted scikit-learn pipeline parameters must never mutate during inference cycles."""
        state = loaded_manager.get_state()
        clf = state.model.named_steps["classifier"]
        tfidf = state.model.named_steps["tfidf"]

        # Capture baseline states
        coef_orig = clf.coef_.copy()
        intercept_orig = clf.intercept_.copy()
        vocab_orig = dict(tfidf.vocabulary_)
        classes_orig = np.array(clf.classes_).copy()

        # Run 50 inference & explanation cycles
        sample_texts = [
            "Unauthorized charge on my credit card that I never authorized with merchant.",
            "Inaccurate late payment reported on my credit report from loan servicer.",
            "Debt collector calling repeatedly after cease and desist notice was delivered.",
            "Escrow account shortage calculations on mortgage are incorrect and inflated.",
        ]
        for t in sample_texts * 12:
            pred = loaded_manager.predict_with_state(state, t)
            expl = loaded_manager.explain_with_state(state, t)
            assert pred["product_category"] == expl.predicted_class

        # Verify fitted pipeline remains exactly byte-for-byte identical
        assert np.array_equal(clf.coef_, coef_orig)
        assert np.array_equal(clf.intercept_, intercept_orig)
        assert np.array_equal(clf.classes_, classes_orig)
        assert tfidf.vocabulary_ == vocab_orig

