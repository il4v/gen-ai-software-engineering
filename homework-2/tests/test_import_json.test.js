const { parseJSON } = require('../src/services/importService');

describe('JSON Import', () => {
  test('parses valid JSON array', () => {
    const json = Buffer.from(JSON.stringify([
      {
        customer_id: 'cust-1',
        customer_email: 'user1@example.com',
        customer_name: 'Alice',
        subject: 'Issue 1',
        description: 'This is a test issue with minimum length',
      },
      {
        customer_id: 'cust-2',
        customer_email: 'user2@example.com',
        customer_name: 'Bob',
        subject: 'Issue 2',
        description: 'This is another test issue with more details',
      },
    ]));

    const records = parseJSON(json);
    expect(records.length).toBe(2);
    expect(records[0].customer_id).toBe('cust-1');
    expect(records[1].customer_name).toBe('Bob');
  });

  test('rejects JSON that is not an array', () => {
    const json = Buffer.from(JSON.stringify({
      customer_id: 'cust-1',
      customer_email: 'user@example.com',
      customer_name: 'Alice',
      subject: 'Test',
      description: 'This is a test issue description',
    }));

    expect(() => parseJSON(json)).toThrow('JSON body must be an array of ticket objects');
  });

  test('preserves complex metadata in JSON', () => {
    const json = Buffer.from(JSON.stringify([
      {
        customer_id: 'cust-1',
        customer_email: 'user@example.com',
        customer_name: 'Alice',
        subject: 'Test',
        description: 'This is a test issue description',
        metadata: {
          source: 'api',
          browser: 'Firefox',
          device_type: 'mobile',
        },
      },
    ]));

    const records = parseJSON(json);
    expect(records[0].metadata).toEqual({
      source: 'api',
      browser: 'Firefox',
      device_type: 'mobile',
    });
  });

  test('handles tags array in JSON', () => {
    const json = Buffer.from(JSON.stringify([
      {
        customer_id: 'cust-1',
        customer_email: 'user@example.com',
        customer_name: 'Alice',
        subject: 'Test',
        description: 'This is a test issue description',
        tags: ['urgent', 'account', 'login'],
      },
    ]));

    const records = parseJSON(json);
    expect(records[0].tags).toEqual(['urgent', 'account', 'login']);
  });

  test('handles empty JSON array', () => {
    const json = Buffer.from(JSON.stringify([]));

    const records = parseJSON(json);
    expect(records.length).toBe(0);
  });
});
