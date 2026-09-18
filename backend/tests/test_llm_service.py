import httpx
import pytest

from app.retrieval.retriever import INSUFFICIENT_LEGAL_EVIDENCE
from app.schemas.findings import Finding
from app.schemas.llm import EvidenceSource
from app.services.legal_llm_service import OllamaProvider, OpenAICompatibleProvider


def finding() -> Finding:
    return Finding(
        finding_type="missing_date",
        document_fact="No effective date was detected.",
    )


def source() -> EvidenceSource:
    return EvidenceSource(
        citation="Section 10",
        text="Agreements are contracts if made by free consent.",
        source_url="https://indiacode.gov.in/",
    )


@pytest.mark.anyio
async def test_ollama_explanation_validates_structured_citation() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "response": '{"legal_source":"Contract Act","ai_interpretation":"Review Recommended.","citations":["Section 10"]}'
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama", "test", client)
    result = await provider.explain_finding(finding(), [source()])

    assert result.status == "EXPLAINED"
    assert result.citations == ["Section 10"]


@pytest.mark.anyio
async def test_no_sources_returns_insufficient_evidence_without_calling_model() -> None:
    provider = OllamaProvider("http://invalid.local", "test")

    result = await provider.explain_finding(finding(), [])

    assert result.status == INSUFFICIENT_LEGAL_EVIDENCE


@pytest.mark.anyio
async def test_openai_compatible_provider_supports_openrouter_response() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer test-key"
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"legal_source":"Contract Act","ai_interpretation":"Review Recommended.","citations":["Section 10"]}'
                        }
                    }
                ]
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OpenAICompatibleProvider("https://openrouter.ai/api/v1", "test-key", "test-model", client)
    result = await provider.explain_finding(finding(), [source()])

    assert result.status == "EXPLAINED"
    assert result.citations == ["Section 10"]
