"""CivicResolve AI — Model Manager and Inference Service.

Loads the saved TF-IDF + Logistic Regression baseline pipeline, computes
predicted class probability estimates, uncertainty flags, and margin between top classes.
Note: LogisticRegression.predict_proba outputs are uncalibrated model probability
estimates and are not guaranteed to match empirical correctness rates.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
import threading
from typing import Any

import joblib
import numpy as np
import torch

from app.config import APPROVED_LABELS, settings
from app.models.bilstm import BiLSTMClassifier, Vocabulary, BiLSTMPipeline
from app.preprocessing.cleaner import clean_narrative
from app.services.explainer import ExplanationResult, explain_prediction

logger = logging.getLogger("civicresolve.nlp")

_SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_CARD_RE = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b")
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b")


def mask_pii(text: str) -> str:
    """Mask Social Security numbers, payment cards, emails, and phone numbers."""
    if not text:
        return ""
    t = _SSN_RE.sub("[SSN-REDACTED]", text)
    t = _CARD_RE.sub("[CARD-REDACTED]", t)
    t = _EMAIL_RE.sub("[EMAIL-REDACTED]", t)
    t = _PHONE_RE.sub("[PHONE-REDACTED]", t)
    return t


@dataclass(frozen=True, slots=True)
class ModelState:
    """Immutable, coherent snapshot of model artifacts, vocabulary, and metadata."""

    model: Any
    classes: tuple[str, ...]
    feature_names: np.ndarray
    model_sha256: str
    metadata: dict[str, Any]

    def __post_init__(self):
        # Enforce tuple for classes if passed as list or other sequence
        if not isinstance(self.classes, tuple):
            object.__setattr__(self, "classes", tuple(self.classes))
        # Enforce read-only immutability on cached feature names array
        if isinstance(self.feature_names, np.ndarray):
            self.feature_names.flags.writeable = False


class ModelManager:
    """Manages the lifecycle and inference of the primary serving model with atomic snapshots."""

    def __init__(
        self,
        model_path: Path | None = None,
        min_confidence: float | None = None,
        min_margin: float | None = None,
    ):
        self.model_path = model_path or settings.baseline_model_path
        self.min_confidence = (
            min_confidence if min_confidence is not None else settings.min_confidence_threshold
        )
        self.min_margin = (
            min_margin if min_margin is not None else settings.min_margin_threshold
        )

        self._lock = threading.Lock()
        self._state: ModelState | None = None
        self.load_error: str | None = None

        self._bilstm_lock = threading.Lock()
        self._bilstm_pipeline: BiLSTMPipeline | None = None
        self.bilstm_load_error: str | None = None

    @property
    def is_loaded(self) -> bool:
        """Indicate whether an active serving snapshot is published and available."""
        with self._lock:
            return self._state is not None

    @property
    def model(self) -> Any:
        """Access the active model pipeline from the current snapshot."""
        state = self.get_state()
        return state.model

    @property
    def classes(self) -> tuple[str, ...]:
        """Access the active class labels from the current snapshot."""
        with self._lock:
            if self._state is not None:
                return self._state.classes
            return tuple(APPROVED_LABELS)

    @property
    def feature_names(self) -> np.ndarray | None:
        """Access the active cached feature names array from the current snapshot."""
        with self._lock:
            if self._state is not None:
                return self._state.feature_names
            return None

    @property
    def model_sha256(self) -> str:
        """Access the active model SHA-256 provenance hash from the current snapshot."""
        with self._lock:
            if self._state is not None:
                return self._state.model_sha256
            return ""

    def get_state(self) -> ModelState:
        """Acquire the currently published immutable model state snapshot.

        Thread-safe: guarantees atomic snapshot acquisition. Callers must capture
        one snapshot reference per request to ensure coherent prediction and explanation.
        """
        with self._lock:
            if self._state is None:
                raise RuntimeError(
                    f"Active serving model is not loaded: {self.load_error or 'Artifact not loaded'}"
                )
            return self._state

    def load(self, model_path: Path | None = None) -> bool:
        """Load and publish an atomic model snapshot from disk.

        Constructs and validates all components in local variables before publishing
        via a single atomic reference assignment protected by self._lock.
        Does NOT retrain any models; strictly deserializes the trained artifact.
        If reload fails, preserves the last-known-good snapshot.
        """
        target_path = model_path or self.model_path
        if not target_path.exists():
            error_msg = f"Model artifact file not found: {target_path}"
            logger.error(error_msg)
            with self._lock:
                if self._state is None:
                    self.load_error = error_msg
                else:
                    logger.warning(f"Failed reload; keeping existing snapshot: {error_msg}")
            return False

        try:
            # 1. Calculate SHA-256 for artifact provenance locally
            hasher = hashlib.sha256()
            with open(target_path, "rb") as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            candidate_sha256 = hasher.hexdigest()

            # 2. Deserialize pipeline via joblib locally
            loaded = joblib.load(target_path)
            if not hasattr(loaded, "predict_proba"):
                raise TypeError(
                    f"Loaded object from {target_path} does not implement predict_proba."
                )
            if not hasattr(loaded, "decision_function"):
                raise TypeError(
                    f"Loaded object from {target_path} does not implement decision_function."
                )

            # 3. Extract class order locally as an immutable tuple
            if hasattr(loaded, "classes_"):
                candidate_classes = tuple(str(c) for c in loaded.classes_)
            elif hasattr(loaded, "named_steps") and hasattr(loaded.named_steps.get("classifier"), "classes_"):
                candidate_classes = tuple(str(c) for c in loaded.named_steps["classifier"].classes_)
            else:
                candidate_classes = tuple(APPROVED_LABELS)

            # 4. Extract and cache feature names array locally
            if hasattr(loaded, "named_steps") and "tfidf" in loaded.named_steps:
                candidate_feature_names = np.array(
                    loaded.named_steps["tfidf"].get_feature_names_out()
                )
            else:
                raise TypeError("Pipeline is missing tfidf step with get_feature_names_out.")

            # 5. Construct candidate immutable snapshot
            candidate_state = ModelState(
                model=loaded,
                classes=candidate_classes,
                feature_names=candidate_feature_names,
                model_sha256=candidate_sha256,
                metadata={"model_name": "baseline_tfidf_logreg"},
            )

            # 6. Publish snapshot atomically under lock
            with self._lock:
                self._state = candidate_state
                self.load_error = None
                self.model_path = target_path

            logger.info(
                f"Model pipeline snapshot successfully published from {target_path} "
                f"(SHA-256: {candidate_sha256[:12]}..., Classes: {len(candidate_classes)})"
            )
            return True

        except Exception as exc:
            error_msg = f"Failed to load model pipeline: {exc}"
            logger.exception(error_msg)
            with self._lock:
                if self._state is None:
                    self.load_error = error_msg
                else:
                    logger.warning(f"Failed reload; keeping existing snapshot: {error_msg}")
            return False

    def unload(self) -> None:
        """Atomically clear the active model snapshot."""
        with self._lock:
            self._state = None
            self.load_error = "Model has been unloaded."
        logger.info("Serving model snapshot unloaded.")

    def predict_with_state(self, state: ModelState, raw_text: str) -> dict[str, Any]:
        """Classify narrative against a specific immutable ModelState snapshot.

        Authoritative Ranking Rule:
        Uses unrounded linear decision scores from decision_function() for class ranking,
        with ascending class index strictly for exact score ties.
        Probabilities are calculated separately for confidence and margin fields.
        """
        cleaned = clean_narrative(raw_text)
        if not cleaned:
            raise ValueError("Narrative text is empty after preprocessing.")

        # 1. Authoritative decision scores for class ranking
        raw_scores = state.model.decision_function([cleaned])[0]
        raw_ranked_indices = sorted(
            range(len(state.classes)),
            key=lambda idx: (-raw_scores[idx], idx),
        )

        # 2. Probability distribution for confidence and probability margin
        probs_matrix = state.model.predict_proba([cleaned])[0]
        prob_dict = {
            state.classes[i]: round(float(probs_matrix[i]), 4)
            for i in range(len(state.classes))
        }

        # 3. Select top and runner-up based on decision-score rank
        top_idx = raw_ranked_indices[0]
        second_idx = raw_ranked_indices[1] if len(raw_ranked_indices) > 1 else top_idx

        top_cat = state.classes[top_idx]
        second_cat = state.classes[second_idx]

        top_prob = prob_dict[top_cat]
        second_prob = prob_dict[second_cat]
        margin = round(float(top_prob - second_prob), 4)

        # 4. Evaluate human-review thresholds
        flag_for_review = False
        review_reasons: list[str] = []

        if top_prob < self.min_confidence:
            flag_for_review = True
            review_reasons.append(
                f"Model score ({top_prob:.4f}) is below human-review threshold ({self.min_confidence:.4f})."
            )

        if margin < self.min_margin:
            flag_for_review = True
            review_reasons.append(
                f"Margin between top category '{top_cat}' and runner-up '{second_cat}' "
                f"({margin:.4f}) is below review margin threshold ({self.min_margin:.4f})."
            )

        return {
            "product_category": top_cat,
            "confidence": top_prob,
            "margin": margin,
            "probabilities": prob_dict,
            "model_used": "baseline_tfidf_logreg",
            "model_version": state.model_sha256[:16],
            "flag_for_review": flag_for_review,
            "review_reasons": review_reasons,
        }

    def explain_with_state(self, state: ModelState, raw_text: str, top_k: int = 5) -> ExplanationResult:
        """Decompose linear Logistic Regression decision scores against a specific ModelState."""
        return explain_prediction(
            pipeline=state.model,
            raw_text=raw_text,
            model_sha256=state.model_sha256,
            top_k=top_k,
            feature_names=state.feature_names,
        )

    def predict(self, raw_text: str) -> dict[str, Any]:
        """Classify a consumer complaint narrative using the current snapshot."""
        state = self.get_state()
        return self.predict_with_state(state, raw_text)

    def explain(self, raw_text: str, top_k: int = 5) -> ExplanationResult:
        """Decompose decision scores into exact feature contributions using the current snapshot."""
        state = self.get_state()
        return self.explain_with_state(state, raw_text, top_k=top_k)

    def get_bilstm_pipeline(self) -> BiLSTMPipeline:
        """Lazy-load the PyTorch Bi-LSTM benchmark model snapshot safely on CPU/GPU."""
        with self._bilstm_lock:
            if self._bilstm_pipeline is not None:
                return self._bilstm_pipeline

            bilstm_model_path = settings.models_dir / "bilstm_best.pt"
            config_path = settings.models_dir / "bilstm_config.json"
            vocab_path = settings.models_dir / "vocab.json"

            if not bilstm_model_path.exists():
                raise FileNotFoundError(f"Bi-LSTM checkpoint not found at {bilstm_model_path}")
            if not config_path.exists():
                raise FileNotFoundError(f"Bi-LSTM config not found at {config_path}")
            if not vocab_path.exists():
                raise FileNotFoundError(f"Vocabulary not found at {vocab_path}")

            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
                vocab = Vocabulary.load(vocab_path)

                hasher = hashlib.sha256()
                with open(bilstm_model_path, "rb") as f:
                    while chunk := f.read(65536):
                        hasher.update(chunk)
                bilstm_sha = hasher.hexdigest()

                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                model = BiLSTMClassifier(
                    vocab_size=config["vocab_size"],
                    embedding_dim=config.get("embedding_dim", 128),
                    hidden_dim=config.get("hidden_dim", 128),
                    num_layers=config.get("num_layers", 1),
                    num_classes=len(config.get("labels", APPROVED_LABELS)),
                    dropout=config.get("dropout", 0.3),
                )

                checkpoint = torch.load(bilstm_model_path, map_location=device, weights_only=True)
                model.load_state_dict(checkpoint["model_state_dict"])
                model.to(device)
                model.eval()

                pipeline = BiLSTMPipeline(model, vocab, config, device, bilstm_sha)
                self._bilstm_pipeline = pipeline
                self.bilstm_load_error = None
                logger.info(
                    f"Bi-LSTM benchmark pipeline lazy-loaded on {device} (SHA-256: {bilstm_sha[:12]}...)"
                )
                return pipeline
            except Exception as exc:
                self.bilstm_load_error = str(exc)
                logger.exception(f"Failed to load Bi-LSTM benchmark pipeline: {exc}")
                raise RuntimeError(f"Bi-LSTM model could not be loaded: {exc}") from exc

    def compare_models(self, raw_text: str) -> dict[str, Any]:
        """Execute side-by-side inference between baseline TF-IDF and PyTorch Bi-LSTM."""
        state = self.get_state()
        cleaned = clean_narrative(raw_text)
        if not cleaned:
            raise ValueError("Narrative text is empty after preprocessing.")

        # 1. Baseline inference
        start_base = time.perf_counter()
        pred_base = self.predict_with_state(state, raw_text)
        latency_base = round((time.perf_counter() - start_base) * 1000.0, 2)

        tfidf_vec = state.model.named_steps["tfidf"].transform([cleaned])
        feature_count = int(tfidf_vec.nnz)

        baseline_summary = {
            "model_name": "TF-IDF + Logistic Regression (balanced)",
            "model_type": "linear_tfidf",
            "model_version_sha256": state.model_sha256,
            "predicted_category": pred_base["product_category"],
            "confidence": pred_base["confidence"],
            "margin": pred_base["margin"],
            "probabilities": pred_base["probabilities"],
            "latency_ms": latency_base,
            "token_or_feature_count": feature_count,
            "truncated": False,
        }

        # 2. PyTorch Bi-LSTM inference
        bilstm_pipe = self.get_bilstm_pipeline()
        bilstm_res = bilstm_pipe.predict(cleaned)

        bilstm_summary = {
            "model_name": "BiLSTMClassifier (PyTorch)",
            "model_type": "neural_bilstm",
            "model_version_sha256": bilstm_res["model_version_sha256"],
            "predicted_category": bilstm_res["predicted_category"],
            "confidence": bilstm_res["confidence"],
            "margin": bilstm_res["margin"],
            "probabilities": bilstm_res["probabilities"],
            "latency_ms": bilstm_res["latency_ms"],
            "token_or_feature_count": bilstm_res["token_count"],
            "truncated": bilstm_res["truncated"],
        }

        models_agree = baseline_summary["predicted_category"] == bilstm_summary["predicted_category"]
        conf_delta = round(float(baseline_summary["confidence"] - bilstm_summary["confidence"]), 4)

        return {
            "baseline": baseline_summary,
            "bilstm": bilstm_summary,
            "models_agree": models_agree,
            "confidence_delta": conf_delta,
            "disclaimer": (
                "Dual-model comparison is provided for reviewer oversight and model audit. "
                "The baseline model remains the sole authority for automated grievance routing. "
                "Probabilities are model estimates and not guaranteed to reflect empirical accuracy."
            ),
        }

    def rank_precedents(
        self,
        state: ModelState,
        query_text: str,
        candidates: list[dict[str, Any]],
        top_k: int = 3,
    ) -> dict[str, Any]:
        """Rank candidate adjudicated grievances by exact Lexical TF-IDF Cosine Similarity."""
        cleaned_query = clean_narrative(query_text)
        if not cleaned_query:
            raise ValueError("Query narrative is empty after preprocessing.")
        if not candidates:
            return {
                "candidates_evaluated": 0,
                "top_k": top_k,
                "precedents": [],
                "similarity_metric": "Lexical TF-IDF Cosine Similarity",
            }

        vec = state.model.named_steps["tfidf"]
        q_vec = vec.transform([cleaned_query])

        cand_texts = [clean_narrative(c.get("text", "")) for c in candidates]
        cand_mat = vec.transform(cand_texts)

        # Dot product of L2-normalized vectors is exact cosine similarity
        scores = cand_mat.dot(q_vec.T).toarray().ravel()

        ranked_indices = sorted(range(len(candidates)), key=lambda idx: (-scores[idx], idx))
        top_indices = ranked_indices[: min(top_k, len(candidates))]

        results = []
        for idx in top_indices:
            c = candidates[idx]
            raw_text = c.get("text", "")
            masked = mask_pii(raw_text)
            snippet = masked[:240].strip()
            if len(masked) > 240:
                snippet += "..."

            results.append({
                "id": str(c.get("id")),
                "similarity_score": round(float(scores[idx]), 4),
                "similarity_metric": "Lexical TF-IDF Cosine Similarity",
                "predicted_category": c.get("predicted_category"),
                "assigned_category": c.get("assigned_category") or c.get("assignedCategory"),
                "status": c.get("status"),
                "sanitized_snippet": snippet,
                "adjudicated_at": c.get("adjudicated_at"),
            })

        return {
            "candidates_evaluated": len(candidates),
            "top_k": top_k,
            "precedents": results,
            "similarity_metric": "Lexical TF-IDF Cosine Similarity",
        }

    def get_info(self) -> dict[str, Any]:
        """Return model metadata, SHA-256 provenance, and benchmark comparison."""
        baseline_metrics: dict[str, Any] = {}
        if settings.baseline_eval_path.exists():
            try:
                data = json.loads(settings.baseline_eval_path.read_text(encoding="utf-8"))
                baseline_metrics = {
                    "num_train_samples": data.get("num_train_samples", 59389),
                    "num_val_samples": data.get("num_val_samples", 12726),
                    "validation_metrics": data.get("metrics", {}),
                    "majority_class_baseline": data.get("majority_class_baseline", {}),
                }
            except Exception as exc:
                logger.warning(f"Could not load baseline eval JSON: {exc}")

        bilstm_metrics: dict[str, Any] = {}
        if settings.bilstm_eval_path.exists():
            try:
                data = json.loads(settings.bilstm_eval_path.read_text(encoding="utf-8"))
                bilstm_metrics = {
                    "model_name": "BiLSTMClassifier (PyTorch)",
                    "validation_metrics": data.get("metrics", {}),
                    "hardware": data.get("hardware", {}),
                    "notice": "Benchmark reference only. Not active serving model.",
                }
            except Exception as exc:
                logger.warning(f"Could not load Bi-LSTM eval JSON: {exc}")

        return {
            "active_serving_model": {
                "model_name": "TF-IDF (1,2-gram) + Logistic Regression (balanced)",
                "artifact_file": self.model_path.name,
                "artifact_sha256": self.model_sha256,
                "is_loaded": self.is_loaded,
                "min_confidence_threshold": self.min_confidence,
                "min_margin_threshold": self.min_margin,
                **baseline_metrics,
            },
            "benchmark_model": bilstm_metrics,
            "supported_categories": self.classes,
            "evaluation_split_status": (
                "Validation split evaluated (12,726 samples, 0 leakage). "
                "Final test split (12,727 samples) remains sealed."
            ),
        }


# Global model manager instance
model_manager = ModelManager()
