"""CivicResolve AI — Service Configuration."""

from __future__ import annotations

import os
from pathlib import Path
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models_saved"

APPROVED_LABELS: list[str] = [
    "Credit reporting or other personal consumer reports",
    "Debt collection",
    "Credit card",
    "Checking or savings account",
    "Money transfer, virtual currency, or money service",
    "Mortgage",
    "Student loan",
    "Vehicle loan or lease",
]


class Settings(BaseModel):
    """Runtime configuration for the CivicResolve NLP service."""

    app_name: str = "CivicResolve AI NLP Service"
    app_version: str = "1.0.0"
    api_prefix: str = ""

    # Model and metadata filepaths
    models_dir: Path = Field(default_factory=lambda: MODELS_DIR)
    baseline_model_path: Path = Field(
        default_factory=lambda: Path(
            os.getenv("BASELINE_MODEL_PATH", str(MODELS_DIR / "baseline_tfidf_logreg.joblib"))
        )
    )
    baseline_eval_path: Path = Field(
        default_factory=lambda: Path(
            os.getenv("BASELINE_EVAL_PATH", str(MODELS_DIR / "baseline_eval_val.json"))
        )
    )
    bilstm_eval_path: Path = Field(
        default_factory=lambda: Path(
            os.getenv("BILSTM_EVAL_PATH", str(MODELS_DIR / "bilstm_eval_val.json"))
        )
    )

    # Uncertainty and human review thresholds
    min_confidence_threshold: float = Field(
        default_factory=lambda: float(os.getenv("CIVIC_MIN_CONFIDENCE", "0.55"))
    )
    min_margin_threshold: float = Field(
        default_factory=lambda: float(os.getenv("CIVIC_MIN_MARGIN", "0.15"))
    )

    # Text validation limits
    min_text_len: int = 20
    max_text_len: int = 10_000

    approved_labels: list[str] = APPROVED_LABELS


settings = Settings()
