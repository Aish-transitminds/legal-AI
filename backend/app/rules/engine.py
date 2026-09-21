import re
import json

from app.schemas.clauses import ClauseSegment
from app.schemas.findings import Finding
from app.services.legal_llm_service import build_legal_llm

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

# Regex fallbacks as a first pass
CLAUSE_FALLBACK_PATTERNS = {
    "parties": r"\b(?:between|lessor|lessee|landlord|tenant|buyer|seller|parties hereto)\b",
    "term": r"\b(?:for a term of|duration of|period of|commencing on|shall remain in force)\b",
    "confidentiality": r"\b(?:confidential|non-disclosure|secrecy)\b",
    "termination": r"\b(?:terminate|termination|determination of this demise|re-entry|re-enter|cancel)\b",
    "notice": r"\b(?:notice in writing|written notice|serve notice)\b",
    "governing_law": r"\b(?:governed by|construed in accordance with|laws of)\b",
    "jurisdiction": r"\b(?:jurisdiction|venue|courts? of)\b",
    "dispute_resolution": r"\b(?:arbitration|arbitrator|mediate|dispute resolution)\b",
}


async def run_document_rules(text: str, clauses: list[ClauseSegment], settings) -> list[Finding]:
    clause_types = {clause.clause_type for clause in clauses}
    
    # 1. Regex Fallback Pass
    for clause_type, pattern in CLAUSE_FALLBACK_PATTERNS.items():
        if clause_type not in clause_types:
            if re.search(pattern, text, re.IGNORECASE):
                clause_types.add(clause_type)

    # 2. LLM Hybrid Pass (Ask AI to find what the rules missed)
    missing_from_rules = REQUIRED_CLAUSES - clause_types
    llm_found_clauses = set()
    
    if missing_from_rules:
        prompt = (
            "You are an expert legal AI. Analyze the following document text and determine if any of "
            "these specific legal concepts are present, regardless of what headings are used.\n\n"
            f"Concepts to look for: {', '.join(missing_from_rules)}\n\n"
            "Return ONLY a valid JSON array of objects. Each object must have:\n"
            '- "clause_type": the string name of the concept\n'
            '- "present": boolean true or false\n'
            '- "evidence_quote": A short quote proving its presence, or null\n\n'
            f"DOCUMENT TEXT (first 10000 chars):\n{text[:10000]}"
        )
        
        try:
            provider = build_legal_llm(settings)
            llm_response = await provider.generate_text(prompt)
            await provider.client.aclose()
            
            cleaned = llm_response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.strip("`").removeprefix("json").strip()
            
            llm_results = json.loads(cleaned)
            for item in llm_results:
                if item.get("present") and item.get("clause_type") in missing_from_rules:
                    llm_found_clauses.add(item.get("clause_type"))
        except Exception as e:
            # If LLM fails, we gracefully fall back to just the regex rules
            pass

    # Merge LLM findings with Rule findings
    final_detected_clauses = clause_types | llm_found_clauses
    findings: list[Finding] = []

    # Flag missing clauses ONLY if both rules AND LLM found nothing
    for clause_type in sorted(REQUIRED_CLAUSES - final_detected_clauses):
        findings.append(
            Finding(
                finding_type="missing_clause",
                document_fact=f"No {clause_type.replace('_', ' ')} clause was detected.",
                ai_interpretation="Review Recommended: the document may need human review for this missing section.",
            )
        )

    # Standard Date & Jurisdiction checks
    if not re.search(r"\b(?:effective|execution|dated|date)\b", text, re.IGNORECASE):
        findings.append(
            Finding(
                finding_type="missing_date",
                document_fact="No effective, execution, or date language was detected.",
                ai_interpretation="Review Recommended: confirm the agreement date manually.",
            )
        )

    if "jurisdiction" not in final_detected_clauses and not re.search(
        r"\bjurisdiction\b|\bvenue\b|\bcourts?\b", text, re.IGNORECASE
    ):
        findings.append(
            Finding(
                finding_type="missing_jurisdiction",
                document_fact="No jurisdiction, venue, or court language was detected.",
                ai_interpretation="Review Recommended: confirm the intended forum manually.",
            )
        )

    # Dynamic Document-Type Checks (Indian Lease Context)
    is_lease = bool(re.search(r"\b(?:lease|rent|lessor|lessee|tenant|demise)\b", text, re.IGNORECASE))
    if is_lease:
        if not re.search(r"\b(?:register|registration|registered)\b", text, re.IGNORECASE):
            findings.append(
                Finding(
                    finding_type="missing_registration_clause",
                    severity="high",
                    document_fact="No registration clause detected.",
                    ai_interpretation="Review Recommended: In India, leases exceeding 11 months must be registered under the Registration Act. Verify if this applies.",
                )
            )
        if not re.search(r"\b(?:stamp duty|stamped)\b", text, re.IGNORECASE):
            findings.append(
                Finding(
                    finding_type="missing_stamp_duty",
                    severity="medium",
                    document_fact="No stamp duty provision detected.",
                    ai_interpretation="Review Recommended: Ensure adequate stamp duty is paid as per state laws to ensure the deed's admissibility in court.",
                )
            )
        if not re.search(r"\b(?:security deposit|deposit)\b", text, re.IGNORECASE):
            findings.append(
                Finding(
                    finding_type="missing_security_deposit",
                    severity="medium",
                    document_fact="No security deposit terms detected.",
                    ai_interpretation="Review Recommended: Leases typically include security deposit, lock-in, and rent escalation clauses for commercial protection.",
                )
            )

    return findings
