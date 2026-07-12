const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store');

beforeEach(() => {
  store.clear();
});

describe('Performance Benchmarks', () => {
  test('creates ticket within 100ms', async () => {
    const startTime = Date.now();

    await request(app).post('/tickets').send({
      customer_id: 'cust-123',
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      subject: 'Test ticket',
      description: 'This is a test ticket description',
    });

    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(100);
  });

  test('lists 1000 tickets within 500ms', async () => {
    // Create 1000 tickets
    for (let i = 0; i < 1000; i++) {
      await request(app).post('/tickets').send({
        customer_id: `cust-${i}`,
        customer_email: `user${i}@example.com`,
        customer_name: `User ${i}`,
        subject: `Issue ${i}`,
        description: `This is issue number ${i} with sufficient description length`,
      });
    }

    const startTime = Date.now();
    const res = await request(app).get('/tickets');
    const endTime = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1000);
    expect(endTime - startTime).toBeLessThan(500);
  });

  test('handles 20 concurrent requests', async () => {
    const startTime = Date.now();
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

    await Promise.all(promises);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(2000);
  });

  test('filters tickets by category efficiently', async () => {
    // Create tickets with different categories
    for (let i = 0; i < 100; i++) {
      const category = i % 2 === 0 ? 'account_access' : 'billing_question';
      await request(app).post('/tickets').send({
        customer_id: `cust-${i}`,
        customer_email: `user${i}@example.com`,
        customer_name: `User ${i}`,
        subject: `Issue ${i}`,
        description: `This is issue number ${i} with sufficient description length`,
        category,
      });
    }

    const startTime = Date.now();
    const res = await request(app).get('/tickets?category=account_access');
    const endTime = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(50);
    expect(endTime - startTime).toBeLessThan(100);
  });

  test('validates ticket data efficiently', async () => {
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      await request(app).post('/tickets').send({
        customer_id: `cust-${i}`,
        customer_email: `user${i}@example.com`,
        customer_name: `User ${i}`,
        subject: `Issue ${i}`,
        description: `This is issue number ${i} with sufficient description length`,
      });
    }

    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(2000);
  });
});
