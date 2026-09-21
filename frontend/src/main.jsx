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
  const [riskScore, setRiskScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState("low");
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [clauseCoverage, setClauseCoverage] = useState(null);
  const [activeTab, setActiveTab] = useState("findings");

  async function analyzeDocument(event) {
    event.preventDefault();
    if (!file) return;

    setBusy(true);
    setError("");
    setDocumentData(null);
    setFindings([]);
    setExplanations([]);
    setDocumentId(null);
    setRiskScore(0);
    setRiskLevel("low");
    setSummary("");
    setClauseCoverage(null);
    setActiveTab("findings");
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
      setRiskScore(analysis.risk_score || 0);
      setRiskLevel(analysis.risk_level || "low");

      // Fetch clause coverage
      try {
        const coverageRes = await fetch(`${API_BASE}/documents/${analysis.id}/clause-coverage`);
        if (coverageRes.ok) setClauseCoverage(await coverageRes.json());
      } catch (_) {}
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
      if (!response.ok) throw new Error(payload.detail || "AI could not explain these findings.");
      setExplanations(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setExplaining(false);
    }
  }

  async function generateSummary() {
    if (!documentId) return;
    setSummarizing(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/documents/${documentId}/summary`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "AI could not generate a summary.");
      setSummary(payload.summary);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSummarizing(false);
    }
  }

  const riskColor = riskLevel === "high" ? "#a33e2e" : riskLevel === "medium" ? "#c57b1a" : "#2e7d32";

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand-mark">LDI</div>
        <div>
          <p className="eyebrow">CLOUD-DEPLOYED / LEGAL AI</p>
          <h1>Legal Document Intelligence</h1>
        </div>
        <span className="trust-note">Human review remains essential</span>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">Evidence before interpretation</p>
          <h2>See what your agreement says, section by section.</h2>
          <p className="lede">
            Upload a digital PDF to extract its text, map detected clauses, surface
            review recommendations, and get AI-powered analysis. This tool provides document analysis, not legal advice.
          </p>
        </div>
        <div className="scope-list" aria-label="Features">
          <span>Digital PDF</span><span>India-first</span><span>AI Analysis</span><span>Risk Scoring</span>
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
            <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB ready` : "Legal documents up to 15 MB"}</span>
          </label>
          <button className="primary-button" disabled={!file || busy} type="submit">
            {busy ? "Analyzing..." : "Analyze document"}
          </button>
          {error && <p className="error" role="alert">{error}</p>}

          {/* Risk Score Dashboard */}
          {documentData && (
            <div className="risk-dashboard">
              <div className="section-label" style={{marginTop: "22px"}}><span>⚡</span> Risk Assessment</div>
              <div className="risk-meter">
                <div className="risk-score-circle" style={{borderColor: riskColor, color: riskColor}}>
                  <span className="risk-number">{riskScore}</span>
                  <span className="risk-label">/100</span>
                </div>
                <div className="risk-details">
                  <div className="risk-level-badge" style={{background: riskColor}}>
                    {riskLevel.toUpperCase()} RISK
                  </div>
                  <span className="risk-finding-count">{findings.length} finding{findings.length !== 1 ? "s" : ""} detected</span>
                </div>
              </div>
            </div>
          )}

          {/* Clause Coverage Matrix */}
          {clauseCoverage && (
            <div className="clause-coverage">
              <div className="section-label" style={{marginTop: "18px"}}><span>📋</span> Clause Coverage ({clauseCoverage.coverage_percent}%)</div>
              <div className="coverage-bar-container">
                <div className="coverage-bar" style={{width: `${clauseCoverage.coverage_percent}%`}} />
              </div>
              <div className="coverage-grid">
                {clauseCoverage.clauses.map((c) => (
                  <div key={c.clause} className={`coverage-chip ${c.present ? "present" : "missing"}`}>
                    {c.present ? "✓" : "✗"} {c.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        <section className="findings-panel">
          <div className="section-label"><span>02</span> Review findings</div>
          {!documentData && !busy && <div className="empty-state">Your extracted clauses and review recommendations will appear here.</div>}
          {busy && <div className="empty-state pulse">Reading the document...</div>}

          {/* Tab Navigation */}
          {documentData && (
            <div className="tab-bar">
              <button className={`tab-btn ${activeTab === "findings" ? "active" : ""}`} onClick={() => setActiveTab("findings")} type="button">Findings</button>
              <button className={`tab-btn ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")} type="button">AI Analysis</button>
              <button className={`tab-btn ${activeTab === "summary" ? "active" : ""}`} onClick={() => setActiveTab("summary")} type="button">Summary</button>
            </div>
          )}

          {/* Findings Tab */}
          {documentData && activeTab === "findings" && (
            <>
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
            </>
          )}

          {/* AI Analysis Tab */}
          {documentData && activeTab === "ai" && (
            <section className="ai-response-panel" aria-live="polite">
              <div className="ai-response-header">
                <div>
                  <p className="eyebrow">AI response</p>
                  <h3>Evidence-grounded review</h3>
                </div>
                <span className="ai-status">{explaining ? "Working" : explanations.length ? "Ready" : "Waiting"}</span>
              </div>
              {!explaining && !explanations.length && (
                <div className="ai-response-empty">
                  <button className="secondary-button" onClick={explainFindings} type="button">
                    Get AI Explanation
                  </button>
                </div>
              )}
              {explaining && <div className="ai-response-empty pulse">AI is analyzing each finding...</div>}
              {!explaining && explanations.map((explanation, index) => (
                <article className="ai-message" key={`ai-message-${index}`}>
                  <div className="ai-avatar">AI</div>
                  <div>
                    <div className="ai-message-status" style={{color: explanation.status === "AI_ANALYZED" ? "#2e7d32" : explanation.status === "EXPLAINED" ? "#1565c0" : "#a33e2e"}}>
                      {explanation.status === "AI_ANALYZED" ? "✦ AI Analyzed" : explanation.status === "EXPLAINED" ? "✓ Evidence-backed" : "⚠ Insufficient Evidence"}
                    </div>
                    <p>{explanation.ai_interpretation}</p>
                    {explanation.citations.length > 0 && (
                      <small>{explanation.citations.join(" · ")}</small>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}

          {/* Summary Tab */}
          {documentData && activeTab === "summary" && (
            <section className="ai-response-panel" aria-live="polite">
              <div className="ai-response-header">
                <div>
                  <p className="eyebrow">AI Summary</p>
                  <h3>Document Overview</h3>
                </div>
                <span className="ai-status">{summarizing ? "Working" : summary ? "Ready" : "Waiting"}</span>
              </div>
              {!summarizing && !summary && (
                <div className="ai-response-empty">
                  <button className="secondary-button" onClick={generateSummary} type="button">
                    Generate AI Summary
                  </button>
                </div>
              )}
              {summarizing && <div className="ai-response-empty pulse">Generating a plain-English summary of your document...</div>}
              {!summarizing && summary && (
                <div className="summary-content">
                  {summary.split("\n").filter(Boolean).map((paragraph, i) => (
                    <p key={`summary-p-${i}`}>{paragraph}</p>
                  ))}
                </div>
              )}
            </section>
          )}
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