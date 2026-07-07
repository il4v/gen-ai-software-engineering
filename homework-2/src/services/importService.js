const { parse: parseCSVSync } = require('csv-parse/sync');
const xml2js = require('xml2js');

function normalizeAutoClassify(ticket) {
  if (ticket.auto_classify === 'true') ticket.auto_classify = true;
  else delete ticket.auto_classify;
}

function parseCSV(buffer) {
  const records = parseCSVSync(buffer.toString(), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map(row => {
    const ticket = { ...row };

    ticket.tags = ticket.tags
      ? ticket.tags.split('|').map(t => t.trim()).filter(Boolean)
      : [];

    const metadata = {};
    if (ticket.metadata_source)      { metadata.source      = ticket.metadata_source; }
    if (ticket.metadata_browser)     { metadata.browser     = ticket.metadata_browser; }
    if (ticket.metadata_device_type) { metadata.device_type = ticket.metadata_device_type; }
    delete ticket.metadata_source;
    delete ticket.metadata_browser;
    delete ticket.metadata_device_type;
    if (Object.keys(metadata).length) ticket.metadata = metadata;

    normalizeAutoClassify(ticket);
    return ticket;
  });
}

function parseJSON(buffer) {
  const data = JSON.parse(buffer.toString());
  if (!Array.isArray(data)) throw new Error('JSON body must be an array of ticket objects');
  return data;
}

async function parseXML(buffer) {
  const result = await xml2js.parseStringPromise(buffer.toString(), { explicitArray: false });

  if (!result.tickets || !result.tickets.ticket) return [];

  const raw = result.tickets.ticket;
  const items = Array.isArray(raw) ? raw : [raw];

  return items.map(t => {
    const ticket = { ...t };

    if (ticket.tags && ticket.tags.tag) {
      ticket.tags = Array.isArray(ticket.tags.tag) ? ticket.tags.tag : [ticket.tags.tag];
    } else {
      ticket.tags = [];
    }

    if (ticket.metadata && typeof ticket.metadata === 'object') {
      ticket.metadata = { ...ticket.metadata };
    }

    normalizeAutoClassify(ticket);
    return ticket;
  });
}

module.exports = { parseCSV, parseJSON, parseXML };
