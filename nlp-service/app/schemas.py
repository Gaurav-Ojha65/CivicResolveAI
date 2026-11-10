"""CivicResolve AI — Request and Response Schemas."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class ClassifyRequest(BaseModel):
    """Input payload containing a genuine consumer complaint narrative."""

    text: str = Field(
        ...,
        min_length=20,
        max_length=10_000,
        description="The consumer complaint narrative text (20–10,000 characters).",
        examples=[
            "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency I have never heard of. I submitted a formal dispute letter requesting verification, but they failed to investigate within 30 days."
        ],
    )


class FeatureContributionItem(BaseModel):
    """Signed additive contribution of a single vocabulary feature to a class decision score."""

    feature: str = Field(..., description="Active vocabulary n-gram term.")
    contribution: float = Field(..., description="Signed additive contribution to the decision score.")


class RunnerUpDifferenceItem(BaseModel):
    """Signed additive contribution of a single feature to the margin over the runner-up class."""

    feature: str = Field(..., description="Active vocabulary n-gram term.")
    difference_contribution: float = Field(
        ...,
        description="Signed additive difference contribution (predicted_contribution - runner_up_contribution).",
    )


class ExplanationResponse(BaseModel):
    """Mathematically grounded linear feature attribution explanation for human reviewers."""

    method: str = Field(
        default="linear_feature_attribution",
        description="Mathematical attribution method name.",
    )
    version: str = Field(
        default="1.0.0",
        description="Explanation engine version identifier.",
    )
    predicted_class: str = Field(
        ...,
        description="Predicted consumer product category matching classification.",
    )
    runner_up_class: str = Field(
        ...,
        description="Second-ranked product category based on raw decision score / probability.",
    )
    predicted_decision_score: float = Field(
        ...,
        description="Raw linear decision score (logit) for the predicted class.",
    )
    runner_up_decision_score: float = Field(
        ...,
        description="Raw linear decision score (logit) for the runner-up class.",
    )
    decision_score_margin: float = Field(
        ...,
        description="Decision score margin (predicted_decision_score - runner_up_decision_score).",
    )
    predicted_intercept: float = Field(
        ...,
        description="Class-specific intercept offset for the predicted class.",
    )
    predicted_total_feature_contribution: float = Field(
        ...,
        description="Sum of all active feature contributions for the predicted class.",
    )
    runner_up_intercept: float = Field(
        ...,
        description="Class-specific intercept offset for the runner-up class.",
    )
    runner_up_total_feature_contribution: float = Field(
        ...,
        description="Sum of all active feature contributions for the runner-up class.",
    )
    intercept_difference: float = Field(
        ...,
        description="Difference between predicted intercept and runner-up intercept.",
    )
    total_difference_contribution: float = Field(
        ...,
        description="Sum of all active feature difference contributions over the runner-up class.",
    )
    active_feature_count: int = Field(
        ...,
        description="Number of non-zero sparse vocabulary n-grams extracted from narrative.",
    )
    top_positive_features: list[FeatureContributionItem] = Field(
        default_factory=list,
        description="Top vocabulary features with highest positive contributions towards predicted class (max 5).",
    )
    top_negative_features: list[FeatureContributionItem] = Field(
        default_factory=list,
        description="Top vocabulary features with strongest negative contributions against predicted class (max 5).",
    )
    top_positive_runner_up_differences: list[RunnerUpDifferenceItem] = Field(
        default_factory=list,
        description="Top features favoring the predicted class over the runner-up class (max 5).",
    )
    top_negative_runner_up_differences: list[RunnerUpDifferenceItem] = Field(
        default_factory=list,
        description="Top features favoring the runner-up class over the predicted class (max 5).",
    )
    model_artifact_sha256: str = Field(
        ...,
        description="Full SHA-256 checksum of the serialized model pipeline artifact.",
    )
    disclaimer: str = Field(
        ...,
        description="Transparency statement clarifying feature contributions are mathematical weights from historical data, not causal facts.",
    )


class ClassifyResponse(BaseModel):
    """Output payload containing predicted product category, uncertainties, and triage priority."""

    product_category: str = Field(
        ...,
        description="Recommended consumer financial product category.",
    )
    confidence: float = Field(
        ...,
        description=(
            "Model confidence score (highest predicted class probability estimate, rounded to 4 decimals). "
            "Note: this is an uncalibrated model probability estimate and is not guaranteed to match empirical correctness rates."
        ),
    )
    margin: float = Field(
        ...,
        description="Probability difference between top prediction estimate and runner-up prediction estimate.",
    )
    probabilities: dict[str, float] = Field(
        ...,
        description=(
            "Predicted class probability distribution across all eight approved categories. "
            "These are uncalibrated model probability estimates from LogisticRegression.predict_proba "
            "and are not guaranteed to match empirical correctness rates."
        ),
    )
    model_used: str = Field(
        ...,
        description="Identifier of the active ML model pipeline.",
    )
    model_version: str = Field(
        ...,
        description="Artifact SHA-256 checksum or version stamp.",
    )
    flag_for_review: bool = Field(
        ...,
        description=(
            "True if human review is required due to classification uncertainty "
            "(low probability estimate or narrow top-two margin) or high/critical triage priority."
        ),
    )
    review_reasons: list[str] = Field(
        default_factory=list,
        description="Explanations of specific conditions that triggered human review.",
    )
    triage_priority: str = Field(
        ...,
        description="Rule-based heuristic review tier: CRITICAL, HIGH, MEDIUM, or LOW.",
    )
    priority_reasons: list[str] = Field(
        default_factory=list,
        description="Rules/keywords that contributed to the triage priority level.",
    )
    sentiment_score: float = Field(
        ...,
        description="Compound sentiment score calculated from narrative text (-1.0 to +1.0).",
    )
    sentiment_label: str = Field(
        ...,
        description="Sentiment classification: NEGATIVE, NEUTRAL, or POSITIVE.",
    )
    disclaimer: str = Field(
        ...,
        description="Transparency statement indicating predictions are uncalibrated model recommendations and priority is a heuristic rule-based score requiring human review.",
    )
    explanation: ExplanationResponse | None = Field(
        default=None,
        description="Mathematically grounded linear feature attribution explanation for human reviewers.",
    )


class HealthResponse(BaseModel):
    """Health check response schema."""

    status: str = Field(..., description="'ok' when serving model is ready, 'degraded' otherwise.")
    model_loaded: bool = Field(..., description="True if active baseline pipeline is loaded in memory.")
    model_path: str = Field(..., description="File path to the serialized model pipeline.")
    timestamp_utc: str = Field(..., description="ISO 8601 UTC timestamp.")
    error: str | None = Field(default=None, description="Diagnostic error details if model failed to load.")


class ModelInfoResponse(BaseModel):
    """Model metadata and recorded validation benchmarks."""

    active_serving_model: dict[str, Any] = Field(
        ...,
        description="Active serving model configuration, SHA-256, and recorded validation metrics.",
    )
    benchmark_model: dict[str, Any] = Field(
        ...,
        description="Preserved experimental Bi-LSTM benchmark metrics for scientific comparison.",
    )
    supported_categories: list[str] = Field(
        ...,
        description="The 8 approved consumer-finance product categories.",
    )
    evaluation_split_status: str = Field(
        ...,
        description="Provenance of validation split and sealing status of test split.",
    )


# ---------------------------------------------------------------------------
# Phase 9 Advanced RegTech & MLOps Schemas
# ---------------------------------------------------------------------------

class CompareClassifyRequest(BaseModel):
    """Input payload for dual-model live comparison arena."""

    text: str = Field(
        ...,
        min_length=10,
        max_length=10_000,
        description="The consumer complaint narrative text to compare across models.",
    )


class ModelInferenceSummary(BaseModel):
    """Structured inference result from a single model pipeline."""

    model_name: str = Field(..., description="Name of the model pipeline.")
    model_type: str = Field(..., description="Architecture family: 'linear_tfidf' or 'neural_bilstm'.")
    model_version_sha256: str = Field(..., description="SHA-256 provenance hash of the model weights.")
    predicted_category: str = Field(..., description="Top predicted product category.")
    confidence: float = Field(..., description="Top predicted class probability estimate (0-1).")
    margin: float = Field(..., description="Margin between top class and runner-up class.")
    probabilities: dict[str, float] = Field(..., description="Full class probability distribution.")
    latency_ms: float = Field(..., description="Inference latency in milliseconds.")
    token_or_feature_count: int = Field(..., description="Active sparse features or token sequence length.")
    truncated: bool = Field(default=False, description="Whether input was truncated by max sequence length.")


class DualModelComparisonResponse(BaseModel):
    """Side-by-side inference output comparing TF-IDF baseline and PyTorch Bi-LSTM."""

    baseline: ModelInferenceSummary = Field(..., description="Inference summary from TF-IDF + LogReg baseline.")
    bilstm: ModelInferenceSummary = Field(..., description="Inference summary from PyTorch Bi-LSTM.")
    models_agree: bool = Field(..., description="True if both models predict the exact same top category.")
    confidence_delta: float = Field(..., description="Difference in confidence (baseline - bilstm).")
    disclaimer: str = Field(
        default=(
            "Dual-model comparison is provided for reviewer oversight and model audit. "
            "The baseline model remains the sole authority for automated grievance routing. "
            "Probabilities are model estimates and not guaranteed to reflect empirical accuracy."
        ),
        description="Transparency and governance disclaimer.",
    )


class CandidatePrecedentItem(BaseModel):
    """Candidate complaint record to be ranked by lexical similarity."""

    id: str = Field(..., description="Unique grievance UUID identifier.")
    text: str = Field(..., description="Complaint narrative text of the historical adjudicated grievance.")
    predicted_category: str | None = Field(default=None, description="Original model predicted category.")
    assignedCategory: str | None = Field(default=None, description="CamelCase alias for assigned_category.")
    assigned_category: str | None = Field(default=None, description="Final human-assigned category.")
    status: str | None = Field(default=None, description="Adjudication status: 'APPROVED' or 'OVERRIDDEN'.")
    adjudicated_at: str | None = Field(default=None, description="ISO timestamp of review completion.")

    def get_assigned(self) -> str | None:
        return self.assigned_category or self.assignedCategory


class PrecedentRankRequest(BaseModel):
    """Request payload for ranking candidate adjudicated grievances by lexical TF-IDF cosine similarity."""

    query_text: str = Field(..., min_length=10, max_length=10_000, description="Current grievance narrative.")
    candidates: list[CandidatePrecedentItem] = Field(..., min_length=1, max_length=200, description="Adjudicated candidate complaints to rank (bounded to 200).")
    top_k: int = Field(default=3, ge=1, le=10, description="Number of top precedents to return.")


class RankedPrecedentItem(BaseModel):
    """Single precedent case ranked by Lexical TF-IDF Cosine Similarity."""

    id: str = Field(..., description="Grievance UUID identifier.")
    similarity_score: float = Field(..., description="Lexical TF-IDF Cosine Similarity score (0.0 to 1.0).")
    similarity_metric: str = Field(
        default="Lexical TF-IDF Cosine Similarity",
        description="Strictly labeled similarity metric: 'Lexical TF-IDF Cosine Similarity'. Never a probability.",
    )
    predicted_category: str | None = Field(default=None, description="Original model predicted category.")
    assigned_category: str | None = Field(default=None, description="Final human-assigned category.")
    status: str | None = Field(default=None, description="Review status ('APPROVED' or 'OVERRIDDEN').")
    sanitized_snippet: str = Field(..., description="PII-sanitized snippet preview of historical narrative.")
    adjudicated_at: str | None = Field(default=None, description="ISO timestamp of review completion.")


class PrecedentRankResponse(BaseModel):
    """Response payload containing top-K ranked precedents."""

    candidates_evaluated: int = Field(..., description="Total candidate precedents evaluated.")
    top_k: int = Field(..., description="Requested top-K count.")
    precedents: list[RankedPrecedentItem] = Field(..., description="Top ranked precedents sorted by similarity descending.")
    similarity_metric: str = Field(
        default="Lexical TF-IDF Cosine Similarity",
        description="Strictly labeled metric: 'Lexical TF-IDF Cosine Similarity'.",
    )


class ReliabilityBin(BaseModel):
    """Single bin for 10-bin reliability diagram calibration curve."""

    bin_index: int = Field(..., description="1-based bin index (1 to 10).")
    bin_lower: float = Field(..., description="Lower confidence bound of the bin.")
    bin_upper: float = Field(..., description="Upper confidence bound of the bin.")
    bin_center: float = Field(..., description="Center of the bin for plotting.")
    sample_count: int = Field(..., description="Number of samples falling into this confidence bin.")
    empirical_accuracy: float = Field(..., description="Observed accuracy of samples in this bin.")
    mean_confidence: float = Field(..., description="Mean predicted confidence of samples in this bin.")


class CalibrationMetricsResponse(BaseModel):
    """Multi-class probability calibration metrics and 10-bin reliability diagram data."""

    evaluation_dataset: str = Field(..., description="Dataset and partition used for calibration evaluation.")
    evaluation_date_utc: str = Field(..., description="ISO 8601 UTC timestamp of evaluation.")
    total_validation_rows: int = Field(..., description="Total rows in validation split (12,726).")
    calibration_fit_rows: int = Field(..., description="Number of rows in calibration-fit split (6,363).")
    calibration_eval_rows: int = Field(..., description="Number of rows in calibration-eval split (6,363).")
    optimal_temperature: float = Field(..., description="Learned Temperature Scaling parameter T > 0.")
    uncalibrated_ece: float = Field(..., description="Expected Calibration Error before temperature scaling.")
    calibrated_ece: float = Field(..., description="Expected Calibration Error after temperature scaling.")
    ece_reduction_percent: float = Field(..., description="Percentage reduction in ECE.")
    uncalibrated_mce: float = Field(..., description="Maximum Calibration Error before temperature scaling.")
    calibrated_mce: float = Field(..., description="Maximum Calibration Error after temperature scaling.")
    uncalibrated_brier: float = Field(..., description="Multi-class Brier score before temperature scaling.")
    calibrated_brier: float = Field(..., description="Multi-class Brier score after temperature scaling.")
    brier_reduction_percent: float = Field(..., description="Percentage reduction in Brier score.")
    uncalibrated_bins: list[ReliabilityBin] = Field(..., description="10-bin reliability data for uncalibrated model.")
    calibrated_bins: list[ReliabilityBin] = Field(..., description="10-bin reliability data for temperature-scaled model.")
    disclaimer: str = Field(..., description="Safety and data governance disclaimer.")
