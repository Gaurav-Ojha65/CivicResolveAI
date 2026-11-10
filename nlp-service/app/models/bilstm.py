"""CivicResolve AI — PyTorch Bi-LSTM Classifier Architecture & Serving.

Provides the exact neural architecture, tokenizer, vocabulary loader, and CPU/GPU inference
pipeline for the benchmark Bi-LSTM model (bilstm_best.pt).
"""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn

from app.config import APPROVED_LABELS

logger = logging.getLogger("civicresolve.nlp")

PAD_TOKEN = "<PAD>"
UNK_TOKEN = "<UNK>"
PAD_IDX = 0
UNK_IDX = 1

TOKEN_RE = re.compile(r"\b[a-z0-9]+(?:'[a-z]+)?\b")


def tokenize(text: str) -> list[str]:
    """Reproducible word tokenization using regex matching train_bilstm.py."""
    if not text or not isinstance(text, str):
        return []
    return TOKEN_RE.findall(text.lower())


class Vocabulary:
    """Vocabulary loaded from saved vocab.json."""

    def __init__(self, token_to_idx: dict[str, int]):
        self.token_to_idx = dict(token_to_idx)
        self.idx_to_token: list[str] = [None] * len(self.token_to_idx)  # type: ignore[list-item]
        for token, idx in self.token_to_idx.items():
            if idx < len(self.idx_to_token):
                self.idx_to_token[idx] = token

    def __len__(self) -> int:
        return len(self.token_to_idx)

    def encode(self, tokens: list[str]) -> list[int]:
        return [self.token_to_idx.get(t, UNK_IDX) for t in tokens]

    @classmethod
    def load(cls, path: Path) -> "Vocabulary":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(token_to_idx=data["token_to_idx"])


class BiLSTMClassifier(nn.Module):
    """Bidirectional LSTM text classifier matching the frozen bilstm_best.pt checkpoint."""

    def __init__(
        self,
        vocab_size: int,
        embedding_dim: int = 128,
        hidden_dim: int = 128,
        num_layers: int = 1,
        num_classes: int = len(APPROVED_LABELS),
        dropout: float = 0.3,
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
        mask = (input_ids != self.padding_idx).unsqueeze(-1).float()
        sum_embeddings = (lstm_out * mask).sum(dim=1)
        valid_lens = mask.sum(dim=1).clamp(min=1.0)
        pooled = sum_embeddings / valid_lens  # (batch_size, 2 * hidden_dim)

        logits = self.head(pooled)  # (batch_size, num_classes)
        return logits


class BiLSTMPipeline:
    """Manages frozen Bi-LSTM inference on CPU/GPU."""

    def __init__(
        self,
        model: BiLSTMClassifier,
        vocab: Vocabulary,
        config: dict[str, Any],
        device: torch.device,
        model_sha256: str,
    ):
        self.model = model
        self.vocab = vocab
        self.config = config
        self.device = device
        self.model_sha256 = model_sha256
        self.max_seq_len = int(config.get("max_seq_len", 250))
        self.classes = tuple(config.get("labels", APPROVED_LABELS))

    def predict(self, cleaned_text: str) -> dict[str, Any]:
        """Run single-text inference and return probability distribution and metrics."""
        start_time = time.perf_counter()
        tokens = tokenize(cleaned_text)
        token_count = len(tokens)
        truncated = False

        if len(tokens) > self.max_seq_len:
            tokens = tokens[: self.max_seq_len]
            truncated = True

        ids = self.vocab.encode(tokens)
        if len(ids) == 0:
            ids = [UNK_IDX]

        input_tensor = torch.tensor([ids], dtype=torch.long, device=self.device)
        lengths_tensor = torch.tensor([len(ids)], dtype=torch.long, device=self.device)

        with torch.no_grad():
            logits = self.model(input_tensor, lengths=lengths_tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        # Probability dictionary
        prob_dict = {
            self.classes[i]: round(float(probs[i]), 4)
            for i in range(len(self.classes))
        }

        # Top and runner-up ranking
        ranked_indices = sorted(
            range(len(self.classes)),
            key=lambda idx: (-probs[idx], idx),
        )
        top_idx = ranked_indices[0]
        runner_up_idx = ranked_indices[1] if len(ranked_indices) > 1 else top_idx

        top_cat = self.classes[top_idx]
        runner_up_cat = self.classes[runner_up_idx]

        confidence = prob_dict[top_cat]
        margin = round(float(confidence - prob_dict[runner_up_cat]), 4)

        return {
            "predicted_category": top_cat,
            "runner_up_category": runner_up_cat,
            "confidence": confidence,
            "margin": margin,
            "probabilities": prob_dict,
            "latency_ms": latency_ms,
            "token_count": token_count,
            "truncated": truncated,
            "model_version_sha256": self.model_sha256,
        }
