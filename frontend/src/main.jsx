import { StrictMode, useState, useEffect } from "react";
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
  const [docType, setDocType] = useState("");

  // Compare feature
  const [compareMode, setCompareMode] = useState(false);
  const [compareFile1, setCompareFile1] = useState(null);
  const [compareFile2, setCompareFile2] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  // History feature
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
    setDocType("");
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
      setDocType(analysis.doc_type || "");
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

  async function compareDocuments(event) {
    event.preventDefault();
    if (!compareFile1 || !compareFile2) return;
    setComparing(true);
    setError("");
    setCompareResult(null);
    const body = new FormData();
    body.append("file1", compareFile1);
    body.append("file2", compareFile2);
    try {
      const response = await fetch(`${API_BASE}/documents/compare`, { method: "POST", body });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "Comparison failed.");
      }
      setCompareResult(await response.json());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setComparing(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${API_BASE}/documents/history/all`);
      if (response.ok) setHistory(await response.json());
    } catch (_) {}
    setLoadingHistory(false);
  }

  function exportReport() {
    const w = window.open("", "_blank");
    const rColor = riskLevel === "high" ? "#a33e2e" : riskLevel === "medium" ? "#c57b1a" : "#2e7d32";
    const findingsHtml = findings.map(f =>
      `<tr><td style="padding:8px;border:1px solid #ddd;text-transform:capitalize">${f.finding_type.replaceAll("_"," ")}</td><td style="padding:8px;border:1px solid #ddd">${f.document_fact}</td><td style="padding:8px;border:1px solid #ddd">${f.severity}</td></tr>`
    ).join("");
    const coverageHtml = clauseCoverage ? clauseCoverage.clauses.map(c =>
      `<tr><td style="padding:6px;border:1px solid #ddd;text-transform:capitalize">${c.label}</td><td style="padding:6px;border:1px solid #ddd;color:${c.present ? '#2e7d32' : '#a33e2e'}">${c.present ? '✓ Present' : '✗ Missing'}</td></tr>`
    ).join("") : "";
    w.document.write(`<!DOCTYPE html><html><head><title>Legal Analysis Report</title>
      <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#183b56}
      h1{border-bottom:3px solid #d56543;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:16px 0}
      .badge{display:inline-block;padding:4px 12px;color:#fff;font-weight:bold;font-size:12px}
      @media print{body{margin:0}}</style></head>
      <body><h1>Legal Document Analysis Report</h1>
      <p><strong>File:</strong> ${documentData?.filename || 'N/A'}</p>
      <p><strong>Document Type:</strong> ${(docType || 'General').replace('_',' ').toUpperCase()}</p>
      <p><strong>Pages:</strong> ${documentData?.page_count || 'N/A'}</p>
      <p><strong>Risk Score:</strong> <span class="badge" style="background:${rColor}">${riskScore}/100 ${riskLevel.toUpperCase()}</span></p>
      ${clauseCoverage ? `<h2>Clause Coverage (${clauseCoverage.coverage_percent}%)</h2><table><tr><th style="padding:6px;border:1px solid #ddd;text-align:left">Clause</th><th style="padding:6px;border:1px solid #ddd;text-align:left">Status</th></tr>${coverageHtml}</table>` : ''}
      <h2>Findings (${findings.length})</h2>
      ${findings.length ? `<table><tr><th style="padding:8px;border:1px solid #ddd;text-align:left">Type</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Detail</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Severity</th></tr>${findingsHtml}</table>` : '<p>No findings.</p>'}
      ${summary ? `<h2>AI Summary</h2><p>${summary.replace(/\n/g,'</p><p>')}</p>` : ''}
      <hr><p style="color:#718087;font-size:11px">AI-assisted analysis only. Not legal advice. Generated ${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close();
    w.print();
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
        <div className="header-actions">
          <button className="header-btn" type="button" onClick={() => { setCompareMode(false); setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}>
            {showHistory ? "← Back" : "📁 History"}
          </button>
          <button className="header-btn" type="button" onClick={() => { setShowHistory(false); setCompareMode(!compareMode); setCompareResult(null); }}>
            {compareMode ? "← Back" : "⚖ Compare"}
          </button>
        </div>
      </header>

      {/* History View */}
      {showHistory && (
        <section className="history-panel">
          <div className="section-label"><span>📁</span> Analysis History</div>
          {loadingHistory && <div className="empty-state pulse">Loading history...</div>}
          {!loadingHistory && history.length === 0 && <div className="empty-state">No documents analyzed yet.</div>}
          {!loadingHistory && history.map((doc) => (
            <div className="history-item" key={doc.id}>
              <div className="history-filename">{doc.filename}</div>
              <div className="history-meta">
                <span>{doc.findings_count} finding{doc.findings_count !== 1 ? "s" : ""}</span>
                <span>{doc.clauses_count} clause{doc.clauses_count !== 1 ? "s" : ""}</span>
                <span>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ""}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Compare View */}
      {compareMode && !showHistory && (
        <section className="compare-panel">
          <div className="section-label"><span>⚖</span> Compare Two Documents</div>
          <form className="compare-form" onSubmit={compareDocuments}>
            <div className="compare-inputs">
              <label className="drop-zone compare-drop">
                <input type="file" accept=".pdf" onChange={(e) => setCompareFile1(e.target.files?.[0] || null)} />
                <strong>{compareFile1 ? compareFile1.name : "Document 1"}</strong>
              </label>
              <span className="compare-vs">VS</span>
              <label className="drop-zone compare-drop">
                <input type="file" accept=".pdf" onChange={(e) => setCompareFile2(e.target.files?.[0] || null)} />
                <strong>{compareFile2 ? compareFile2.name : "Document 2"}</strong>
              </label>
            </div>
            <button className="primary-button" disabled={!compareFile1 || !compareFile2 || comparing} type="submit">
              {comparing ? "Comparing..." : "Compare Documents"}
            </button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
          {compareResult && (
            <div className="compare-results">
              <div className="compare-summary">
                <div className="compare-doc-card">
                  <div className="compare-doc-name">{compareResult.doc1.filename}</div>
                  <div className="compare-doc-type">{(compareResult.doc1.doc_type || 'general').replace('_',' ')}</div>
                  <div className="risk-level-badge" style={{background: compareResult.doc1.risk_level === "high" ? "#a33e2e" : compareResult.doc1.risk_level === "medium" ? "#c57b1a" : "#2e7d32"}}>
                    {compareResult.doc1.risk_score}/100 {compareResult.doc1.risk_level.toUpperCase()}
                  </div>
                  <span className="risk-finding-count">{compareResult.doc1.findings_count} findings</span>
                </div>
                <div className="compare-doc-card">
                  <div className="compare-doc-name">{compareResult.doc2.filename}</div>
                  <div className="compare-doc-type">{(compareResult.doc2.doc_type || 'general').replace('_',' ')}</div>
                  <div className="risk-level-badge" style={{background: compareResult.doc2.risk_level === "high" ? "#a33e2e" : compareResult.doc2.risk_level === "medium" ? "#c57b1a" : "#2e7d32"}}>
                    {compareResult.doc2.risk_score}/100 {compareResult.doc2.risk_level.toUpperCase()}
                  </div>
                  <span className="risk-finding-count">{compareResult.doc2.findings_count} findings</span>
                </div>
              </div>
              <div className="section-label" style={{marginTop:"18px"}}><span>📋</span> Clause Comparison</div>
              <table className="compare-table">
                <thead><tr><th>Clause</th><th>{compareResult.doc1.filename}</th><th>{compareResult.doc2.filename}</th></tr></thead>
                <tbody>
                  {compareResult.clause_comparison.map(c => (
                    <tr key={c.clause}>
                      <td>{c.label}</td>
                      <td style={{color: c.in_doc1 ? "#2e7d32" : "#a33e2e"}}>{c.in_doc1 ? "✓ Present" : "✗ Missing"}</td>
                      <td style={{color: c.in_doc2 ? "#2e7d32" : "#a33e2e"}}>{c.in_doc2 ? "✓ Present" : "✗ Missing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Main Analysis View */}
      {!compareMode && !showHistory && (
        <>
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
              <span>Digital PDF</span><span>India-first</span><span>AI Analysis</span><span>Risk Scoring</span><span>Doc Compare</span><span>Export Report</span>
            </div>
          </section>

          <section className="workspace">
            <form className="upload-panel" onSubmit={analyzeDocument}>
              <div className="section-label"><span>01</span> Add document</div>
              <label className="drop-zone">
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                <strong>{file ? file.name : "Choose a digital PDF"}</strong>
                <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB ready` : "Legal documents up to 15 MB"}</span>
              </label>
              <button className="primary-button" disabled={!file || busy} type="submit">
                {busy ? "Analyzing..." : "Analyze document"}
              </button>
              {error && <p className="error" role="alert">{error}</p>}

              {documentData && (
                <div className="risk-dashboard">
                  <div className="section-label" style={{marginTop: "22px"}}><span>⚡</span> Risk Assessment</div>
                  {docType && <div className="doc-type-badge">{docType.replace('_',' ').toUpperCase()}</div>}
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
                  <button className="export-btn" type="button" onClick={exportReport}>📄 Export Report</button>
                </div>
              )}

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

              {documentData && (
                <div className="tab-bar">
                  <button className={`tab-btn ${activeTab === "findings" ? "active" : ""}`} onClick={() => setActiveTab("findings")} type="button">Findings</button>
                  <button className={`tab-btn ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")} type="button">AI Analysis</button>
                  <button className={`tab-btn ${activeTab === "summary" ? "active" : ""}`} onClick={() => setActiveTab("summary")} type="button">Summary</button>
                </div>
              )}

              {documentData && activeTab === "findings" && (
                <>
                  {findings.length === 0 && <div className="empty-state">No issues found — this document looks well-structured.</div>}
                  {findings.map((finding, index) => (
                    <article className="finding" key={`${finding.finding_type}-${index}`}>
                      <div className="finding-marker">{finding.severity === "high" ? "‼" : finding.severity === "low" ? "ℹ" : "!"}</div>
                      <div>
                        <div className="finding-title">
                          {finding.finding_type.replaceAll("_", " ")}
                          <span className={`severity-tag severity-${finding.severity}`}>{finding.severity}</span>
                        </div>
                        <p>{finding.document_fact}</p>
                        <small>{finding.ai_interpretation}</small>
                      </div>
                    </article>
                  ))}
                </>
              )}

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
                      <button className="secondary-button" onClick={explainFindings} type="button">Get AI Explanation</button>
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
                        {explanation.citations.length > 0 && <small>{explanation.citations.join(" · ")}</small>}
                      </div>
                    </article>
                  ))}
                </section>
              )}

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
                      <button className="secondary-button" onClick={generateSummary} type="button">Generate AI Summary</button>
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
        </>
      )}

      <footer>AI-assisted document analysis only. Potential findings require qualified human legal review.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);