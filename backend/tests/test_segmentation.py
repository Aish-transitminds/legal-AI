from app.ingestion.pdf_service import extract_digital_pdf
from app.segmentation.clause_service import segment_clauses
from tests.test_ingestion import make_pdf


def test_segments_reduced_nda_taxonomy_headings() -> None:
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

    assert [clause["clause_type"] for clause in clauses] == [
        "parties",
        "confidentiality",
        "governing_law",
        "jurisdiction",
    ]
    assert "protect information" in clauses[1]["text"]
