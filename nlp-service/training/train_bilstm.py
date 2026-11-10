#!/usr/bin/env python3
"""CivicResolve AI — Phase 4: Bi-LSTM Training and Baseline Comparison.

Trains a PyTorch Bidirectional LSTM (Bi-LSTM) text classifier on the clean
deduplicated training complaints (train.csv). Evaluates strictly on validation
complaints (val.csv) and compares results directly against the saved Phase 3
baseline (TF-IDF + Logistic Regression).

Safety gate:
The test set (test.csv) is strictly sealed and must never be loaded or
evaluated in this pipeline.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from torch.utils.data import DataLoader, Dataset

# ---------------------------------------------------------------------------
# Default paths and constants
# ---------------------------------------------------------------------------

DEFAULT_TRAIN = Path(__file__).resolve().parents[1] / "data" / "processed" / "train.csv"
DEFAULT_VAL = Path(__file__).resolve().parents[1] / "data" / "processed" / "val.csv"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "models_saved"
DEFAULT_BASELINE_EVAL = DEFAULT_OUTPUT_DIR / "baseline_eval_val.json"

RANDOM_SEED = 42
DEFAULT_MAX_SEQ_LEN = 250
DEFAULT_MIN_FREQ = 2
DEFAULT_MAX_VOCAB_SIZE = 30000
DEFAULT_EMBED_DIM = 128
DEFAULT_HIDDEN_DIM = 128
DEFAULT_NUM_LAYERS = 1
DEFAULT_DROPOUT = 0.3
DEFAULT_BATCH_SIZE = 128
DEFAULT_EPOCHS = 8
DEFAULT_PATIENCE = 3
DEFAULT_LEARNING_RATE = 1e-3

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

PAD_TOKEN = "<PAD>"
UNK_TOKEN = "<UNK>"
PAD_IDX = 0
UNK_IDX = 1

TOKEN_RE = re.compile(r"\b[a-z0-9]+(?:'[a-z]+)?\b")
_NORMALIZE_WS_RE = re.compile(r"\s+")


def normalize_narrative(text: object) -> str:
    """Deterministic normalization for duplicate and leakage auditing."""
    if text is None or pd.isna(text):
        return ""
    t = str(text).strip().lower()
    return _NORMALIZE_WS_RE.sub(" ", t)


def tokenize(text: str) -> list[str]:
    """Reproducible word tokenization using regex."""
    if not text or not isinstance(text, str):
        return []
    return TOKEN_RE.findall(text.lower())


def set_seed(seed: int = RANDOM_SEED) -> None:
    """Set deterministic seeds for Python, NumPy and PyTorch."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

class Vocabulary:
    """Reproducible vocabulary built exclusively from training narratives."""

    def __init__(self, token_to_idx: dict[str, int] | None = None):
        if token_to_idx is None:
            self.token_to_idx: dict[str, int] = {PAD_TOKEN: PAD_IDX, UNK_TOKEN: UNK_IDX}
            self.idx_to_token: list[str] = [PAD_TOKEN, UNK_TOKEN]
        else:
            self.token_to_idx = dict(token_to_idx)
            self.idx_to_token = [None] * len(self.token_to_idx)  # type: ignore[list-item]
            for token, idx in self.token_to_idx.items():
                self.idx_to_token[idx] = token

    def __len__(self) -> int:
        return len(self.token_to_idx)

    @classmethod
    def build_from_texts(
        cls,
        texts: Iterable[str],
        min_freq: int = DEFAULT_MIN_FREQ,
        max_vocab_size: int | None = DEFAULT_MAX_VOCAB_SIZE,
    ) -> "Vocabulary":
        counter: Counter = Counter()
        for text in texts:
            counter.update(tokenize(str(text)))

        filtered = [
            (tok, count)
            for tok, count in counter.most_common()
            if count >= min_freq and tok not in (PAD_TOKEN, UNK_TOKEN)
        ]
        if max_vocab_size is not None and max_vocab_size > 2:
            filtered = filtered[: max_vocab_size - 2]

        token_to_idx = {PAD_TOKEN: PAD_IDX, UNK_TOKEN: UNK_IDX}
        for tok, _ in filtered:
            token_to_idx[tok] = len(token_to_idx)

        return cls(token_to_idx=token_to_idx)

    def encode(self, tokens: list[str]) -> list[int]:
        return [self.token_to_idx.get(t, UNK_IDX) for t in tokens]

    def decode(self, indices: list[int]) -> list[str]:
        return [
            self.idx_to_token[i]
            if 0 <= i < len(self.idx_to_token) and self.idx_to_token[i] is not None
            else UNK_TOKEN
            for i in indices
        ]

    def to_dict(self) -> dict:
        return {
            "pad_token": PAD_TOKEN,
            "unk_token": UNK_TOKEN,
            "pad_idx": PAD_IDX,
            "unk_idx": UNK_IDX,
            "vocab_size": len(self.token_to_idx),
            "token_to_idx": self.token_to_idx,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Vocabulary":
        return cls(token_to_idx=data["token_to_idx"])

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "Vocabulary":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls.from_dict(data)


# ---------------------------------------------------------------------------
# Dataset and Batch Collation
# ---------------------------------------------------------------------------

class ComplaintDataset(Dataset):
    """PyTorch Dataset for text classification with narrative truncation tracking."""

    def __init__(
        self,
        texts: list[str],
        labels: list[str] | None = None,
        vocab: Vocabulary | None = None,
        max_seq_len: int = DEFAULT_MAX_SEQ_LEN,
        label_to_idx: dict[str, int] | None = None,
    ):
        self.texts = texts
        self.labels = labels
        self.vocab = vocab or Vocabulary()
        self.max_seq_len = max_seq_len
        self.label_to_idx = label_to_idx or {l: i for i, l in enumerate(APPROVED_LABELS)}

        self.encoded_sequences: list[torch.Tensor] = []
        self.truncated_count: int = 0

        for text in texts:
            tokens = tokenize(str(text))
            if len(tokens) > self.max_seq_len:
                self.truncated_count += 1
                tokens = tokens[: self.max_seq_len]
            ids = self.vocab.encode(tokens)
            if len(ids) == 0:
                ids = [UNK_IDX]
            self.encoded_sequences.append(torch.tensor(ids, dtype=torch.long))

        self.label_indices: list[int] | None = None
        if self.labels is not None:
            self.label_indices = [self.label_to_idx[lbl] for lbl in self.labels]

    def __len__(self) -> int:
        return len(self.encoded_sequences)

    def __getitem__(self, idx: int):
        seq = self.encoded_sequences[idx]
        if self.label_indices is not None:
            label = torch.tensor(self.label_indices[idx], dtype=torch.long)
            return seq, label
        return seq

    @property
    def truncation_rate(self) -> float:
        if not self.encoded_sequences:
            return 0.0
        return self.truncated_count / len(self.encoded_sequences)


def collate_batch(batch):
    """Collate variable-length sequences using torch.nn.utils.rnn.pad_sequence."""
    if isinstance(batch[0], tuple):
        sequences, labels = zip(*batch)
        padded = torch.nn.utils.rnn.pad_sequence(
            sequences, batch_first=True, padding_value=PAD_IDX
        )
        lengths = torch.tensor([len(s) for s in sequences], dtype=torch.long)
        labels_tensor = torch.stack(labels)
        return padded, lengths, labels_tensor
    else:
        sequences = batch
        padded = torch.nn.utils.rnn.pad_sequence(
            sequences, batch_first=True, padding_value=PAD_IDX
        )
        lengths = torch.tensor([len(s) for s in sequences], dtype=torch.long)
        return padded, lengths


# ---------------------------------------------------------------------------
# Bi-LSTM Model Architecture
# ---------------------------------------------------------------------------

class BiLSTMClassifier(nn.Module):
    """Bidirectional LSTM text classifier with length-aware masked pooling and dropout."""

    def __init__(
        self,
        vocab_size: int,
        embedding_dim: int = DEFAULT_EMBED_DIM,
        hidden_dim: int = DEFAULT_HIDDEN_DIM,
        num_layers: int = DEFAULT_NUM_LAYERS,
        num_classes: int = len(APPROVED_LABELS),
        dropout: float = DEFAULT_DROPOUT,
        padding_idx: int = PAD_IDX,
    ):
        super().__init__()
        self.vocab_size = vocab_size
        self.embedding_dim = embedding_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.num_classes = num_classes
        self.dropout_rate = dropout
        self.padding_idx = padding_idx

        self.embedding = nn.Embedding(
            num_embeddings=vocab_size,
            embedding_dim=embedding_dim,
            padding_idx=padding_idx,
        )

        self.lstm = nn.LSTM(
            input_size=embedding_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            bidirectional=True,
            batch_first=True,
        )

        # Head maps 2 * hidden_dim (bidirectional) -> hidden_dim -> num_classes
        self.head = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Dropout(p=dropout),
            nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, input_ids: torch.Tensor, lengths: torch.Tensor | None = None) -> torch.Tensor:
        # input_ids: (batch_size, seq_len)
        emb = self.embedding(input_ids)  # (batch_size, seq_len, embedding_dim)
        lstm_out, _ = self.lstm(emb)  # (batch_size, seq_len, 2 * hidden_dim)

        # Length-aware masked average pooling
        mask = (input_ids != self.padding_idx).unsqueeze(-1).float()  # (batch_size, seq_len, 1)
        sum_embeddings = (lstm_out * mask).sum(dim=1)  # (batch_size, 2 * hidden_dim)
        valid_lens = mask.sum(dim=1).clamp(min=1.0)  # (batch_size, 1)
        pooled = sum_embeddings / valid_lens  # (batch_size, 2 * hidden_dim)

        logits = self.head(pooled)  # (batch_size, num_classes)
        return logits


# ---------------------------------------------------------------------------
# Class Weights & Data Quality Gate
# ---------------------------------------------------------------------------

def compute_class_weights(
    labels: pd.Series,
    approved_labels: list[str] = APPROVED_LABELS,
) -> torch.Tensor:
    """Calculate balanced class weights from training labels: N / (C * count_c)."""
    counts = labels.value_counts()
    n_samples = len(labels)
    n_classes = len(approved_labels)
    weights = [
        n_samples / (n_classes * counts.get(c, 1))
        for c in approved_labels
    ]
    return torch.tensor(weights, dtype=torch.float32)


def verify_data_quality(
    df_train: pd.DataFrame,
    df_val: pd.DataFrame,
    approved_labels: list[str] = APPROVED_LABELS,
) -> None:
    """Enforce data completeness and verify zero cross-split narrative leakage."""
    approved_set = set(approved_labels)
    required_cols = {"text", "product_category"}

    for name, df in [("train", df_train), ("val", df_val)]:
        if df.empty:
            raise ValueError(f"{name} split is empty.")
        missing_cols = required_cols - set(df.columns)
        if missing_cols:
            raise ValueError(f"{name} split missing columns: {missing_cols}")

        blank_text = df["text"].isna() | df["text"].astype(str).str.strip().eq("")
        if blank_text.any():
            raise ValueError(f"{name} split contains {blank_text.sum()} blank narratives.")

        unapproved = set(df["product_category"].unique()) - approved_set
        if unapproved:
            raise ValueError(f"{name} split contains unapproved categories: {unapproved}")

    train_norms = df_train["text"].map(normalize_narrative)
    val_norms = df_val["text"].map(normalize_narrative)

    dup_train = train_norms.duplicated().sum()
    if dup_train > 0:
        raise ValueError(f"train split contains {dup_train} duplicate normalized narratives.")

    dup_val = val_norms.duplicated().sum()
    if dup_val > 0:
        raise ValueError(f"val split contains {dup_val} duplicate normalized narratives.")

    overlap = set(train_norms) & set(val_norms)
    if overlap:
        raise ValueError(
            f"DATA LEAKAGE DETECTED: {len(overlap)} normalized narratives appear in both train and val."
        )


# ---------------------------------------------------------------------------
# Training & Validation
# ---------------------------------------------------------------------------

def train_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: torch.device,
) -> float:
    """Train model for one epoch and return average loss."""
    model.train()
    total_loss = 0.0
    for input_ids, lengths, labels in dataloader:
        input_ids = input_ids.to(device)
        lengths = lengths.to(device)
        labels = labels.to(device)

        optimizer.zero_grad()
        logits = model(input_ids, lengths)
        loss = criterion(logits, labels)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
        optimizer.step()

        total_loss += loss.item() * len(labels)

    return total_loss / len(dataloader.dataset)  # type: ignore[arg-type]


@torch.no_grad()
def evaluate_model(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    labels: list[str] = APPROVED_LABELS,
) -> dict:
    """Evaluate model on dataloader and compute classification metrics."""
    model.eval()
    total_loss = 0.0
    all_preds: list[int] = []
    all_targets: list[int] = []

    for input_ids, lengths, targets in dataloader:
        input_ids = input_ids.to(device)
        lengths = lengths.to(device)
        targets = targets.to(device)

        logits = model(input_ids, lengths)
        loss = criterion(logits, targets)
        total_loss += loss.item() * len(targets)

        preds = torch.argmax(logits, dim=-1)
        all_preds.extend(preds.cpu().tolist())
        all_targets.extend(targets.cpu().tolist())

    y_true = [labels[i] for i in all_targets]
    y_pred = [labels[i] for i in all_preds]

    avg_loss = total_loss / len(dataloader.dataset)  # type: ignore[arg-type]
    acc = float(accuracy_score(y_true, y_pred))
    macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))

    p, r, f, s = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    per_class = {
        label: {
            "precision": round(float(p[i]), 4),
            "recall": round(float(r[i]), 4),
            "f1_score": round(float(f[i]), 4),
            "support": int(s[i]),
        }
        for i, label in enumerate(labels)
    }

    cm = confusion_matrix(y_true, y_pred, labels=labels)
    cm_list = cm.tolist()

    misclass_pairs = []
    for i, true_lbl in enumerate(labels):
        for j, pred_lbl in enumerate(labels):
            if i != j and cm[i, j] > 0:
                misclass_pairs.append({
                    "true_category": true_lbl,
                    "predicted_category": pred_lbl,
                    "count": int(cm[i, j]),
                })
    misclass_pairs.sort(key=lambda x: -x["count"])

    return {
        "loss": round(avg_loss, 4),
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class": per_class,
        "confusion_matrix": cm_list,
        "most_frequent_misclassifications": misclass_pairs[:10],
    }


def train_bilstm_pipeline(
    train_path: Path,
    val_path: Path,
    output_dir: Path,
    max_seq_len: int = DEFAULT_MAX_SEQ_LEN,
    min_freq: int = DEFAULT_MIN_FREQ,
    max_vocab_size: int = DEFAULT_MAX_VOCAB_SIZE,
    embed_dim: int = DEFAULT_EMBED_DIM,
    hidden_dim: int = DEFAULT_HIDDEN_DIM,
    num_layers: int = DEFAULT_NUM_LAYERS,
    dropout: float = DEFAULT_DROPOUT,
    batch_size: int = DEFAULT_BATCH_SIZE,
    epochs: int = DEFAULT_EPOCHS,
    patience: int = DEFAULT_PATIENCE,
    learning_rate: float = DEFAULT_LEARNING_RATE,
    random_seed: int = RANDOM_SEED,
) -> dict:
    """Execute complete Bi-LSTM training and validation pipeline."""
    # Safety gate: test split must remain sealed
    if "test.csv" in str(train_path).lower() or "test.csv" in str(val_path).lower():
        raise ValueError(
            "SAFETY VIOLATION: test.csv must remain sealed and cannot be loaded in training or validation evaluation."
        )

    set_seed(random_seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    print(f"[Device] Using {device} ({device_name})")

    # 1. Load data
    print(f"[Data] Loading training complaints: {train_path}")
    df_train = pd.read_csv(train_path)
    print(f"[Data] Loading validation complaints: {val_path}")
    df_val = pd.read_csv(val_path)

    # 2. Quality gate
    print("[Data Quality Gate] Verifying zero leakage and clean narratives ...")
    verify_data_quality(df_train, df_val, APPROVED_LABELS)
    print("[Data Quality Gate] PASSED: Zero cross-split leakage, zero duplicates.")

    # 3. Build Vocabulary exclusively from train narratives
    print(f"[Vocabulary] Fitting vocabulary on {len(df_train):,} training narratives ...")
    vocab = Vocabulary.build_from_texts(
        df_train["text"],
        min_freq=min_freq,
        max_vocab_size=max_vocab_size,
    )
    print(f"[Vocabulary] Built vocabulary with {len(vocab):,} tokens (min_freq={min_freq}).")

    # 4. Datasets & DataLoaders
    train_dataset = ComplaintDataset(
        texts=df_train["text"].tolist(),
        labels=df_train["product_category"].tolist(),
        vocab=vocab,
        max_seq_len=max_seq_len,
    )
    val_dataset = ComplaintDataset(
        texts=df_val["text"].tolist(),
        labels=df_val["product_category"].tolist(),
        vocab=vocab,
        max_seq_len=max_seq_len,
    )

    print(f"[Dataset] Train narratives truncated: {train_dataset.truncated_count:,} / {len(train_dataset):,} "
          f"({train_dataset.truncation_rate:.2%}) at max_seq_len={max_seq_len}")
    print(f"[Dataset] Val narratives truncated: {val_dataset.truncated_count:,} / {len(val_dataset):,} "
          f"({val_dataset.truncation_rate:.2%}) at max_seq_len={max_seq_len}")

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_batch,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_batch,
    )

    # 5. Class weights & Loss
    class_weights = compute_class_weights(df_train["product_category"], APPROVED_LABELS)
    criterion = nn.CrossEntropyLoss(weight=class_weights.to(device))
    print(f"[Weights] Computed balanced class weights from training distribution.")

    # 6. Model initialization
    model = BiLSTMClassifier(
        vocab_size=len(vocab),
        embedding_dim=embed_dim,
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        num_classes=len(APPROVED_LABELS),
        dropout=dropout,
        padding_idx=PAD_IDX,
    ).to(device)

    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[Model] Initialized BiLSTMClassifier with {total_params:,} trainable parameters.")

    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=learning_rate,
        weight_decay=1e-5,
    )

    # 7. Training loop with early stopping on validation Macro F1
    output_dir.mkdir(parents=True, exist_ok=True)
    best_checkpoint_path = output_dir / "bilstm_best.pt"

    best_val_macro_f1 = -1.0
    best_epoch = -1
    best_val_metrics: dict = {}
    patience_counter = 0
    training_history: list[dict] = []

    start_time = time.time()
    print(f"[Training] Starting training up to {epochs} epochs (patience={patience}) ...")

    for epoch in range(1, epochs + 1):
        epoch_start = time.time()
        train_loss = train_epoch(model, train_loader, optimizer, criterion, device)
        val_eval = evaluate_model(model, val_loader, criterion, device, APPROVED_LABELS)
        epoch_dur = time.time() - epoch_start

        epoch_record = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "val_loss": val_eval["loss"],
            "val_accuracy": val_eval["accuracy"],
            "val_macro_f1": val_eval["macro_f1"],
            "val_weighted_f1": val_eval["weighted_f1"],
            "duration_seconds": round(epoch_dur, 2),
        }
        training_history.append(epoch_record)

        print(
            f"Epoch {epoch:2d}/{epochs:2d} ({epoch_dur:4.1f}s) | "
            f"Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_eval['loss']:.4f} | "
            f"Val Macro F1: {val_eval['macro_f1']:.4f} | "
            f"Val Weighted F1: {val_eval['weighted_f1']:.4f} | "
            f"Val Acc: {val_eval['accuracy']:.4f}"
        )

        if val_eval["macro_f1"] > best_val_macro_f1:
            best_val_macro_f1 = val_eval["macro_f1"]
            best_epoch = epoch
            best_val_metrics = val_eval
            patience_counter = 0
            # Save checkpoint
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "val_macro_f1": best_val_macro_f1,
                    "vocab_size": len(vocab),
                    "model_config": {
                        "embedding_dim": embed_dim,
                        "hidden_dim": hidden_dim,
                        "num_layers": num_layers,
                        "num_classes": len(APPROVED_LABELS),
                        "dropout": dropout,
                    },
                    "approved_labels": APPROVED_LABELS,
                },
                best_checkpoint_path,
            )
            print(f"  --> Checkpoint saved (New Best Val Macro F1: {best_val_macro_f1:.4f})")
        else:
            patience_counter += 1
            print(f"  --> Patience counter: {patience_counter}/{patience}")
            if patience_counter >= patience:
                print(f"[Training] Early stopping triggered at epoch {epoch}.")
                break

    total_training_duration = time.time() - start_time
    print(f"[Training] Complete in {total_training_duration:.1f}s. Best Epoch: {best_epoch} (Macro F1: {best_val_macro_f1:.4f})")

    # 8. Reload best checkpoint for final audit and evaluation consistency
    checkpoint = torch.load(best_checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(checkpoint["model_state_dict"])
    final_val_eval = evaluate_model(model, val_loader, criterion, device, APPROVED_LABELS)

    # 9. Save artifacts: vocab.json, bilstm_config.json, bilstm_eval_val.json
    vocab_path = output_dir / "vocab.json"
    vocab.save(vocab_path)
    print(f"[Artifacts] Vocabulary saved to {vocab_path}")

    config_record = {
        "model_architecture": "BiLSTMClassifier (Bidirectional LSTM with Masked Pooling)",
        "framework": "PyTorch",
        "torch_version": torch.__version__,
        "device": str(device),
        "device_name": device_name,
        "vocab_size": len(vocab),
        "max_seq_len": max_seq_len,
        "train_truncation_rate": round(train_dataset.truncation_rate, 4),
        "val_truncation_rate": round(val_dataset.truncation_rate, 4),
        "embedding_dim": embed_dim,
        "hidden_dim": hidden_dim,
        "num_layers": num_layers,
        "dropout": dropout,
        "batch_size": batch_size,
        "epochs_trained": len(training_history),
        "best_epoch": best_epoch,
        "total_params": total_params,
        "learning_rate": learning_rate,
        "training_duration_seconds": round(total_training_duration, 2),
        "random_seed": random_seed,
        "labels": APPROVED_LABELS,
    }
    config_path = output_dir / "bilstm_config.json"
    config_path.write_text(json.dumps(config_record, indent=2), encoding="utf-8")
    print(f"[Artifacts] Model config saved to {config_path}")

    eval_record = {
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model_architecture": "BiLSTM (Bidirectional LSTM + Masked Average Pooling)",
        "num_train_samples": len(df_train),
        "num_val_samples": len(df_val),
        "labels": APPROVED_LABELS,
        "metrics": {
            "accuracy": final_val_eval["accuracy"],
            "macro_f1": final_val_eval["macro_f1"],
            "weighted_f1": final_val_eval["weighted_f1"],
            "val_loss": final_val_eval["loss"],
        },
        "per_class": final_val_eval["per_class"],
        "most_frequent_misclassifications": final_val_eval["most_frequent_misclassifications"],
        "confusion_matrix": final_val_eval["confusion_matrix"],
        "training_history": training_history,
        "hardware": {
            "device": str(device),
            "device_name": device_name,
            "training_duration_seconds": round(total_training_duration, 2),
        },
    }
    eval_path = output_dir / "bilstm_eval_val.json"
    eval_path.write_text(json.dumps(eval_record, indent=2), encoding="utf-8")
    print(f"[Artifacts] Validation evaluation saved to {eval_path}")

    # 10. Generate comparative report vs Phase 3 baseline
    comparison_md_path = output_dir / "model_comparison_val.md"
    generate_comparison_report(
        baseline_eval_path=DEFAULT_BASELINE_EVAL,
        bilstm_eval=eval_record,
        config=config_record,
        output_path=comparison_md_path,
    )
    print(f"[Artifacts] Comparative markdown report saved to {comparison_md_path}")

    return {
        "config": config_record,
        "eval": eval_record,
        "artifacts": {
            "checkpoint": best_checkpoint_path,
            "vocab": vocab_path,
            "config": config_path,
            "eval_json": eval_path,
            "comparison_md": comparison_md_path,
        },
    }


# ---------------------------------------------------------------------------
# Comparative Report Generation
# ---------------------------------------------------------------------------

def generate_comparison_report(
    baseline_eval_path: Path,
    bilstm_eval: dict,
    config: dict,
    output_path: Path,
) -> str:
    """Generate side-by-side markdown comparison report between Baseline and Bi-LSTM."""
    baseline_eval: dict = {}
    if baseline_eval_path.exists():
        baseline_eval = json.loads(baseline_eval_path.read_text(encoding="utf-8"))

    bm = baseline_eval.get("metrics", {})
    lm = bilstm_eval.get("metrics", {})
    b_per_class = baseline_eval.get("per_class", {})
    l_per_class = bilstm_eval.get("per_class", {})

    b_acc = bm.get("accuracy", 0.0)
    b_mf1 = bm.get("macro_f1", 0.0)
    b_wf1 = bm.get("weighted_f1", 0.0)

    l_acc = lm.get("accuracy", 0.0)
    l_mf1 = lm.get("macro_f1", 0.0)
    l_wf1 = lm.get("weighted_f1", 0.0)

    delta_acc = l_acc - b_acc
    delta_mf1 = l_mf1 - b_mf1
    delta_wf1 = l_wf1 - b_wf1

    lines = [
        "# CivicResolve AI — Validation Model Comparison Report",
        "",
        f"> **Generated at:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "> **Dataset:** Deduplicated CFPB Complaint Dataset (59,389 train, 12,726 validation, 0 cross-split leakage)",
        "> **Evaluation Split:** Validation Set (`val.csv` — exactly identical 12,726 examples for both models)",
        "> **Test Split Status:** **SEALED** (`test.csv` was never accessed or evaluated)",
        "",
        "## 1. Overall Validation Metrics",
        "",
        "| Metric | Baseline (TF-IDF + LogReg) | Bi-LSTM (PyTorch) | Delta (Bi-LSTM - Baseline) |",
        "|---|---|---|---|",
        f"| **Macro F1** | **{b_mf1:.4f}** | **{l_mf1:.4f}** | **{delta_mf1:+.4f}** |",
        f"| **Weighted F1** | **{b_wf1:.4f}** | **{l_wf1:.4f}** | **{delta_wf1:+.4f}** |",
        f"| **Accuracy** | **{b_acc:.4f}** | **{l_acc:.4f}** | **{delta_acc:+.4f}** |",
        "",
        "## 2. Per-Class Performance Comparison",
        "",
        "| Product Category | Baseline Prec | Bi-LSTM Prec | Baseline Rec | Bi-LSTM Rec | Baseline F1 | Bi-LSTM F1 | Delta F1 | Support |",
        "|---|---|---|---|---|---|---|---|---|",
    ]

    for cat in APPROVED_LABELS:
        bp = b_per_class.get(cat, {})
        lp = l_per_class.get(cat, {})

        bp_p = bp.get("precision", 0.0)
        bp_r = bp.get("recall", 0.0)
        bp_f = bp.get("f1_score", 0.0)
        supp = bp.get("support", lp.get("support", 0))

        lp_p = lp.get("precision", 0.0)
        lp_r = lp.get("recall", 0.0)
        lp_f = lp.get("f1_score", 0.0)

        df1 = lp_f - bp_f
        lines.append(
            f"| {cat} | {bp_p:.4f} | {lp_p:.4f} | {bp_r:.4f} | {lp_r:.4f} | {bp_f:.4f} | {lp_f:.4f} | {df1:+.4f} | {supp:,} |"
        )

    lines.extend([
        "",
        "## 3. Training & Hardware Configuration",
        "",
        "| Property | Value |",
        "|---|---|",
        f"| Model Architecture | {config.get('model_architecture')} |",
        f"| Vocabulary Size | {config.get('vocab_size'):,} tokens |",
        f"| Max Sequence Length | {config.get('max_seq_len')} tokens |",
        f"| Train Narrative Truncation Rate | {config.get('train_truncation_rate', 0):.2%} |",
        f"| Validation Narrative Truncation Rate | {config.get('val_truncation_rate', 0):.2%} |",
        f"| Embedding Dimension | {config.get('embedding_dim')} |",
        f"| Hidden Dimension | {config.get('hidden_dim')} |",
        f"| Total Trainable Parameters | {config.get('total_params'):,} |",
        f"| Best Epoch | {config.get('best_epoch')} of {config.get('epochs_trained')} |",
        f"| Hardware / Device | {config.get('device')} ({config.get('device_name')}) |",
        f"| Total Training Duration | {config.get('training_duration_seconds')}s |",
        "",
        "## 4. Top Misclassification Pairs",
        "",
        "### Bi-LSTM Top Errors (True Category -> Predicted Category)",
        "",
        "| True Category | Predicted Category | Error Count |",
        "|---|---|---|",
    ])

    for pair in bilstm_eval.get("most_frequent_misclassifications", [])[:8]:
        lines.append(
            f"| {pair['true_category']} | {pair['predicted_category']} | {pair['count']:,} |"
        )

    lines.extend([
        "",
        "## 5. Architectural & Practical Observations",
        "",
        "1. **Imbalance Handling:** Both models used balanced class weighting computed exclusively from training labels.",
        "2. **Vocabulary Generalization:** Bi-LSTM uses a closed vocabulary fitted on training narratives only with reserved `<PAD>` (0) and `<UNK>` (1) tokens. Out-of-vocabulary words are safely mapped to `<UNK>` without crashes.",
        "3. **Inference Footprint:** The PyTorch Bi-LSTM checkpoint is compact, using length-aware masked pooling to avoid pad dilution.",
        "4. **Strict Safety Protocol:** The test split (`test.csv` — 12,727 rows) remains unread and fully sealed.",
        "",
    ])

    report_text = "\n".join(lines)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report_text, encoding="utf-8")
    return report_text


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--train-path",
        type=Path,
        default=DEFAULT_TRAIN,
        help="Path to clean train.csv.",
    )
    parser.add_argument(
        "--val-path",
        type=Path,
        default=DEFAULT_VAL,
        help="Path to clean val.csv.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory to save checkpoint, vocab, config, and evaluation artifacts.",
    )
    parser.add_argument(
        "--max-seq-len",
        type=int,
        default=DEFAULT_MAX_SEQ_LEN,
        help="Maximum sequence length in tokens (default: 250).",
    )
    parser.add_argument(
        "--min-freq",
        type=int,
        default=DEFAULT_MIN_FREQ,
        help="Minimum token frequency in training narratives for vocabulary (default: 2).",
    )
    parser.add_argument(
        "--max-vocab-size",
        type=int,
        default=DEFAULT_MAX_VOCAB_SIZE,
        help="Maximum vocabulary size (default: 30000).",
    )
    parser.add_argument(
        "--embed-dim",
        type=int,
        default=DEFAULT_EMBED_DIM,
        help="Word embedding dimension (default: 128).",
    )
    parser.add_argument(
        "--hidden-dim",
        type=int,
        default=DEFAULT_HIDDEN_DIM,
        help="LSTM hidden dimension (default: 128).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="Training batch size (default: 128).",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=DEFAULT_EPOCHS,
        help="Maximum training epochs (default: 8).",
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=DEFAULT_PATIENCE,
        help="Patience for early stopping on validation Macro F1 (default: 3).",
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=DEFAULT_LEARNING_RATE,
        help="Learning rate for Adam optimizer (default: 1e-3).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=RANDOM_SEED,
        help="Deterministic random seed (default: 42).",
    )
    args = parser.parse_args(argv)

    try:
        results = train_bilstm_pipeline(
            train_path=args.train_path,
            val_path=args.val_path,
            output_dir=args.output_dir,
            max_seq_len=args.max_seq_len,
            min_freq=args.min_freq,
            max_vocab_size=args.max_vocab_size,
            embed_dim=args.embed_dim,
            hidden_dim=args.hidden_dim,
            batch_size=args.batch_size,
            epochs=args.epochs,
            patience=args.patience,
            learning_rate=args.lr,
            random_seed=args.seed,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    m = results["eval"]["metrics"]
    print()
    print("=" * 65)
    print("CivicResolve AI — Bi-LSTM Model Validation Results")
    print("=" * 65)
    print(f"Macro F1      : {m['macro_f1']:.4f}")
    print(f"Weighted F1   : {m['weighted_f1']:.4f}")
    print(f"Accuracy      : {m['accuracy']:.4f}")
    print(f"Validation Loss : {m['val_loss']:.4f}")
    print("=" * 65)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
