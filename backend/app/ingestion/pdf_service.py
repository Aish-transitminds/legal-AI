from io import BytesIO

import fitz

from app.schemas.ingestion import ExtractedDocument, ExtractedPage, TextBlock


class PDFIngestionError(ValueError):
    pass


def extract_digital_pdf(content: bytes, filename: str) -> ExtractedDocument:
    if not content:
        raise PDFIngestionError("The uploaded PDF is empty.")

    try:
        document = fitz.open(stream=BytesIO(content), filetype="pdf")
    except (fitz.FileDataError, ValueError) as error:
        raise PDFIngestionError("The uploaded file is not a readable PDF.") from error

    pages: list[ExtractedPage] = []
    try:
        for page_index, page in enumerate(document):
            blocks: list[TextBlock] = []
            for block in page.get_text("blocks"):
                text = block[4].strip()
                if text:
                    blocks.append(TextBlock(text=text, bbox=tuple(block[:4])))

            pages.append(
                ExtractedPage(
                    page_number=page_index + 1,
                    text=page.get_text("text").strip(),
                    blocks=blocks,
                )
            )
    finally:
        document.close()

    if not pages or not any(page.text for page in pages):
        raise PDFIngestionError(
            "No digital text was found in this PDF. Scanned PDFs are not supported; please use a digitally-created PDF."
        )

    total_extracted_text = sum(len(page.text) for page in pages)
    if total_extracted_text < 10:
        raise PDFIngestionError(
            "This appears to be a scanned PDF. Only digital (text-based) PDFs are supported. "
            "Please use a digitally-created PDF or run OCR on the scanned document first."
        )

    return ExtractedDocument(filename=filename, page_count=len(pages), pages=pages)
