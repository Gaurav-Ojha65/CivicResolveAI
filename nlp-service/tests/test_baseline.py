import json
import sys
from pathlib import Path

NLP_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(NLP_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_SERVICE_DIR))

import joblib
import pandas as pd
import pytest

from training.train_baseline import (

    APPROVED_LABELS,
    DEFAULT_OUTPUT_DIR,
    build_baseline_pipeline,
    evaluate_baseline,
    normalize_narrative,
    verify_data_quality,
)

FIXTURE_TRAIN = pd.DataFrame({
    "text": [
        "Inaccurate inquiries appearing on my credit profile without consent.",
        "A debt collector calls my workplace constantly demanding payments.",
        "My credit card interest rate was raised improperly without warning.",
        "Checking account charged unauthorized overdraft penalty fees.",
        "Money transfer to another person was cancelled but funds were not returned.",
        "Mortgage escrow calculation is inaccurate and taxes were missed.",
        "Student loan servicer refused to process my income-driven repayment plan.",
        "Vehicle loan company added forced-place insurance unexpectedly.",
    ],
    "product_category": APPROVED_LABELS,
})

FIXTURE_VAL = pd.DataFrame({
    "text": [
        "Credit report inquiry listed multiple times erroneously.",
        "Harassing debt collection phone calls during evening hours.",
        "Credit card dispute was closed without adequate investigation.",
        "Checking account funds held for weeks after check cleared.",
        "Virtual currency transaction failed to arrive at recipient wallet.",
        "Mortgage interest rate adjusted incorrectly on monthly statement.",
        "Student loan interest capitalised during approved deferment period.",
        "Vehicle lease return charged excessive wear and tear fee.",
    ],
    "product_category": APPROVED_LABELS,
})


class TestBaselinePipeline:
    """Verify classical baseline pipeline construction, fitting, and evaluation."""

    def test_pipeline_structure(self):
        pipeline = build_baseline_pipeline(max_features=1000, max_iter=100)
        assert "tfidf" in pipeline.named_steps
        assert "classifier" in pipeline.named_steps
        assert pipeline.named_steps["classifier"].class_weight == "balanced"

    def test_pipeline_fit_and_predict(self):
        pipeline = build_baseline_pipeline(max_features=100, max_iter=50)
        pipeline.fit(FIXTURE_TRAIN["text"], FIXTURE_TRAIN["product_category"])
        preds = pipeline.predict(FIXTURE_VAL["text"])
        assert len(preds) == len(FIXTURE_VAL)
        for pred in preds:
            assert pred in APPROVED_LABELS

    def test_evaluate_baseline_structure(self):
        pipeline = build_baseline_pipeline(max_features=100, max_iter=50)
        pipeline.fit(FIXTURE_TRAIN["text"], FIXTURE_TRAIN["product_category"])
        eval_results = evaluate_baseline(
            pipeline=pipeline,
            df_train=FIXTURE_TRAIN,
            df_val=FIXTURE_VAL,
            labels=APPROVED_LABELS,
        )

        assert "metrics" in eval_results
        assert "accuracy" in eval_results["metrics"]
        assert "macro_f1" in eval_results["metrics"]
        assert "weighted_f1" in eval_results["metrics"]
        assert "per_class" in eval_results
        assert len(eval_results["per_class"]) == len(APPROVED_LABELS)
        assert "confusion_matrix" in eval_results
        assert len(eval_results["confusion_matrix"]) == len(APPROVED_LABELS)

    def test_saved_baseline_model_artifact(self):
        model_path = DEFAULT_OUTPUT_DIR / "baseline_tfidf_logreg.joblib"
        if model_path.exists():
            loaded_model = joblib.load(model_path)
            assert hasattr(loaded_model, "predict")
            preds = loaded_model.predict(["This is a credit dispute on my credit report."])
            assert len(preds) == 1
            assert preds[0] in APPROVED_LABELS

    def test_saved_baseline_eval_json(self):
        eval_path = DEFAULT_OUTPUT_DIR / "baseline_eval_val.json"
        if eval_path.exists():
            data = json.loads(eval_path.read_text(encoding="utf-8"))
            assert data["num_train_samples"] == 59389
            assert data["num_val_samples"] == 12726
            assert data["metrics"]["macro_f1"] == 0.7453
            assert data["metrics"]["accuracy"] == 0.838
