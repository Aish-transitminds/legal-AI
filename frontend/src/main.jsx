import { StrictMode, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { TourOverlay, TourHelpButton, useTour } from "./components/Tour.jsx";
import * as api from "./services/api.js";

// ── Risk calculation helper (mirrors backend logic) ──────────
function getRiskColor(level) {
  if (level === "high") return "#a33e2e";
  if (level === "medium") return "#c57b1a";
  return "#2e7d32";
}

// ── Utility: Export HTML report ──────────────────────────────
function buildReportHtml({ documentData, docType, riskScore, riskLevel, findings, clauseCoverage, summary }) {
  const rc = getRiskColor(riskLevel);
  const fh = findings
    .map(
      (f) =>
        `<tr><td style="padding:8px;border:1px solid #ddd;text-transform:capitalize">${f.finding_type.replaceAll("_", " ")}</td><td style="padding:8px;border:1px solid #ddd">${f.document_fact}</td><td style="padding:8px;border:1px solid #ddd">${f.severity}</td></tr>`
    )
    .join("");
  const ch = clauseCoverage
    ? clauseCoverage.clauses
        .map(
          (c) =>
            `<tr><td style="padding:6px;border:1px solid #ddd">${c.label}</td><td style="padding:6px;border:1px solid #ddd;color:${c.present ? "#2e7d32" : "#a33e2e"}">${c.present ? "✓ Present" : "✗ Missing"}</td></tr>`
        )
        .join("")
    : "";

  return `<!DOCTYPE html><html><head><title>Legal Analysis Report</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#183b56}
h1{border-bottom:3px solid #d56543;padding-bottom:10px}
table{width:100%;border-collapse:collapse;margin:16px 0}
.badge{display:inline-block;padding:4px 12px;color:#fff;font-weight:bold;font-size:12px}
@media print{body{margin:0}}</style></head><body>
<h1>Legal Document Analysis Report</h1>
<p><strong>File:</strong> ${documentData?.filename || "N/A"}</p>
<p><strong>Type:</strong> ${(docType || "General").replace("_", " ").toUpperCase()}</p>
<p><strong>Risk:</strong> <span class="badge" style="background:${rc}">${riskScore}/100 ${riskLevel.toUpperCase()}</span></p>
${clauseCoverage ? `<h2>Coverage (${clauseCoverage.coverage_percent}%)</h2><table><tr><th style="padding:6px;border:1px solid #ddd;text-align:left">Clause</th><th style="padding:6px;border:1px solid #ddd;text-align:left">Status</th></tr>${ch}</table>` : ""}
<h2>Findings (${findings.length})</h2>
${findings.length ? `<table><tr><th style="padding:8px;border:1px solid #ddd;text-align:left">Type</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Detail</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Severity</th></tr>${fh}</table>` : "<p>No findings.</p>"}
${summary ? `<h2>AI Summary</h2><p>${summary.replace(/\n/g, "</p><p>")}</p>` : ""}
<hr><p style="color:#718087;font-size:11px">AI-assisted analysis. Not legal advice. ${new Date().toLocaleString()}</p>
</body></html>`;
}

function exportReport(reportData) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(buildReportHtml(reportData));
  w.document.close();
  w.print();
}

// ── App Component ─────────────────────────────────────────────
function App() {
  // ── Document analysis state
  const [file, setFile] = useState(null);
  const [documentData, setDocumentData] = useState(null);
  const [findings, setFindings] = useState([]);
  const [explanations, setExplanations] = useState([]);
  const [documentId, setDocumentId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [riskScore, setRiskScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState("low");
  const [docType, setDocType] = useState("");
  const [clauseCoverage, setClauseCoverage] = useState(null);
  const [activeTab, setActiveTab] = useState("findings");

  // ── AI feature state
  const [explaining, setExplaining] = useState(false);
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  // ── Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  // ── Clause tools state
  const [draftingClause, setDraftingClause] = useState("");
  const [draftedClauses, setDraftedClauses] = useState({});
  const [simplifiedClauses, setSimplifiedClauses] = useState({});
  const [simplifyingIdx, setSimplifyingIdx] = useState(null);

  // ── Fairness state
  const [fairnessIssues, setFairnessIssues] = useState([]);
  const [checkingFairness, setCheckingFairness] = useState(false);

  // ── Compliance state
  const [selectedState, setSelectedState] = useState("");
  const [complianceData, setComplianceData] = useState(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [states, setStates] = useState([]);

  // ── Compare state
  const [compareMode, setCompareMode] = useState(false);
  const [compareFile1, setCompareFile1] = useState(null);
  const [compareFile2, setCompareFile2] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  // ── History state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Tour
  const tour = useTour();

  // ── Handlers ─────────────────────────────────────────────────

  function resetAnalysisState() {
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
    setChatMessages([]);
    setDraftedClauses({});
    setSimplifiedClauses({});
    setFairnessIssues([]);
    setComplianceData(null);
    setSelectedState("");
  }

  async function analyzeDocument(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    resetAnalysisState();

    try {
      const analysis = await api.analyzeDocument(file);
      setDocumentId(analysis.id);
      setDocumentData(analysis.document);
      setFindings(analysis.findings);
      setRiskScore(analysis.risk_score ?? 0);
      setRiskLevel(analysis.risk_level ?? "low");
      setDocType(analysis.doc_type ?? "");

      // Load clause coverage and states in parallel — don't block on these
      Promise.all([
        api.fetchClauseCoverage(analysis.id).then(setClauseCoverage).catch(() => {}),
        api.fetchComplianceStates().then(setStates).catch(() => {}),
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function explainFindings() {
    if (!documentId) return;
    setExplaining(true);
    setError("");
    try {
      const data = await api.explainFindings(documentId);
      setExplanations(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setExplaining(false);
    }
  }

  async function generateSummary() {
    if (!documentId) return;
    setSummarizing(true);
    setError("");
    try {
      const data = await api.generateSummary(documentId);
      setSummary(data.summary);
    } catch (e) {
      setError(e.message);
    } finally {
      setSummarizing(false);
    }
  }

  async function sendChat(e) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || !documentId) return;
    setChatInput("");
    setChatBusy(true);
    setChatMessages((prev) => [...prev, { role: "user", text: q }]);
    try {
      const data = await api.chatWithDocument(documentId, q);
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", text: data.answer || "No answer.", sources: data.source_clauses || [] },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", text: "Failed to get an answer. Please try again." },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function draftClause(clauseType) {
    setDraftingClause(clauseType);
    try {
      const data = await api.draftClause(documentId, clauseType, docType || "general");
      setDraftedClauses((prev) => ({ ...prev, [clauseType]: data.drafted_text || "Draft failed." }));
    } catch {
      setDraftedClauses((prev) => ({ ...prev, [clauseType]: "Failed to generate draft." }));
    } finally {
      setDraftingClause("");
    }
  }

  async function simplifyClause(idx, text) {
    setSimplifyingIdx(idx);
    try {
      const data = await api.simplifyClause(documentId, text);
      setSimplifiedClauses((prev) => ({ ...prev, [idx]: data.simple_text || "Simplification failed." }));
    } catch {
      setSimplifiedClauses((prev) => ({ ...prev, [idx]: "Simplification failed." }));
    } finally {
      setSimplifyingIdx(null);
    }
  }

  async function checkFairness() {
    if (!documentId) return;
    setCheckingFairness(true);
    try {
      const data = await api.checkFairness(documentId);
      setFairnessIssues(Array.isArray(data) ? data : []);
    } catch {
      setFairnessIssues([]);
    } finally {
      setCheckingFairness(false);
    }
  }

  async function loadCompliance(stateCode) {
    setSelectedState(stateCode);
    if (!stateCode) {
      setComplianceData(null);
      return;
    }
    setLoadingCompliance(true);
    try {
      const data = await api.fetchStateCompliance(documentId, stateCode);
      setComplianceData(data);
    } catch {
      setComplianceData(null);
    } finally {
      setLoadingCompliance(false);
    }
  }

  async function compareDocuments(event) {
    event.preventDefault();
    if (!compareFile1 || !compareFile2) return;
    setComparing(true);
    setError("");
    setCompareResult(null);
    try {
      const data = await api.compareDocuments(compareFile1, compareFile2);
      setCompareResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setComparing(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await api.fetchHistory();
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  const riskColor = getRiskColor(riskLevel);

  // ── Render ────────────────────────────────────────────────────
  return (
    <main className="shell">
      {/* ── Tour ── */}
      <TourOverlay
        isActive={tour.isActive}
        stepIndex={tour.stepIndex}
        onNext={tour.nextStep}
        onBack={tour.prevStep}
        onSkip={tour.endTour}
      />
      <TourHelpButton onStart={tour.startTour} />

      {/* ── Header ── */}
      <header className="masthead">
        <div className="brand-mark" aria-hidden="true">LDI</div>
        <div>
          <p className="eyebrow">Cloud-Deployed / Legal AI</p>
          <h1>Legal Document Intelligence</h1>
        </div>
        <div className="header-actions">
          <button
            id="tour-history-btn"
            className="header-btn"
            type="button"
            onClick={() => {
              setCompareMode(false);
              setShowHistory(!showHistory);
              if (!showHistory) loadHistory();
            }}
          >
            {showHistory ? "← Back" : "📁 History"}
          </button>
          <button
            id="tour-compare-btn"
            className="header-btn"
            type="button"
            onClick={() => {
              setShowHistory(false);
              setCompareMode(!compareMode);
              setCompareResult(null);
            }}
          >
            {compareMode ? "← Back" : "⚖ Compare"}
          </button>
        </div>
      </header>

      {/* ── History Panel ── */}
      {showHistory && (
        <section className="history-panel" aria-label="Analysis history">
          <div className="section-label"><span>📁</span> Analysis History</div>
          {loadingHistory && <div className="empty-state pulse">Loading history…</div>}
          {!loadingHistory && history.length === 0 && (
            <div className="empty-state">No analyzed documents yet. Upload a document to get started.</div>
          )}
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

      {/* ── Compare Panel ── */}
      {compareMode && !showHistory && (
        <section className="compare-panel" aria-label="Document comparison">
          <div className="section-label"><span>⚖</span> Compare Two Documents</div>
          <form className="compare-form" onSubmit={compareDocuments}>
            <div className="compare-inputs">
              <label className="drop-zone compare-drop">
                <input type="file" accept=".pdf,application/pdf" onChange={(e) => setCompareFile1(e.target.files?.[0] || null)} />
                <strong>{compareFile1 ? compareFile1.name : "Document 1"}</strong>
              </label>
              <span className="compare-vs" aria-hidden="true">VS</span>
              <label className="drop-zone compare-drop">
                <input type="file" accept=".pdf,application/pdf" onChange={(e) => setCompareFile2(e.target.files?.[0] || null)} />
                <strong>{compareFile2 ? compareFile2.name : "Document 2"}</strong>
              </label>
            </div>
            <button
              className="primary-button"
              disabled={!compareFile1 || !compareFile2 || comparing}
              type="submit"
            >
              {comparing ? "Comparing…" : "Compare Documents"}
            </button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
          {compareResult && (
            <div className="compare-results">
              <div className="compare-summary">
                {[compareResult.doc1, compareResult.doc2].map((d, i) => (
                  <div className="compare-doc-card" key={i}>
                    <div className="compare-doc-name">{d.filename}</div>
                    <div className="compare-doc-type">{(d.doc_type || "general").replace("_", " ")}</div>
                    <div
                      className="risk-level-badge"
                      style={{ background: getRiskColor(d.risk_level) }}
                    >
                      {d.risk_score}/100 {d.risk_level.toUpperCase()}
                    </div>
                    <span className="risk-finding-count">{d.findings_count} finding{d.findings_count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Clause</th>
                    <th>Doc 1</th>
                    <th>Doc 2</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResult.clause_comparison.map((c) => (
                    <tr key={c.clause}>
                      <td>{c.label}</td>
                      <td style={{ color: c.in_doc1 ? "#2e7d32" : "#a33e2e" }}>{c.in_doc1 ? "✓" : "✗"}</td>
                      <td style={{ color: c.in_doc2 ? "#2e7d32" : "#a33e2e" }}>{c.in_doc2 ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Main Workspace ── */}
      {!compareMode && !showHistory && (
        <>
          <section className="intro" aria-label="Introduction">
            <div>
              <p className="eyebrow">Evidence before interpretation</p>
              <h2>See what your agreement says, section by section.</h2>
              <p className="lede">
                Upload a digital PDF to extract its text, map detected clauses, surface review
                recommendations, and get AI-powered analysis.
              </p>
            </div>
            <div className="scope-list" aria-label="Features">
              <span>AI Chat</span>
              <span>Clause Drafting</span>
              <span>Fairness Check</span>
              <span>State Compliance</span>
              <span>Doc Compare</span>
              <span>Export Report</span>
            </div>
          </section>

          <section className="workspace">
            {/* ── Upload Panel ── */}
            <form className="upload-panel" onSubmit={analyzeDocument} aria-label="Document upload">
              <div className="section-label"><span>01</span> Add document</div>
              <label className="drop-zone" id="tour-upload-zone" htmlFor="file-input">
                <input
                  id="file-input"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <strong>{file ? file.name : "Choose a digital PDF"}</strong>
                <span>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(2)} MB ready`
                    : "Legal documents up to 15 MB"}
                </span>
              </label>

              <button
                id="tour-analyze-btn"
                className="primary-button"
                disabled={!file || busy}
                type="submit"
                aria-busy={busy}
              >
                {busy ? "Analyzing…" : "Analyze document"}
              </button>

              {error && <p className="error" role="alert">{error}</p>}

              {/* ── Risk Dashboard ── */}
              {documentData && (
                <div className="risk-dashboard" aria-label="Risk assessment">
                  <div className="section-label" style={{ marginTop: "22px" }}>
                    <span>⚡</span> Risk Assessment
                  </div>
                  {docType && (
                    <div className="doc-type-badge">
                      {docType.replace(/_/g, " ").toUpperCase()}
                    </div>
                  )}
                  <div className="risk-meter">
                    <div
                      className="risk-score-circle"
                      style={{ borderColor: riskColor, color: riskColor }}
                      aria-label={`Risk score: ${riskScore} out of 100`}
                    >
                      <span className="risk-number">{riskScore}</span>
                      <span className="risk-label">/100</span>
                    </div>
                    <div className="risk-details">
                      <div className="risk-level-badge" style={{ background: riskColor }}>
                        {riskLevel.toUpperCase()} RISK
                      </div>
                      <span className="risk-finding-count">
                        {findings.length} finding{findings.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    className="export-btn"
                    type="button"
                    onClick={() =>
                      exportReport({ documentData, docType, riskScore, riskLevel, findings, clauseCoverage, summary })
                    }
                  >
                    📄 Export Report
                  </button>

                  {/* State Compliance */}
                  {states.length > 0 && (
                    <div className="state-compliance">
                      <div className="section-label" style={{ marginTop: "14px" }}>
                        <span>🇮🇳</span> State Compliance
                      </div>
                      <select
                        className="state-select"
                        value={selectedState}
                        onChange={(e) => loadCompliance(e.target.value)}
                        aria-label="Select state for compliance check"
                      >
                        <option value="">Select your state…</option>
                        {states.map((s) => (
                          <option key={s.code} value={s.code}>{s.name}</option>
                        ))}
                      </select>
                      {loadingCompliance && (
                        <div className="pulse" style={{ fontSize: "12px", padding: "8px" }}>
                          Loading compliance data…
                        </div>
                      )}
                      {complianceData && (
                        <div className="compliance-info">
                          <div className="compliance-row">
                            <strong>Stamp Duty:</strong>{" "}
                            {complianceData.stamp_duty || complianceData.stamp_duty_lease || "N/A"}
                          </div>
                          <div className="compliance-row">
                            <strong>Registration:</strong> {complianceData.registration_required}
                          </div>
                          <div className="compliance-row">
                            <strong>Registration Fee:</strong> {complianceData.registration_fee}
                          </div>
                          {complianceData.rent_control && (
                            <div className="compliance-row">
                              <strong>Rent Control:</strong> {complianceData.rent_control}
                            </div>
                          )}
                          <div className="compliance-row">
                            <strong>Key Acts:</strong> {complianceData.key_acts?.join(", ")}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Clause Coverage */}
              {clauseCoverage && (
                <div className="clause-coverage" aria-label="Clause coverage">
                  <div className="section-label" style={{ marginTop: "18px" }}>
                    <span>📋</span> Clause Coverage ({clauseCoverage.coverage_percent}%)
                  </div>
                  <div
                    className="coverage-bar-container"
                    role="progressbar"
                    aria-valuenow={clauseCoverage.coverage_percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="coverage-bar"
                      style={{ width: `${clauseCoverage.coverage_percent}%` }}
                    />
                  </div>
                  <div className="coverage-grid">
                    {clauseCoverage.clauses.map((c) => (
                      <div
                        key={c.clause}
                        className={`coverage-chip ${c.present ? "present" : "missing"}`}
                      >
                        {c.present ? "✓" : "✗"} {c.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>

            {/* ── Findings Panel ── */}
            <section
              className="findings-panel"
              id="tour-findings-panel"
              aria-label="Analysis results"
              aria-live="polite"
            >
              <div className="section-label"><span>02</span> Review findings</div>

              {!documentData && !busy && (
                <div className="empty-state">Your analysis will appear here after uploading a document.</div>
              )}
              {busy && <div className="empty-state pulse">Reading the document…</div>}

              {documentData && (
                <div className="tab-bar" role="tablist">
                  {[
                    { id: "findings", label: "Findings" },
                    { id: "ai", label: "AI Analysis" },
                    { id: "summary", label: "Summary" },
                    { id: "chat", label: "💬 Chat" },
                    { id: "fairness", label: "⚖ Fairness" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                      onClick={() => setActiveTab(tab.id)}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Findings Tab */}
              {documentData && activeTab === "findings" && (
                <div role="tabpanel">
                  {findings.length === 0 && (
                    <div className="empty-state">✓ No issues detected in this document.</div>
                  )}
                  {findings.map((f, i) => {
                    const clauseMatch =
                      f.finding_type === "missing_clause" &&
                      f.document_fact.match(/No (\w[\w\s]*) clause/i);
                    const clauseKey = clauseMatch
                      ? clauseMatch[1].trim().toLowerCase().replace(/\s+/g, "_")
                      : null;
                    return (
                      <article className="finding" key={`${f.finding_type}-${i}`}>
                        <div className="finding-marker" aria-hidden="true">
                          {f.finding_type === "incomplete_draft"
                            ? "✍"
                            : f.severity === "high"
                            ? "‼"
                            : f.severity === "low"
                            ? "ℹ"
                            : "!"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="finding-title">
                            {f.finding_type.replaceAll("_", " ")}
                            <span className={`severity-tag severity-${f.severity}`}>{f.severity}</span>
                          </div>
                          <p>{f.document_fact}</p>
                          {f.ai_interpretation && <small>{f.ai_interpretation}</small>}
                          {clauseKey && (
                            <div style={{ marginTop: "8px" }}>
                              {draftedClauses[clauseKey] ? (
                                <div className="drafted-clause">
                                  <div className="drafted-header">
                                    ✨ AI-Drafted Clause
                                    <button
                                      className="copy-btn"
                                      type="button"
                                      onClick={() => navigator.clipboard.writeText(draftedClauses[clauseKey])}
                                    >
                                      Copy
                                    </button>
                                  </div>
                                  <p>{draftedClauses[clauseKey]}</p>
                                  <small className="disclaimer">
                                    AI-generated draft. Must be reviewed by a legal professional before use.
                                  </small>
                                </div>
                              ) : (
                                <button
                                  className="draft-btn"
                                  disabled={draftingClause === clauseKey}
                                  onClick={() => draftClause(clauseKey)}
                                  type="button"
                                >
                                  {draftingClause === clauseKey ? "Drafting…" : "✨ Draft Clause"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* AI Analysis Tab */}
              {documentData && activeTab === "ai" && (
                <section className="ai-response-panel" aria-live="polite" role="tabpanel">
                  <div className="ai-response-header">
                    <div>
                      <p className="eyebrow">AI Response</p>
                      <h3>Evidence-grounded review</h3>
                    </div>
                    <span className="ai-status">
                      {explaining ? "Working…" : explanations.length ? "Ready" : "Waiting"}
                    </span>
                  </div>
                  {!explaining && !explanations.length && (
                    <div className="ai-response-empty">
                      <button className="secondary-button" onClick={explainFindings} type="button">
                        Get AI Explanation
                      </button>
                    </div>
                  )}
                  {explaining && (
                    <div className="ai-response-empty pulse">AI is analyzing…</div>
                  )}
                  {!explaining && explanations.map((ex, i) => (
                    <article className="ai-message" key={`ai-${i}`}>
                      <div className="ai-avatar" aria-hidden="true">AI</div>
                      <div>
                        <div
                          className="ai-message-status"
                          style={{
                            color:
                              ex.status === "AI_ANALYZED"
                                ? "#2e7d32"
                                : ex.status === "EXPLAINED"
                                ? "#1565c0"
                                : "#a33e2e",
                          }}
                        >
                          {ex.status === "AI_ANALYZED"
                            ? "✦ AI Analyzed"
                            : ex.status === "EXPLAINED"
                            ? "✓ Evidence-backed"
                            : "⚠ Insufficient evidence"}
                        </div>
                        <p>{ex.ai_interpretation}</p>
                        {ex.citations?.length > 0 && (
                          <small>{ex.citations.join(" · ")}</small>
                        )}
                      </div>
                    </article>
                  ))}
                </section>
              )}

              {/* Summary Tab */}
              {documentData && activeTab === "summary" && (
                <section className="ai-response-panel" aria-live="polite" role="tabpanel">
                  <div className="ai-response-header">
                    <div>
                      <p className="eyebrow">AI Summary</p>
                      <h3>Document Overview</h3>
                    </div>
                    <span className="ai-status">
                      {summarizing ? "Working…" : summary ? "Ready" : "Waiting"}
                    </span>
                  </div>
                  {!summarizing && !summary && (
                    <div className="ai-response-empty">
                      <button className="secondary-button" onClick={generateSummary} type="button">
                        Generate AI Summary
                      </button>
                    </div>
                  )}
                  {summarizing && <div className="ai-response-empty pulse">Generating summary…</div>}
                  {!summarizing && summary && (
                    <div className="summary-content">
                      {summary.split("\n").filter(Boolean).map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Chat Tab */}
              {documentData && activeTab === "chat" && (
                <section className="chat-panel" role="tabpanel">
                  <div className="chat-header">
                    <p className="eyebrow">Ask the Document</p>
                    <h3>AI-powered Q&amp;A from your clauses</h3>
                  </div>
                  <div className="chat-messages" aria-live="polite" aria-label="Chat messages">
                    {chatMessages.length === 0 && (
                      <div className="chat-empty">
                        Ask a question like "What happens if rent is not paid?" or "What are the
                        termination conditions?"
                      </div>
                    )}
                    {chatMessages.map((m, i) => (
                      <div key={i} className={`chat-msg chat-${m.role}`}>
                        <div className="chat-bubble">
                          <p>{m.text}</p>
                          {m.sources?.length > 0 && (
                            <small className="chat-sources">Source: {m.sources.join(", ")}</small>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatBusy && (
                      <div className="chat-msg chat-ai">
                        <div className="chat-bubble pulse">Thinking…</div>
                      </div>
                    )}
                  </div>
                  <form className="chat-input-bar" onSubmit={sendChat}>
                    <input
                      className="chat-input"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask about your document…"
                      disabled={chatBusy}
                      maxLength={2000}
                      aria-label="Chat input"
                    />
                    <button
                      className="chat-send"
                      type="submit"
                      disabled={chatBusy || !chatInput.trim()}
                    >
                      Send
                    </button>
                  </form>
                </section>
              )}

              {/* Fairness Tab */}
              {documentData && activeTab === "fairness" && (
                <section className="fairness-panel" role="tabpanel">
                  <div className="ai-response-header">
                    <div>
                      <p className="eyebrow">Fairness Analysis</p>
                      <h3>One-sided clause detection</h3>
                    </div>
                  </div>
                  {!checkingFairness && fairnessIssues.length === 0 && (
                    <div className="ai-response-empty">
                      <button
                        className="secondary-button"
                        onClick={checkFairness}
                        type="button"
                      >
                        ⚖ Run Fairness Check
                      </button>
                    </div>
                  )}
                  {checkingFairness && (
                    <div className="ai-response-empty pulse">Analyzing clause fairness…</div>
                  )}
                  {!checkingFairness && fairnessIssues.length > 0 &&
                    fairnessIssues.map((issue, i) => (
                      <div className="fairness-issue" key={i}>
                        <div className="fairness-favors">
                          Favors: <strong>{issue.favors}</strong>
                        </div>
                        <p className="fairness-excerpt">"{issue.clause_excerpt}"</p>
                        <p className="fairness-desc">{issue.issue}</p>
                        <small className="fairness-suggestion">💡 {issue.suggestion}</small>
                      </div>
                    ))}
                  {!checkingFairness && fairnessIssues.length === 0 && explanations.length > 0 && (
                    <div className="empty-state">✓ No obvious fairness issues detected.</div>
                  )}
                </section>
              )}
            </section>
          </section>

          {/* ── Document Viewer with Simplify ── */}
          {documentData && (
            <section className="document-viewer" aria-label="Extracted document">
              <div className="viewer-header">
                <div>
                  <div className="section-label"><span>03</span> Extracted document</div>
                  <h3>{documentData.filename}</h3>
                </div>
                <span className="page-count">
                  {documentData.page_count} page{documentData.page_count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="clause-grid">
                {documentData.pages.flatMap((page) =>
                  page.blocks.map((block, index) => {
                    const key = `${page.page_number}-${index}`;
                    return (
                      <article className="clause-card" key={key}>
                        <span>Page {page.page_number}</span>
                        {simplifiedClauses[key] ? (
                          <>
                            <p className="simplified-text">{simplifiedClauses[key]}</p>
                            <button
                              className="simplify-toggle"
                              type="button"
                              onClick={() =>
                                setSimplifiedClauses((prev) => {
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                })
                              }
                            >
                              Show Original
                            </button>
                          </>
                        ) : (
                          <>
                            <p>{block.text}</p>
                            <button
                              className="simplify-toggle"
                              type="button"
                              disabled={simplifyingIdx === key}
                              onClick={() => simplifyClause(key, block.text)}
                            >
                              {simplifyingIdx === key ? "Simplifying…" : "💡 Simplify"}
                            </button>
                          </>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </>
      )}

      <footer>
        AI-assisted document analysis only. All findings require qualified human legal review before acting on them.
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);