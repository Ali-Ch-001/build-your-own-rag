from rag_platform.ingestion.chunker import ChunkerConfig, SemanticChunker, canonicalize_text
from rag_platform.ingestion.parser import ParsedDocument, TextBlock


def block(text: str, page: int = 1, heading_level: int | None = None) -> TextBlock:
    return TextBlock(
        text=text,
        page=page,
        bbox=(0, 0, 100, 100),
        font_size=12,
        heading_level=heading_level,
    )


def test_chunks_respect_heading_boundaries_and_have_hashes() -> None:
    parsed = ParsedDocument(
        page_count=2,
        metadata={},
        blocks=(
            block("Security Controls", heading_level=1),
            block("Access is reviewed every quarter. " * 30),
            block("Recovery", page=2, heading_level=1),
            block("Backups are tested monthly. " * 30, page=2),
        ),
    )
    chunks = SemanticChunker(
        ChunkerConfig(target_tokens=100, max_tokens=150, overlap_tokens=10)
    ).chunk(parsed)

    assert chunks
    assert {tuple(item.heading_path) for item in chunks} == {
        ("Security Controls",),
        ("Recovery",),
    }
    assert all(len(item.content_sha256) == 64 for item in chunks)
    assert all(item.page_from <= item.page_to for item in chunks)


def test_exact_duplicate_chunks_are_removed() -> None:
    parsed = ParsedDocument(
        page_count=1,
        metadata={},
        blocks=(block("Repeated paragraph."), block("Repeated paragraph.")),
    )
    chunks = SemanticChunker(ChunkerConfig(target_tokens=1, max_tokens=30, overlap_tokens=0)).chunk(
        parsed
    )
    assert len(chunks) == 1


def test_canonicalization_is_stable() -> None:
    assert canonicalize_text("A\t value\n\n\nB") == "A value\n\nB"
