# Legal Document Intelligence

India-first, local-first legal document analysis for a deliberately narrow MVP.

This is an AI-assisted document analysis and legal-information tool. It is not an AI lawyer,
does not provide legal advice, and does not replace review by a qualified legal professional.
Potential findings require human review.

## MVP v1 scope

- Document type: NDA
- Input: digital PDF only
- Clause segmentation: reduced, rule-based taxonomy
- Legal retrieval: verified Indian Contract Act material from India Code only
- Findings: deterministic checks for missing clauses, dates, and jurisdiction
- LLM: local Ollama, used only to explain findings with validated evidence
- User model: single-user local tool; no authentication yet

OCR, DOCX, chat, additional document types, judgments, research-based classifiers,
authentication, and production hardening are later phases and are intentionally excluded.

## Free/local cost policy

The default design requires no paid API:

- PDF parsing: local Python libraries
- Embeddings: local sentence-transformers model
- LLM explanations: local Ollama model
- Database: local PostgreSQL for the target architecture

Groq or another OpenAI-compatible provider may be added as an optional remote provider.
It is not required, and sending contracts to a remote provider has additional privacy and
cost implications. API keys must remain server-side and must never be committed.

Render deployment is supported as a deployment target, but Render pricing, sleep behavior,
storage persistence, and managed PostgreSQL availability depend on the current account plan.
This project does not claim that hosted deployment is free or DPDP Act compliant.

## Planned local setup

1. Install PostgreSQL locally.
2. Install Ollama and pull a small model such as `llama3.2:3b`.
3. Copy `.env.example` to `.env` and adjust local values.
4. Install backend dependencies from `backend/requirements.txt` once Phase 2 begins.

The implementation will be delivered phase by phase. No dataset is considered downloaded
until its file, provenance, checksum, and verification status are recorded.

## Privacy and legal limitations

Uploaded contracts may contain personal data. The MVP will support deletion and configurable
retention, but these engineering controls do not constitute DPDP Act compliance. A real
product requires legal review of privacy, retention, security, and unauthorized-practice
risks before broad release.
