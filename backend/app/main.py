import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.documents import router as documents_router
from app.core.config import get_settings
from app.db import create_tables

logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create database tables once at startup
    create_tables()
    logger.info("Database tables ready. LLM provider: %s", settings.llm_provider)
    yield
    logger.info("Application shutting down.")


app = FastAPI(
    title=settings.app_name,
    description="Local-first legal document analysis aid; not legal advice.",
    version="0.2.0",
    lifespan=lifespan,
    # Disable the interactive docs in production to reduce attack surface
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
)

# CORS — allow only the configured origins
_allowed_origins = [
    origin.strip()
    for origin in settings.cors_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

app.include_router(documents_router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Health check endpoint. Returns application status and environment."""
    return {"status": "ok", "environment": settings.app_env}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler to prevent internal error details from leaking to clients."""
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )
