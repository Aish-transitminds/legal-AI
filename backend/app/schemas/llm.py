from typing import Literal

from pydantic import BaseModel, Field


class EvidenceSource(BaseModel):
    citation: str
    text: str
    source_url: str


class FindingExplanation(BaseModel):
    status: Literal["EXPLAINED", "AI_ANALYZED", "INSUFFICIENT_LEGAL_EVIDENCE"]
    document_fact: str
    legal_source: str | None = None
    ai_interpretation: str
    citations: list[str] = Field(default_factory=list)
