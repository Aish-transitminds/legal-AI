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
    (
        "parties",
        r"\b(?:between|lessor|lessee|landlord|tenant|buyer|seller|parties hereto|whereas)\b",
    ),
    (
        "term",
        r"\b(?:for a term of|duration of|period of|commencing on|shall remain in force)\b",
    ),
    ("payment", r"\b(?:rent of|shall pay|consideration|fees)\b"),
    (
        "termination",
        r"\b(?:terminate|termination|determination of this demise|re-entry|re-enter|cancel)\b",
    ),
    ("notice", r"\b(?:notice in writing|written notice|serve notice)\b"),
    ("confidentiality", r"\b(?:confidential|non-disclosure|secrecy)\b"),
    ("governing_law", r"\b(?:governed by|construed in accordance with|laws of)\b"),
    ("jurisdiction", r"\b(?:jurisdiction|venue|courts? of)\b"),
    (
        "dispute_resolution",
        r"\b(?:arbitration|arbitrator|mediate|dispute resolution)\b",
    ),
)


def _classify_heading(line: str) -> str | None:
    """Return a clause_type if `line` looks like a section heading, else None.

    Strips common numbering prefixes (e.g. "1.", "2.1", "(a)", "Article 2.") before
    matching, so that "1. Parties" and "3. Governing Law" are correctly classified.
    Only considers lines up to 100 characters (headings are rarely longer).
    """
    stripped_line = line.strip()
    # Only consider short lines as potential headings
    if not stripped_line or len(stripped_line) > 100:
        return None

    # Normalize: remove leading section numbers / bullet marks, lowercase, strip colons
    # Handles: "1.", "1.1.", "(a)", "Article 2 -", "SECTION 3:"
    normalized = re.sub(
        r"^(?:article|section|clause|para(?:graph)?|schedule)?\s*[\d.]+\s*[-.):]?\s*",
        "",
        stripped_line.lower(),
        flags=re.IGNORECASE,
    ).strip(": ")

    if not normalized:
        # Fall back to the full line text without numbering
        normalized = re.sub(r"^[\s\d.()\[\]-]+", "", stripped_line.lower()).strip(": ")

    if not normalized:
        return None

    for clause_type, pattern in _HEADING_PATTERNS:
        if re.fullmatch(pattern, normalized) or re.match(
            rf"^(?:{pattern})\s*[:\-]?$", normalized
        ):
            return clause_type

    return None


def segment_clauses(document: ExtractedDocument) -> list[dict[str, object]]:
    """Segment a document into typed clause dictionaries.

    Strategy:
    1. Process the document line-by-line so that even when PyMuPDF returns all
       text in a single block (the common case for simple PDFs), we still detect
       section headings on individual lines.
    2. When a heading is detected, flush the current accumulator and start a new
       section under the detected clause type.
    3. As a fallback, apply regex patterns against the accumulated body text to
       re-classify sections that were missed by heading detection.
    """
    segments: list[dict[str, object]] = []

    for page in document.pages:
        current_type: str = "miscellaneous"
        current_lines: list[str] = []

        def flush() -> None:
            nonlocal current_lines
            text = "\n".join(current_lines).strip()
            if text:
                segments.append(
                    {
                        "clause_type": current_type,
                        "text": text,
                        "page_number": page.page_number,
                    }
                )
            current_lines = []

        for raw_line in page.text.splitlines():
            line = raw_line.strip()
            if not line:
                continue  # Skip blank lines

            heading_type = _classify_heading(line)
            if heading_type and heading_type != current_type:
                # New section heading found → flush previous section
                flush()
                current_type = heading_type
                # Don't include the heading line itself in the body text
                # (it's identified by clause_type already)
            else:
                current_lines.append(line)

        flush()

    # Post-process: re-classify any "miscellaneous" segments using fallback patterns
    for segment in segments:
        if segment["clause_type"] == "miscellaneous":
            text = str(segment["text"])
            for ctype, pattern in FALLBACK_PATTERNS:
                if re.search(pattern, text, re.IGNORECASE):
                    segment["clause_type"] = ctype
                    break

    # Merge consecutive segments of the same type (can happen with multi-paragraph sections)
    if not segments:
        return segments

    merged: list[dict[str, object]] = [segments[0]]
    for seg in segments[1:]:
        last = merged[-1]
        if (
            seg["clause_type"] == last["clause_type"]
            and seg["page_number"] == last["page_number"]
        ):
            last["text"] = str(last["text"]) + "\n\n" + str(seg["text"])
        else:
            merged.append(seg)

    return merged
