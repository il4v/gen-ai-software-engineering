const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store');

beforeEach(() => {
  store.clear();
});

describe('Ticket API Endpoints', () => {
  // POST /tickets
  test('POST /tickets creates a new ticket with valid data', async () => {
    const ticketData = {
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Cannot login',
      description: 'I am unable to access my account after password reset',
      category: 'account_access',
      priority: 'high',
      status: 'new',
    };

    const res = await request(app).post('/tickets').send(ticketData);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.customer_id).toBe('cust-123');
    expect(res.body.status).toBe('new');
    expect(res.body.created_at).toBeDefined();
  });

  test('POST /tickets returns 400 for missing required fields', async () => {
    const res = await request(app).post('/tickets').send({
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('POST /tickets returns 400 for invalid email format', async () => {
    const res = await request(app).post('/tickets').send({
      customer_id: 'cust-123',
      customer_email: 'invalid-email',
      customer_name: 'John Doe',
      subject: 'Test',
      description: 'This is a test description',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toContain('must be a valid email address');
  });

  test('POST /tickets auto-classifies when flag is set', async () => {
    const res = await request(app).post('/tickets').send({
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Password reset needed',
      description: 'I cannot login to my account because I forgot my password',
      auto_classify: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('account_access');
    expect(res.body.classification_confidence).toBeGreaterThan(0);
  });

  // GET /tickets
  test('GET /tickets returns all tickets', async () => {
    const ticket1 = {
      customer_id: 'cust-1',
      customer_email: 'user1@example.com',
      customer_name: 'Alice',
      subject: 'Issue 1',
      description: 'Description for issue 1',
    };
    const ticket2 = {
      customer_id: 'cust-2',
      customer_email: 'user2@example.com',
      customer_name: 'Bob',
      subject: 'Issue 2',
      description: 'Description for issue 2',
    };

    await request(app).post('/tickets').send(ticket1);
    await request(app).post('/tickets').send(ticket2);

    const res = await request(app).get('/tickets');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  test('GET /tickets filters by category', async () => {
    const tickets = [
      {
        customer_id: 'cust-1',
        customer_email: 'user1@example.com',
        customer_name: 'Alice',
        subject: 'Password issue',
        description: 'Cannot login to my account',
        category: 'account_access',
      },
      {
        customer_id: 'cust-2',
        customer_email: 'user2@example.com',
        customer_name: 'Bob',
        subject: 'Billing issue',
        description: 'Unexpected charge on my account',
        category: 'billing_question',
      },
    ];

    for (const ticket of tickets) {
      await request(app).post('/tickets').send(ticket);
    }

    const res = await request(app).get('/tickets?category=account_access');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].category).toBe('account_access');
  });

  test('GET /tickets filters by priority and status', async () => {
    const ticket = {
      customer_id: 'cust-1',
      customer_email: 'user1@example.com',
      customer_name: 'Alice',
      subject: 'Critical issue',
      description: 'Production is down',
      priority: 'urgent',
      status: 'in_progress',
    };

    await request(app).post('/tickets').send(ticket);

    const res = await request(app).get('/tickets?priority=urgent&status=in_progress');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].priority).toBe('urgent');
  });

  // GET /tickets/:id
  test('GET /tickets/:id returns specific ticket', async () => {
    const ticketData = {
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Test ticket',
      description: 'This is a test ticket description',
    };

    const createRes = await request(app).post('/tickets').send(ticketData);
    const ticketId = createRes.body.id;

    const res = await request(app).get(`/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticketId);
    expect(res.body.subject).toBe('Test ticket');
  });

  test('GET /tickets/:id returns 404 for non-existent ticket', async () => {
    const res = await request(app).get('/tickets/non-existent-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ticket not found');
  });

  // PUT /tickets/:id
  test('PUT /tickets/:id updates ticket', async () => {
    const ticketData = {
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Original subject',
      description: 'This is the original description',
      priority: 'medium',
      status: 'new',
    };

    const createRes = await request(app).post('/tickets').send(ticketData);
    const ticketId = createRes.body.id;

    const updateData = {
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Updated subject',
      description: 'This is the updated description',
      priority: 'urgent',
      status: 'in_progress',
    };

    const res = await request(app).put(`/tickets/${ticketId}`).send(updateData);
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Updated subject');
    expect(res.body.priority).toBe('urgent');
    expect(res.body.status).toBe('in_progress');
  });

  test('PUT /tickets/:id sets resolved_at when status is resolved', async () => {
    const ticketData = {
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Test ticket',
      description: 'This is a test ticket',
      status: 'new',
    };

    const createRes = await request(app).post('/tickets').send(ticketData);
    const ticketId = createRes.body.id;

    const updateData = {
      ...ticketData,
      status: 'resolved',
    };

    const res = await request(app).put(`/tickets/${ticketId}`).send(updateData);
    expect(res.status).toBe(200);
    expect(res.body.resolved_at).toBeDefined();
    expect(res.body.status).toBe('resolved');
  });

  test('PUT /tickets/:id returns 404 for non-existent ticket', async () => {
    const updateData = {
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Test',
      description: 'Test description',
    };

    const res = await request(app).put('/tickets/non-existent-id').send(updateData);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ticket not found');
  });

  // DELETE /tickets/:id
  test('DELETE /tickets/:id removes ticket', async () => {
    const ticketData = {
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Test ticket',
      description: 'This is a test ticket',
    };

    const createRes = await request(app).post('/tickets').send(ticketData);
    const ticketId = createRes.body.id;

    const deleteRes = await request(app).delete(`/tickets/${ticketId}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/tickets/${ticketId}`);
    expect(getRes.status).toBe(404);
  });

  test('DELETE /tickets/:id returns 404 for non-existent ticket', async () => {
    const res = await request(app).delete('/tickets/non-existent-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ticket not found');
  });

  // POST /tickets/import — status code reflects row-level outcome
  test('POST /tickets/import returns 200 when every row succeeds', async () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description\n' +
      'cust-1,user1@example.com,Alice,Issue 1,This is a valid ticket description\n' +
      'cust-2,user2@example.com,Bob,Issue 2,This is another valid description\n'
    );

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', csv, 'tickets.csv');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 2, successful: 2, failed: 0, errors: [] });
  });

  test('POST /tickets/import returns 207 when some rows fail validation', async () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description\n' +
      'cust-1,user1@example.com,Alice,Issue 1,This is a valid ticket description\n' +
      'cust-2,not-an-email,Bob,Issue 2,This is another valid description\n'
    );

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', csv, 'tickets.csv');

    expect(res.status).toBe(207);
    expect(res.body.total).toBe(2);
    expect(res.body.successful).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toEqual([
      { row: 2, error: 'customer_email must be a valid email address' },
    ]);
  });

  test('POST /tickets/import returns 400 when every row fails validation', async () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description\n' +
      'cust-1,not-an-email,Alice,Issue 1,This is a valid ticket description\n' +
      'cust-2,also-not-an-email,Bob,Issue 2,This is another valid description\n'
    );

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', csv, 'tickets.csv');

    expect(res.status).toBe(400);
    expect(res.body.total).toBe(2);
    expect(res.body.successful).toBe(0);
    expect(res.body.failed).toBe(2);
  });

  test('POST /tickets/import returns 200 for an empty file with no records', async () => {
    const csv = Buffer.from('customer_id,customer_email,customer_name,subject,description\n');

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', csv, 'tickets.csv');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, successful: 0, failed: 0, errors: [] });
  });
});
