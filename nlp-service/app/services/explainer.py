"""CivicResolve AI — Explanation Engine for Linear NLP Baseline.

Provides mathematically grounded, exact feature attribution for predictions made
by the TF-IDF + Logistic Regression classification pipeline.

Mathematical Formulation:
-------------------------
For input text vectorized into sparse TF-IDF feature weights x_j >= 0, the decision score
z_c for class c is strictly linear:
    z_c = beta_{0, c} + sum_{j in A} x_j * beta_{c, j}
where:
    - beta_{0, c} = clf.intercept_[c] (class prior bias)
    - beta_{c, j} = clf.coef_[c, j] (learned feature weight)
    - x_j = tfidf_value[j]
    - A = {j | x_j > 0} (active sparse non-zero features)

For top class c_top versus runner-up class c_runner:
    Delta z = z_{c_top} - z_{c_runner}
            = (beta_{0, c_top} - beta_{0, c_runner}) + sum_{j in A} x_j * (beta_{c_top, j} - beta_{c_runner, j})

Under multinomial logistic regression with softmax link:
    ln( P(Y = c_top) / P(Y = c_runner) ) = z_{c_top} - z_{c_runner} = Delta z
Hence, Delta z is the exact log-odds margin between predicted and runner-up classes,
and each term's difference contribution represents its exact additive contribution to
that log-odds margin.

Reconstruction Guarantee:
-------------------------
This engine independently verifies:
    | beta_{0, c_top} + sum(contributions) - z_{c_top} | <= tolerance (1e-6)
    | Delta beta_0 + sum(diff_contributions) - Delta z | <= tolerance (1e-6)
If any tolerance check fails, an ExplanationReconstructionError is raised.
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
from scipy.sparse import issparse

from app.preprocessing.cleaner import clean_narrative

# ---------------------------------------------------------------------------
# Constants and Privacy Safeguard Patterns
# ---------------------------------------------------------------------------

EXPLANATION_METHOD = "linear_feature_attribution"
DEFAULT_TOLERANCE = 1e-6
DEFAULT_TOP_K = 5
DEFAULT_MIN_DF = 10
DEFAULT_TOTAL_TRAIN_DOCS = 59_389

# Regex patterns for defense-in-depth display suppression
_NUMERIC_RE = re.compile(r"\d")
_EMAIL_OR_WEB_RE = re.compile(r"(@|\b(https?|www|com|net|org|gov|edu)\b)", re.IGNORECASE)
_REDACTION_OR_SPECIAL_RE = re.compile(r"(x{3,}|_{2,}|#|\$)", re.IGNORECASE)
_IDENTIFIER_KEYWORD_RE = re.compile(r"\b(ssn|social security|pin|dob)\b", re.IGNORECASE)

EXPLANATION_DISCLAIMER = (
    "Feature contributions are mathematical weights from a linear model trained on historical "
    "CFPB consumer complaint data. They reflect statistical correlation in the training vocabulary, "
    "not causal factors or factual proof of real-world dispute events."
)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ExplanationError(Exception):
    """Base exception for explanation engine failures."""


class ExplanationModelIncompatibleError(ExplanationError):
    """Raised when the model or pipeline does not satisfy linear explainability requirements."""


class ExplanationReconstructionError(ExplanationError):
    """Raised when mathematical reconstruction fails to match the model decision score."""


# ---------------------------------------------------------------------------
# Result Data Structures
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class FeatureContribution:
    """Signed additive contribution of a single vocabulary feature to a class decision score."""

    feature: str
    contribution: float


@dataclass(frozen=True)
class RunnerUpDifference:
    """Signed additive contribution of a single feature to the margin over the runner-up class."""

    feature: str
    difference_contribution: float


@dataclass(frozen=True)
class ExplanationResult:
    """Complete mathematical explanation for a single prediction."""

    predicted_class: str
    runner_up_class: str
    predicted_decision_score: float
    runner_up_decision_score: float
    decision_score_margin: float
    predicted_intercept: float
    predicted_total_feature_contribution: float
    runner_up_intercept: float
    runner_up_total_feature_contribution: float
    intercept_difference: float
    total_difference_contribution: float
    top_positive_features: list[FeatureContribution]
    top_negative_features: list[FeatureContribution]
    top_positive_runner_up_differences: list[RunnerUpDifference]
    top_negative_runner_up_differences: list[RunnerUpDifference]
    model_artifact_sha256: str
    method: str = EXPLANATION_METHOD
    version: str = "1.0.0"
    active_feature_count: int = 0
    disclaimer: str = EXPLANATION_DISCLAIMER

    @property
    def total_feature_contribution(self) -> float:
        """Backward-compatible alias for predicted_total_feature_contribution."""
        return self.predicted_total_feature_contribution

    @property
    def model_sha256(self) -> str:
        """Backward-compatible alias for model_artifact_sha256."""
        return self.model_artifact_sha256

    @property
    def explanation_method(self) -> str:
        """Backward-compatible alias for method."""
        return self.method

    def to_dict(self) -> dict[str, Any]:
        """Convert explanation result to standard dictionary representation."""
        return {
            "method": self.method,
            "version": self.version,
            "predicted_class": self.predicted_class,
            "runner_up_class": self.runner_up_class,
            "predicted_decision_score": self.predicted_decision_score,
            "runner_up_decision_score": self.runner_up_decision_score,
            "decision_score_margin": self.decision_score_margin,
            "predicted_intercept": self.predicted_intercept,
            "predicted_total_feature_contribution": self.predicted_total_feature_contribution,
            "runner_up_intercept": self.runner_up_intercept,
            "runner_up_total_feature_contribution": self.runner_up_total_feature_contribution,
            "intercept_difference": self.intercept_difference,
            "total_difference_contribution": self.total_difference_contribution,
            "active_feature_count": self.active_feature_count,
            "top_positive_features": [asdict(f) for f in self.top_positive_features],
            "top_negative_features": [asdict(f) for f in self.top_negative_features],
            "top_positive_runner_up_differences": [
                asdict(f) for f in self.top_positive_runner_up_differences
            ],
            "top_negative_runner_up_differences": [
                asdict(f) for f in self.top_negative_runner_up_differences
            ],
            "model_artifact_sha256": self.model_artifact_sha256,
            "disclaimer": self.disclaimer,
            # Backward-compatible keys
            "total_feature_contribution": self.predicted_total_feature_contribution,
            "model_sha256": self.model_artifact_sha256,
            "explanation_method": self.method,
        }


# ---------------------------------------------------------------------------
# Privacy Safeguard Filtering
# ---------------------------------------------------------------------------

def calculate_max_allowed_idf(total_docs: int, min_df: int) -> float:
    """Compute the maximum allowed IDF corresponding to a minimum document frequency.

    Under scikit-learn's default TfidfVectorizer(smooth_idf=True):
        idf(t) = ln((1 + N) / (1 + df(t))) + 1
    Therefore:
        df(t) >= min_df  <=>  idf(t) <= ln((1 + N) / (1 + min_df)) + 1
    """
    if total_docs <= 0 or min_df <= 0:
        return float("inf")
    return math.log((1.0 + total_docs) / (1.0 + min_df)) + 1.0


def is_safe_feature(term: str, idf: float, max_allowed_idf: float) -> bool:
    """Evaluate whether an active vocabulary term is safe to display to reviewers.

    Defense-in-depth rules:
    1. Suppress tokens containing any numeric digits (phone, account, SSN, card, dates).
    2. Suppress email, URL, and web domain tokens.
    3. Suppress redaction or special mask tokens (e.g. xxx, ___).
    4. Suppress sensitive identifier terms (ssn, pin, dob).
    5. Suppress terms whose estimated training document frequency < min_df (idf > max_allowed_idf).
    """
    if _NUMERIC_RE.search(term):
        return False
    if _EMAIL_OR_WEB_RE.search(term):
        return False
    if _REDACTION_OR_SPECIAL_RE.search(term):
        return False
    if _IDENTIFIER_KEYWORD_RE.search(term):
        return False
    if idf > max_allowed_idf + 1e-9:
        return False
    return True


# ---------------------------------------------------------------------------
# Core Explanation Engine
# ---------------------------------------------------------------------------

def explain_prediction(
    pipeline: Any,
    raw_text: str,
    model_sha256: str = "",
    top_k: int = DEFAULT_TOP_K,
    min_df: int = DEFAULT_MIN_DF,
    total_docs: int = DEFAULT_TOTAL_TRAIN_DOCS,
    tolerance: float = DEFAULT_TOLERANCE,
    feature_names: np.ndarray | list[str] | None = None,
) -> ExplanationResult:
    """Decompose linear Logistic Regression decision scores into exact feature contributions.

    Args:
        pipeline: The fitted scikit-learn Pipeline containing 'tfidf' and 'classifier' steps.
        raw_text: The consumer complaint narrative text.
        model_sha256: SHA-256 provenance checksum of the serving artifact.
        top_k: Maximum number of positive and negative features to return for display.
        min_df: Minimum training document frequency required for displayable terms.
        total_docs: Total training documents used to calibrate the IDF document-frequency threshold.
        tolerance: Maximum acceptable floating-point difference for mathematical reconstruction (<= 1e-6).
        feature_names: Optional pre-extracted/cached array of vocabulary feature names.

    Returns:
        ExplanationResult holding exact mathematical reconstructions and ranked display features.

    Raises:
        ValueError: If raw_text is blank or empty after preprocessing.
        ExplanationModelIncompatibleError: If pipeline steps or required attributes are missing.
        ExplanationReconstructionError: If mathematical reconstruction exceeds tolerance.
    """
    # ── 1. Pipeline Validation ─────────────────────────────────────────────
    if pipeline is None:
        raise ExplanationModelIncompatibleError("Provided pipeline is None.")

    if not hasattr(pipeline, "named_steps"):
        raise ExplanationModelIncompatibleError(
            f"Pipeline object of type {type(pipeline)} does not expose 'named_steps'."
        )

    tfidf = pipeline.named_steps.get("tfidf")
    clf = pipeline.named_steps.get("classifier")

    if tfidf is None:
        raise ExplanationModelIncompatibleError("Pipeline is missing 'tfidf' step.")
    if clf is None:
        raise ExplanationModelIncompatibleError("Pipeline is missing 'classifier' step.")

    if not hasattr(clf, "classes_") or not hasattr(clf, "coef_") or not hasattr(clf, "intercept_"):
        raise ExplanationModelIncompatibleError(
            "Classifier is missing required attributes: classes_, coef_, or intercept_."
        )
    if not hasattr(clf, "decision_function"):
        raise ExplanationModelIncompatibleError("Classifier does not implement decision_function.")
    if not hasattr(tfidf, "get_feature_names_out") or not hasattr(tfidf, "idf_"):
        raise ExplanationModelIncompatibleError(
            "Vectorizer is missing get_feature_names_out or idf_ attributes."
        )

    # ── 2. Preprocess Input Text ──────────────────────────────────────────
    cleaned = clean_narrative(raw_text)
    if not cleaned:
        raise ValueError("Narrative text is empty after preprocessing.")

    # ── 3. Sparse Feature Extraction & Decision Scoring ───────────────────
    # Vectorize strictly as sparse CSR matrix without dense allocation
    X = tfidf.transform([cleaned])
    if not issparse(X):
        raise ExplanationModelIncompatibleError("TF-IDF transform did not return a sparse matrix.")

    raw_scores = clf.decision_function(X)[0]
    classes = list(clf.classes_)
    num_classes = len(classes)

    if num_classes < 2:
        raise ExplanationModelIncompatibleError(
            f"Classifier must have at least 2 classes, found {num_classes}."
        )

    # ── 4. Deterministic Class Ranking (Top & Runner-Up) ─────────────────
    # Sort descending by decision score; break ties deterministically by class index
    ranked_indices = sorted(
        range(num_classes),
        key=lambda idx: (-raw_scores[idx], idx),
    )
    predicted_idx = ranked_indices[0]
    runner_up_idx = ranked_indices[1]

    predicted_class = classes[predicted_idx]
    runner_up_class = classes[runner_up_idx]

    predicted_decision_score = float(raw_scores[predicted_idx])
    runner_up_decision_score = float(raw_scores[runner_up_idx])
    decision_score_margin = float(predicted_decision_score - runner_up_decision_score)

    predicted_intercept = float(clf.intercept_[predicted_idx])
    runner_up_intercept = float(clf.intercept_[runner_up_idx])
    intercept_difference = float(predicted_intercept - runner_up_intercept)

    # ── 5. Sparse Active Feature Decomposition ────────────────────────────
    # Extract only active non-zero column indices from CSR row
    active_indices = X.indices
    active_values = X.data
    active_count = len(active_indices)

    max_allowed_idf = calculate_max_allowed_idf(total_docs, min_df)

    # Resolve feature names using cached array or dynamically from vectorizer
    if feature_names is None:
        resolved_feature_names = np.array(tfidf.get_feature_names_out())
    else:
        num_features = clf.coef_.shape[1]
        if len(feature_names) != num_features:
            raise ExplanationModelIncompatibleError(
                f"Provided feature_names length ({len(feature_names)}) does not match "
                f"classifier coefficients columns ({num_features})."
            )
        resolved_feature_names = feature_names

    if active_count == 0:
        # Zero-vector / all-OOV edge case: no active vocabulary features present
        predicted_total_feature_contribution = 0.0
        runner_up_total_feature_contribution = 0.0
        total_difference_contribution = 0.0
        top_pos: list[FeatureContribution] = []
        top_neg: list[FeatureContribution] = []
        top_diff_pos: list[RunnerUpDifference] = []
        top_diff_neg: list[RunnerUpDifference] = []
    else:
        # Slice only the active columns from the 50,000-column coefficient rows
        coef_pred = clf.coef_[predicted_idx, active_indices]
        coef_runner = clf.coef_[runner_up_idx, active_indices]

        # Element-wise contribution vectors (length: active_count)
        contributions = active_values * coef_pred
        runner_contributions = active_values * coef_runner
        diff_contributions = active_values * (coef_pred - coef_runner)

        # Aggregate totals over ALL active features to preserve exact math
        predicted_total_feature_contribution = float(np.sum(contributions))
        runner_up_total_feature_contribution = float(np.sum(runner_contributions))
        total_difference_contribution = float(np.sum(diff_contributions))

        # ── 6. Privacy Filtering & Candidate Collection ──────────────────
        cand_pos: list[FeatureContribution] = []
        cand_neg: list[FeatureContribution] = []
        cand_diff_pos: list[RunnerUpDifference] = []
        cand_diff_neg: list[RunnerUpDifference] = []

        for k in range(active_count):
            col_idx = int(active_indices[k])
            term = str(resolved_feature_names[col_idx])
            idf_val = float(tfidf.idf_[col_idx])
            c_val = float(contributions[k])
            d_val = float(diff_contributions[k])

            if not is_safe_feature(term, idf_val, max_allowed_idf):
                continue

            if c_val > 0.0:
                cand_pos.append(FeatureContribution(feature=term, contribution=c_val))
            elif c_val < 0.0:
                cand_neg.append(FeatureContribution(feature=term, contribution=c_val))

            if d_val > 0.0:
                cand_diff_pos.append(RunnerUpDifference(feature=term, difference_contribution=d_val))
            elif d_val < 0.0:
                cand_diff_neg.append(RunnerUpDifference(feature=term, difference_contribution=d_val))

        # ── 7. Deterministic Ranking of Displayed Features ───────────────
        # Positive contributions: descending by value; tie-break alphabetically by term
        top_pos = sorted(cand_pos, key=lambda x: (-x.contribution, x.feature))[:top_k]

        # Negative contributions: ascending by value (strongest negative first); tie-break alphabetically
        top_neg = sorted(cand_neg, key=lambda x: (x.contribution, x.feature))[:top_k]

        # Positive runner-up differences: descending by value; tie-break alphabetically
        top_diff_pos = sorted(cand_diff_pos, key=lambda x: (-x.difference_contribution, x.feature))[:top_k]

        # Negative runner-up differences: ascending by value; tie-break alphabetically
        top_diff_neg = sorted(cand_diff_neg, key=lambda x: (x.difference_contribution, x.feature))[:top_k]

    # ── 8. Mathematical Reconstruction Verification ───────────────────────
    reconstructed_pred_score = predicted_intercept + predicted_total_feature_contribution
    pred_error = abs(reconstructed_pred_score - predicted_decision_score)
    if pred_error > tolerance:
        raise ExplanationReconstructionError(
            f"Predicted class reconstruction failed: intercept ({predicted_intercept:.8f}) + "
            f"total_contributions ({predicted_total_feature_contribution:.8f}) = {reconstructed_pred_score:.8f}, "
            f"which differs from decision_score ({predicted_decision_score:.8f}) by {pred_error:.2e} "
            f"(tolerance: {tolerance:.2e})."
        )

    reconstructed_runner_score = runner_up_intercept + runner_up_total_feature_contribution
    runner_error = abs(reconstructed_runner_score - runner_up_decision_score)
    if runner_error > tolerance:
        raise ExplanationReconstructionError(
            f"Runner-up class reconstruction failed: intercept ({runner_up_intercept:.8f}) + "
            f"total_contributions ({runner_up_total_feature_contribution:.8f}) = {reconstructed_runner_score:.8f}, "
            f"which differs from decision_score ({runner_up_decision_score:.8f}) by {runner_error:.2e} "
            f"(tolerance: {tolerance:.2e})."
        )

    reconstructed_margin = intercept_difference + total_difference_contribution
    margin_error = abs(reconstructed_margin - decision_score_margin)
    if margin_error > tolerance:
        raise ExplanationReconstructionError(
            f"Runner-up margin reconstruction failed: intercept_diff ({intercept_difference:.8f}) + "
            f"total_diff_contributions ({total_difference_contribution:.8f}) = {reconstructed_margin:.8f}, "
            f"which differs from decision_score_margin ({decision_score_margin:.8f}) by {margin_error:.2e} "
            f"(tolerance: {tolerance:.2e})."
        )

    return ExplanationResult(
        predicted_class=predicted_class,
        runner_up_class=runner_up_class,
        predicted_decision_score=predicted_decision_score,
        runner_up_decision_score=runner_up_decision_score,
        decision_score_margin=decision_score_margin,
        predicted_intercept=predicted_intercept,
        predicted_total_feature_contribution=predicted_total_feature_contribution,
        runner_up_intercept=runner_up_intercept,
        runner_up_total_feature_contribution=runner_up_total_feature_contribution,
        intercept_difference=intercept_difference,
        total_difference_contribution=total_difference_contribution,
        top_positive_features=top_pos,
        top_negative_features=top_neg,
        top_positive_runner_up_differences=top_diff_pos,
        top_negative_runner_up_differences=top_diff_neg,
        model_artifact_sha256=model_sha256,
        method=EXPLANATION_METHOD,
        version="1.0.0",
        active_feature_count=active_count,
        disclaimer=EXPLANATION_DISCLAIMER,
    )
