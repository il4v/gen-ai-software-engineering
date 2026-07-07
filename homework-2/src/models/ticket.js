const CATEGORIES = ['account_access', 'technical_issue', 'billing_question', 'feature_request', 'bug_report', 'other'];
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const STATUSES = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const SOURCES = ['web_form', 'email', 'api', 'chat', 'phone'];
const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function missingString(v) {
  return !v || !String(v).trim();
}

function validateTicket(data) {
  const errors = [];

  if (missingString(data.customer_id))   errors.push('customer_id is required');
  if (missingString(data.customer_name)) errors.push('customer_name is required');

  if (!data.customer_email) {
    errors.push('customer_email is required');
  } else if (!EMAIL_RE.test(String(data.customer_email).trim())) {
    errors.push('customer_email must be a valid email address');
  }

  if (!data.subject) {
    errors.push('subject is required');
  } else {
    const len = String(data.subject).trim().length;
    if (len < 1 || len > 200) errors.push('subject must be 1-200 characters');
  }

  if (!data.description) {
    errors.push('description is required');
  } else {
    const len = String(data.description).trim().length;
    if (len < 10 || len > 2000) errors.push('description must be 10-2000 characters');
  }

  for (const [field, allowed] of [['category', CATEGORIES], ['priority', PRIORITIES], ['status', STATUSES]]) {
    if (data[field] && !allowed.includes(data[field])) {
      errors.push(`${field} must be one of: ${allowed.join(', ')}`);
    }
  }

  if (data.metadata) {
    for (const [field, allowed] of [['source', SOURCES], ['device_type', DEVICE_TYPES]]) {
      if (data.metadata[field] && !allowed.includes(data.metadata[field])) {
        errors.push(`metadata.${field} must be one of: ${allowed.join(', ')}`);
      }
    }
  }

  return errors;
}

module.exports = { CATEGORIES, PRIORITIES, STATUSES, SOURCES, DEVICE_TYPES, validateTicket };
