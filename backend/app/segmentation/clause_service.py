import re

from app.schemas.ingestion import ExtractedDocument

CLAUSE_TYPES = (
    "parties",
    "term",
    "payment",
    "termination",
    "notice",
    "confidentiality",
    "governing_law",
    "jurisdiction",
    "dispute_resolution",
    "miscellaneous",
)

_HEADING_PATTERNS: tuple[tuple[str, str], ...] = (
    ("parties", r"(?:parties|disclosing party|receiving party)"),
    ("term", r"(?:term|duration|effective date)"),
    ("payment", r"(?:payment|fees|consideration)"),
    ("termination", r"(?:termination|terminate|survival)"),
    ("notice", r"(?:notices?|notice address)"),
    ("confidentiality", r"(?:confidentiality|confidential information|non-disclosure)"),
    ("governing_law", r"(?:governing law|applicable law)"),
    ("jurisdiction", r"(?:jurisdiction|venue)"),
    ("dispute_resolution", r"(?:dispute resolution|arbitration|mediation)"),
    ("miscellaneous", r"(?:miscellaneous|entire agreement|severability)"),
)


def _classify_heading(line: str) -> str | None:
    normalized = re.sub(r"^[\s\d.()\-]+", "", line.lower()).strip(" :")
    for clause_type, pattern in _HEADING_PATTERNS:
        if re.fullmatch(pattern, normalized) or re.match(rf"^{pattern}\s*[:\-]", normalized):
            return clause_type
    return None


def segment_clauses(document: ExtractedDocument) -> list[dict[str, object]]:
    segments: list[dict[str, object]] = []
    for page in document.pages:
        lines = page.text.splitlines()
        current_type: str | None = None
        current_lines: list[str] = []

        def flush() -> None:
            if current_type and current_lines:
                segments.append(
                    {
                        "clause_type": current_type,
                        "text": "\n".join(current_lines).strip(),
                        "page_number": page.page_number,
                    }
                )

        for line in lines:
            heading_type = _classify_heading(line)
            if heading_type:
                flush()
                current_type = heading_type
                current_lines = [line.strip()]
            elif current_type:
                current_lines.append(line.strip())

        flush()

    return segments
