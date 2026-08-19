const STATUS_LABELS = {
  settled: "Settled",
  flagged_for_review: "Flagged for review",
  rejected: "Rejected",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function loadSummary() {
  const res = await fetch("/api/summary");
  const summary = await res.json();

  const container = document.getElementById("summary");
  container.textContent = "";

  const total = el("div", "card", `Total: ${summary.total}`);
  container.appendChild(total);

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
    row.appendChild(el("td", `status-${data.status}`, STATUS_LABELS[data.status] || data.status || ""));
    row.appendChild(el("td", null, data.amount || ""));
    row.appendChild(el("td", null, data.currency || ""));
    row.appendChild(el("td", null, reasonOrFlags(record)));
    tbody.appendChild(row);
  }
}

loadSummary();
loadResults();
