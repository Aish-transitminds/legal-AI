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
  const [docType, setDocType] = useState("");

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  // Draft clause
  const [draftingClause, setDraftingClause] = useState("");
  const [draftedClauses, setDraftedClauses] = useState({});

  // Simplify
  const [simplifiedClauses, setSimplifiedClauses] = useState({});
  const [simplifyingIdx, setSimplifyingIdx] = useState(null);

  // Fairness
  const [fairnessIssues, setFairnessIssues] = useState([]);
  const [checkingFairness, setCheckingFairness] = useState(false);

  // Compliance
  const [selectedState, setSelectedState] = useState("");
  const [complianceData, setComplianceData] = useState(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [states, setStates] = useState([]);

  // Compare
  const [compareMode, setCompareMode] = useState(false);
  const [compareFile1, setCompareFile1] = useState(null);
  const [compareFile2, setCompareFile2] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function analyzeDocument(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError(""); setDocumentData(null); setFindings([]); setExplanations([]);
    setDocumentId(null); setRiskScore(0); setRiskLevel("low"); setSummary(""); setClauseCoverage(null);
    setActiveTab("findings"); setDocType(""); setChatMessages([]); setDraftedClauses({});
    setSimplifiedClauses({}); setFairnessIssues([]); setComplianceData(null); setSelectedState("");
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch(`${API_BASE}/documents/analyze`, { method: "POST", body });
      if (!response.ok) { const d = await response.json().catch(() => ({})); throw new Error(d.detail || "Analysis failed."); }
      const analysis = await response.json();
      setDocumentId(analysis.id); setDocumentData(analysis.document); setFindings(analysis.findings);
      setRiskScore(analysis.risk_score || 0); setRiskLevel(analysis.risk_level || "low"); setDocType(analysis.doc_type || "");
      try { const cr = await fetch(`${API_BASE}/documents/${analysis.id}/clause-coverage`); if (cr.ok) setClauseCoverage(await cr.json()); } catch (_) {}
      try { const sr = await fetch(`${API_BASE}/documents/compliance/states`); if (sr.ok) setStates(await sr.json()); } catch (_) {}
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function explainFindings() {
    if (!documentId) return; setExplaining(true); setError("");
    try { const r = await fetch(`${API_BASE}/documents/${documentId}/explain`, { method: "POST" }); const p = await r.json().catch(() => ({})); if (!r.ok) throw new Error(p.detail || "AI error."); setExplanations(p); }
    catch (e) { setError(e.message); } finally { setExplaining(false); }
  }

  async function generateSummary() {
    if (!documentId) return; setSummarizing(true); setError("");
    try { const r = await fetch(`${API_BASE}/documents/${documentId}/summary`, { method: "POST" }); const p = await r.json().catch(() => ({})); if (!r.ok) throw new Error(p.detail || "AI error."); setSummary(p.summary); }
    catch (e) { setError(e.message); } finally { setSummarizing(false); }
  }

  async function sendChat(e) {
    e.preventDefault(); if (!chatInput.trim() || !documentId) return;
    const q = chatInput.trim(); setChatInput(""); setChatBusy(true);
    setChatMessages(prev => [...prev, { role: "user", text: q }]);
    try {
      const r = await fetch(`${API_BASE}/documents/${documentId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q })
      });
      const p = await r.json().catch(() => ({}));
      setChatMessages(prev => [...prev, { role: "ai", text: p.answer || p.detail || "No answer.", sources: p.source_clauses || [] }]);
    } catch (_) { setChatMessages(prev => [...prev, { role: "ai", text: "Failed to get answer. Try again." }]); }
    setChatBusy(false);
  }

  async function draftClause(clauseType) {
    setDraftingClause(clauseType);
    try {
      const r = await fetch(`${API_BASE}/documents/${documentId}/draft-clause`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clause_type: clauseType, doc_type: docType || "general" })
      });
      const p = await r.json().catch(() => ({}));
      setDraftedClauses(prev => ({ ...prev, [clauseType]: p.drafted_text || p.detail || "Draft failed." }));
    } catch (_) { setDraftedClauses(prev => ({ ...prev, [clauseType]: "Failed to generate draft." })); }
    setDraftingClause("");
  }

  async function simplifyClause(idx, text) {
    setSimplifyingIdx(idx);
    try {
      const r = await fetch(`${API_BASE}/documents/${documentId}/simplify-clause`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clause_text: text })
      });
      const p = await r.json().catch(() => ({}));
      setSimplifiedClauses(prev => ({ ...prev, [idx]: p.simple_text || "Simplification failed." }));
    } catch (_) { setSimplifiedClauses(prev => ({ ...prev, [idx]: "Failed." })); }
    setSimplifyingIdx(null);
  }

  async function checkFairness() {
    if (!documentId) return; setCheckingFairness(true);
    try {
      const r = await fetch(`${API_BASE}/documents/${documentId}/fairness-check`, { method: "POST" });
      const p = await r.json().catch(() => []);
      setFairnessIssues(Array.isArray(p) ? p : []);
    } catch (_) { setFairnessIssues([]); }
    setCheckingFairness(false);
  }

  async function loadCompliance(stateCode) {
    setSelectedState(stateCode); if (!stateCode) { setComplianceData(null); return; }
    setLoadingCompliance(true);
    try {
      const r = await fetch(`${API_BASE}/documents/${documentId}/compliance`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: stateCode })
      });
      if (r.ok) setComplianceData(await r.json()); else setComplianceData(null);
    } catch (_) { setComplianceData(null); }
    setLoadingCompliance(false);
  }

  async function compareDocuments(event) {
    event.preventDefault(); if (!compareFile1 || !compareFile2) return;
    setComparing(true); setError(""); setCompareResult(null);
    const body = new FormData(); body.append("file1", compareFile1); body.append("file2", compareFile2);
    try { const r = await fetch(`${API_BASE}/documents/compare`, { method: "POST", body }); if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "Failed."); } setCompareResult(await r.json()); }
    catch (e) { setError(e.message); } finally { setComparing(false); }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try { const r = await fetch(`${API_BASE}/documents/history/all`); if (r.ok) setHistory(await r.json()); } catch (_) {}
    setLoadingHistory(false);
  }

  function exportReport() {
    const w = window.open("", "_blank");
    const rc = riskLevel === "high" ? "#a33e2e" : riskLevel === "medium" ? "#c57b1a" : "#2e7d32";
    const fh = findings.map(f => `<tr><td style="padding:8px;border:1px solid #ddd;text-transform:capitalize">${f.finding_type.replaceAll("_"," ")}</td><td style="padding:8px;border:1px solid #ddd">${f.document_fact}</td><td style="padding:8px;border:1px solid #ddd">${f.severity}</td></tr>`).join("");
    const ch = clauseCoverage ? clauseCoverage.clauses.map(c => `<tr><td style="padding:6px;border:1px solid #ddd">${c.label}</td><td style="padding:6px;border:1px solid #ddd;color:${c.present?'#2e7d32':'#a33e2e'}">${c.present?'\u2713 Present':'\u2717 Missing'}</td></tr>`).join("") : "";
    w.document.write(`<!DOCTYPE html><html><head><title>Legal Analysis Report</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#183b56}h1{border-bottom:3px solid #d56543;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:16px 0}.badge{display:inline-block;padding:4px 12px;color:#fff;font-weight:bold;font-size:12px}@media print{body{margin:0}}</style></head><body><h1>Legal Document Analysis Report</h1><p><strong>File:</strong> ${documentData?.filename||'N/A'}</p><p><strong>Type:</strong> ${(docType||'General').replace('_',' ').toUpperCase()}</p><p><strong>Risk:</strong> <span class="badge" style="background:${rc}">${riskScore}/100 ${riskLevel.toUpperCase()}</span></p>${clauseCoverage?`<h2>Coverage (${clauseCoverage.coverage_percent}%)</h2><table><tr><th style="padding:6px;border:1px solid #ddd;text-align:left">Clause</th><th style="padding:6px;border:1px solid #ddd;text-align:left">Status</th></tr>${ch}</table>`:''}<h2>Findings (${findings.length})</h2>${findings.length?`<table><tr><th style="padding:8px;border:1px solid #ddd;text-align:left">Type</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Detail</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Severity</th></tr>${fh}</table>`:'<p>No findings.</p>'}${summary?`<h2>AI Summary</h2><p>${summary.replace(/\n/g,'</p><p>')}</p>`:''}<hr><p style="color:#718087;font-size:11px">AI-assisted analysis. Not legal advice. ${new Date().toLocaleString()}</p></body></html>`);
    w.document.close(); w.print();
  }

  const riskColor = riskLevel === "high" ? "#a33e2e" : riskLevel === "medium" ? "#c57b1a" : "#2e7d32";
  // Extract missing clause types from findings for draft buttons
  const missingClauseTypes = findings.filter(f => f.finding_type === "missing_clause").map(f => {
    const m = f.document_fact.match(/No (\w[\w\s]*) clause/i);
    return m ? m[1].trim().toLowerCase().replace(/\s+/g, '_') : null;
  }).filter(Boolean);

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand-mark">LDI</div>
        <div>
          <p className="eyebrow">CLOUD-DEPLOYED / LEGAL AI</p>
          <h1>Legal Document Intelligence</h1>
        </div>
        <div className="header-actions">
          <button className="header-btn" type="button" onClick={() => { setCompareMode(false); setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}>{showHistory ? "← Back" : "📁 History"}</button>
          <button className="header-btn" type="button" onClick={() => { setShowHistory(false); setCompareMode(!compareMode); setCompareResult(null); }}>{compareMode ? "← Back" : "⚖ Compare"}</button>
        </div>
      </header>

      {showHistory && (
        <section className="history-panel">
          <div className="section-label"><span>📁</span> Analysis History</div>
          {loadingHistory && <div className="empty-state pulse">Loading...</div>}
          {!loadingHistory && history.length === 0 && <div className="empty-state">No documents yet.</div>}
          {!loadingHistory && history.map(doc => (
            <div className="history-item" key={doc.id}>
              <div className="history-filename">{doc.filename}</div>
              <div className="history-meta"><span>{doc.findings_count} findings</span><span>{doc.clauses_count} clauses</span><span>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ""}</span></div>
            </div>
          ))}
        </section>
      )}

      {compareMode && !showHistory && (
        <section className="compare-panel">
          <div className="section-label"><span>⚖</span> Compare Two Documents</div>
          <form className="compare-form" onSubmit={compareDocuments}>
            <div className="compare-inputs">
              <label className="drop-zone compare-drop"><input type="file" accept=".pdf" onChange={e => setCompareFile1(e.target.files?.[0]||null)} /><strong>{compareFile1 ? compareFile1.name : "Document 1"}</strong></label>
              <span className="compare-vs">VS</span>
              <label className="drop-zone compare-drop"><input type="file" accept=".pdf" onChange={e => setCompareFile2(e.target.files?.[0]||null)} /><strong>{compareFile2 ? compareFile2.name : "Document 2"}</strong></label>
            </div>
            <button className="primary-button" disabled={!compareFile1||!compareFile2||comparing} type="submit">{comparing ? "Comparing..." : "Compare Documents"}</button>
          </form>
          {error && <p className="error">{error}</p>}
          {compareResult && (
            <div className="compare-results">
              <div className="compare-summary">
                {[compareResult.doc1, compareResult.doc2].map((d,i) => (
                  <div className="compare-doc-card" key={i}>
                    <div className="compare-doc-name">{d.filename}</div>
                    <div className="compare-doc-type">{(d.doc_type||'general').replace('_',' ')}</div>
                    <div className="risk-level-badge" style={{background: d.risk_level==="high"?"#a33e2e":d.risk_level==="medium"?"#c57b1a":"#2e7d32"}}>{d.risk_score}/100 {d.risk_level.toUpperCase()}</div>
                    <span className="risk-finding-count">{d.findings_count} findings</span>
                  </div>
                ))}
              </div>
              <table className="compare-table"><thead><tr><th>Clause</th><th>Doc 1</th><th>Doc 2</th></tr></thead><tbody>
                {compareResult.clause_comparison.map(c => (<tr key={c.clause}><td>{c.label}</td><td style={{color:c.in_doc1?"#2e7d32":"#a33e2e"}}>{c.in_doc1?"\u2713":"\u2717"}</td><td style={{color:c.in_doc2?"#2e7d32":"#a33e2e"}}>{c.in_doc2?"\u2713":"\u2717"}</td></tr>))}
              </tbody></table>
            </div>
          )}
        </section>
      )}

      {!compareMode && !showHistory && (
        <>
          <section className="intro">
            <div>
              <p className="eyebrow">Evidence before interpretation</p>
              <h2>See what your agreement says, section by section.</h2>
              <p className="lede">Upload a digital PDF to extract its text, map detected clauses, surface review recommendations, and get AI-powered analysis.</p>
            </div>
            <div className="scope-list" aria-label="Features">
              <span>AI Chat</span><span>Clause Drafting</span><span>Fairness Check</span><span>State Compliance</span><span>Doc Compare</span><span>Export Report</span>
            </div>
          </section>

          <section className="workspace">
            <form className="upload-panel" onSubmit={analyzeDocument}>
              <div className="section-label"><span>01</span> Add document</div>
              <label className="drop-zone">
                <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0]||null)} />
                <strong>{file ? file.name : "Choose a digital PDF"}</strong>
                <span>{file ? `${(file.size/1024/1024).toFixed(2)} MB ready` : "Legal documents up to 15 MB"}</span>
              </label>
              <button className="primary-button" disabled={!file||busy} type="submit">{busy ? "Analyzing..." : "Analyze document"}</button>
              {error && <p className="error">{error}</p>}

              {documentData && (
                <div className="risk-dashboard">
                  <div className="section-label" style={{marginTop:"22px"}}><span>\u26a1</span> Risk Assessment</div>
                  {docType && <div className="doc-type-badge">{docType.replace('_',' ').toUpperCase()}</div>}
                  <div className="risk-meter">
                    <div className="risk-score-circle" style={{borderColor:riskColor,color:riskColor}}>
                      <span className="risk-number">{riskScore}</span><span className="risk-label">/100</span>
                    </div>
                    <div className="risk-details">
                      <div className="risk-level-badge" style={{background:riskColor}}>{riskLevel.toUpperCase()} RISK</div>
                      <span className="risk-finding-count">{findings.length} finding{findings.length!==1?"s":""}</span>
                    </div>
                  </div>
                  <button className="export-btn" type="button" onClick={exportReport}>\ud83d\udcc4 Export Report</button>

                  {/* State Compliance */}
                  {states.length > 0 && (
                    <div className="state-compliance">
                      <div className="section-label" style={{marginTop:"14px"}}><span>\ud83c\uddee\ud83c\uddf3</span> State Compliance</div>
                      <select className="state-select" value={selectedState} onChange={e => loadCompliance(e.target.value)}>
                        <option value="">Select your state...</option>
                        {states.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                      </select>
                      {loadingCompliance && <div className="pulse" style={{fontSize:"12px",padding:"8px"}}>Loading...</div>}
                      {complianceData && (
                        <div className="compliance-info">
                          <div className="compliance-row"><strong>Stamp Duty:</strong> {complianceData.stamp_duty || complianceData.stamp_duty_lease || 'N/A'}</div>
                          <div className="compliance-row"><strong>Registration:</strong> {complianceData.registration_required}</div>
                          <div className="compliance-row"><strong>Registration Fee:</strong> {complianceData.registration_fee}</div>
                          {complianceData.rent_control && <div className="compliance-row"><strong>Rent Control:</strong> {complianceData.rent_control}</div>}
                          <div className="compliance-row"><strong>Key Acts:</strong> {complianceData.key_acts?.join(", ")}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {clauseCoverage && (
                <div className="clause-coverage">
                  <div className="section-label" style={{marginTop:"18px"}}><span>\ud83d\udccb</span> Clause Coverage ({clauseCoverage.coverage_percent}%)</div>
                  <div className="coverage-bar-container"><div className="coverage-bar" style={{width:`${clauseCoverage.coverage_percent}%`}} /></div>
                  <div className="coverage-grid">{clauseCoverage.clauses.map(c => (<div key={c.clause} className={`coverage-chip ${c.present?"present":"missing"}`}>{c.present?"\u2713":"\u2717"} {c.label}</div>))}</div>
                </div>
              )}
            </form>

            <section className="findings-panel">
              <div className="section-label"><span>02</span> Review findings</div>
              {!documentData && !busy && <div className="empty-state">Your analysis will appear here.</div>}
              {busy && <div className="empty-state pulse">Reading the document...</div>}

              {documentData && (
                <div className="tab-bar">
                  <button className={`tab-btn ${activeTab==="findings"?"active":""}`} onClick={()=>setActiveTab("findings")} type="button">Findings</button>
                  <button className={`tab-btn ${activeTab==="ai"?"active":""}`} onClick={()=>setActiveTab("ai")} type="button">AI Analysis</button>
                  <button className={`tab-btn ${activeTab==="summary"?"active":""}`} onClick={()=>setActiveTab("summary")} type="button">Summary</button>
                  <button className={`tab-btn ${activeTab==="chat"?"active":""}`} onClick={()=>setActiveTab("chat")} type="button">💬 Chat</button>
                  <button className={`tab-btn ${activeTab==="fairness"?"active":""}`} onClick={()=>setActiveTab("fairness")} type="button">⚖ Fairness</button>
                </div>
              )}

              {/* Findings Tab */}
              {documentData && activeTab==="findings" && (
                <>
                  {findings.length===0 && <div className="empty-state">No issues found.</div>}
                  {findings.map((f,i) => {
                    const clauseMatch = f.finding_type==="missing_clause" && f.document_fact.match(/No (\w[\w\s]*) clause/i);
                    const clauseKey = clauseMatch ? clauseMatch[1].trim().toLowerCase().replace(/\s+/g,'_') : null;
                    return (
                      <article className="finding" key={`${f.finding_type}-${i}`}>
                        <div className="finding-marker">{f.finding_type==="incomplete_draft"?"\u270d":f.severity==="high"?"\u203c":f.severity==="low"?"\u2139":"!"}</div>
                        <div style={{flex:1}}>
                          <div className="finding-title">
                            {f.finding_type.replaceAll("_"," ")}
                            <span className={`severity-tag severity-${f.severity}`}>{f.severity}</span>
                          </div>
                          <p>{f.document_fact}</p>
                          <small>{f.ai_interpretation}</small>
                          {clauseKey && f.finding_type==="missing_clause" && (
                            <div style={{marginTop:"8px"}}>
                              {draftedClauses[clauseKey] ? (
                                <div className="drafted-clause">
                                  <div className="drafted-header">\u2728 AI-Drafted Clause <button className="copy-btn" onClick={()=>navigator.clipboard.writeText(draftedClauses[clauseKey])}>Copy</button></div>
                                  <p>{draftedClauses[clauseKey]}</p>
                                  <small className="disclaimer">AI-generated draft. Must be reviewed by a legal professional.</small>
                                </div>
                              ) : (
                                <button className="draft-btn" disabled={draftingClause===clauseKey} onClick={()=>draftClause(clauseKey)} type="button">
                                  {draftingClause===clauseKey ? "Drafting..." : "\u2728 Draft Clause"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </>
              )}

              {/* AI Analysis Tab */}
              {documentData && activeTab==="ai" && (
                <section className="ai-response-panel" aria-live="polite">
                  <div className="ai-response-header"><div><p className="eyebrow">AI response</p><h3>Evidence-grounded review</h3></div><span className="ai-status">{explaining?"Working":explanations.length?"Ready":"Waiting"}</span></div>
                  {!explaining && !explanations.length && <div className="ai-response-empty"><button className="secondary-button" onClick={explainFindings} type="button">Get AI Explanation</button></div>}
                  {explaining && <div className="ai-response-empty pulse">AI is analyzing...</div>}
                  {!explaining && explanations.map((ex,i) => (
                    <article className="ai-message" key={`ai-${i}`}>
                      <div className="ai-avatar">AI</div>
                      <div><div className="ai-message-status" style={{color:ex.status==="AI_ANALYZED"?"#2e7d32":ex.status==="EXPLAINED"?"#1565c0":"#a33e2e"}}>{ex.status==="AI_ANALYZED"?"\u2726 AI Analyzed":ex.status==="EXPLAINED"?"\u2713 Evidence-backed":"\u26a0 Insufficient"}</div><p>{ex.ai_interpretation}</p>{ex.citations.length>0&&<small>{ex.citations.join(" \u00b7 ")}</small>}</div>
                    </article>
                  ))}
                </section>
              )}

              {/* Summary Tab */}
              {documentData && activeTab==="summary" && (
                <section className="ai-response-panel" aria-live="polite">
                  <div className="ai-response-header"><div><p className="eyebrow">AI Summary</p><h3>Document Overview</h3></div><span className="ai-status">{summarizing?"Working":summary?"Ready":"Waiting"}</span></div>
                  {!summarizing && !summary && <div className="ai-response-empty"><button className="secondary-button" onClick={generateSummary} type="button">Generate AI Summary</button></div>}
                  {summarizing && <div className="ai-response-empty pulse">Generating summary...</div>}
                  {!summarizing && summary && <div className="summary-content">{summary.split("\n").filter(Boolean).map((p,i) => <p key={i}>{p}</p>)}</div>}
                </section>
              )}

              {/* Chat Tab */}
              {documentData && activeTab==="chat" && (
                <section className="chat-panel">
                  <div className="chat-header"><p className="eyebrow">Ask the Document</p><h3>AI-powered Q&A from your clauses</h3></div>
                  <div className="chat-messages">
                    {chatMessages.length===0 && <div className="chat-empty">Ask a question like "What happens if rent is not paid?" or "What are the termination conditions?"</div>}
                    {chatMessages.map((m,i) => (
                      <div key={i} className={`chat-msg chat-${m.role}`}>
                        <div className="chat-bubble">
                          <p>{m.text}</p>
                          {m.sources && m.sources.length>0 && <small className="chat-sources">Source: {m.sources.join(", ")}</small>}
                        </div>
                      </div>
                    ))}
                    {chatBusy && <div className="chat-msg chat-ai"><div className="chat-bubble pulse">Thinking...</div></div>}
                  </div>
                  <form className="chat-input-bar" onSubmit={sendChat}>
                    <input className="chat-input" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Ask about your document..." disabled={chatBusy} />
                    <button className="chat-send" type="submit" disabled={chatBusy||!chatInput.trim()}>Send</button>
                  </form>
                </section>
              )}

              {/* Fairness Tab */}
              {documentData && activeTab==="fairness" && (
                <section className="fairness-panel">
                  <div className="ai-response-header"><div><p className="eyebrow">Fairness Analysis</p><h3>One-sided clause detection</h3></div></div>
                  {!checkingFairness && fairnessIssues.length===0 && <div className="ai-response-empty"><button className="secondary-button" onClick={checkFairness} type="button">\u2696 Run Fairness Check</button></div>}
                  {checkingFairness && <div className="ai-response-empty pulse">Analyzing clause fairness...</div>}
                  {!checkingFairness && fairnessIssues.length>0 && fairnessIssues.map((issue,i) => (
                    <div className="fairness-issue" key={i}>
                      <div className="fairness-favors">Favors: <strong>{issue.favors}</strong></div>
                      <p className="fairness-excerpt">"{issue.clause_excerpt}"</p>
                      <p className="fairness-desc">{issue.issue}</p>
                      <small className="fairness-suggestion">\ud83d\udca1 {issue.suggestion}</small>
                    </div>
                  ))}
                  {!checkingFairness && fairnessIssues.length===0 && activeTab==="fairness" && explanations.length>0 && <div className="empty-state">No fairness issues detected.</div>}
                </section>
              )}
            </section>
          </section>

          {/* Extracted Document with Simplify */}
          {documentData && (
            <section className="document-viewer">
              <div className="viewer-header">
                <div><div className="section-label"><span>03</span> Extracted document</div><h3>{documentData.filename}</h3></div>
                <span className="page-count">{documentData.page_count} page{documentData.page_count===1?"":"s"}</span>
              </div>
              <div className="clause-grid">
                {documentData.pages.flatMap((page) => page.blocks.map((block, index) => {
                  const key = `${page.page_number}-${index}`;
                  return (
                    <article className="clause-card" key={key}>
                      <span>Page {page.page_number}</span>
                      {simplifiedClauses[key] ? (
                        <><p className="simplified-text">{simplifiedClauses[key]}</p><button className="simplify-toggle" onClick={()=>setSimplifiedClauses(prev=>{const n={...prev};delete n[key];return n;})}>Show Original</button></>
                      ) : (
                        <><p>{block.text}</p><button className="simplify-toggle" disabled={simplifyingIdx===key} onClick={()=>simplifyClause(key,block.text)}>{simplifyingIdx===key?"Simplifying...":"\ud83d\udca1 Simplify"}</button></>
                      )}
                    </article>
                  );
                }))}
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