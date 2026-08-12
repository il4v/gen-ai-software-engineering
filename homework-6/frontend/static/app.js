const STATUS_LABELS = {
  settled: "Settled",
  flagged_for_review: "Flagged for review",
  rejected: "Rejected",
  cleared: "Cleared",
};

// The dashboard itself (frontend/server.py) stays read-only — this is the API gateway's own port,
// a separate service, called directly from the browser (see specification-challenge.md).
const API_BASE = "http://127.0.0.1:8001";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusPill(status) {
  const span = el("span", `status-pill status-${status}`, STATUS_LABELS[status] || status);
  return span;
}

// ---------------------------------------------------------------------------
// Pipeline results (read-only, same-origin — unchanged behavior from before)
// ---------------------------------------------------------------------------

async function loadSummary() {
  const res = await fetch("/api/summary");
  const summary = await res.json();

  const container = document.getElementById("summary");
  container.textContent = "";
  container.appendChild(el("div", "card", `Total: ${summary.total}`));
  for (const [status, count] of Object.entries(summary.counts)) {
    const label = STATUS_LABELS[status] || status;
    container.appendChild(el("div", `card card-${status}`, `${label}: ${count}`));
  }
}

function reasonOrFlags(record) {
  const data = record.data || {};
  if (data.status === "rejected") return data.reason || "";
  if (data.status === "flagged_for_review") {
    return `score=${data.risk_score} (${(data.flags || []).join(", ")})`;
  }
  if (data.status === "settled") return `fee=${data.fee}`;
  return "";
}

async function loadResults() {
  const res = await fetch("/api/results");
  const records = await res.json();

  const tbody = document.querySelector("#results-table tbody");
  tbody.textContent = "";

  for (const record of records) {
    const data = record.data || {};
    const row = document.createElement("tr");
    row.appendChild(el("td", null, data.transaction_id || ""));
    const statusCell = el("td");
    statusCell.appendChild(statusPill(data.status));
    row.appendChild(statusCell);
    row.appendChild(el("td", null, data.amount || ""));
    row.appendChild(el("td", null, data.currency || ""));
    row.appendChild(el("td", null, reasonOrFlags(record)));
    tbody.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Fraud rule configuration — talks to the API gateway (:8001), not this dashboard's own server
// ---------------------------------------------------------------------------

function setRulesStatus(message, kind) {
  const span = document.getElementById("rules-status");
  span.textContent = message;
  span.className = kind ? kind : "";
}

function readRulesFromForm() {
  const flagThreshold = Number(document.getElementById("flag-threshold").value);
  const rows = document.querySelectorAll("#rules-table tbody tr");
  const rules = Array.from(rows).map((row) => ({
    name: row.querySelector(".rule-name").value,
    field: row.querySelector(".rule-field").value,
    operator: row.querySelector(".rule-operator").value,
    value: parseRuleValue(row.querySelector(".rule-value").value),
    score: Number(row.querySelector(".rule-score").value),
  }));
  return { flag_threshold: flagThreshold, rules };
}

function parseRuleValue(raw) {
  // Values can be a bare string ("US"), a number-as-string ("10000"), or a JSON array
  // ("[6, 22]" for outside_hours) — try JSON first, fall back to the raw string.
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function renderRuleValue(value) {
  return Array.isArray(value) ? JSON.stringify(value) : String(value);
}

function renderRulesForm(ruleset) {
  document.getElementById("flag-threshold").value = ruleset.flag_threshold;

  const tbody = document.querySelector("#rules-table tbody");
  tbody.textContent = "";
  for (const rule of ruleset.rules) {
    const row = document.createElement("tr");

    const nameInput = el("input");
    nameInput.className = "rule-name";
    nameInput.type = "text";
    nameInput.value = rule.name;

    const fieldInput = el("input");
    fieldInput.className = "rule-field";
    fieldInput.type = "text";
    fieldInput.value = rule.field;

    const operatorInput = el("input");
    operatorInput.className = "rule-operator";
    operatorInput.type = "text";
    operatorInput.value = rule.operator;

    const valueInput = el("input");
    valueInput.className = "rule-value";
    valueInput.type = "text";
    valueInput.value = renderRuleValue(rule.value);

    const scoreInput = el("input");
    scoreInput.className = "rule-score";
    scoreInput.type = "number";
    scoreInput.value = rule.score;

    for (const input of [nameInput, fieldInput, operatorInput, valueInput, scoreInput]) {
      const td = el("td");
      td.appendChild(input);
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
}

async function loadRules() {
  try {
    const res = await fetch(`${API_BASE}/rules`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderRulesForm(await res.json());
  } catch (err) {
    setRulesStatus(
      "API gateway not reachable at " + API_BASE + " — start it with: " +
        "python3 -m uvicorn api.server:app --port 8001",
      "error"
    );
  }
}

async function previewImpact() {
  setRulesStatus("Running preview against sample-transactions.json...", "");
  const candidate = readRulesFromForm();

  let currentByTxn = {};
  try {
    const currentRes = await fetch("/api/results");
    const currentRecords = await currentRes.json();
    currentByTxn = Object.fromEntries(
      currentRecords.map((r) => [r.data.transaction_id, r.data.status])
    );
  } catch {
    // Real shared/results/ may not have every sample transaction yet — diff just shows "unknown" then.
  }

  try {
    const res = await fetch(`${API_BASE}/rules/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    if (!res.ok) {
      const body = await res.json();
      setRulesStatus(`Preview failed: ${body.detail || res.status}`, "error");
      return;
    }
    const { results } = await res.json();
    renderPreview(results, currentByTxn);
    setRulesStatus("Preview complete — nothing saved yet.", "ok");
  } catch (err) {
    setRulesStatus("Could not reach the API gateway for preview.", "error");
  }
}

function renderPreview(results, currentByTxn) {
  const container = document.getElementById("preview-results");
  container.textContent = "";

  const table = el("table");
  const thead = el("thead");
  const headRow = el("tr");
  ["Transaction ID", "Current status", "Status with this rule set", "Detail"].forEach((h) =>
    headRow.appendChild(el("th", null, h))
  );
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el("tbody");
  let changedCount = 0;
  for (const r of results) {
    const current = currentByTxn[r.transaction_id] || "(not yet processed)";
    const changed = current !== r.status;
    if (changed) changedCount += 1;

    const row = el("tr", changed ? "diff-changed" : undefined);
    row.appendChild(el("td", null, r.transaction_id));
    row.appendChild(el("td", null, current));
    const statusCell = el("td");
    statusCell.appendChild(statusPill(r.status));
    row.appendChild(statusCell);
    const detail = r.status === "rejected" ? r.reason : r.status === "flagged_for_review" ? `score=${r.risk_score} (${(r.flags || []).join(", ")})` : "";
    row.appendChild(el("td", null, detail || ""));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  container.appendChild(
    el("p", "diff-note", `${changedCount} of ${results.length} transactions would change outcome with this rule set.`)
  );
}

async function saveRules() {
  const candidate = readRulesFromForm();
  setRulesStatus("Saving...", "");
  try {
    const res = await fetch(`${API_BASE}/rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    if (!res.ok) {
      const body = await res.json();
      setRulesStatus(`Save failed: ${body.detail || res.status}`, "error");
      return;
    }
    setRulesStatus("Saved to config/fraud_rules.yaml. Re-run the pipeline to apply it to new submissions.", "ok");
  } catch (err) {
    setRulesStatus("Could not reach the API gateway to save.", "error");
  }
}

document.getElementById("preview-btn").addEventListener("click", previewImpact);
document.getElementById("save-btn").addEventListener("click", saveRules);

loadSummary();
loadResults();
loadRules();
