from pydantic import BaseModel, Field


class TextBlock(BaseModel):
    text: str
    bbox: tuple[float, float, float, float]


class ExtractedPage(BaseModel):
    page_number: int = Field(ge=1)
    text: str
    blocks: list[TextBlock]


class ExtractedDocument(BaseModel):
    filename: str
    page_count: int = Field(ge=1)
    pages: list[ExtractedPage]
