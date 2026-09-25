import httpx
import pytest

from app.retrieval.retriever import INSUFFICIENT_LEGAL_EVIDENCE
from app.schemas.findings import Finding
from app.schemas.llm import EvidenceSource
from app.services.legal_llm_service import OllamaProvider, OpenAICompatibleProvider, _parse_json, _validate_citations


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
async def test_no_sources_falls_back_to_general_analysis() -> None:
    """When no retrieved sources are available, the provider falls back to general AI analysis (not INSUFFICIENT)."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "response": '{"legal_source":"Indian Contract Act 1872","ai_interpretation":"Review Recommended: the document lacks an effective date."}'
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama", "test", client)
    result = await provider.explain_finding(finding(), [])

    # With no sources, the provider should fall back to AI_ANALYZED (not INSUFFICIENT_LEGAL_EVIDENCE)
    assert result.status == "AI_ANALYZED"
    assert result.ai_interpretation != ""


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


def test_parse_json_strips_markdown_code_fences() -> None:
    """_parse_json should correctly handle JSON wrapped in markdown code fences."""
    fenced = '```json\n{"key": "value"}\n```'
    result = _parse_json(fenced)
    assert result == {"key": "value"}


def test_parse_json_handles_plain_json() -> None:
    """_parse_json should handle plain JSON without code fences."""
    plain = '{"legal_source": "test", "ai_interpretation": "ok"}'
    result = _parse_json(plain)
    assert result["legal_source"] == "test"


def test_validate_citations_rejects_hallucinated_citation() -> None:
    """_validate_citations should raise ValueError when LLM returns a citation not in the sources."""
    sources = [source()]
    payload = {
        "legal_source": "Contract Act",
        "ai_interpretation": "Review Recommended.",
        "citations": ["HALLUCINATED_CITATION"],  # Not in sources
    }
    with pytest.raises(ValueError, match="citations did not match"):
        _validate_citations(payload, finding(), sources)
