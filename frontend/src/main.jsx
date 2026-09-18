import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function App() {
  const [file, setFile] = useState(null);
  const [documentData, setDocumentData] = useState(null);
  const [findings, setFindings] = useState([]);
  const [explanations, setExplanations] = useState([]);
  const [documentId, setDocumentId] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyzeDocument(event) {
    event.preventDefault();
    if (!file) return;

    setBusy(true);
    setError("");
    setDocumentData(null);
    setFindings([]);
    setExplanations([]);
    setDocumentId(null);
    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch(`${API_BASE}/documents/analyze`, { method: "POST", body });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "The document could not be analyzed.");
      }
      const analysis = await response.json();
      setDocumentId(analysis.id);
      setDocumentData(analysis.document);
      setFindings(analysis.findings);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function explainFindings() {
    if (!documentId) return;
    setExplaining(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/documents/${documentId}/explain`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Local AI could not explain these findings.");
      setExplanations(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setExplaining(false);
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand-mark">LDI</div>
        <div>
          <p className="eyebrow">LOCAL-FIRST / NDA MVP</p>
          <h1>Legal Document Intelligence</h1>
        </div>
        <span className="trust-note">Human review remains essential</span>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">Evidence before interpretation</p>
          <h2>See what your agreement says, section by section.</h2>
          <p className="lede">
            Upload a digital NDA to extract its text, map detected clauses, and surface
            review recommendations. This tool provides document analysis, not legal advice.
          </p>
        </div>
        <div className="scope-list" aria-label="MVP scope">
          <span>Digital PDF</span><span>India-first</span><span>Traceable findings</span>
        </div>
      </section>

      <section className="workspace">
        <form className="upload-panel" onSubmit={analyzeDocument}>
          <div className="section-label"><span>01</span> Add document</div>
          <label className="drop-zone">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <strong>{file ? file.name : "Choose a digital PDF"}</strong>
            <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB ready` : "NDA files up to 15 MB"}</span>
          </label>
          <button className="primary-button" disabled={!file || busy} type="submit">
            {busy ? "Analyzing..." : "Analyze document"}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>

        <section className="findings-panel">
          <div className="section-label"><span>02</span> Review findings</div>
          {!documentData && !busy && <div className="empty-state">Your extracted clauses and review recommendations will appear here.</div>}
          {busy && <div className="empty-state pulse">Reading the document locally...</div>}
          {documentData && <button className="secondary-button" disabled={explaining} onClick={explainFindings} type="button">
            {explaining ? "Asking local AI..." : "Explain with local AI"}
          </button>}
          {documentData && (
            <section className="ai-response-panel" aria-live="polite">
              <div className="ai-response-header">
                <div>
                  <p className="eyebrow">AI response</p>
                  <h3>Evidence-grounded review</h3>
                </div>
                <span className="ai-status">{explaining ? "Working" : explanations.length ? "Ready" : "Waiting"}</span>
              </div>
              {explaining && <div className="ai-response-empty pulse">Reviewing findings against official legal sources...</div>}
              {!explaining && !explanations.length && (
                <div className="ai-response-empty">Select “Explain with local AI” to see the response here.</div>
              )}
              {!explaining && explanations.map((explanation, index) => (
                <article className="ai-message" key={`ai-message-${index}`}>
                  <div className="ai-avatar">AI</div>
                  <div>
                    <p>{explanation.ai_interpretation}</p>
                    <small>{explanation.citations.join(" · ") || "No validated citation returned"}</small>
                  </div>
                </article>
              ))}
            </section>
          )}
          {findings.map((finding, index) => (
            <article className="finding" key={`${finding.finding_type}-${index}`}>
              <div className="finding-marker">!</div>
              <div>
                <div className="finding-title">{finding.finding_type.replaceAll("_", " ")}</div>
                <p>{finding.document_fact}</p>
                <small>{finding.ai_interpretation}</small>
              </div>
            </article>
          ))}
        </section>
      </section>

      {documentData && (
        <section className="document-viewer">
          <div className="viewer-header">
            <div>
              <div className="section-label"><span>03</span> Extracted document</div>
              <h3>{documentData.filename}</h3>
            </div>
            <span className="page-count">{documentData.page_count} page{documentData.page_count === 1 ? "" : "s"}</span>
          </div>
          <div className="clause-grid">
            {documentData.pages.flatMap((page) => page.blocks.map((block, index) => (
              <article className="clause-card" key={`${page.page_number}-${index}`}>
                <span>Page {page.page_number}</span>
                <p>{block.text}</p>
              </article>
            )))}
          </div>
        </section>
      )}

      <footer>AI-assisted document analysis only. Potential findings require qualified human legal review.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);