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

FALLBACK_PATTERNS: tuple[tuple[str, str], ...] = (
    ("parties", r"\b(?:between|lessor|lessee|landlord|tenant|buyer|seller|parties hereto|whereas)\b"),
    ("term", r"\b(?:for a term of|duration of|period of|commencing on|shall remain in force)\b"),
    ("payment", r"\b(?:rent of|shall pay|consideration|fees)\b"),
    ("termination", r"\b(?:terminate|termination|determination of this demise|re-entry|re-enter|cancel)\b"),
    ("notice", r"\b(?:notice in writing|written notice|serve notice)\b"),
    ("confidentiality", r"\b(?:confidential|non-disclosure|secrecy)\b"),
    ("governing_law", r"\b(?:governed by|construed in accordance with|laws of)\b"),
    ("jurisdiction", r"\b(?:jurisdiction|venue|courts? of)\b"),
    ("dispute_resolution", r"\b(?:arbitration|arbitrator|mediate|dispute resolution)\b"),
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
        # Group text into paragraphs
        paragraphs = []
        current_paragraph = []
        for line in page.text.splitlines():
            line = line.strip()
            if not line:
                if current_paragraph:
                    paragraphs.append(" ".join(current_paragraph))
                    current_paragraph = []
            else:
                current_paragraph.append(line)
        if current_paragraph:
            paragraphs.append(" ".join(current_paragraph))

        current_type: str = "miscellaneous"
        current_lines: list[str] = []

        def flush() -> None:
            if current_lines:
                segments.append(
                    {
                        "clause_type": current_type,
                        "text": "\n\n".join(current_lines).strip(),
                        "page_number": page.page_number,
                    }
                )

        for para in paragraphs:
            # 1. Try strict heading
            heading_type = _classify_heading(para)
            if not heading_type:
                # 2. Try regex fallback on the paragraph body
                for ctype, pattern in FALLBACK_PATTERNS:
                    if re.search(pattern, para, re.IGNORECASE):
                        heading_type = ctype
                        break
            
            if heading_type and heading_type != current_type:
                flush()
                current_type = heading_type
                current_lines = [para]
            else:
                current_lines.append(para)

        flush()

    return segments
