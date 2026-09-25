from app.ingestion.pdf_service import extract_digital_pdf
from app.segmentation.clause_service import segment_clauses
from tests.test_ingestion import make_pdf


def test_segments_numbered_nda_headings() -> None:
    """Numbered section headings like '1. Parties' must be correctly classified."""
    document = extract_digital_pdf(
        make_pdf(
            "1. Parties\nAlpha Pvt Ltd and Beta Labs.\n"
            "2. Confidentiality\nThe receiving party shall protect information.\n"
            "3. Governing Law\nThe laws of India apply.\n"
            "4. Jurisdiction\nCourts at Bengaluru have jurisdiction."
        ),
        "nda.pdf",
    )

    clauses = segment_clauses(document)
    detected_types = [clause["clause_type"] for clause in clauses]

    # Must detect all four major headings
    assert "parties" in detected_types
    assert "confidentiality" in detected_types
    assert "governing_law" in detected_types
    assert "jurisdiction" in detected_types
    # Confidentiality body text must be preserved
    confidentiality_clause = next(c for c in clauses if c["clause_type"] == "confidentiality")
    assert "protect information" in confidentiality_clause["text"]


def test_segments_plain_headings_without_numbers() -> None:
    """Plain headings without numbering must also be detected."""
    document = extract_digital_pdf(
        make_pdf(
            "Parties\nParty A and Party B are the contracting parties.\n"
            "Termination\nEither party may terminate upon 30 days written notice."
        ),
        "contract.pdf",
    )

    clauses = segment_clauses(document)
    detected_types = [c["clause_type"] for c in clauses]

    assert "parties" in detected_types
    assert "termination" in detected_types


def test_fallback_pattern_catches_inline_clause_keywords() -> None:
    """When headings are absent, inline clause-related keywords should trigger fallback classification."""
    document = extract_digital_pdf(
        make_pdf(
            "This agreement is governed by the laws of India and shall be construed accordingly. "
            "Courts at Mumbai shall have jurisdiction over any disputes."
        ),
        "agreement.pdf",
    )

    clauses = segment_clauses(document)
    detected_types = {c["clause_type"] for c in clauses}
    # Should detect governing_law or jurisdiction from inline text
    assert "governing_law" in detected_types or "jurisdiction" in detected_types
