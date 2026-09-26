import asyncio
import hashlib
import logging
import re
from typing import Any

import httpx
from app.core.config import get_settings
from app.db import SessionLocal
from app.ingestion.pdf_service import PDFIngestionError, extract_digital_pdf
from app.models import Clause, Document, LegalFinding, LegalSource
from app.retrieval.retriever import HybridRetriever, SourceRecord
from app.rules.engine import _FALLBACK, REQUIRED_CLAUSES, run_document_rules
from app.rules.indian_compliance import get_state_compliance, get_supported_states
from app.schemas.clauses import ClauseSegment
from app.schemas.documents import PersistedDocument
from app.schemas.findings import Finding
from app.schemas.ingestion import ExtractedDocument
from app.schemas.llm import EvidenceSource
from app.schemas.llm import EvidenceSource as LlmEvidenceSource
from app.schemas.llm import FindingExplanation
from app.segmentation.clause_service import segment_clauses
from app.services.legal_llm_service import _summary_prompt, build_legal_llm
from fastapi import APIRouter, Body, File, HTTPException, UploadFile, status
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])
settings = get_settings()

# Input validation constants
_MAX_QUESTION_LENGTH = 2000
_MAX_CLAUSE_TEXT_LENGTH = 10000
_MAX_CLAUSE_TYPE_LENGTH = 100

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _validate_pdf_upload(file: UploadFile, content: bytes) -> None:
    """Raise HTTPException for invalid PDF uploads (type or size)."""
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        # Also accept octet-stream since some browsers send PDFs that way
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only PDF files are supported.",
            )
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.max_upload_size_mb} MB upload limit.",
        )


def _calculate_risk(
    findings: list[Finding], clauses: list[ClauseSegment], doc_type: str = "general"
) -> tuple[int, str]:
    """Calculate a risk score (0–100) weighted by severity."""
    severity_weights = {"high": 12, "medium": 6, "low": 3, "review_recommended": 4}
    score = min(sum(severity_weights.get(f.severity, 4) for f in findings), 100)

    if score >= 60:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"

    return score, level


def _persisted_response(document: Document) -> PersistedDocument:
    extracted = ExtractedDocument(
        filename=document.filename,
        page_count=max(
            (clause.page_number or 1 for clause in document.clauses), default=1
        ),
        pages=[],
    )
    clauses = [
        ClauseSegment.model_validate(clause.__dict__) for clause in document.clauses
    ]
    findings = [
        Finding.model_validate(finding.__dict__) for finding in document.findings
    ]
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


def _get_document_or_404(database, document_id: str) -> Document:
    """Fetch a non-deleted document by ID or raise 404."""
    document = database.scalar(
        select(Document).where(
            Document.id == document_id, Document.deleted_at.is_(None)
        )
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
        )
    return document


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/extract", response_model=ExtractedDocument)
async def extract_document(file: UploadFile = File(...)) -> ExtractedDocument:
    content = await file.read()
    _validate_pdf_upload(file, content)
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
    return [
        ClauseSegment.model_validate(clause) for clause in segment_clauses(extracted)
    ]


@router.post("/rules", response_model=list[Finding])
async def analyze_document_rules(file: UploadFile = File(...)) -> list[Finding]:
    extracted = await extract_document(file)
    clauses = [
        ClauseSegment.model_validate(clause) for clause in segment_clauses(extracted)
    ]
    text = "\n".join(page.text for page in extracted.pages)
    findings, _doc_type = run_document_rules(text, clauses)
    return findings


@router.post("/analyze", response_model=PersistedDocument)
async def analyze_and_persist_document(
    file: UploadFile = File(...),
) -> PersistedDocument:
    content = await file.read()
    _validate_pdf_upload(file, content)

    try:
        extracted = extract_digital_pdf(content, file.filename or "uploaded.pdf")
    except PDFIngestionError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

    clauses = [
        ClauseSegment.model_validate(clause) for clause in segment_clauses(extracted)
    ]
    text = "\n".join(page.text for page in extracted.pages)
    findings, doc_type = run_document_rules(text, clauses)
    content_sha256 = hashlib.sha256(content).hexdigest()
    risk_score, risk_level = _calculate_risk(findings, clauses, doc_type)

    with SessionLocal.begin() as database:
        existing = database.scalar(
            select(Document).where(
                Document.content_sha256 == content_sha256,
                Document.deleted_at.is_(None),
            )
        )
        if existing is not None:
            # Delete old cached analysis so we always use the latest rules engine
            database.delete(existing)
            database.flush()

        document = Document(
            filename=extracted.filename,
            content_sha256=content_sha256,
            status="analyzed",
        )
        database.add(document)
        database.flush()
        database.add_all(
            [
                Clause(
                    document_id=document.id,
                    clause_type=clause.clause_type,
                    text=clause.text,
                    page_number=clause.page_number,
                )
                for clause in clauses
            ]
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
            doc_type=doc_type,
        )


@router.post("/{document_id}/explain", response_model=list[FindingExplanation])
async def explain_document_findings(document_id: str) -> list[FindingExplanation]:
    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        findings = [
            Finding.model_validate(finding.__dict__) for finding in document.findings
        ]
        sources = database.scalars(select(LegalSource)).all()

    source_records = [
        SourceRecord(
            source.id,
            source.title,
            source.citation,
            source.text,
            source.source_url,
            source.authority_level,
        )
        for source in sources
    ]
    retriever = HybridRetriever(source_records) if source_records else None

    try:
        provider = build_legal_llm(settings)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

    async def explain_one(finding: Finding) -> FindingExplanation:
        try:
            retrieved = (
                retriever.search(f"{finding.finding_type} {finding.document_fact}")
                if retriever
                else None
            )
            evidence = (
                []
                if retrieved is None
                else [
                    EvidenceSource(
                        citation=source.citation,
                        text=source.text,
                        source_url=source.source_url,
                    )
                    for source in retrieved.sources
                ]
            )
            return await provider.explain_finding(finding, evidence)
        except Exception:
            logger.warning(
                "AI explanation failed for finding '%s'; returning fallback",
                finding.finding_type,
            )
            return FindingExplanation(
                status="AI_ANALYZED",
                document_fact=finding.document_fact,
                ai_interpretation=(
                    f"Review Recommended: {finding.document_fact} "
                    "This may require human legal review to assess its implications."
                ),
                citations=[],
            )

    try:
        explanations = list(
            await asyncio.gather(*(explain_one(finding) for finding in findings))
        )
    except Exception as error:
        logger.error("AI explanation batch failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again later.",
        ) from error
    finally:
        await provider.client.aclose()

    return explanations


@router.post("/{document_id}/summary")
async def summarize_document(document_id: str) -> dict[str, str]:
    """Generate an AI-powered plain-English summary of the analyzed document."""
    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]
        findings = [Finding.model_validate(f.__dict__) for f in document.findings]

    clauses_info = (
        "\n".join(f"- {c.clause_type}: {c.text[:150]}..." for c in clauses)
        or "No clauses detected."
    )
    findings_info = (
        "\n".join(f"- [{f.finding_type}] {f.document_fact}" for f in findings)
        or "No findings."
    )
    full_text = "\n".join(c.text for c in clauses) if clauses else "No text extracted."

    try:
        provider = build_legal_llm(settings)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

    try:
        prompt = _summary_prompt(full_text, clauses_info, findings_info)
        summary = await provider.generate_text(prompt)
    except Exception as error:
        logger.error("Summary generation failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again later.",
        ) from error
    finally:
        await provider.client.aclose()

    return {"summary": summary}


@router.get("/{document_id}/clause-coverage")
def get_clause_coverage(document_id: str) -> dict[str, Any]:
    """Return which required clauses are present vs missing, using both DB clauses and regex fallback."""
    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]
        full_text = " ".join(c.text for c in document.clauses)

    detected = {c.clause_type for c in clauses}
    for clause_type, pattern in _FALLBACK.items():
        if clause_type not in detected and re.search(pattern, full_text, re.IGNORECASE):
            detected.add(clause_type)

    coverage = [
        {
            "clause": clause_type,
            "label": clause_type.replace("_", " ").title(),
            "present": clause_type in detected,
        }
        for clause_type in sorted(REQUIRED_CLAUSES)
    ]

    present_count = sum(1 for c in coverage if c["present"])
    return {
        "total_required": len(REQUIRED_CLAUSES),
        "present_count": present_count,
        "missing_count": len(REQUIRED_CLAUSES) - present_count,
        "coverage_percent": (
            round(present_count / len(REQUIRED_CLAUSES) * 100)
            if REQUIRED_CLAUSES
            else 0
        ),
        "clauses": coverage,
    }


@router.post("/{document_id}/chat")
async def chat_with_document(
    document_id: str,
    body: dict[str, str] = Body(default={}),
) -> dict[str, Any]:
    """Ask a question about the document, answered from its clauses only."""
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Question is required."
        )
    if len(question) > _MAX_QUESTION_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Question must not exceed {_MAX_QUESTION_LENGTH} characters.",
        )

    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]

    clauses_text = "\n\n".join(f"[{c.clause_type.upper()}]: {c.text}" for c in clauses)

    try:
        provider = build_legal_llm(settings)
        from app.services.legal_llm_service import _chat_prompt, _parse_json

        prompt = _chat_prompt(question, clauses_text[:8000])
        raw = await provider.generate_text(prompt)
        await provider.client.aclose()

        try:
            parsed = _parse_json(raw)
            return {
                "answer": parsed.get("answer", raw),
                "source_clauses": parsed.get("source_clauses", []),
            }
        except Exception:
            return {"answer": raw.strip(), "source_clauses": []}
    except Exception as error:
        logger.error("Chat endpoint error: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again later.",
        )


@router.post("/{document_id}/draft-clause")
async def draft_clause(
    document_id: str,
    body: dict[str, str] = Body(default={}),
) -> dict[str, Any]:
    """AI-generate a suggested clause for a missing clause type."""
    clause_type = body.get("clause_type", "").strip()
    if not clause_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="clause_type is required."
        )
    if len(clause_type) > _MAX_CLAUSE_TYPE_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="clause_type is too long."
        )

    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]

    existing_text = (
        "\n".join(f"- {c.clause_type}: {c.text[:200]}" for c in clauses)
        or "No existing clauses."
    )
    doc_type = body.get("doc_type", "general")

    try:
        provider = build_legal_llm(settings)
        from app.services.legal_llm_service import _draft_clause_prompt

        prompt = _draft_clause_prompt(clause_type, doc_type, existing_text[:4000])
        drafted = await provider.generate_text(prompt)
        await provider.client.aclose()
        return {
            "clause_type": clause_type,
            "drafted_text": drafted.strip(),
            "disclaimer": "AI-generated draft. Must be reviewed and customized by a qualified legal professional before use.",
        }
    except Exception as error:
        logger.error("Draft clause error: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again later.",
        )


@router.post("/{document_id}/simplify-clause")
async def simplify_clause(
    document_id: str,
    body: dict[str, str] = Body(default={}),
) -> dict[str, str]:
    """Rewrite a legal clause in plain English."""
    clause_text = body.get("clause_text", "").strip()
    if not clause_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="clause_text is required."
        )
    if len(clause_text) > _MAX_CLAUSE_TEXT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"clause_text must not exceed {_MAX_CLAUSE_TEXT_LENGTH} characters.",
        )

    try:
        provider = build_legal_llm(settings)
        from app.services.legal_llm_service import _simplify_prompt

        prompt = _simplify_prompt(clause_text[:3000])
        simplified = await provider.generate_text(prompt)
        await provider.client.aclose()
        return {"simple_text": simplified.strip()}
    except Exception as error:
        logger.error("Simplify clause error: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again later.",
        )


@router.post("/{document_id}/fairness-check")
async def check_fairness(document_id: str) -> list[dict[str, str]]:
    """Detect one-sided or unfair clauses."""
    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]

    clauses_text = "\n\n".join(f"[{c.clause_type}]: {c.text}" for c in clauses)
    full_text = " ".join(c.text for c in clauses)
    from app.rules.engine import _detect_doc_type

    doc_type = _detect_doc_type(full_text)

    try:
        provider = build_legal_llm(settings)
        from app.services.legal_llm_service import _fairness_prompt, _parse_json

        prompt = _fairness_prompt(clauses_text[:8000], doc_type)
        raw = await provider.generate_text(prompt)
        await provider.client.aclose()

        try:
            parsed = _parse_json(raw)
            if isinstance(parsed, list):
                return parsed
            return []
        except Exception:
            return []
    except Exception as error:
        logger.error("Fairness check error: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again later.",
        )


@router.get("/compliance/states")
def list_compliance_states() -> list[dict[str, str]]:
    """Return list of supported Indian states for compliance checks."""
    return get_supported_states()


@router.post("/{document_id}/compliance")
def get_document_compliance(
    document_id: str,
    body: dict[str, str] = Body(default={}),
) -> dict[str, Any]:
    """Get state-specific compliance info for a document."""
    state_code = body.get("state", "").strip().lower()
    if not state_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="state is required."
        )

    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        clauses = [ClauseSegment.model_validate(c.__dict__) for c in document.clauses]

    full_text = " ".join(c.text for c in clauses)
    from app.rules.engine import _detect_doc_type

    doc_type = _detect_doc_type(full_text)

    compliance = get_state_compliance(state_code, doc_type)
    if compliance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"State '{state_code}' is not supported yet.",
        )

    return compliance


@router.post("/compare")
async def compare_documents(
    file1: UploadFile = File(...), file2: UploadFile = File(...)
) -> dict[str, Any]:
    """Compare two legal documents side by side."""
    content1 = await file1.read()
    content2 = await file2.read()
    _validate_pdf_upload(file1, content1)
    _validate_pdf_upload(file2, content2)

    try:
        doc1 = extract_digital_pdf(content1, file1.filename or "document1.pdf")
        doc2 = extract_digital_pdf(content2, file2.filename or "document2.pdf")
    except PDFIngestionError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

    clauses1 = [ClauseSegment.model_validate(c) for c in segment_clauses(doc1)]
    clauses2 = [ClauseSegment.model_validate(c) for c in segment_clauses(doc2)]
    text1 = "\n".join(p.text for p in doc1.pages)
    text2 = "\n".join(p.text for p in doc2.pages)

    findings1, type1 = run_document_rules(text1, clauses1)
    findings2, type2 = run_document_rules(text2, clauses2)
    risk1, level1 = _calculate_risk(findings1, clauses1, type1)
    risk2, level2 = _calculate_risk(findings2, clauses2, type2)

    types1 = {c.clause_type for c in clauses1}
    types2 = {c.clause_type for c in clauses2}
    for ct, pat in _FALLBACK.items():
        if ct not in types1 and re.search(pat, text1, re.IGNORECASE):
            types1.add(ct)
        if ct not in types2 and re.search(pat, text2, re.IGNORECASE):
            types2.add(ct)

    all_types = sorted(types1 | types2 | REQUIRED_CLAUSES)
    clause_comparison = [
        {
            "clause": ct,
            "label": ct.replace("_", " ").title(),
            "in_doc1": ct in types1,
            "in_doc2": ct in types2,
        }
        for ct in all_types
    ]

    return {
        "doc1": {
            "filename": doc1.filename,
            "pages": doc1.page_count,
            "doc_type": type1,
            "risk_score": risk1,
            "risk_level": level1,
            "findings_count": len(findings1),
        },
        "doc2": {
            "filename": doc2.filename,
            "pages": doc2.page_count,
            "doc_type": type2,
            "risk_score": risk2,
            "risk_level": level2,
            "findings_count": len(findings2),
        },
        "clause_comparison": clause_comparison,
    }


@router.get("/history/all")
def get_document_history() -> list[dict[str, Any]]:
    """Return all previously analyzed documents."""
    with SessionLocal() as database:
        documents = database.scalars(
            select(Document)
            .where(Document.deleted_at.is_(None))
            .order_by(Document.created_at.desc())
        ).all()

    return [
        {
            "id": doc.id,
            "filename": doc.filename,
            "status": doc.status,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
            "findings_count": len(doc.findings),
            "clauses_count": len(doc.clauses),
        }
        for doc in documents
    ]


@router.get("/sources", response_model=list[LlmEvidenceSource])
def list_legal_sources() -> list[LlmEvidenceSource]:
    """List indexed legal sources (citation, text, url)."""
    with SessionLocal() as database:
        sources = database.scalars(select(LegalSource)).all()

    return [
        LlmEvidenceSource(
            citation=source.citation, text=source.text, source_url=source.source_url
        )
        for source in sources
    ]


@router.get("/{document_id}", response_model=PersistedDocument)
def get_document(document_id: str) -> PersistedDocument:
    with SessionLocal() as database:
        document = _get_document_or_404(database, document_id)
        return _persisted_response(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str) -> None:
    with SessionLocal.begin() as database:
        document = database.scalar(select(Document).where(Document.id == document_id))
        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
            )
        database.delete(document)
