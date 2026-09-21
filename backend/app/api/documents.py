import hashlib
import asyncio

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal, create_tables
from app.ingestion.pdf_service import PDFIngestionError, extract_digital_pdf
from app.models import Clause, Document, LegalFinding, LegalSource
from app.schemas.clauses import ClauseSegment
from app.schemas.documents import PersistedDocument
from app.schemas.findings import Finding
from app.schemas.ingestion import ExtractedDocument
from app.schemas.llm import EvidenceSource, FindingExplanation
from app.retrieval.retriever import HybridRetriever, SourceRecord
from app.rules.engine import run_document_rules, REQUIRED_CLAUSES
from app.segmentation.clause_service import segment_clauses
from app.services.legal_llm_service import build_legal_llm, _summary_prompt
from typing import Any
from app.schemas.llm import EvidenceSource as LlmEvidenceSource


router = APIRouter(prefix="/documents", tags=["documents"])
settings = get_settings()


def _calculate_risk(findings: list[Finding], clauses: list[ClauseSegment]) -> tuple[int, str]:
    """Calculate a risk score (0-100) and risk level based on findings and clause coverage."""
    score = 0
    clause_types = {c.clause_type for c in clauses}
    total_required = len(REQUIRED_CLAUSES)
    missing_count = len(REQUIRED_CLAUSES - clause_types)

    # Missing clauses: up to 60 points
    if total_required > 0:
        score += int((missing_count / total_required) * 60)

    # Each finding adds risk
    for f in findings:
        if f.finding_type == "missing_clause":
            score += 3
        elif f.finding_type == "missing_jurisdiction":
            score += 8
        elif f.finding_type == "missing_date":
            score += 5
        else:
            score += 2

    score = min(score, 100)

    if score >= 60:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"

    return score, level


@router.post("/extract", response_model=ExtractedDocument)
async def extract_document(file: UploadFile = File(...)) -> ExtractedDocument:
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only digital PDF files are supported in MVP v1.",
        )

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.max_upload_size_mb} MB upload limit.",
        )

    try:
        return extract_digital_pdf(content, file.filename or "uploaded.pdf")
    except PDFIngestionError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error


@router.post("/segment", response_model=list[ClauseSegment])
async def segment_document(file: UploadFile = File(...)) -> list[ClauseSegment]:
    extracted = await extract_document(file)
    return [ClauseSegment.model_validate(clause) for clause in segment_clauses(extracted)]


@router.post("/rules", response_model=list[Finding])
async def analyze_document_rules(file: UploadFile = File(...)) -> list[Finding]:
    extracted = await extract_document(file)
    clauses = [ClauseSegment.model_validate(clause) for clause in segment_clauses(extracted)]
    text = "\n".join(page.text for page in extracted.pages)
    return run_document_rules(text, clauses)


def _persisted_response(document: Document) -> PersistedDocument:
    extracted = ExtractedDocument(
        filename=document.filename,
        page_count=max((clause.page_number or 1 for clause in document.clauses), default=1),
        pages=[],
    )
    clauses = [ClauseSegment.model_validate(clause.__dict__) for clause in document.clauses]
    findings = [Finding.model_validate(finding.__dict__) for finding in document.findings]
    risk_score, risk_level = _calculate_risk(findings, clauses)
    return PersistedDocument(
        id=document.id,
        status=document.status,
        document=extracted,
        clauses=clauses,
        findings=findings,
        risk_score=risk_score,
        risk_level=risk_level,
    )


@router.post("/analyze", response_model=PersistedDocument)
async def analyze_and_persist_document(file: UploadFile = File(...)) -> PersistedDocument:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Only PDF files are supported.")

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds upload limit.")

    try:
        extracted = extract_digital_pdf(content, file.filename or "uploaded.pdf")
    except PDFIngestionError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error

    clauses = [ClauseSegment.model_validate(clause) for clause in segment_clauses(extracted)]
    text = "\n".join(page.text for page in extracted.pages)
    findings = run_document_rules(text, clauses)
    content_sha256 = hashlib.sha256(content).hexdigest()
    risk_score, risk_level = _calculate_risk(findings, clauses)
    create_tables()

    with SessionLocal.begin() as database:
        existing = database.scalar(
            select(Document).where(
                Document.content_sha256 == content_sha256,
                Document.deleted_at.is_(None),
            )
        )
        if existing is not None:
            ex_clauses = [ClauseSegment.model_validate(clause.__dict__) for clause in existing.clauses]
            ex_findings = [Finding.model_validate(finding.__dict__) for finding in existing.findings]
            ex_risk_score, ex_risk_level = _calculate_risk(ex_findings, ex_clauses)
            return PersistedDocument(
                id=existing.id,
                status=existing.status,
                document=extracted,
                clauses=ex_clauses,
                findings=ex_findings,
                risk_score=ex_risk_score,
                risk_level=ex_risk_level,
            )

        document = Document(
            filename=extracted.filename,
            content_sha256=content_sha256,
            status="analyzed",
        )
        database.add(document)
        database.flush()
        database.add_all(
            [Clause(document_id=document.id, clause_type=clause.clause_type, text=clause.text, page_number=clause.page_number) for clause in clauses]
        )
        database.add_all(
            [
                LegalFinding(
                    document_id=document.id,
                    finding_type=finding.finding_type,
                    severity=finding.severity,
                    document_fact=finding.document_fact,
                    legal_source=finding.legal_source,
                    ai_interpretation=finding.ai_interpretation,
                )
                for finding in findings
            ]
        )
        database.refresh(document)
        return PersistedDocument(
            id=document.id,
            status=document.status,
            document=extracted,
            clauses=clauses,
            findings=findings,
            risk_score=risk_score,
            risk_level=risk_level,
        )


@router.post("/{document_id}/explain", response_model=list[FindingExplanation])
async def explain_document_findings(document_id: str) -> list[FindingExplanation]:
    with SessionLocal() as database:
        document = database.scalar(select(Document).where(Document.id == document_id, Document.deleted_at.is_(None)))
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
        findings = [Finding.model_validate(finding.__dict__) for finding in document.findings]
        sources = database.scalars(select(LegalSource)).all()

    source_records = [
        SourceRecord(source.id, source.title, source.citation, source.text, source.source_url, source.authority_level)
        for source in sources
    ]
    retriever = HybridRetriever(source_records) if source_records else None
    try:
        provider = build_legal_llm(settings)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    async def explain_one(finding: Finding) -> FindingExplanation:
        try:
            retrieved = retriever.search(f"{finding.finding_type} {finding.document_fact}") if retriever else None
            evidence = [] if retrieved is None else [
                EvidenceSource(citation=source.citation, text=source.text, source_url=source.source_url)
                for source in retrieved.sources
            ]
            return await provider.explain_finding(finding, evidence)
        except Exception:
            # If one finding fails, return a fallback instead of crashing everything
            return FindingExplanation(
                status="AI_ANALYZED",
                document_fact=finding.document_fact,
                ai_interpretation=f"Review Recommended: {finding.document_fact} This may require human legal review to assess its implications for your agreement.",
                citations=[],
            )

    try:
        explanations = list(await asyncio.gather(*(explain_one(finding) for finding in findings)))
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service is temporarily unavailable: {error}",
        ) from error
    finally:
        await provider.client.aclose()

    return explanations


@router.post("/{document_id}/summary")
async def summarize_document(document_id: str) -> dict[str, str]:
    """Generate an AI-powered plain-English summary of the analyzed document."""
    with SessionLocal() as database:
        document = database.scalar(select(Document).where(Document.id == document_id, Document.deleted_at.is_(None)))
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]
        findings = [Finding.model_validate(f.__dict__) for f in document.findings]

    clauses_info = "\n".join(f"- {c.clause_type}: {c.text[:150]}..." for c in clauses) or "No clauses detected."
    findings_info = "\n".join(f"- [{f.finding_type}] {f.document_fact}" for f in findings) or "No findings."

    # Get clause text for summary
    full_text = "\n".join(c.text for c in clauses) if clauses else "No text extracted."

    try:
        provider = build_legal_llm(settings)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    try:
        prompt = _summary_prompt(full_text, clauses_info, findings_info)
        summary = await provider.generate_text(prompt)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service is temporarily unavailable: {error}",
        ) from error
    finally:
        await provider.client.aclose()

    return {"summary": summary}


@router.get("/{document_id}/clause-coverage")
def get_clause_coverage(document_id: str) -> dict[str, Any]:
    """Return which required clauses are present vs missing."""
    with SessionLocal() as database:
        document = database.scalar(select(Document).where(Document.id == document_id, Document.deleted_at.is_(None)))
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]

    detected = {c.clause_type for c in clauses}
    coverage = []
    for clause_type in sorted(REQUIRED_CLAUSES):
        coverage.append({
            "clause": clause_type,
            "label": clause_type.replace("_", " ").title(),
            "present": clause_type in detected,
        })

    present_count = sum(1 for c in coverage if c["present"])
    return {
        "total_required": len(REQUIRED_CLAUSES),
        "present_count": present_count,
        "missing_count": len(REQUIRED_CLAUSES) - present_count,
        "coverage_percent": round(present_count / len(REQUIRED_CLAUSES) * 100) if REQUIRED_CLAUSES else 0,
        "clauses": coverage,
    }


@router.get("/sources", response_model=list[LlmEvidenceSource])
def list_legal_sources() -> list[LlmEvidenceSource]:
    """Diagnostic endpoint: list indexed legal sources (citation, text, url)."""
    with SessionLocal() as database:
        sources = database.scalars(select(LegalSource)).all()

    return [
        LlmEvidenceSource(citation=source.citation, text=source.text, source_url=source.source_url)
        for source in sources
    ]


@router.get("/{document_id}", response_model=PersistedDocument)
def get_document(document_id: str) -> PersistedDocument:
    with SessionLocal() as database:
        document = database.scalar(select(Document).where(Document.id == document_id, Document.deleted_at.is_(None)))
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
        return _persisted_response(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str) -> None:
    with SessionLocal.begin() as database:
        document = database.scalar(select(Document).where(Document.id == document_id))
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
        database.delete(document)


@router.get("/{document_id}/debug_retrieval")
def debug_retrieval(document_id: str) -> Any:
    """Developer diagnostic: for each finding, return the retriever matches and scores."""
    with SessionLocal() as database:
        document = database.scalar(select(Document).where(Document.id == document_id, Document.deleted_at.is_(None)))
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
        findings = [Finding.model_validate(finding.__dict__) for finding in document.findings]
        sources = database.scalars(select(LegalSource)).all()

    source_records = [
        SourceRecord(source.id, source.title, source.citation, source.text, source.source_url, source.authority_level)
        for source in sources
    ]
    retriever = HybridRetriever(source_records) if source_records else None

    results: list[dict[str, Any]] = []
    for finding in findings:
        query = f"{finding.finding_type} {finding.document_fact}"
        if not retriever:
            results.append({"finding": finding.document_fact, "query": query, "matches": []})
            continue
        scored = retriever.search_with_scores(query, limit=10)
        matches = [
            {
                "score": score,
                "citation": source.citation,
                "title": source.title,
                "authority_level": source.authority_level,
            }
            for score, source in scored
        ]
        results.append({"finding": finding.document_fact, "query": query, "matches": matches})

    return results
