const { validateTicket, CATEGORIES, PRIORITIES, STATUSES } = require('../src/models/ticket');

describe('Ticket Model Validation', () => {
  const validTicket = {
    customer_id: 'cust-123',
    customer_email: 'user@example.com',
    customer_name: 'John Doe',
    subject: 'Test subject',
    description: 'This is a test description',
  };

  test('validates a correct ticket', () => {
    const errors = validateTicket(validTicket);
    expect(errors.length).toBe(0);
  });

  test('rejects missing customer_id', () => {
    const ticket = { ...validTicket };
    delete ticket.customer_id;
    const errors = validateTicket(ticket);
    expect(errors).toContain('customer_id is required');
  });

  test('rejects missing customer_name', () => {
    const ticket = { ...validTicket };
    delete ticket.customer_name;
    const errors = validateTicket(ticket);
    expect(errors).toContain('customer_name is required');
  });

  test('rejects missing customer_email', () => {
    const ticket = { ...validTicket };
    delete ticket.customer_email;
    const errors = validateTicket(ticket);
    expect(errors).toContain('customer_email is required');
  });

  test('rejects invalid email format', () => {
    const ticket = { ...validTicket, customer_email: 'not-an-email' };
    const errors = validateTicket(ticket);
    expect(errors).toContain('customer_email must be a valid email address');
  });

  test('rejects subject longer than 200 characters', () => {
    const ticketLong = { ...validTicket, subject: 'a'.repeat(201) };
    const errorsLong = validateTicket(ticketLong);
    expect(errorsLong.some(e => e.includes('subject must be 1-200 characters'))).toBe(true);
  });

  test('rejects missing subject', () => {
    const ticket = { ...validTicket };
    delete ticket.subject;
    const errors = validateTicket(ticket);
    expect(errors.some(e => e.includes('subject is required'))).toBe(true);
  });

  test('rejects description shorter than 10 characters or longer than 2000', () => {
    const ticketShort = { ...validTicket, description: 'short' };
    const errorsShort = validateTicket(ticketShort);
    expect(errorsShort.some(e => e.includes('description must be 10-2000 characters'))).toBe(true);

    const ticketLong = { ...validTicket, description: 'a'.repeat(2001) };
    const errorsLong = validateTicket(ticketLong);
    expect(errorsLong.some(e => e.includes('description must be 10-2000 characters'))).toBe(true);
  });

  test('rejects invalid category', () => {
    const ticket = { ...validTicket, category: 'invalid_category' };
    const errors = validateTicket(ticket);
    expect(errors.some(e => e.includes('category must be one of'))).toBe(true);
  });

  test('accepts valid categories', () => {
    for (const category of CATEGORIES) {
      const ticket = { ...validTicket, category };
      const errors = validateTicket(ticket);
      expect(errors.filter(e => e.includes('category'))).toHaveLength(0);
    }
  });

  test('rejects invalid priority', () => {
    const ticket = { ...validTicket, priority: 'super_urgent' };
    const errors = validateTicket(ticket);
    expect(errors.some(e => e.includes('priority must be one of'))).toBe(true);
  });

  test('accepts valid priorities', () => {
    for (const priority of PRIORITIES) {
      const ticket = { ...validTicket, priority };
      const errors = validateTicket(ticket);
      expect(errors.filter(e => e.includes('priority'))).toHaveLength(0);
    }
  });

  test('rejects invalid status', () => {
    const ticket = { ...validTicket, status: 'completed' };
    const errors = validateTicket(ticket);
    expect(errors.some(e => e.includes('status must be one of'))).toBe(true);
  });

  test('accepts valid statuses', () => {
    for (const status of STATUSES) {
      const ticket = { ...validTicket, status };
      const errors = validateTicket(ticket);
      expect(errors.filter(e => e.includes('status'))).toHaveLength(0);
    }
  });

  test('validates metadata fields', () => {
    const ticket = {
      ...validTicket,
      metadata: {
        source: 'invalid_source',
        device_type: 'invalid_device',
      },
    };
    const errors = validateTicket(ticket);
    expect(errors.some(e => e.includes('metadata.source'))).toBe(true);
    expect(errors.some(e => e.includes('metadata.device_type'))).toBe(true);
  });

  test('allows null values for optional fields', () => {
    const ticket = {
      ...validTicket,
      category: null,
      priority: null,
      assigned_to: null,
    };
    const errors = validateTicket(ticket);
    expect(errors.length).toBe(0);
  });
});
