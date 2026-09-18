from pydantic import BaseModel, Field


class ClauseSegment(BaseModel):
    clause_type: str
    text: str
    page_number: int = Field(ge=1)
