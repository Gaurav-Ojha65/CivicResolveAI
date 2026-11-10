"""CivicResolve AI — Preprocessing and Narrative Cleaning for Serving.

Implements the exact same cleaning procedure established in data_split.py
and train_baseline.py during dataset construction and model training.
"""

from __future__ import annotations

import re

_XXXX_RE = re.compile(r"(?i)\bX{4}\b")
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_NORMALIZE_WS_RE = re.compile(r"\s+")


def clean_narrative(text: object) -> str:
    """Clean a single complaint narrative reproducibly.

    1. Strip leading/trailing whitespace.
    2. Remove case-insensitive XXXX redaction masks (whole-word only).
    3. Collapse multiple consecutive spaces/tabs to a single space.
    4. Collapse 3+ consecutive newlines to two.
    5. Strip again.
    """
    if text is None:
        return ""
    text_str = str(text).strip()
    if not text_str:
        return ""
    text_str = _XXXX_RE.sub("", text_str)
    text_str = _MULTI_SPACE_RE.sub(" ", text_str)
    text_str = _MULTI_NEWLINE_RE.sub("\n\n", text_str)
    return text_str.strip()


def normalize_narrative(text: object) -> str:
    """Deterministic narrative normalization for duplicate detection and auditing."""
    if text is None:
        return ""
    t = str(text).strip().lower()
    return _NORMALIZE_WS_RE.sub(" ", t)
