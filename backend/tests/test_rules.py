from app.rules.engine import run_document_rules
from app.schemas.clauses import ClauseSegment


def test_rules_flag_missing_clause_date_and_jurisdiction() -> None:
    findings, doc_type = run_document_rules(
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
    # Should detect missing jurisdiction or governing law
    assert "missing_jurisdiction" in finding_types or any(
        "jurisdiction" in f.document_fact.lower() or "governing_law" in f.document_fact.lower()
        for f in findings
    )
    assert all("illegal" not in finding.ai_interpretation.lower() for finding in findings)


def test_jurisdiction_language_satisfies_jurisdiction_rule() -> None:
    findings, doc_type = run_document_rules(
        "This agreement is dated 18 September 2026. Courts at Bengaluru have jurisdiction.",
        [ClauseSegment(clause_type="jurisdiction", text="Courts at Bengaluru", page_number=1)],
    )

    assert not any(finding.finding_type == "missing_date" for finding in findings)
    assert not any(
        finding.finding_type == "missing_clause" and "jurisdiction" in finding.document_fact.lower()
        for finding in findings
    )


def test_lease_specific_rules_are_applied() -> None:
    """Lease documents should trigger lease-specific checks for registration and stamp duty."""
    findings, doc_type = run_document_rules(
        "This Lease Deed is executed between Lessor and Lessee for premises located in Pune.",
        [],
    )

    assert doc_type == "lease"
    finding_types = {f.finding_type for f in findings}
    assert "missing_registration" in finding_types or "missing_clause" in finding_types


def test_incomplete_draft_flagged() -> None:
    """Documents with unfilled placeholders should trigger an incomplete_draft finding."""
    findings, doc_type = run_document_rules(
        "This agreement between [NAME] and _______ is executed on [DATE].",
        [],
    )

    finding_types = {f.finding_type for f in findings}
    assert "incomplete_draft" in finding_types


def test_no_illegal_language_in_any_interpretation() -> None:
    """The rules engine must never use the word 'illegal' in ai_interpretation."""
    findings, doc_type = run_document_rules(
        "Parties\nAlpha and Beta.\nThis is dated 1 January 2025.",
        [ClauseSegment(clause_type="parties", text="Alpha and Beta", page_number=1)],
    )
    assert all("illegal" not in f.ai_interpretation.lower() for f in findings)
