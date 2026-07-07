const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store');

const fixturesDir = path.join(__dirname, 'fixtures');

beforeEach(() => {
  store.clear();
});

describe('Integration Tests', () => {
  test('complete ticket lifecycle workflow', async () => {
    // Create ticket
    const createRes = await request(app).post('/tickets').send({
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Cannot login',
      description: 'I cannot access my account after password reset',
      auto_classify: true,
    });

    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.id;

    // Get ticket
    const getRes = await request(app).get(`/tickets/${ticketId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('new');

    // Update ticket status
    const updateRes = await request(app).put(`/tickets/${ticketId}`).send({
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Cannot login',
      description: 'I cannot access my account after password reset',
      status: 'in_progress',
      assigned_to: 'support_agent_1',
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe('in_progress');
    expect(updateRes.body.assigned_to).toBe('support_agent_1');

    // Mark as resolved
    const resolveRes = await request(app).put(`/tickets/${ticketId}`).send({
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Cannot login',
      description: 'I cannot access my account after password reset',
      status: 'resolved',
    });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.status).toBe('resolved');
    expect(resolveRes.body.resolved_at).toBeDefined();

    // Delete ticket
    const deleteRes = await request(app).delete(`/tickets/${ticketId}`);
    expect(deleteRes.status).toBe(204);
  });

  test('bulk import with CSV and filtering', async () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description,category,priority\n' +
      'cust-1,user1@example.com,Alice,Login issue,Cannot access account properly,account_access,urgent\n' +
      'cust-2,user2@example.com,Bob,Billing question,Invoice is incorrect correctly,billing_question,high\n' +
      'cust-3,user3@example.com,Charlie,Bug report,App crashes on startup consistently,technical_issue,medium\n'
    );

    const importRes = await request(app)
      .post('/tickets/import')
      .attach('file', csv, 'tickets.csv');

    expect(importRes.status).toBe(200);
    expect(importRes.body.total).toBe(3);
    expect(importRes.body.successful).toBe(3);

    // Filter by category
    const listRes = await request(app).get('/tickets?category=account_access');
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].category).toBe('account_access');

    // Filter by priority
    const urgentRes = await request(app).get('/tickets?priority=urgent');
    expect(urgentRes.status).toBe(200);
    expect(urgentRes.body.length).toBe(1);
  });

  test('bulk import with auto-classification verification', async () => {
    // No category/priority supplied — auto_classify must derive them from content.
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description,auto_classify\n' +
      'cust-1,user1@example.com,Alice,Cannot login,I cannot sign in to my account after password reset,true\n' +
      'cust-2,user2@example.com,Bob,Production down,The production server is down and this is critical,true\n' +
      'cust-3,user3@example.com,Charlie,Random note,This ticket has no relevant classification keywords,true\n'
    );

    const importRes = await request(app)
      .post('/tickets/import')
      .attach('file', csv, 'tickets.csv');

    expect(importRes.status).toBe(200);
    expect(importRes.body.successful).toBe(3);

    const listRes = await request(app).get('/tickets');
    const tickets = listRes.body;
    expect(tickets.length).toBe(3);

    const alice = tickets.find(t => t.customer_id === 'cust-1');
    expect(alice.category).toBe('account_access');
    expect(alice.classification_confidence).toBeGreaterThan(0);

    // "production down"/"critical" are priority signals, not category keywords,
    // so priority is derived but category falls back to 'other' (confidence 0).
    const bob = tickets.find(t => t.customer_id === 'cust-2');
    expect(bob.priority).toBe('urgent');
    expect(bob.category).toBe('other');

    const charlie = tickets.find(t => t.customer_id === 'cust-3');
    expect(charlie.category).toBe('other');
    expect(charlie.priority).toBe('medium');
    expect(charlie.classification_confidence).toBe(0);
  });

  test('bulk import from the full sample fixture files (CSV/JSON/XML)', async () => {
    const csvRes = await request(app)
      .post('/tickets/import')
      .attach('file', path.join(fixturesDir, 'sample_tickets.csv'));
    expect(csvRes.status).toBe(200);
    expect(csvRes.body.total).toBe(50);
    expect(csvRes.body.successful).toBe(50);

    const jsonRes = await request(app)
      .post('/tickets/import')
      .attach('file', path.join(fixturesDir, 'sample_tickets.json'));
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body.total).toBe(20);
    expect(jsonRes.body.successful).toBe(20);

    const xmlRes = await request(app)
      .post('/tickets/import')
      .attach('file', path.join(fixturesDir, 'sample_tickets.xml'));
    expect(xmlRes.status).toBe(200);
    expect(xmlRes.body.total).toBe(30);
    expect(xmlRes.body.successful).toBe(30);

    const listRes = await request(app).get('/tickets');
    expect(listRes.body.length).toBe(100);
  });

  test('bulk import rejects fully invalid CSV/XML fixtures with 400 and a per-row error summary', async () => {
    const csvRes = await request(app)
      .post('/tickets/import')
      .attach('file', path.join(fixturesDir, 'invalid/malformed.csv'));
    expect(csvRes.status).toBe(400);
    expect(csvRes.body.successful).toBe(0);
    expect(csvRes.body.errors.length).toBeGreaterThan(0);

    const xmlRes = await request(app)
      .post('/tickets/import')
      .attach('file', path.join(fixturesDir, 'invalid/malformed.xml'));
    expect(xmlRes.status).toBe(400);
    expect(xmlRes.body.successful).toBe(0);
    expect(xmlRes.body.errors.length).toBeGreaterThan(0);

    // Nothing from either invalid file should have been persisted.
    const listRes = await request(app).get('/tickets');
    expect(listRes.body.length).toBe(0);
  });

  test('bulk import rejects malformed JSON fixture (non-array body) with 400 and a single error message', async () => {
    // malformed.json is a single object, not an array — this fails at parse time,
    // before any per-row validation, so the response is { error } not { errors: [...] }.
    const jsonRes = await request(app)
      .post('/tickets/import')
      .attach('file', path.join(fixturesDir, 'invalid/malformed.json'));

    expect(jsonRes.status).toBe(400);
    expect(jsonRes.body.error).toContain('Failed to parse JSON');
    expect(jsonRes.body.successful).toBeUndefined();

    const listRes = await request(app).get('/tickets');
    expect(listRes.body.length).toBe(0);
  });

  test('concurrent operations — 20 simultaneous ticket creations', async () => {
    const promises = [];

    for (let i = 0; i < 20; i++) {
      promises.push(
        request(app).post('/tickets').send({
          customer_id: `cust-${i}`,
          customer_email: `user${i}@example.com`,
          customer_name: `User ${i}`,
          subject: `Issue ${i}`,
          description: `This is issue number ${i} with sufficient description length`,
        })
      );
    }

    const results = await Promise.all(promises);
    expect(results.every(r => r.status === 201)).toBe(true);

    // Every ticket got a distinct id — no lost updates / race conditions in the store.
    const ids = new Set(results.map(r => r.body.id));
    expect(ids.size).toBe(20);

    const listRes = await request(app).get('/tickets');
    expect(listRes.body.length).toBe(20);
  });

  test('combined filtering by category and priority', async () => {
    const tickets = [
      {
        customer_id: 'cust-1',
        customer_email: 'user1@example.com',
        customer_name: 'Alice',
        subject: 'Login issue',
        description: 'Cannot login to my account',
        category: 'account_access',
        priority: 'urgent',
      },
      {
        customer_id: 'cust-2',
        customer_email: 'user2@example.com',
        customer_name: 'Bob',
        subject: 'Login issue too',
        description: 'Also cannot login to my account',
        category: 'account_access',
        priority: 'low',
      },
      {
        customer_id: 'cust-3',
        customer_email: 'user3@example.com',
        customer_name: 'Charlie',
        subject: 'Billing issue',
        description: 'Incorrect charge on invoice',
        category: 'billing_question',
        priority: 'urgent',
      },
    ];

    for (const ticket of tickets) {
      await request(app).post('/tickets').send(ticket);
    }

    const res = await request(app).get('/tickets?category=account_access&priority=urgent');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].customer_name).toBe('Alice');
  });

  test('combined filtering by category, priority, and status', async () => {
    const tickets = [
      {
        customer_id: 'cust-1',
        customer_email: 'user1@example.com',
        customer_name: 'Alice',
        subject: 'Login issue',
        description: 'Cannot login to my account',
        category: 'account_access',
        priority: 'urgent',
        status: 'new',
      },
      {
        customer_id: 'cust-2',
        customer_email: 'user2@example.com',
        customer_name: 'Bob',
        subject: 'Billing issue',
        description: 'Incorrect charge on invoice',
        category: 'billing_question',
        priority: 'urgent',
        status: 'in_progress',
      },
      {
        customer_id: 'cust-3',
        customer_email: 'user3@example.com',
        customer_name: 'Charlie',
        subject: 'Feature request',
        description: 'Request for dark mode feature',
        category: 'feature_request',
        priority: 'low',
        status: 'new',
      },
    ];

    for (const ticket of tickets) {
      await request(app).post('/tickets').send(ticket);
    }

    const res = await request(app).get('/tickets?category=account_access&priority=urgent&status=new');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].customer_name).toBe('Alice');
  });

  test('auto-classify endpoint updates existing ticket', async () => {
    const createRes = await request(app).post('/tickets').send({
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'No category assigned',
      description: 'This is a description without keywords that would trigger classification',
    });

    const ticketId = createRes.body.id;
    expect(createRes.body.category).toBeNull();

    const classifyRes = await request(app).post(`/tickets/${ticketId}/auto-classify`);
    expect(classifyRes.status).toBe(200);
    expect(classifyRes.body.ticket_id).toBe(ticketId);
    expect(classifyRes.body.category).toBeDefined();
    expect(classifyRes.body.confidence).toBeDefined();
  });
});
