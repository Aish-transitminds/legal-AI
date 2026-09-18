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


def run_document_rules(text: str, clauses: list[ClauseSegment]) -> list[Finding]:
    clause_types = {clause.clause_type for clause in clauses}
    findings: list[Finding] = []

    for clause_type in sorted(REQUIRED_CLAUSES - clause_types):
        findings.append(
            Finding(
                finding_type="missing_clause",
                document_fact=f"No {clause_type.replace('_', ' ')} clause was detected.",
                ai_interpretation="Review Recommended: the document may need human review for this missing section.",
            )
        )

    if not re.search(r"\b(?:effective|execution|dated|date)\b", text, re.IGNORECASE):
        findings.append(
            Finding(
                finding_type="missing_date",
                document_fact="No effective, execution, or date language was detected.",
                ai_interpretation="Review Recommended: confirm the agreement date manually.",
            )
        )

    if "jurisdiction" not in clause_types and not re.search(
        r"\bjurisdiction\b|\bvenue\b|\bcourts?\b", text, re.IGNORECASE
    ):
        findings.append(
            Finding(
                finding_type="missing_jurisdiction",
                document_fact="No jurisdiction, venue, or court language was detected.",
                ai_interpretation="Review Recommended: confirm the intended forum manually.",
            )
        )

    return findings
