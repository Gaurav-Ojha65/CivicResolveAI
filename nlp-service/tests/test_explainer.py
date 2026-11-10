"""CivicResolve AI — Tests for Phase 3: Python Explainability Engine.

Comprehensive test suite verifying exact mathematical reconstruction,
privacy filtering, deterministic tie-breaking, sparse operations, and edge-case handling.
"""

from __future__ import annotations

import copy
import re
import sys
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

NLP_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(NLP_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_SERVICE_DIR))

from app.services.explainer import (
    DEFAULT_TOLERANCE,
    EXPLANATION_METHOD,
    ExplanationModelIncompatibleError,
    ExplanationReconstructionError,
    ExplanationResult,
    FeatureContribution,
    RunnerUpDifference,
    calculate_max_allowed_idf,
    explain_prediction,
    is_safe_feature,
)
from app.services.model_manager import model_manager


@pytest.fixture(scope="module")
def loaded_manager():
    """Ensure global model_manager is loaded."""
    if not model_manager.is_loaded:
        success = model_manager.load()
        assert success, f"Failed to load serving model: {model_manager.load_error}"
    return model_manager


@pytest.fixture(scope="module")
def serving_pipeline(loaded_manager):
    """Retrieve active serving scikit-learn Pipeline."""
    return loaded_manager.model


# ---------------------------------------------------------------------------
# Test Suite 1: Exact Mathematical Reconstruction
# ---------------------------------------------------------------------------

class TestMathematicalReconstruction:
    """Verify that feature contributions reconstruct decision scores within 1e-6 tolerance."""

    SAMPLE_NARRATIVE = (
        "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency. "
        "I submitted a formal dispute letter requesting verification, but they failed to investigate within 30 days."
    )

    def test_exact_predicted_class_score_reconstruction(self, serving_pipeline):
        """Verify: predicted_intercept + total_feature_contribution == predicted_decision_score."""
        result = explain_prediction(serving_pipeline, self.SAMPLE_NARRATIVE, tolerance=1e-6)

        reconstructed = result.predicted_intercept + result.total_feature_contribution
        error = abs(reconstructed - result.predicted_decision_score)
        assert error <= DEFAULT_TOLERANCE, f"Predicted class score error {error:.2e} exceeded tolerance."

    def test_exact_runner_up_score_reconstruction(self, serving_pipeline):
        """Verify: runner_up_intercept + total_runner_up_contributions == runner_up_decision_score."""
        tfidf = serving_pipeline.named_steps["tfidf"]
        clf = serving_pipeline.named_steps["classifier"]
        classes = list(clf.classes_)

        result = explain_prediction(serving_pipeline, self.SAMPLE_NARRATIVE, tolerance=1e-6)
        runner_up_idx = classes.index(result.runner_up_class)

        from app.preprocessing.cleaner import clean_narrative
        X = tfidf.transform([clean_narrative(self.SAMPLE_NARRATIVE)])
        raw_scores = clf.decision_function(X)[0]

        # Calculate runner-up contributions directly
        active_indices = X.indices
        active_values = X.data
        runner_coefs = clf.coef_[runner_up_idx, active_indices]
        runner_contributions = active_values * runner_coefs
        total_runner_contrib = float(np.sum(runner_contributions))

        reconstructed_runner = float(clf.intercept_[runner_up_idx]) + total_runner_contrib
        actual_runner_score = float(raw_scores[runner_up_idx])

        error = abs(reconstructed_runner - actual_runner_score)
        assert error <= DEFAULT_TOLERANCE, f"Runner-up score error {error:.2e} exceeded tolerance."
        assert abs(actual_runner_score - result.runner_up_decision_score) <= 1e-5

    def test_exact_predicted_vs_runner_up_margin_reconstruction(self, serving_pipeline):
        """Verify: intercept_difference + total_difference_contribution == decision_score_margin."""
        result = explain_prediction(serving_pipeline, self.SAMPLE_NARRATIVE, tolerance=1e-6)

        reconstructed_margin = result.intercept_difference + result.total_difference_contribution
        error = abs(reconstructed_margin - result.decision_score_margin)
        assert error <= DEFAULT_TOLERANCE, f"Margin reconstruction error {error:.2e} exceeded tolerance."

        # Verify decision_score_margin equals difference of individual scores
        expected_margin = result.predicted_decision_score - result.runner_up_decision_score
        assert abs(result.decision_score_margin - expected_margin) <= 1e-5

    def test_reconstruction_across_diverse_product_categories(self, serving_pipeline):
        """Verify exact mathematical reconstruction across diverse complaints from different categories."""
        complaints = [
            # Debt collection
            "A collection agency has been calling my workplace repeatedly demanding payment for a medical debt I already paid.",
            # Mortgage
            "My mortgage servicer improperly calculated my escrow account and failed to pay property taxes on time.",
            # Checking account
            "The bank assessed multiple unauthorized overdraft fees on my checking account while my direct deposit was pending.",
            # Credit card
            "I was charged an unexpected annual fee and fraudulent charges appeared on my credit card statement.",
            # Student loan
            "My federal student loan servicer failed to apply my payments under the income-driven repayment plan correctly.",
            # Vehicle loan
            "The auto finance company repossessed my vehicle despite my account being fully current under our agreed payment plan.",
        ]

        for text in complaints:
            result = explain_prediction(serving_pipeline, text, tolerance=1e-6)
            # 1. Predicted class identity check
            pred_reconstructed = result.predicted_intercept + result.total_feature_contribution
            assert abs(pred_reconstructed - result.predicted_decision_score) <= DEFAULT_TOLERANCE

            # 2. Runner-up margin identity check
            margin_reconstructed = result.intercept_difference + result.total_difference_contribution
            assert abs(margin_reconstructed - result.decision_score_margin) <= DEFAULT_TOLERANCE

            # 3. Decision score margin positivity (predicted must score higher than runner-up)
            assert result.decision_score_margin >= 0.0


# ---------------------------------------------------------------------------
# Test Suite 2: Agreement and Alignment with Classifier
# ---------------------------------------------------------------------------

class TestClassifierAlignment:
    """Verify that explanation outputs strictly agree with model inference predictions."""

    def test_agreement_with_existing_classifier_prediction(self, loaded_manager):
        """Verify that explainer predicted_class identically matches model_manager.predict()."""
        narrative = (
            "I noticed inaccurate late payment marks on my Experian and TransUnion credit reports. "
            "I sent a certified dispute letter requesting immediate deletion under the Fair Credit Reporting Act."
        )

        pred_result = loaded_manager.predict(narrative)
        expl_result = loaded_manager.explain(narrative)

        assert expl_result.predicted_class == pred_result["product_category"]
        assert expl_result.model_sha256 == loaded_manager.model_sha256

    def test_correct_class_index_mapping_from_classes_(self, serving_pipeline):
        """Verify class indices match clf.classes_ array."""
        clf = serving_pipeline.named_steps["classifier"]
        classes = list(clf.classes_)

        narrative = "Escrow account shortage and missed mortgage interest rate adjustments."
        result = explain_prediction(serving_pipeline, narrative)

        assert result.predicted_class in classes
        assert result.runner_up_class in classes
        assert result.predicted_class != result.runner_up_class

        pred_idx = classes.index(result.predicted_class)
        runner_idx = classes.index(result.runner_up_class)

        # Check intercept mapping
        assert abs(result.predicted_intercept - float(clf.intercept_[pred_idx])) <= 1e-5
        assert abs(result.runner_up_intercept - (clf.intercept_[runner_idx])) <= 1e-5

    def test_correct_runner_up_selection(self, loaded_manager, serving_pipeline):
        """Verify that runner_up_class matches the second-highest class from inference."""
        narrative = "Debt collector contacted my family regarding an old disputed credit card balance."
        pred_result = loaded_manager.predict(narrative)
        expl_result = loaded_manager.explain(narrative)

        # In pred_result, classes are sorted descending by probability
        sorted_probs = sorted(pred_result["probabilities"].items(), key=lambda x: -x[1])
        top_cat = sorted_probs[0][0]
        second_cat = sorted_probs[1][0]

        assert expl_result.predicted_class == top_cat
        assert expl_result.runner_up_class == second_cat


# ---------------------------------------------------------------------------
# Test Suite 3: Ordering, Ranking, and Deterministic Tie-Breaking
# ---------------------------------------------------------------------------

class TestRankingAndOrdering:
    """Verify sorting order and deterministic tie-breaking for displayed features."""

    SAMPLE_TEXT = (
        "I submitted a formal dispute letter regarding fraudulent credit card inquiries and unauthorized debt collection fees."
    )

    def test_positive_contribution_descending_order(self, serving_pipeline):
        """Verify positive contributions are strictly positive and sorted descending."""
        result = explain_prediction(serving_pipeline, self.SAMPLE_TEXT)

        assert len(result.top_positive_features) <= 5
        prev_contrib = float("inf")
        for fc in result.top_positive_features:
            assert fc.contribution > 0.0, f"Feature {fc.feature} has non-positive contribution: {fc.contribution}"
            assert fc.contribution <= prev_contrib, "Features not sorted in descending order."
            prev_contrib = fc.contribution

    def test_negative_contribution_ascending_order(self, serving_pipeline):
        """Verify negative contributions are strictly negative and sorted ascending (most negative first)."""
        result = explain_prediction(serving_pipeline, self.SAMPLE_TEXT)

        assert len(result.top_negative_features) <= 5
        prev_contrib = -float("inf")
        for fc in result.top_negative_features:
            assert fc.contribution < 0.0, f"Feature {fc.feature} has non-negative contribution: {fc.contribution}"
            # Lowest algebraic value first (-1.0 before -0.1)
            assert fc.contribution >= prev_contrib, "Negative features not sorted in ascending order."
            prev_contrib = fc.contribution

    def test_positive_runner_up_differences_descending_order(self, serving_pipeline):
        """Verify positive runner-up differences are strictly positive and sorted descending."""
        result = explain_prediction(serving_pipeline, self.SAMPLE_TEXT)

        assert len(result.top_positive_runner_up_differences) <= 5
        prev_diff = float("inf")
        for rd in result.top_positive_runner_up_differences:
            assert rd.difference_contribution > 0.0
            assert rd.difference_contribution <= prev_diff
            prev_diff = rd.difference_contribution

    def test_negative_runner_up_differences_ascending_order(self, serving_pipeline):
        """Verify negative runner-up differences are strictly negative and sorted ascending."""
        result = explain_prediction(serving_pipeline, self.SAMPLE_TEXT)

        assert len(result.top_negative_runner_up_differences) <= 5
        prev_diff = -float("inf")
        for rd in result.top_negative_runner_up_differences:
            assert rd.difference_contribution < 0.0
            assert rd.difference_contribution >= prev_diff
            prev_diff = rd.difference_contribution

    def test_deterministic_handling_of_ties(self):
        """Verify alphabetical tie-breaking when two features have identical contributions."""
        # Create a mock pipeline with identical coefficients for two terms
        tfidf = TfidfVectorizer(ngram_range=(1, 1))
        corpus = ["alpha beta gamma delta epsilon"]
        tfidf.fit(corpus)

        clf = LogisticRegression()
        X = tfidf.transform(corpus)
        clf.classes_ = np.array(["CatA", "CatB"])
        # Set identical coefficients for 'alpha' and 'beta'
        clf.coef_ = np.zeros((2, len(tfidf.vocabulary_)))
        clf.coef_[0, tfidf.vocabulary_["alpha"]] = 2.0
        clf.coef_[0, tfidf.vocabulary_["beta"]] = 2.0
        clf.coef_[0, tfidf.vocabulary_["gamma"]] = -1.5
        clf.coef_[0, tfidf.vocabulary_["delta"]] = -1.5
        clf.intercept_ = np.array([0.0, 0.0])

        pipe = Pipeline([("tfidf", tfidf), ("classifier", clf)])

        res1 = explain_prediction(pipe, "alpha beta gamma delta", total_docs=100, min_df=1)
        res2 = explain_prediction(pipe, "alpha beta gamma delta", total_docs=100, min_df=1)

        pos_terms = [f.feature for f in res1.top_positive_features]
        # 'alpha' must precede 'beta' alphabetically
        assert pos_terms == ["alpha", "beta"]

        neg_terms = [f.feature for f in res1.top_negative_features]
        # 'delta' must precede 'gamma' alphabetically when contributions are tied (-1.5)
        assert neg_terms == ["delta", "gamma"]

        # Determinism check across runs
        assert res1.to_dict() == res2.to_dict()


# ---------------------------------------------------------------------------
# Test Suite 4: Privacy Safeguards and Display Filtering
# ---------------------------------------------------------------------------

class TestPrivacySafeguards:
    """Verify defense-in-depth suppression of numeric tokens, identifiers, and rare terms."""

    def test_numeric_identifier_suppression(self, serving_pipeline):
        """Verify tokens containing digits (e.g. '30', 'within 30', account numbers) are suppressed."""
        text = "I filed a formal dispute within 30 days regarding account 123456789 and fee 500 dollars."
        result = explain_prediction(serving_pipeline, text)

        all_displayed_terms = (
            [f.feature for f in result.top_positive_features]
            + [f.feature for f in result.top_negative_features]
            + [f.feature for f in result.top_positive_runner_up_differences]
            + [f.feature for f in result.top_negative_runner_up_differences]
        )

        for term in all_displayed_terms:
            assert not re.search(r"\d", term), f"Displayed term '{term}' contains numeric digits."

    def test_email_and_web_feature_suppression(self):
        """Verify email addresses and URLs are rejected by is_safe_feature()."""
        max_idf = 10.0
        assert is_safe_feature("support@example.com", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("http", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("www", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("com", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("dispute", idf=5.0, max_allowed_idf=max_idf) is True

    def test_sensitive_identifier_keyword_suppression(self):
        """Verify terms matching SSN, PIN, DOB are rejected by is_safe_feature()."""
        max_idf = 10.0
        assert is_safe_feature("ssn", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("pin", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("dob", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("social security", idf=5.0, max_allowed_idf=max_idf) is False
        assert is_safe_feature("equifax", idf=5.0, max_allowed_idf=max_idf) is True

    def test_minimum_document_frequency_filtering(self):
        """Verify terms with training document frequency < min_df are suppressed."""
        total_docs = 59_389
        min_df = 10
        max_allowed_idf = calculate_max_allowed_idf(total_docs, min_df)

        # Term with df = 5 has higher IDF than allowed
        idf_df_5 = np.log((1 + total_docs) / (1 + 5)) + 1.0
        assert idf_df_5 > max_allowed_idf
        assert is_safe_feature("raretypoterm", idf=idf_df_5, max_allowed_idf=max_allowed_idf) is False

        # Term with df = 50 has lower IDF than allowed
        idf_df_50 = np.log((1 + total_docs) / (1 + 50)) + 1.0
        assert idf_df_50 < max_allowed_idf
        assert is_safe_feature("commondisputeterm", idf=idf_df_50, max_allowed_idf=max_allowed_idf) is True

    def test_correct_aggregate_reconstruction_after_display_filtering(self, serving_pipeline):
        """Verify total_feature_contribution retains all active features even when features are filtered from display."""
        # Narrative containing digits ('30 days', 'within 30') which are filtered from display
        text = "I submitted a formal credit dispute letter to Equifax within 30 days but they ignored it."
        result = explain_prediction(serving_pipeline, text)

        # Mathematical totals must still match exactly
        reconstructed_score = result.predicted_intercept + result.total_feature_contribution
        assert abs(reconstructed_score - result.predicted_decision_score) <= DEFAULT_TOLERANCE

        reconstructed_margin = result.intercept_difference + result.total_difference_contribution
        assert abs(reconstructed_margin - result.decision_score_margin) <= DEFAULT_TOLERANCE

        # Check that none of the displayed features contain '30'
        for f in result.top_positive_features + result.top_negative_features:
            assert "30" not in f.feature


# ---------------------------------------------------------------------------
# Test Suite 5: Edge Cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Verify robust behavior across boundary inputs and invalid pipelines."""

    def test_empty_narrative_raises_value_error(self, serving_pipeline):
        """Empty string must raise ValueError."""
        with pytest.raises(ValueError, match="empty after preprocessing"):
            explain_prediction(serving_pipeline, "")

    def test_whitespace_only_narrative_raises_value_error(self, serving_pipeline):
        """Whitespace string must raise ValueError."""
        with pytest.raises(ValueError, match="empty after preprocessing"):
            explain_prediction(serving_pipeline, "   \t\n\n   ")

    def test_only_redaction_masks_raises_value_error(self, serving_pipeline):
        """String of only XXXX masks must raise ValueError."""
        with pytest.raises(ValueError, match="empty after preprocessing"):
            explain_prediction(serving_pipeline, "XXXX XXXX XXXX XXXX")

    def test_all_out_of_vocabulary_narrative(self, serving_pipeline):
        """All-OOV narrative must produce 0 active features and exact intercept decision scores."""
        oov_text = "qwertyuiop asdfghjkl zxcvbnm1234567890 zzzzzzzzz"
        result = explain_prediction(serving_pipeline, oov_text)

        assert result.active_feature_count == 0
        assert result.total_feature_contribution == 0.0
        assert result.total_difference_contribution == 0.0
        assert result.top_positive_features == []
        assert result.top_negative_features == []
        assert result.top_positive_runner_up_differences == []
        assert result.top_negative_runner_up_differences == []

        # Decision score must strictly equal intercept
        assert result.predicted_decision_score == result.predicted_intercept
        assert result.decision_score_margin == result.intercept_difference

    def test_zero_tfidf_vector_directly(self):
        """Zero CSR vector input produces exact mathematical equality with zero feature totals."""
        tfidf = TfidfVectorizer()
        tfidf.fit(["one two three"])
        clf = LogisticRegression()
        clf.classes_ = np.array(["A", "B"])
        clf.coef_ = np.array([[1.0, 2.0, 3.0], [-1.0, -2.0, -3.0]])
        clf.intercept_ = np.array([0.5, -0.5])
        pipe = Pipeline([("tfidf", tfidf), ("classifier", clf)])

        result = explain_prediction(pipe, "unknown terms only", total_docs=10, min_df=1)
        assert result.active_feature_count == 0
        assert result.total_feature_contribution == 0.0
        assert result.predicted_decision_score == result.predicted_intercept

    def test_very_short_valid_narrative(self, serving_pipeline):
        """Short narrative with 1 recognizable word."""
        result = explain_prediction(serving_pipeline, "Equifax error report")
        assert result.active_feature_count >= 1
        assert abs((result.predicted_intercept + result.total_feature_contribution) - result.predicted_decision_score) <= DEFAULT_TOLERANCE

    def test_very_long_narrative(self, serving_pipeline):
        """Very long narrative (> 5000 characters) processes correctly without memory degradation."""
        long_text = (
            "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency. "
            "I submitted a formal dispute letter requesting verification under the FCRA. "
        ) * 40  # ~4,800 characters
        assert len(long_text) > 4000

        result = explain_prediction(serving_pipeline, long_text)
        assert result.active_feature_count > 10
        assert abs((result.predicted_intercept + result.total_feature_contribution) - result.predicted_decision_score) <= DEFAULT_TOLERANCE

    def test_incompatible_pipeline_missing_named_steps(self):
        """Non-pipeline object raises ExplanationModelIncompatibleError."""
        with pytest.raises(ExplanationModelIncompatibleError, match="does not expose 'named_steps'"):
            explain_prediction(object(), "Valid complaint narrative text here.")

    def test_incompatible_pipeline_none(self):
        """None pipeline raises ExplanationModelIncompatibleError."""
        with pytest.raises(ExplanationModelIncompatibleError, match="pipeline is None"):
            explain_prediction(None, "Valid complaint narrative text here.")

    def test_incompatible_pipeline_missing_classifier(self):
        """Pipeline without 'classifier' step raises ExplanationModelIncompatibleError."""
        pipe = Pipeline([("tfidf", TfidfVectorizer())])
        with pytest.raises(ExplanationModelIncompatibleError, match="missing 'classifier' step"):
            explain_prediction(pipe, "Valid complaint narrative text here.")

    def test_tolerance_failure_raises_reconstruction_error(self, serving_pipeline):
        """Injecting inconsistent decision scores must trigger ExplanationReconstructionError."""
        corrupted_pipe = copy.deepcopy(serving_pipeline)
        corrupted_clf = corrupted_pipe.named_steps["classifier"]
        # Mock decision_function to return artificial scores inconsistent with weights and intercept
        corrupted_clf.decision_function = MagicMock(return_value=np.array([[999.0] * len(corrupted_clf.classes_)]))

        with pytest.raises(ExplanationReconstructionError, match="reconstruction failed"):
            explain_prediction(corrupted_pipe, "Valid credit reporting dispute text here.", tolerance=1e-6)


# ---------------------------------------------------------------------------
# Test Suite 6: Performance, Immutability, and Sparse Operation Verification
# ---------------------------------------------------------------------------

class TestPerformanceAndImmutability:
    """Verify sparse matrix efficiency and fitted model immutability."""

    def test_sparse_matrix_operations_no_dense_allocation(self, serving_pipeline, monkeypatch):
        """Verify that X is a sparse CSR matrix and toarray() is never called."""
        text = "Unauthorized credit inquiry on my credit report from a collection agency."

        # Monkeypatch csr_matrix.toarray to detect if densification is attempted
        def forbidden_toarray(*args, **kwargs):
            raise AssertionError("ILLEGAL: toarray() called on sparse matrix during explanation!")

        monkeypatch.setattr(csr_matrix, "toarray", forbidden_toarray)

        # Must execute without calling toarray()
        result = explain_prediction(serving_pipeline, text)
        assert result.active_feature_count > 0

    def test_model_immutability(self, serving_pipeline):
        """Verify that explaining predictions does NOT mutate model coefficients or intercepts."""
        clf = serving_pipeline.named_steps["classifier"]
        coef_before = clf.coef_.copy()
        intercept_before = clf.intercept_.copy()

        text = "Credit card interest rate raised without notice by the bank."
        explain_prediction(serving_pipeline, text)

        np.testing.assert_array_equal(clf.coef_, coef_before)
        np.testing.assert_array_equal(clf.intercept_, intercept_before)

    def test_result_to_dict_structure(self, serving_pipeline):
        """Verify to_dict serialization contains all required fields and matches schema types."""
        text = "Checking account overdraft penalty dispute letter."
        result = explain_prediction(serving_pipeline, text, model_sha256="test-sha256-hash")
        d = result.to_dict()

        assert d["predicted_class"] == result.predicted_class
        assert d["runner_up_class"] == result.runner_up_class
        assert d["predicted_decision_score"] == result.predicted_decision_score
        assert d["decision_score_margin"] == result.decision_score_margin
        assert d["explanation_method"] == EXPLANATION_METHOD
        assert d["model_sha256"] == "test-sha256-hash"
        assert isinstance(d["top_positive_features"], list)
        assert isinstance(d["top_negative_features"], list)
        assert isinstance(d["top_positive_runner_up_differences"], list)
        assert isinstance(d["top_negative_runner_up_differences"], list)
        assert "disclaimer" in d


# ---------------------------------------------------------------------------
# Test Suite 7: Feature Names Caching and Runner-Up Ranking Invariance
# ---------------------------------------------------------------------------

class TestFeatureNamesCachingAndRankingInvariance:
    """Verify model-lifecycle feature name caching and unrounded runner-up ranking agreement."""

    def test_feature_names_cached_on_model_load(self, loaded_manager):
        """Verify that feature names array is generated once and cached in model manager."""
        assert loaded_manager.feature_names is not None
        assert isinstance(loaded_manager.feature_names, np.ndarray)
        assert len(loaded_manager.feature_names) == 50_000

    def test_repeated_explain_uses_cached_feature_names(self, loaded_manager):
        """Verify that explain() does NOT call tfidf.get_feature_names_out repeatedly."""
        tfidf = loaded_manager.model.named_steps["tfidf"]

        # If get_feature_names_out is called, raise an assertion error
        def forbidden_get_feature_names():
            raise AssertionError("ILLEGAL: get_feature_names_out called during inference!")

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(tfidf, "get_feature_names_out", forbidden_get_feature_names)
            # Must succeed by utilizing loaded_manager.feature_names cache
            result = loaded_manager.explain("Dispute regarding late payment fee on mortgage statement.")
            assert result.predicted_class == "Mortgage"
            assert result.active_feature_count > 0

    def test_feature_names_length_mismatch_raises(self, serving_pipeline):
        """Passing mismatched length feature_names array must raise ExplanationModelIncompatibleError."""
        bad_names = np.array(["foo", "bar"])
        with pytest.raises(ExplanationModelIncompatibleError, match="does not match"):
            explain_prediction(
                serving_pipeline,
                "Valid complaint narrative text for testing.",
                feature_names=bad_names,
            )

    def test_failed_load_resets_feature_names_to_none(self, tmp_path):
        """Verify that a failed load resets feature_names to None."""
        from app.services.model_manager import ModelManager

        missing_mgr = ModelManager(model_path=tmp_path / "does_not_exist.joblib")
        success = missing_mgr.load()
        assert success is False
        assert missing_mgr.feature_names is None

    def test_runner_up_total_feature_contribution_identity(self, serving_pipeline):
        """Verify exact additive identity for runner-up total feature contribution."""
        text = "Unauthorized overdraft charge on checking account."
        result = explain_prediction(serving_pipeline, text)

        # Runner-up score identity
        runner_score_reconstructed = result.runner_up_intercept + result.runner_up_total_feature_contribution
        assert abs(runner_score_reconstructed - result.runner_up_decision_score) <= 1e-6

        # Difference identity
        diff_reconstructed = result.predicted_total_feature_contribution - result.runner_up_total_feature_contribution
        assert abs(diff_reconstructed - result.total_difference_contribution) <= 1e-6

    def test_runner_up_ranking_matches_unrounded_probabilities(self, loaded_manager):
        """Verify that predict() runner-up category agrees with raw unrounded probabilities.

        Specifically guards against the 4-decimal rounding bug that caused alphabetical tie-breaks.
        """
        val_csv = NLP_SERVICE_DIR / "data" / "processed" / "val.csv"
        if not val_csv.exists():
            pytest.skip("val.csv not available for regression test.")

        import pandas as pd
        df = pd.read_csv(val_csv)
        row161_text = str(df.iloc[161]["text"])

        pred = loaded_manager.predict(row161_text)
        expl = loaded_manager.explain(row161_text)

        # Predicted class must match
        assert pred["product_category"] == expl.predicted_class
        assert pred["product_category"] == "Mortgage"

        # Runner-up must match Credit card (NOT Checking or savings account)
        assert expl.runner_up_class == "Credit card"

        # Verify raw probabilities order
        from app.preprocessing.cleaner import clean_narrative
        cleaned = clean_narrative(row161_text)
        raw_probs = loaded_manager.model.predict_proba([cleaned])[0]
        raw_top2_idx = sorted(range(len(loaded_manager.classes)), key=lambda i: (-raw_probs[i], i))[:2]
        assert loaded_manager.classes[raw_top2_idx[0]] == expl.predicted_class
        assert loaded_manager.classes[raw_top2_idx[1]] == expl.runner_up_class
