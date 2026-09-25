import re

from app.schemas.clauses import ClauseSegment
from app.schemas.findings import Finding

REQUIRED_CLAUSES = {
    "parties",
    "term",
    "confidentiality",
    "termination",
    "notice",
    "governing_law",
    "jurisdiction",
    "dispute_resolution",
}

# Broad regex fallbacks that catch old-style Indian drafting
_FALLBACK = {
    "parties": r"\b(?:between|lessor|lessee|landlord|tenant|licensor|licensee|buyer|seller|vendor|vendee|first party|second party|party of the first part|witnesseth|whereas.*hereinafter)\b",
    "term": r"\b(?:for a term of|duration of|period of|commencing on|shall remain in force|tenure|from the date|years from)\b",
    "confidentiality": r"\b(?:confidential|non-disclosure|secrecy|proprietary information)\b",
    "termination": r"\b(?:terminat|determination of this demise|re-entry|re-enter|cancel|revok|expiry of|surrender)\b",
    "notice": r"\b(?:notice in writing|written notice|serve notice|days.? notice|notice period|prior notice)\b",
    "governing_law": r"\b(?:governed by|construed in accordance with|laws of|subject to the laws)\b",
    "jurisdiction": r"\b(?:jurisdiction|venue|courts? of|exclusive jurisdiction)\b",
    "dispute_resolution": r"\b(?:arbitrat|mediat|dispute.?resolution|conciliation|resolved amicably)\b",
}


def _detect_doc_type(text: str) -> str:
    """Detect the broad document type from text content."""
    lower = text.lower()
    if re.search(r"\b(?:lease|rent|lessor|lessee|tenant|demise|premises)\b", lower):
        return "lease"
    if re.search(r"\b(?:non-disclosure|nda|confidential information|disclosing party|receiving party)\b", lower):
        return "nda"
    if re.search(r"\b(?:employ|salary|compensation|probation|designation|human resource)\b", lower):
        return "employment"
    if re.search(r"\b(?:sale deed|conveyance|absolute sale|purchase price|immovable property)\b", lower):
        return "sale_deed"
    if re.search(r"\b(?:service agreement|scope of work|deliverables|service provider|client)\b", lower):
        return "service_agreement"
    return "general"


# Clauses that are NOT expected in certain doc types (so don't penalize)
_CLAUSE_EXCEPTIONS: dict[str, set[str]] = {
    "lease": {"confidentiality"},
    "nda": {"notice"},
    "employment": set(),
    "sale_deed": {"confidentiality", "notice"},
    "service_agreement": set(),
    "general": set(),
}


def run_document_rules(text: str, clauses: list[ClauseSegment]) -> list[Finding]:
    doc_type = _detect_doc_type(text)
    exceptions = _CLAUSE_EXCEPTIONS.get(doc_type, set())

    clause_types = {clause.clause_type for clause in clauses}

    # Regex fallback: scan full text for patterns the heading-based segmenter missed
    for clause_type, pattern in _FALLBACK.items():
        if clause_type not in clause_types:
            if re.search(pattern, text, re.IGNORECASE):
                clause_types.add(clause_type)

    findings: list[Finding] = []

    # Only flag clauses that are BOTH missing AND expected for this doc type
    actually_missing = (REQUIRED_CLAUSES - clause_types) - exceptions
    for clause_type in sorted(actually_missing):
        findings.append(
            Finding(
                finding_type="missing_clause",
                severity="high" if clause_type in {"governing_law", "jurisdiction", "dispute_resolution"} else "medium",
                document_fact=f"No {clause_type.replace('_', ' ')} clause was detected in this {doc_type.replace('_', ' ')}.",
                ai_interpretation=f"Review Recommended: a {clause_type.replace('_', ' ')} clause is typically expected in a {doc_type.replace('_', ' ')} agreement.",
            )
        )

    # Date check
    if not re.search(r"\b(?:effective|execution|executed on|dated|day of|date of)\b", text, re.IGNORECASE):
        findings.append(
            Finding(
                finding_type="missing_date",
                severity="medium",
                document_fact="No effective or execution date language was detected.",
                ai_interpretation="Review Recommended: confirm the agreement date manually.",
            )
        )

    # Indian Lease-specific checks
    if doc_type == "lease":
        if not re.search(r"\b(?:register|registration|registered|sub-registrar)\b", text, re.IGNORECASE):
            findings.append(
                Finding(
                    finding_type="missing_registration",
                    severity="high",
                    document_fact="No registration clause detected in this lease deed.",
                    ai_interpretation="Review Recommended: under the Indian Registration Act 1908, leases exceeding 11 months must be registered.",
                )
            )
        if not re.search(r"\b(?:stamp duty|stamp paper|stamped|non-judicial stamp)\b", text, re.IGNORECASE):
            findings.append(
                Finding(
                    finding_type="missing_stamp_duty",
                    severity="medium",
                    document_fact="No stamp duty provision detected.",
                    ai_interpretation="Review Recommended: ensure adequate stamp duty is paid per state laws for the deed's admissibility.",
                )
            )
        if not re.search(r"\b(?:security deposit|earnest|caution deposit)\b", text, re.IGNORECASE):
            findings.append(
                Finding(
                    finding_type="missing_security_deposit",
                    severity="medium",
                    document_fact="No security deposit terms detected.",
                    ai_interpretation="Review Recommended: lease agreements typically include security deposit, lock-in period and rent escalation clauses.",
                )
            )
        if not re.search(r"\b(?:escalat|increase|revision|hike|increment).*\b(?:rent|lease)\b|\b(?:rent|lease).*\b(?:escalat|increase|revision|hike)\b", text, re.IGNORECASE):
            findings.append(
                Finding(
                    finding_type="missing_rent_escalation",
                    severity="low",
                    document_fact="No rent escalation clause detected.",
                    ai_interpretation="Review Recommended: consider adding periodic rent revision terms to protect against inflation.",
                )
            )

    # Fill-in-the-blank / incomplete draft detection
    blanks = re.findall(r'(?:\.{3,}|_{3,}|\[\s*INSERT\s*\]|\[\s*NAME\s*\]|\[\s*DATE\s*\]|\[\s*ADDRESS\s*\]|\[\s*AMOUNT\s*\]|\[\s*\]|\*{3,})', text, re.IGNORECASE)
    if blanks:
        unique_blanks = list(set(b.strip() for b in blanks))
        findings.append(
            Finding(
                finding_type="incomplete_draft",
                severity="high",
                document_fact=f"Found {len(blanks)} unfilled placeholder(s) in the document: {', '.join(unique_blanks[:5])}{'...' if len(unique_blanks) > 5 else ''}",
                ai_interpretation="This document appears to be an incomplete template with unfilled blanks. All placeholders must be filled before execution.",
            )
        )

    return findings, doc_type
