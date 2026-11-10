"""CivicResolve AI — FastAPI NLP Service.

Provides text classification into 8 consumer-finance product categories using
the trained TF-IDF + Logistic Regression baseline pipeline, paired with rule-based
triage priority evaluation and uncertainty flags.

Endpoints:
- POST /classify: Classify consumer complaint narrative into product category.
- GET  /health: Service liveness and model load status.
- GET  /models/info: Metadata for active serving model and benchmark Bi-LSTM.
"""

from __future__ import annotations

import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.schemas import (
    CalibrationMetricsResponse,
    ClassifyRequest,
    ClassifyResponse,
    CompareClassifyRequest,
    DualModelComparisonResponse,
    ExplanationResponse,
    FeatureContributionItem,
    HealthResponse,
    ModelInfoResponse,
    PrecedentRankRequest,
    PrecedentRankResponse,
    RunnerUpDifferenceItem,
)
from app.services.model_manager import model_manager
from app.services.triage import determine_review_status, evaluate_triage_priority

# Configure structured privacy-safe logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("civicresolve.nlp")


# ---------------------------------------------------------------------------
# Application Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the trained model pipeline on startup.

    STRICT POLICY: No models are retrained at startup.
    The sealed final test dataset is never accessed or evaluated.
    """
    logger.info("Initializing CivicResolve NLP Service...")
    success = model_manager.load()
    if success:
        logger.info(
            f"Active serving model loaded: {model_manager.model_path.name} "
            f"(SHA-256: {model_manager.model_sha256[:12]}...)"
        )
    else:
        logger.warning(
            f"Serving model could not be loaded: {model_manager.load_error}. "
            "Endpoints requiring inference will respond with HTTP 503 until resolved."
        )
    yield
    logger.info("Shutting down CivicResolve NLP Service...")


# ---------------------------------------------------------------------------
# FastAPI App Construction
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "NLP classification and heuristic triage service for CivicResolve AI. "
        "Classifies consumer complaint narratives into eight CFPB product categories "
        "and flags uncertain predictions for human review."
    ),
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Privacy-Safe Logging Middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def audit_logging_middleware(request: Request, call_next) -> Response:
    """Log request metadata without logging raw narratives or personal data."""
    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    # Log only privacy-safe operational metadata
    logger.info(
        f"HTTP {request.method} {request.url.path} -> {response.status_code} "
        f"({duration_ms}ms, client: {request.client.host if request.client else 'unknown'})"
    )
    return response


# ---------------------------------------------------------------------------
# Exception Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return clear 422 validation errors for invalid input schemas."""
    errors = []
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err.get("loc", []))
        errors.append({
            "field": field,
            "message": err.get("msg", "Invalid input"),
            "type": err.get("type", "value_error"),
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Input validation failed. Please review field constraints.",
            "errors": errors,
        },
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": str(exc)},
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(request: Request, exc: RuntimeError):
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health check",
    tags=["System"],
)
async def health_check() -> HealthResponse:
    """Return liveness status and model load availability."""
    current_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if model_manager.is_loaded:
        return HealthResponse(
            status="ok",
            model_loaded=True,
            model_path=str(model_manager.model_path),
            timestamp_utc=current_utc,
            error=None,
        )
    return HealthResponse(
        status="degraded",
        model_loaded=False,
        model_path=str(model_manager.model_path),
        timestamp_utc=current_utc,
        error=model_manager.load_error or "Model is not loaded",
    )


@app.get(
    "/models/info",
    response_model=ModelInfoResponse,
    summary="Active model provenance and benchmarks",
    tags=["Models"],
)
async def models_info() -> ModelInfoResponse:
    """Return active serving model metadata and benchmark validation metrics."""
    info_data = model_manager.get_info()
    return ModelInfoResponse(**info_data)


@app.get(
    "/models/calibration",
    response_model=CalibrationMetricsResponse,
    summary="Model probability calibration and 10-bin reliability metrics",
    tags=["Models"],
)
async def get_calibration_metrics() -> CalibrationMetricsResponse:
    """Return Expected Calibration Error (ECE), Brier Score, and 10-bin reliability diagrams evaluated on val.csv."""
    calib_path = settings.models_dir / "calibration_eval_val.json"
    if not calib_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calibration metrics artifact not found. Run evaluate_calibration_val.py first.",
        )
    try:
        data = json.loads(calib_path.read_text(encoding="utf-8"))
        return CalibrationMetricsResponse(**data)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load calibration metrics: {exc}",
        )


@app.post(
    "/classify",
    response_model=ClassifyResponse,
    summary="Classify consumer complaint narrative",
    tags=["Inference"],
)
async def classify_complaint(payload: ClassifyRequest) -> ClassifyResponse:
    """Classify a genuine consumer complaint narrative into an approved product category.

    - Preprocesses text using the exact clean_narrative pipeline from training.
    - Runs the active TF-IDF + Logistic Regression model.
    - Computes predicted class probabilities (uncalibrated model probability estimates;
      not guaranteed to match empirical correctness rates).
    - Evaluates human-review triggers: classification uncertainty (low confidence or narrow margin)
      OR high/critical triage priority.
    - Evaluates transparent rule-based triage priority and sentiment polarity.
    - Never uses metadata or personal data in classification.
    """
    # 1. Acquire single immutable model state snapshot for entire request lifecycle
    try:
        state = model_manager.get_state()
    except RuntimeError as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Serving model is unavailable: {err}",
        )

    # 2. Model inference against snapshot
    try:
        pred_result = model_manager.predict_with_state(state, payload.text)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )

    # 3. Rule-based triage priority and sentiment analysis
    triage_result = evaluate_triage_priority(payload.text)

    # 4. Determine overall human review status (uncertainty OR priority)
    flag_for_review, review_reasons = determine_review_status(
        model_flag_for_review=pred_result["flag_for_review"],
        model_review_reasons=pred_result["review_reasons"],
        triage_priority=triage_result["triage_priority"],
    )

    # 5. Generate explainability payload using the exact same snapshot
    explanation_obj: ExplanationResponse | None = None
    try:
        expl_result = model_manager.explain_with_state(state, payload.text)
        explanation_obj = ExplanationResponse(
            method=expl_result.method,
            version=expl_result.version,
            predicted_class=expl_result.predicted_class,
            runner_up_class=expl_result.runner_up_class,
            predicted_decision_score=expl_result.predicted_decision_score,
            runner_up_decision_score=expl_result.runner_up_decision_score,
            decision_score_margin=expl_result.decision_score_margin,
            predicted_intercept=expl_result.predicted_intercept,
            predicted_total_feature_contribution=expl_result.predicted_total_feature_contribution,
            runner_up_intercept=expl_result.runner_up_intercept,
            runner_up_total_feature_contribution=expl_result.runner_up_total_feature_contribution,
            intercept_difference=expl_result.intercept_difference,
            total_difference_contribution=expl_result.total_difference_contribution,
            active_feature_count=expl_result.active_feature_count,
            top_positive_features=[
                FeatureContributionItem(feature=f.feature, contribution=f.contribution)
                for f in expl_result.top_positive_features
            ],
            top_negative_features=[
                FeatureContributionItem(feature=f.feature, contribution=f.contribution)
                for f in expl_result.top_negative_features
            ],
            top_positive_runner_up_differences=[
                RunnerUpDifferenceItem(feature=f.feature, difference_contribution=f.difference_contribution)
                for f in expl_result.top_positive_runner_up_differences
            ],
            top_negative_runner_up_differences=[
                RunnerUpDifferenceItem(feature=f.feature, difference_contribution=f.difference_contribution)
                for f in expl_result.top_negative_runner_up_differences
            ],
            model_artifact_sha256=expl_result.model_artifact_sha256,
            disclaimer=expl_result.disclaimer,
        )
    except Exception as expl_exc:
        logger.warning(
            f"Explanation generation failed; continuing with unaugmented classification: {type(expl_exc).__name__}"
        )
        explanation_obj = None

    # 5. Assemble response
    disclaimer = (
        "Category prediction is an automated recommendation for human triage. "
        "Class probabilities are uncalibrated model probability estimates and are not "
        "guaranteed to match empirical correctness rates. Triage priority is a heuristic "
        "rule-based score and has not been validated against labeled urgency outcomes. "
        "Human review is required."
    )

    return ClassifyResponse(
        product_category=pred_result["product_category"],
        confidence=pred_result["confidence"],
        margin=pred_result["margin"],
        probabilities=pred_result["probabilities"],
        model_used=pred_result["model_used"],
        model_version=pred_result["model_version"],
        flag_for_review=flag_for_review,
        review_reasons=review_reasons,
        triage_priority=triage_result["triage_priority"],
        priority_reasons=triage_result["priority_reasons"],
        sentiment_score=triage_result["sentiment_score"],
        sentiment_label=triage_result["sentiment_label"],
        disclaimer=disclaimer,
        explanation=explanation_obj,
    )


@app.post(
    "/classify/compare",
    response_model=DualModelComparisonResponse,
    summary="Compare baseline and Bi-LSTM inference side-by-side",
    tags=["Inference"],
)
async def compare_models_endpoint(payload: CompareClassifyRequest) -> DualModelComparisonResponse:
    """Run dual-model inference comparing TF-IDF baseline and PyTorch Bi-LSTM."""
    if not model_manager.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serving baseline model is not loaded.",
        )
    try:
        result = model_manager.compare_models(payload.text)
        return DualModelComparisonResponse(**result)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except RuntimeError as r_err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(r_err),
        )


@app.post(
    "/precedents/rank",
    response_model=PrecedentRankResponse,
    summary="Rank candidate historical complaints by Lexical TF-IDF Cosine Similarity",
    tags=["Inference"],
)
async def rank_precedents_endpoint(payload: PrecedentRankRequest) -> PrecedentRankResponse:
    """Rank historical complaints using L2-normalized TF-IDF cosine similarity."""
    try:
        state = model_manager.get_state()
    except RuntimeError as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Serving model is unavailable: {err}",
        )
    try:
        candidates_raw = [c.model_dump() for c in payload.candidates]
        result = model_manager.rank_precedents(
            state=state,
            query_text=payload.query_text,
            candidates=candidates_raw,
            top_k=payload.top_k,
        )
        return PrecedentRankResponse(**result)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )


@app.get("/", summary="Root index", tags=["System"])
async def root():
    """Welcome index with links to API documentation."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "active_model": "TF-IDF + Logistic Regression (balanced)",
        "docs_url": "/docs",
        "health_url": "/health",
        "models_info_url": "/models/info",
        "status": "online" if model_manager.is_loaded else "degraded",
    }
