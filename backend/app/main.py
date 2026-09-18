from fastapi import FastAPI

from app.api.documents import router as documents_router
from app.core.config import get_settings


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    description="Local-first legal document analysis aid; not legal advice.",
    version="0.1.0",
)
app.include_router(documents_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env}
