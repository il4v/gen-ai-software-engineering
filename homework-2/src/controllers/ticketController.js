const { v4: uuidv4 } = require('uuid');
const store = require('../store');
const { validateTicket } = require('../models/ticket');
const { classify } = require('../services/classificationService');
const { parseCSV, parseJSON, parseXML } = require('../services/importService');

function buildMetadata(src) {
  if (!src) return { source: null, browser: null, device_type: null };
  return {
    source: src.source || null,
    browser: src.browser || null,
    device_type: src.device_type || null,
  };
}

function newTicket(data) {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    customer_id: String(data.customer_id).trim(),
    customer_email: String(data.customer_email).trim().toLowerCase(),
    customer_name: String(data.customer_name).trim(),
    subject: String(data.subject).trim(),
    description: String(data.description).trim(),
    category: data.category || null,
    priority: data.priority || null,
    status: data.status || 'new',
    created_at: now,
    updated_at: now,
    resolved_at: null,
    assigned_to: data.assigned_to || null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    metadata: buildMetadata(data.metadata),
    manually_classified: false,
    classification_confidence: null,
  };
}

function applyClassification(ticket, result) {
  ticket.category = result.category;
  ticket.priority = result.priority;
  ticket.classification_confidence = result.confidence;
  ticket.updated_at = new Date().toISOString();
  console.log(`[classify] ticket ${ticket.id} → category=${result.category} priority=${result.priority} confidence=${result.confidence}`);
}

function maybeAutoClassify(ticket, flag) {
  if (flag) applyClassification(ticket, classify(ticket.subject, ticket.description));
}

// GET /tickets
exports.listTickets = (req, res) => {
  let tickets = Array.from(store.values());
  const { category, priority, status } = req.query;
  if (category) tickets = tickets.filter(t => t.category === category);
  if (priority) tickets = tickets.filter(t => t.priority === priority);
  if (status)   tickets = tickets.filter(t => t.status === status);
  res.json(tickets);
};

// POST /tickets
exports.createTicket = (req, res, next) => {
  try {
    const errors = validateTicket(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const ticket = newTicket(req.body);
    maybeAutoClassify(ticket, req.body.auto_classify);

    store.set(ticket.id, ticket);
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
};

// GET /tickets/:id
exports.getTicket = (req, res) => {
  const ticket = store.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
};

// PUT /tickets/:id — full replacement
exports.updateTicket = (req, res, next) => {
  try {
    const existing = store.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const errors = validateTicket(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const now = new Date().toISOString();
    const newStatus = req.body.status || 'new';

    let resolved_at = existing.resolved_at;
    if (newStatus === 'resolved' && existing.status !== 'resolved') resolved_at = now;
    else if (!['resolved', 'closed'].includes(newStatus)) resolved_at = null;

    // Only lock manual classification when the values actually changed
    const manuallyClassified =
      (req.body.category != null && req.body.category !== existing.category) ||
      (req.body.priority != null && req.body.priority !== existing.priority);

    const updated = {
      ...newTicket(req.body),
      id: existing.id,
      created_at: existing.created_at,
      updated_at: now,
      resolved_at,
      manually_classified: manuallyClassified,
      classification_confidence: manuallyClassified ? null : existing.classification_confidence,
    };

    store.set(existing.id, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /tickets/:id
exports.deleteTicket = (req, res) => {
  if (!store.has(req.params.id)) return res.status(404).json({ error: 'Ticket not found' });
  store.delete(req.params.id);
  res.status(204).send();
};

// POST /tickets/import
exports.importTickets = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let records;

    try {
      if (ext === 'csv')       records = parseCSV(req.file.buffer);
      else if (ext === 'json') records = parseJSON(req.file.buffer);
      else if (ext === 'xml')  records = await parseXML(req.file.buffer);
      else return res.status(400).json({ error: `Unsupported file format: .${ext}` });
    } catch (parseErr) {
      return res.status(400).json({ error: `Failed to parse ${ext.toUpperCase()}: ${parseErr.message}` });
    }

    const summary = { total: records.length, successful: 0, failed: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const data = records[i];
      const errors = validateTicket(data);
      if (errors.length) {
        summary.failed++;
        summary.errors.push({ row: i + 1, error: errors.join('; ') });
        continue;
      }

      const ticket = newTicket(data);
      maybeAutoClassify(ticket, data.auto_classify);

      store.set(ticket.id, ticket);
      summary.successful++;
    }

    let status = 200;
    if (summary.total > 0 && summary.successful === 0) status = 400;
    else if (summary.failed > 0) status = 207;

    res.status(status).json(summary);
  } catch (err) {
    next(err);
  }
};

// POST /tickets/:id/auto-classify
exports.autoClassify = (req, res, next) => {
  try {
    const ticket = store.get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const result = classify(ticket.subject, ticket.description);

    if (!ticket.manually_classified) {
      applyClassification(ticket, result);
      store.set(ticket.id, ticket);
    } else {
      console.log(`[classify] ticket ${ticket.id} → category=${result.category} priority=${result.priority} confidence=${result.confidence} (not applied: manually classified)`);
    }

    res.json({
      ticket_id: ticket.id,
      category: result.category,
      priority: result.priority,
      confidence: result.confidence,
      reasoning: result.reasoning,
      keywords_found: result.keywords_found,
    });
  } catch (err) {
    next(err);
  }
};
