import json
import sys
from pathlib import Path

NLP_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(NLP_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_SERVICE_DIR))

import pytest
import torch
import torch.nn as nn

from training.train_bilstm import (

    APPROVED_LABELS,
    PAD_IDX,
    UNK_IDX,
    BiLSTMClassifier,
    ComplaintDataset,
    Vocabulary,
    collate_batch,
    compute_class_weights,
    generate_comparison_report,
    normalize_narrative,
    set_seed,
    tokenize,
    train_bilstm_pipeline,
    verify_data_quality,
)

FIXTURE_TEXTS = [
    "I noticed inaccurate inquiries on my credit report from a bank.",
    "A debt collector called repeatedly demanding payment for an unknown bill.",
    "The interest rate on my credit card was increased without notice.",
    "My checking account was charged unexpected overdraft fees.",
    "A money transfer via a digital wallet app failed and funds were lost.",
    "The mortgage servicer failed to apply my monthly escrow payment properly.",
    "My federal student loan repayment plan was miscalculated.",
    "The auto dealership misstated the vehicle loan interest rate.",
]

FIXTURE_LABELS = [
    "Credit reporting or other personal consumer reports",
    "Debt collection",
    "Credit card",
    "Checking or savings account",
    "Money transfer, virtual currency, or money service",
    "Mortgage",
    "Student loan",
    "Vehicle loan or lease",
]


class TestTokenizerAndVocabulary:
    """Verify reproducible tokenization and vocabulary construction."""

    def test_tokenize_reproducibility(self):
        text = "They charged $150.00 to my account on 2025-05-12! Didn't receive funds."
        tokens1 = tokenize(text)
        tokens2 = tokenize(text)
        assert tokens1 == tokens2
        assert "charged" in tokens1
        assert "didn't" in tokens1
        assert "150" in tokens1

    def test_empty_and_none_tokenization(self):
        assert tokenize("") == []
        assert tokenize(None) == []  # type: ignore[arg-type]
        assert tokenize("   ") == []

    def test_vocabulary_reserved_tokens(self):
        vocab = Vocabulary.build_from_texts(FIXTURE_TEXTS, min_freq=1)
        assert vocab.token_to_idx["<PAD>"] == PAD_IDX
        assert vocab.token_to_idx["<UNK>"] == UNK_IDX
        assert vocab.decode([PAD_IDX]) == ["<PAD>"]
        assert vocab.decode([UNK_IDX]) == ["<UNK>"]

    def test_vocabulary_unk_handling(self):
        vocab = Vocabulary.build_from_texts(["hello world"], min_freq=1)
        encoded = vocab.encode(["hello", "unseen_token", "world"])
        assert encoded[0] == vocab.token_to_idx["hello"]
        assert encoded[1] == UNK_IDX
        assert encoded[2] == vocab.token_to_idx["world"]

    def test_vocabulary_min_freq_and_max_size(self):
        texts = ["apple apple banana banana banana cherry date date"]
        # min_freq=2 should keep apple, banana, date; cherry has freq 1 so it becomes UNK
        vocab = Vocabulary.build_from_texts(texts, min_freq=2, max_vocab_size=10)
        assert "banana" in vocab.token_to_idx
        assert "apple" in vocab.token_to_idx
        assert "date" in vocab.token_to_idx
        assert "cherry" not in vocab.token_to_idx
        assert vocab.encode(["cherry"]) == [UNK_IDX]

    def test_vocabulary_serialization(self, tmp_path):
        vocab = Vocabulary.build_from_texts(FIXTURE_TEXTS, min_freq=1)
        save_path = tmp_path / "vocab_test.json"
        vocab.save(save_path)
        assert save_path.exists()

        loaded_vocab = Vocabulary.load(save_path)
        assert len(loaded_vocab) == len(vocab)
        assert loaded_vocab.token_to_idx == vocab.token_to_idx
        assert loaded_vocab.idx_to_token == vocab.idx_to_token


class TestDatasetAndBatchPadding:
    """Verify Dataset truncation, variable-length collation, and pad_sequence."""

    def test_dataset_truncation(self):
        long_text = "word " * 100
        vocab = Vocabulary.build_from_texts([long_text], min_freq=1)
        dataset = ComplaintDataset([long_text], vocab=vocab, max_seq_len=20)
        assert len(dataset) == 1
        assert dataset.truncated_count == 1
        assert dataset.truncation_rate == 1.0
        assert len(dataset[0]) == 20

    def test_collate_batch_variable_length(self):
        texts = ["short narrative", "a much longer complaint narrative with extra details"]
        vocab = Vocabulary.build_from_texts(texts, min_freq=1)
        labels = [APPROVED_LABELS[0], APPROVED_LABELS[1]]
        dataset = ComplaintDataset(texts, labels=labels, vocab=vocab, max_seq_len=50)

        batch = [dataset[0], dataset[1]]
        padded, lengths, targets = collate_batch(batch)

        assert padded.shape[0] == 2
        assert padded.shape[1] == max(lengths).item()
        assert lengths[0] < lengths[1]
        assert padded[0, lengths[0]:].sum() == 0  # padded positions are PAD_IDX (0)
        assert targets.shape[0] == 2


class TestBiLSTMClassifier:
    """Verify PyTorch model forward, backward, shapes, and label mapping."""

    def test_model_output_shape_and_classes(self):
        vocab_size = 50
        model = BiLSTMClassifier(vocab_size=vocab_size, embedding_dim=32, hidden_dim=32, num_classes=8)
        dummy_input = torch.tensor([[2, 3, 4, 0], [5, 6, 0, 0]], dtype=torch.long)
        logits = model(dummy_input)
        assert logits.shape == (2, 8)

    def test_forward_and_backward_pass(self):
        set_seed(42)
        vocab_size = 20
        model = BiLSTMClassifier(vocab_size=vocab_size, embedding_dim=16, hidden_dim=16, num_classes=8)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-2)
        criterion = nn.CrossEntropyLoss()

        dummy_input = torch.tensor([[2, 3, 4, 0], [5, 6, 1, 2]], dtype=torch.long)
        targets = torch.tensor([0, 3], dtype=torch.long)

        logits = model(dummy_input)
        loss = criterion(logits, targets)
        loss.backward()

        # Verify gradients exist and are non-zero
        assert model.embedding.weight.grad is not None
        assert model.lstm.weight_ih_l0.grad is not None

        optimizer.step()
        assert not torch.isnan(loss)

    def test_save_and_load_checkpoint_consistency(self, tmp_path):
        set_seed(42)
        model = BiLSTMClassifier(vocab_size=30, embedding_dim=16, hidden_dim=16, num_classes=8)
        ckpt_path = tmp_path / "model_ckpt.pt"

        dummy_input = torch.tensor([[2, 3, 4], [5, 6, 7]], dtype=torch.long)
        model.eval()
        with torch.no_grad():
            orig_preds = model(dummy_input)

        torch.save({"model_state_dict": model.state_dict()}, ckpt_path)

        loaded_model = BiLSTMClassifier(vocab_size=30, embedding_dim=16, hidden_dim=16, num_classes=8)
        ckpt = torch.load(ckpt_path, weights_only=True)
        loaded_model.load_state_dict(ckpt["model_state_dict"])
        loaded_model.eval()

        with torch.no_grad():
            loaded_preds = loaded_model(dummy_input)

        assert torch.allclose(orig_preds, loaded_preds, atol=1e-6)


class TestClassWeightsAndDataQuality:
    """Verify class weight calculation and leakage prevention."""

    def test_compute_class_weights(self):
        import pandas as pd
        # Heavily imbalanced series
        s = pd.Series([APPROVED_LABELS[0]] * 100 + [APPROVED_LABELS[1]] * 10)
        weights = compute_class_weights(s, APPROVED_LABELS[:2])
        assert len(weights) == 2
        # Minority class should have a strictly higher weight
        assert weights[1] > weights[0]

    def test_verify_data_quality_detects_leakage(self):
        import pandas as pd
        df_train = pd.DataFrame({
            "text": ["Identical narrative", "Unique narrative 1"],
            "product_category": [APPROVED_LABELS[0], APPROVED_LABELS[1]],
        })
        df_val = pd.DataFrame({
            "text": ["Identical narrative", "Unique narrative 2"],
            "product_category": [APPROVED_LABELS[0], APPROVED_LABELS[2]],
        })
        with pytest.raises(ValueError, match="DATA LEAKAGE DETECTED"):
            verify_data_quality(df_train, df_val, APPROVED_LABELS)

    def test_test_csv_strictly_rejected(self, tmp_path):
        """Verify pipeline explicitly rejects any attempt to pass test.csv."""
        fake_test_path = tmp_path / "test.csv"
        fake_test_path.write_text("dummy", encoding="utf-8")
        dummy_val = tmp_path / "val.csv"
        dummy_val.write_text("dummy", encoding="utf-8")

        with pytest.raises(ValueError, match="SAFETY VIOLATION"):
            train_bilstm_pipeline(
                train_path=fake_test_path,
                val_path=dummy_val,
                output_dir=tmp_path,
            )

        with pytest.raises(ValueError, match="SAFETY VIOLATION"):
            train_bilstm_pipeline(
                train_path=dummy_val,
                val_path=fake_test_path,
                output_dir=tmp_path,
            )


class TestComparisonReportGeneration:
    """Verify markdown report generation correctly parses baseline and bilstm metrics."""

    def test_generate_comparison_report(self, tmp_path):
        baseline_eval_file = tmp_path / "baseline_eval.json"
        baseline_eval_data = {
            "metrics": {"accuracy": 0.838, "macro_f1": 0.7453, "weighted_f1": 0.8455},
            "per_class": {
                label: {"precision": 0.8, "recall": 0.8, "f1_score": 0.8, "support": 100}
                for label in APPROVED_LABELS
            },
        }
        baseline_eval_file.write_text(json.dumps(baseline_eval_data), encoding="utf-8")

        bilstm_eval_data = {
            "metrics": {"accuracy": 0.825, "macro_f1": 0.735, "weighted_f1": 0.830},
            "per_class": {
                label: {"precision": 0.78, "recall": 0.78, "f1_score": 0.78, "support": 100}
                for label in APPROVED_LABELS
            },
            "most_frequent_misclassifications": [
                {
                    "true_category": APPROVED_LABELS[0],
                    "predicted_category": APPROVED_LABELS[1],
                    "count": 45,
                }
            ],
        }

        config = {
            "model_architecture": "BiLSTMClassifier",
            "vocab_size": 25000,
            "max_seq_len": 250,
            "embedding_dim": 128,
            "hidden_dim": 128,
            "total_params": 3500000,
            "device": "cuda",
            "device_name": "NVIDIA RTX 4050",
            "training_duration_seconds": 45.2,
            "best_epoch": 4,
            "epochs_trained": 6,
        }

        output_md = tmp_path / "comparison.md"
        report_text = generate_comparison_report(
            baseline_eval_path=baseline_eval_file,
            bilstm_eval=bilstm_eval_data,
            config=config,
            output_path=output_md,
        )

        assert output_md.exists()
        assert "CivicResolve AI — Validation Model Comparison Report" in report_text
        assert "Macro F1" in report_text
        assert "0.7453" in report_text
        assert "0.7350" in report_text
        assert "SEALED" in report_text
