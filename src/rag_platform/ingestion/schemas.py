from __future__ import annotations

from dataclasses import dataclass


class PdfExtractionError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class TextBlock:
    text: str
    page: int
    bbox: tuple[float, float, float, float]
    font_size: float
    heading_level: int | None
    extraction_method: str = "native"
    confidence: float | None = None


@dataclass(frozen=True, slots=True)
class ParsedDocument:
    page_count: int
    blocks: tuple[TextBlock, ...]
    metadata: dict[str, str]
