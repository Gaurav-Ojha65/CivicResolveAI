"""CivicResolve AI — Rule-Based Triage Priority & Sentiment Analysis.

Provides a transparent, heuristic priority evaluation to assist human triage.
IMPORTANT:
- This is NOT a trained or validated machine learning urgency model.
- Priority rules have not been validated against labeled urgency outcomes.
- Negative sentiment alone DOES NOT automatically imply an emergency.
"""

from __future__ import annotations

import re
from typing import Any
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Initialize VADER sentiment analyzer once
_VADER = SentimentIntensityAnalyzer()

# ---------------------------------------------------------------------------
# Rule & Keyword Patterns
# ---------------------------------------------------------------------------

CRITICAL_PATTERNS: list[tuple[re.Pattern, str]] = [
    (
        re.compile(r"\b(eviction|foreclosure|homeless(?:ness)?|loss of (?:my|our) (?:home|house)|sheriff sale|notice of sale|auction of (?:my|our) (?:home|house|property)|lockout notice)\b", re.IGNORECASE),
        "Imminent risk of eviction, foreclosure, or loss of primary shelter",
    ),
    (
        re.compile(r"\b(identity theft|stolen identity|drained (?:my|all|our) (?:savings|account)|life savings stolen|police report filed for identity theft)\b", re.IGNORECASE),
        "Active identity theft or complete drainage of consumer account",
    ),
]

HIGH_PATTERNS: list[tuple[re.Pattern, str]] = [
    (
        re.compile(r"\b(repossession|repossessed|tow truck|seizure of (?:my|our) (?:car|vehicle))\b", re.IGNORECASE),
        "Imminent or completed vehicle repossession",
    ),
    (
        re.compile(r"\b(wage garnishment|freeze (?:my|our) wages|threatened (?:with )?arrest|harassing calls at work|threatened jail)\b", re.IGNORECASE),
        "Aggressive collection tactics, wage garnishment, or legal threats",
    ),
    (
        re.compile(r"\b(unauthorized (?:wire|transfer|withdrawal)|fraudulent charges?|account (?:frozen|locked) without (?:access|funds))\b", re.IGNORECASE),
        "Unauthorized fund transfers, fraudulent charges, or severe account freeze",
    ),
]

DISTRESS_PATTERNS: list[tuple[re.Pattern, str]] = [
    (
        re.compile(r"\b(cannot afford (?:food|medicine|rent)|desperate|ruining my life|severe hardship|distress)\b", re.IGNORECASE),
        "Consumer reported acute personal or medical hardship",
    ),
]

MEDIUM_PATTERNS: list[tuple[re.Pattern, str]] = [
    (
        re.compile(r"\b(inaccurate (?:reporting|inquiry|balance)|dispute(?:d)?|late payment reported in error|credit score dropped)\b", re.IGNORECASE),
        "Substantive credit reporting inaccuracy or disputed derogatory mark",
    ),
    (
        re.compile(r"\b(overdraft fee|unauthorized fee|escrow error|interest rate increased|delayed refund|funds on hold)\b", re.IGNORECASE),
        "Account servicing error, disputed fee, or escrow calculation discrepancy",
    ),
]

TRIAGE_DISCLAIMER = (
    "Triage priority is a heuristic rule-based recommendation and has not been "
    "validated against labeled urgency outcomes. Human review is required."
)


def evaluate_sentiment(text: str) -> tuple[float, str]:
    """Calculate sentiment polarity using VADER.

    Returns:
        compound_score (float between -1.0 and 1.0)
        label ('NEGATIVE', 'NEUTRAL', or 'POSITIVE')
    """
    if not text or not text.strip():
        return 0.0, "NEUTRAL"
    scores = _VADER.polarity_scores(text)
    compound = round(float(scores["compound"]), 4)
    if compound <= -0.05:
        label = "NEGATIVE"
    elif compound >= 0.05:
        label = "POSITIVE"
    else:
        label = "NEUTRAL"
    return compound, label


def evaluate_triage_priority(text: str) -> dict[str, Any]:
    """Evaluate complaint narrative against explicit triage rules.

    Priority Tiers:
    - CRITICAL: Imminent loss of shelter or acute identity theft fund drain.
    - HIGH: Repossession, wage garnishment, unauthorized transfers, or severe hardship with negative sentiment.
    - MEDIUM: Substantive credit reporting dispute, servicing fee error, or moderate billing issue.
    - LOW: Routine inquiry, general clarification, or neutral informational dispute.

    RULE: Negative sentiment alone does NOT cause a high or critical rating.
    """
    if not text or not text.strip():
        return {
            "triage_priority": "LOW",
            "priority_reasons": ["Empty or whitespace narrative; defaulting to LOW review tier."],
            "sentiment_score": 0.0,
            "sentiment_label": "NEUTRAL",
            "disclaimer": TRIAGE_DISCLAIMER,
        }

    compound, sentiment_label = evaluate_sentiment(text)
    reasons: list[str] = []

    # 1. Check CRITICAL triggers
    critical_matches = []
    for pattern, desc in CRITICAL_PATTERNS:
        if pattern.search(text):
            critical_matches.append(desc)

    if critical_matches:
        reasons.extend(critical_matches)
        if sentiment_label == "NEGATIVE":
            reasons.append(f"Negative sentiment ({compound}) reinforces urgent review.")
        return {
            "triage_priority": "CRITICAL",
            "priority_reasons": reasons,
            "sentiment_score": compound,
            "sentiment_label": sentiment_label,
            "disclaimer": TRIAGE_DISCLAIMER,
        }

    # 2. Check HIGH triggers
    high_matches = []
    for pattern, desc in HIGH_PATTERNS:
        if pattern.search(text):
            high_matches.append(desc)

    # Distress keywords only trigger HIGH if accompanied by negative sentiment
    for pattern, desc in DISTRESS_PATTERNS:
        if pattern.search(text):
            if compound <= -0.3:
                high_matches.append(f"{desc} (supported by negative sentiment score {compound})")
            else:
                reasons.append(f"{desc} noted (neutral sentiment).")

    if high_matches:
        reasons.extend(high_matches)
        return {
            "triage_priority": "HIGH",
            "priority_reasons": reasons,
            "sentiment_score": compound,
            "sentiment_label": sentiment_label,
            "disclaimer": TRIAGE_DISCLAIMER,
        }

    # 3. Check MEDIUM triggers
    medium_matches = []
    for pattern, desc in MEDIUM_PATTERNS:
        if pattern.search(text):
            medium_matches.append(desc)

    if medium_matches:
        reasons.extend(medium_matches)
        if sentiment_label == "NEGATIVE":
            reasons.append(f"Negative consumer sentiment detected ({compound}).")
        return {
            "triage_priority": "MEDIUM",
            "priority_reasons": reasons,
            "sentiment_score": compound,
            "sentiment_label": sentiment_label,
            "disclaimer": TRIAGE_DISCLAIMER,
        }

    # 4. Default to LOW
    reasons.append("No critical distress, severe enforcement, or active fraud keywords detected.")
    if sentiment_label == "NEGATIVE":
        reasons.append(
            f"Note: Narrative contains negative sentiment ({compound}), but no explicit high-priority triggers."
        )
    return {
        "triage_priority": "LOW",
        "priority_reasons": reasons,
        "sentiment_score": compound,
        "sentiment_label": sentiment_label,
        "disclaimer": TRIAGE_DISCLAIMER,
    }


def determine_review_status(
    model_flag_for_review: bool,
    model_review_reasons: list[str],
    triage_priority: str,
) -> tuple[bool, list[str]]:
    """Determine whether human review is required and aggregate explanatory reasons.

    Human review is triggered if EITHER:
    1. Classification uncertainty threshold is breached (model probability estimate is below
       min_confidence or top-two margin is below min_margin).
    2. Triage priority is HIGH or CRITICAL, regardless of classification confidence.

    Rules:
    - High-confidence CRITICAL cases MUST flag for human review.
    - High-confidence HIGH cases MUST flag for human review.
    - Low-confidence or narrow-margin cases MUST flag for human review.
    - Negative sentiment alone does NOT cause HIGH or CRITICAL priority and does not
      automatically trigger priority-based emergency review.

    Returns:
        (flag_for_review: bool, review_reasons: list[str])
    """
    review_reasons = list(model_review_reasons)
    flag_for_review = bool(model_flag_for_review)

    if triage_priority in ("CRITICAL", "HIGH"):
        flag_for_review = True
        review_reasons.append(
            f"Triage priority is {triage_priority}; human review is required regardless of classification confidence."
        )

    return flag_for_review, review_reasons
