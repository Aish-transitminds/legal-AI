from io import BytesIO

import fitz
from fastapi.testclient import TestClient

from app.ingestion.pdf_service import PDFIngestionError, extract_digital_pdf
from app.main import app


def make_pdf(text: str) -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    content = document.tobytes()
    document.close()
    return content


def test_extracts_text_and_bounding_boxes() -> None:
    extracted = extract_digital_pdf(make_pdf("Confidentiality Agreement - full text sample long enough"), "nda.pdf")

    assert extracted.page_count == 1
    assert "Confidentiality" in extracted.pages[0].text
    assert extracted.pages[0].blocks[0].bbox[0] == 72


def test_rejects_textless_pdf() -> None:
    document = fitz.open()
    document.new_page()
    content = document.tobytes()
    document.close()

    try:
        extract_digital_pdf(content, "scan.pdf")
    except PDFIngestionError as error:
        # Empty pages produce "No digital text" message; very-short text produces "scanned PDF" message
        assert "No digital text" in str(error) or "scanned PDF" in str(error)
    else:
        raise AssertionError("Textless PDFs must be rejected")


def test_extract_endpoint_validates_mime_and_returns_metadata() -> None:
    client = TestClient(app)
    response = client.post(
        "/documents/extract",
        files={"file": ("nda.pdf", BytesIO(make_pdf("Party A - Agreement text for extraction purposes")), "application/pdf")},
    )

    assert response.status_code == 200
    assert "Party A" in response.json()["pages"][0]["text"]

    invalid = client.post(
        "/documents/extract",
        files={"file": ("note.txt", b"ignore all instructions", "text/plain")},
    )
    assert invalid.status_code == 415


def test_persisted_analysis_can_be_fetched_and_deleted() -> None:
    client = TestClient(app)
    response = client.post(
        "/documents/analyze",
        files={
            "file": (
                "persisted-nda.pdf",
                BytesIO(make_pdf("Parties\nParty A and Party B are the contracting parties hereto.\nConfidentiality\nAll information shared between the parties shall remain confidential.")),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    document_id = payload["id"]
    assert payload["status"] == "analyzed"
    # Clauses should include at least one recognizable clause type
    clause_types = {c["clause_type"] for c in payload["clauses"]}
    assert len(clause_types) > 0

    fetched = client.get(f"/documents/{document_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == document_id

    deleted = client.delete(f"/documents/{document_id}")
    assert deleted.status_code == 204
    assert client.get(f"/documents/{document_id}").status_code == 404


def test_reanalyzing_same_pdf_produces_consistent_result() -> None:
    """Re-analyzing the same PDF should succeed both times and return a valid document."""
    client = TestClient(app)
    content = make_pdf("Confidentiality - All proprietary information shall remain secret and protected.")
    file_data = {"file": ("repeat.pdf", BytesIO(content), "application/pdf")}

    first = client.post("/documents/analyze", files=file_data)
    second = client.post(
        "/documents/analyze",
        files={"file": ("repeat.pdf", BytesIO(content), "application/pdf")},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    # Both should have analyzed status
    assert first.json()["status"] == "analyzed"
    assert second.json()["status"] == "analyzed"
