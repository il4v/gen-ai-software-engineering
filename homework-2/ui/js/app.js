const API = '';  // same origin

const CATEGORIES = ['account_access','technical_issue','billing_question','feature_request','bug_report','other'];
const PRIORITIES  = ['urgent','high','medium','low'];
const STATUSES    = ['new','in_progress','waiting_customer','resolved','closed'];
const SOURCES     = ['web_form','email','api','chat','phone'];
const DEVICE_TYPES = ['desktop','mobile','tablet'];

/* ── Utilities ── */
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  });
  children.forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
};

function badge(value) {
  const span = document.createElement('span');
  span.className = `badge badge-${value || 'none'}`;
  span.textContent = value ? value.replace(/_/g, ' ') : '—';
  return span;
}

function showAlert(elId, type, msg) {
  const a = $(elId);
  a.className = `alert alert-${type} visible`;
  a.textContent = msg;
}
function hideAlert(elId) {
  const a = $(elId);
  a.className = 'alert';
  a.textContent = '';
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 204) return null;
  return res.json().then(data => ({ ok: res.ok, status: res.status, data }));
}

/* ── Nav / Tab switching ── */
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('main section').forEach(s => s.classList.remove('visible'));
    btn.classList.add('active');
    $(btn.dataset.target).classList.add('visible');
  });
});

/* ════════════════════════════════════════════
   SECTION: Ticket List
════════════════════════════════════════════ */
let allTickets = [];

async function loadTickets() {
  const r = await apiFetch('/tickets');
  if (!r.ok) { showAlert('list-alert', 'error', 'Failed to load tickets'); return; }
  allTickets = r.data;
  renderTable(allTickets);
}

function renderTable(tickets) {
  const tbody = $('ticket-tbody');
  tbody.innerHTML = '';

  if (!tickets.length) {
    tbody.appendChild(el('tr', { class: 'empty-row' }, el('td', { colspan: '6', text: 'No tickets found.' })));
    return;
  }

  tickets.forEach(t => {
    const row = el('tr', {});
    row.innerHTML = `
      <td><span class="id-pill">${t.id.slice(0,8)}…</span></td>
      <td>${escHtml(t.subject)}</td>
      <td></td>
      <td></td>
      <td></td>
      <td>${t.created_at ? t.created_at.slice(0,10) : '—'}</td>
    `;
    row.cells[2].appendChild(badge(t.category));
    row.cells[3].appendChild(badge(t.priority));
    row.cells[4].appendChild(badge(t.status));
    row.addEventListener('click', () => openModal(t.id));
    tbody.appendChild(row);
  });
}

function applyFilters() {
  const cat = $('filter-category').value;
  const pri = $('filter-priority').value;
  const sta = $('filter-status').value;
  let filtered = allTickets;
  if (cat) filtered = filtered.filter(t => t.category === cat);
  if (pri) filtered = filtered.filter(t => t.priority === pri);
  if (sta) filtered = filtered.filter(t => t.status === sta);
  renderTable(filtered);
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

$('btn-refresh').addEventListener('click', loadTickets);
$('btn-apply-filter').addEventListener('click', applyFilters);
$('btn-reset-filter').addEventListener('click', () => {
  ['filter-category','filter-priority','filter-status'].forEach(id => $(id).value = '');
  renderTable(allTickets);
});

/* ════════════════════════════════════════════
   SECTION: Ticket Detail Modal
════════════════════════════════════════════ */
let currentTicketId = null;

async function openModal(id) {
  const r = await apiFetch(`/tickets/${id}`);
  if (!r.ok) { showAlert('list-alert', 'error', 'Could not load ticket'); return; }
  currentTicketId = id;
  renderModalContent(r.data);
  $('ticket-modal').classList.add('open');
  hideAlert('modal-alert');
  $('classify-result').classList.remove('visible');
}

function renderModalContent(t) {
  const f = v => escHtml(v ?? '—');
  const fDate = v => v ? v.replace('T',' ').slice(0,19) : '—';

  $('modal-title').textContent = `Ticket ${t.id.slice(0,8)}…`;

  $('modal-fields').innerHTML = `
    <div class="detail-grid">
      <div class="detail-field full">
        <label>Subject</label><p>${f(t.subject)}</p>
      </div>
      <div class="detail-field">
        <label>Customer Name</label><p>${f(t.customer_name)}</p>
      </div>
      <div class="detail-field">
        <label>Customer Email</label><p>${f(t.customer_email)}</p>
      </div>
      <div class="detail-field">
        <label>Customer ID</label><p>${f(t.customer_id)}</p>
      </div>
      <div class="detail-field">
        <label>Assigned To</label><p>${f(t.assigned_to)}</p>
      </div>
      <div class="detail-field full">
        <label>Description</label><p style="white-space:pre-wrap">${f(t.description)}</p>
      </div>
      <div class="detail-field">
        <label>Category</label>
        <p id="modal-cat-badge"></p>
      </div>
      <div class="detail-field">
        <label>Priority</label>
        <p id="modal-pri-badge"></p>
      </div>
      <div class="detail-field">
        <label>Status</label>
        <p id="modal-sta-badge"></p>
      </div>
      <div class="detail-field">
        <label>Confidence</label>
        <p>${t.classification_confidence != null ? (t.classification_confidence * 100).toFixed(0) + '%' : '—'}</p>
      </div>
      <div class="detail-field">
        <label>Tags</label>
        <p>${t.tags && t.tags.length ? t.tags.join(', ') : '—'}</p>
      </div>
      <div class="detail-field">
        <label>Manually Classified</label>
        <p>${t.manually_classified ? 'Yes' : 'No'}</p>
      </div>
      <div class="detail-field">
        <label>Created</label><p>${fDate(t.created_at)}</p>
      </div>
      <div class="detail-field">
        <label>Updated</label><p>${fDate(t.updated_at)}</p>
      </div>
      <div class="detail-field">
        <label>Resolved</label><p>${fDate(t.resolved_at)}</p>
      </div>
      <div class="detail-field">
        <label>Source</label><p>${f(t.metadata && t.metadata.source)}</p>
      </div>
    </div>
  `;

  $('modal-cat-badge').appendChild(badge(t.category));
  $('modal-pri-badge').appendChild(badge(t.priority));
  $('modal-sta-badge').appendChild(badge(t.status));

  // Status updater
  const sel = $('status-select');
  sel.innerHTML = STATUSES.map(s => `<option value="${s}"${s===t.status?' selected':''}>${s.replace(/_/g,' ')}</option>`).join('');
}

function closeModal() {
  $('ticket-modal').classList.remove('open');
  currentTicketId = null;
}

$('modal-close').addEventListener('click', closeModal);

$('ticket-modal').addEventListener('click', e => {
  if (e.target === $('ticket-modal')) closeModal();
});

$('btn-auto-classify').addEventListener('click', async () => {
  if (!currentTicketId) return;
  const r = await apiFetch(`/tickets/${currentTicketId}/auto-classify`, { method: 'POST' });
  if (!r.ok) { showAlert('modal-alert', 'error', r.data.error || 'Classification failed'); return; }

  const d = r.data;
  const res = $('classify-result');
  res.innerHTML = `
    <h4>Classification Result</h4>
    <div class="classify-meta">
      <span><small>Category</small><strong>${d.category.replace(/_/g,' ')}</strong></span>
      <span><small>Priority</small><strong>${d.priority}</strong></span>
      <span><small>Confidence</small><strong>${(d.confidence * 100).toFixed(0)}%</strong></span>
    </div>
    <div class="classify-keywords">Keywords: ${d.keywords_found.length ? d.keywords_found.join(', ') : 'none'}</div>
    <div class="classify-reasoning">${escHtml(d.reasoning)}</div>
  `;
  res.classList.add('visible');
  await loadTickets();
});

$('btn-update-status').addEventListener('click', async () => {
  if (!currentTicketId) return;
  const getR = await apiFetch(`/tickets/${currentTicketId}`);
  if (!getR.ok) { showAlert('modal-alert', 'error', 'Could not fetch ticket'); return; }

  const t = getR.data;
  const newStatus = $('status-select').value;
  const payload = { ...t, status: newStatus };
  delete payload.id; delete payload.created_at; delete payload.updated_at;
  delete payload.resolved_at; delete payload.manually_classified; delete payload.classification_confidence;

  const r = await apiFetch(`/tickets/${currentTicketId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    showAlert('modal-alert', 'error', r.data.errors ? r.data.errors.join('\n') : r.data.error);
    return;
  }
  showAlert('modal-alert', 'success', 'Status updated');
  renderModalContent(r.data);
  await loadTickets();
});

$('btn-delete-ticket').addEventListener('click', async () => {
  if (!currentTicketId) return;
  if (!confirm('Delete this ticket? This cannot be undone.')) return;
  const res = await fetch(`${API}/tickets/${currentTicketId}`, { method: 'DELETE' });
  if (res.status === 204 || res.ok) {
    $('ticket-modal').classList.remove('open');
    await loadTickets();
  } else {
    showAlert('modal-alert', 'error', 'Delete failed');
  }
});

/* ════════════════════════════════════════════
   SECTION: Create Ticket
════════════════════════════════════════════ */
$('create-form').addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert('create-alert');

  const f = e.target;
  const payload = {
    customer_id:    f.customer_id.value.trim(),
    customer_email: f.customer_email.value.trim(),
    customer_name:  f.customer_name.value.trim(),
    subject:        f.subject.value.trim(),
    description:    f.description.value.trim(),
    auto_classify:  f.auto_classify.checked,
  };
  if (f.category.value)  payload.category = f.category.value;
  if (f.priority.value)  payload.priority = f.priority.value;
  if (f.status.value)    payload.status   = f.status.value;
  if (f.tags.value.trim()) payload.tags   = f.tags.value.split(',').map(t => t.trim()).filter(Boolean);

  const src = f.metadata_source.value;
  const dev = f.metadata_device_type.value;
  const bro = f.metadata_browser.value.trim();
  if (src || dev || bro) payload.metadata = { source: src || null, device_type: dev || null, browser: bro || null };

  const r = await apiFetch('/tickets', { method: 'POST', body: JSON.stringify(payload) });

  if (!r.ok) {
    showAlert('create-alert', 'error', r.data.errors ? r.data.errors.join('\n') : r.data.error);
    return;
  }

  showAlert('create-alert', 'success', `Ticket created: ${r.data.id}`);
  f.reset();
  await loadTickets();
});

$('btn-clear-form').addEventListener('click', () => {
  $('create-form').reset();
  hideAlert('create-alert');
});

/* ════════════════════════════════════════════
   SECTION: Bulk Import
════════════════════════════════════════════ */
$('import-form').addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert('import-alert');
  $('import-results').innerHTML = '';

  const file = $('import-file').files[0];
  if (!file) { showAlert('import-alert', 'error', 'Please select a file'); return; }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API}/tickets/import`, { method: 'POST', body: formData });
  const data = await res.json();

  // The import endpoint returns 200 (all rows ok), 207 (partial success), or 400
  // (every row failed) — all three carry a { total, successful, failed, errors }
  // summary and should render the results table. A bare { error } body means the
  // file itself was missing/unreadable/unsupported, which has no summary to show.
  if (data.error && data.total === undefined) {
    showAlert('import-alert', 'error', data.error);
    return;
  }

  if (res.status === 400) {
    showAlert('import-alert', 'error', `Import failed: all ${data.total} row(s) were invalid.`);
  } else if (res.status === 207) {
    showAlert('import-alert', 'success', `Imported ${data.successful} of ${data.total} row(s) — ${data.failed} failed.`);
  } else {
    showAlert('import-alert', 'success', `Imported ${data.successful} of ${data.total} row(s).`);
  }

  renderImportResults(data);
  await loadTickets();
});

function renderImportResults(d) {
  const wrap = $('import-results');
  wrap.innerHTML = '';

  const stats = el('div', { class: 'import-stats' });
  [['Total', d.total, '#2d3748'], ['Imported', d.successful, '#276749'], ['Failed', d.failed, '#c53030']].forEach(([label, val, color]) => {
    const s = el('div', { class: 'import-stat' });
    const strong = el('strong', {}, String(val));
    strong.style.color = color;
    s.appendChild(strong);
    s.appendChild(el('small', { text: label }));
    stats.appendChild(s);
  });
  wrap.appendChild(stats);

  if (d.errors && d.errors.length) {
    const errWrap = el('div', { class: 'import-errors' });
    errWrap.appendChild(el('h4', { text: 'Errors' }));
    const tbl = el('table', {});
    tbl.innerHTML = `<thead><tr><th>Row</th><th>Error</th></tr></thead>`;
    const tbody = el('tbody', {});
    d.errors.forEach(({ row, error }) => {
      const tr = el('tr', {});
      tr.appendChild(el('td', { text: String(row) }));
      tr.appendChild(el('td', { text: error }));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    errWrap.appendChild(tbl);
    wrap.appendChild(errWrap);
  }
}

/* ── Bootstrap ── */
loadTickets();
