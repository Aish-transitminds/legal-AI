/**
 * Centralized API service for Legal Document Intelligence.
 * All backend calls go through these helpers — never call fetch() directly from components.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Generic fetch wrapper that normalizes errors into a consistent shape.
 * Throws an Error with `message` set to the API's detail string.
 */
async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.detail) detail = data.detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }
  return response.json();
}

// ── Document Analysis ────────────────────────────────────────

export async function analyzeDocument(file) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch("/documents/analyze", { method: "POST", body });
}

export async function fetchClauseCoverage(documentId) {
  return apiFetch(`/documents/${documentId}/clause-coverage`);
}

export async function fetchComplianceStates() {
  return apiFetch("/documents/compliance/states");
}

// ── AI Features ──────────────────────────────────────────────

export async function explainFindings(documentId) {
  return apiFetch(`/documents/${documentId}/explain`, { method: "POST" });
}

export async function generateSummary(documentId) {
  return apiFetch(`/documents/${documentId}/summary`, { method: "POST" });
}

export async function chatWithDocument(documentId, question) {
  return apiFetch(`/documents/${documentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
}

export async function draftClause(documentId, clauseType, docType = "general") {
  return apiFetch(`/documents/${documentId}/draft-clause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clause_type: clauseType, doc_type: docType }),
  });
}

export async function simplifyClause(documentId, clauseText) {
  return apiFetch(`/documents/${documentId}/simplify-clause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clause_text: clauseText }),
  });
}

export async function checkFairness(documentId) {
  return apiFetch(`/documents/${documentId}/fairness-check`, { method: "POST" });
}

export async function fetchStateCompliance(documentId, state) {
  return apiFetch(`/documents/${documentId}/compliance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

// ── Comparison & History ─────────────────────────────────────

export async function compareDocuments(file1, file2) {
  const body = new FormData();
  body.append("file1", file1);
  body.append("file2", file2);
  return apiFetch("/documents/compare", { method: "POST", body });
}

export async function fetchHistory() {
  return apiFetch("/documents/history/all");
}
