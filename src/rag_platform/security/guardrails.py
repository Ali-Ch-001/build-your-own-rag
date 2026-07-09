from __future__ import annotations

import re
from dataclasses import dataclass


class GuardrailViolation(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class GuardrailResult:
    text: str
    risk_labels: tuple[str, ...]


_INJECTION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"ignore\s+(all|any|the)?\s*(previous|prior|system)(\s+system)?\s+instructions?",
        r"reveal\s+(the\s+)?(system|developer)\s+prompt",
        r"act\s+as\s+(an?\s+)?unrestricted",
        r"execute\s+(this\s+)?(shell|sql|cypher|command)",
        r"<\s*(script|iframe|object)\b",
    )
)

_SECRET_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"sk-[A-Za-z0-9_-]{20,}",
        r"AKIA[0-9A-Z]{16}",
        r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
    )
)


def inspect_input(text: str, *, reject_injection: bool = False) -> GuardrailResult:
    normalized = " ".join(text.replace("\x00", "").split())
    labels: list[str] = []
    if any(pattern.search(normalized) for pattern in _INJECTION_PATTERNS):
        labels.append("prompt_injection")
        if reject_injection:
            raise GuardrailViolation("The request contains instruction-manipulation patterns")
    if any(pattern.search(normalized) for pattern in _SECRET_PATTERNS):
        raise GuardrailViolation("Potential credential material must not be submitted")
    return GuardrailResult(text=normalized, risk_labels=tuple(labels))


def sanitize_evidence(text: str) -> GuardrailResult:
    inspected = inspect_input(text)
    sanitized = re.sub(r"<[^>]+>", " ", inspected.text)
    sanitized = re.sub(r"!?\[[^\]]*\]\([^)]*\)", " ", sanitized)
    return GuardrailResult(text=" ".join(sanitized.split()), risk_labels=inspected.risk_labels)


def inspect_output(text: str) -> str:
    if any(pattern.search(text) for pattern in _SECRET_PATTERNS):
        raise GuardrailViolation("Generated output matched a credential pattern")
    return text
