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

## Render deployment

The repository includes `render.yaml` for a separate API web service and static frontend.
Create a Blueprint from this repository, then set these secret or deployment-specific values
in the Render dashboard:

- API: `DATABASE_URL`, `CORS_ORIGINS`, and `OPENROUTER_API_KEY`.
- Frontend: `VITE_API_BASE_URL`, set to the deployed API URL such as
	`https://legal-document-ai-api.onrender.com`.

The app remains editable after deployment: push changes to `main`, and Render will rebuild
the affected services automatically. Keep API keys only in Render environment variables,
never in GitHub.

## Local setup

The development default is SQLite, so PostgreSQL is not required to run the MVP locally.

```powershell
cd backend
python -m pip install -r requirements.txt
python -m pytest -q
python -m uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. The frontend is a Vite app:

```powershell
cd frontend
npm install
npm run dev
```

Copy `.env.example` to `.env` to configure the database. Install Ollama separately and
pull a local model such as `llama3.2:3b` when enabling local LLM explanations.

## Official law ingestion

The official PDF must be downloaded manually from India Code and placed at
`data/official/laws/indian_contract_act_1872.pdf`. Register its file checksum, then extract
and persist the verified text:

```powershell
python scripts/register_official_law.py data/official/laws/indian_contract_act_1872.pdf `
	--url "https://indiacode.gov.in/" `
	--title "The Indian Contract Act, 1872"

python scripts/ingest_official_law_pdf.py data/official/laws/indian_contract_act_1872.pdf `
	--title "The Indian Contract Act, 1872" `
	--citation "Act No. 9 of 1872" `
	--url "https://indiacode.gov.in/"
```

The loader rejects unverified or checksum-mismatched source records and avoids duplicate
database rows on repeat runs.

The implementation will be delivered phase by phase. No dataset is considered downloaded
until its file, provenance, checksum, and verification status are recorded.

## Privacy and legal limitations

Uploaded contracts may contain personal data. The MVP will support deletion and configurable
retention, but these engineering controls do not constitute DPDP Act compliance. A real
product requires legal review of privacy, retention, security, and unauthorized-practice
risks before broad release.
