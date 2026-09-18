from app.retrieval.retriever import (
    INSUFFICIENT_LEGAL_EVIDENCE,
    HybridRetriever,
    SourceRecord,
)


def test_retrieval_prioritizes_official_law() -> None:
    retriever = HybridRetriever(
        [
            SourceRecord(
                "research-1",
                "Research note",
                "research",
                "Confidentiality duties may be discussed in a research note.",
                "https://example.invalid/research",
                "research",
            ),
            SourceRecord(
                "official-1",
                "Indian Contract Act, 1872",
                "Section 10",
                "Agreements are contracts if made by free consent of parties competent to contract.",
                "https://indiacode.gov.in/",
                "official_legislation",
            ),
        ]
    )

    result = retriever.search("free consent and competent parties")

    assert result.status == "RETRIEVED"
    assert result.sources[0].authority_level == "official_legislation"


def test_retrieval_returns_insufficient_evidence_without_match() -> None:
    retriever = HybridRetriever(
        [
            SourceRecord(
                "official-1",
                "Indian Contract Act, 1872",
                "Section 10",
                "Free consent and competent parties.",
                "https://indiacode.gov.in/",
                "official_legislation",
            )
        ]
    )

    result = retriever.search("unrelated maritime insurance rule")

    assert result.status == INSUFFICIENT_LEGAL_EVIDENCE
    assert result.sources == ()
