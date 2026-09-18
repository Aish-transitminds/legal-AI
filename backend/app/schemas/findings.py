from pydantic import BaseModel


class Finding(BaseModel):
    finding_type: str
    severity: str = "review_recommended"
    document_fact: str
    legal_source: str | None = None
    ai_interpretation: str | None = None
