from app.rules.engine import run_document_rules
from app.schemas.clauses import ClauseSegment


def test_rules_flag_missing_clause_date_and_jurisdiction() -> None:
    findings = run_document_rules(
        "Parties\nAlpha and Beta.\nConfidentiality\nInformation is protected.",
        [
            ClauseSegment(
                clause_type="parties",
                text="Parties Alpha and Beta.",
                page_number=1,
            ),
            ClauseSegment(
                clause_type="confidentiality",
                text="Confidentiality information is protected.",
                page_number=1,
            ),
        ],
    )

    finding_types = {finding.finding_type for finding in findings}
    assert "missing_clause" in finding_types
    assert "missing_date" in finding_types
    assert "missing_jurisdiction" in finding_types
    assert all("illegal" not in finding.ai_interpretation.lower() for finding in findings)


def test_jurisdiction_language_satisfies_jurisdiction_rule() -> None:
    findings = run_document_rules(
        "This agreement is dated 18 September 2026. Courts at Bengaluru have jurisdiction.",
        [ClauseSegment(clause_type="jurisdiction", text="Courts at Bengaluru", page_number=1)],
    )

    assert not any(finding.finding_type == "missing_date" for finding in findings)
    assert not any(finding.finding_type == "missing_jurisdiction" for finding in findings)
