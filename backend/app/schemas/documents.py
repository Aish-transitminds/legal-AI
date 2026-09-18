from pydantic import BaseModel

from app.schemas.clauses import ClauseSegment
from app.schemas.findings import Finding
from app.schemas.ingestion import ExtractedDocument


class PersistedDocument(BaseModel):
    id: str
    status: str
    document: ExtractedDocument
    clauses: list[ClauseSegment]
    findings: list[Finding]
