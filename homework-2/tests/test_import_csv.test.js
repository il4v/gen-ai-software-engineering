const { parseCSV } = require('../src/services/importService');

describe('CSV Import', () => {
  test('parses valid CSV file', () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description\n' +
      'cust-1,user1@example.com,Alice,Issue 1,This is a test issue with minimum length\n' +
      'cust-2,user2@example.com,Bob,Issue 2,This is another test issue with more details\n'
    );

    const records = parseCSV(csv);
    expect(records.length).toBe(2);
    expect(records[0].customer_id).toBe('cust-1');
    expect(records[0].customer_email).toBe('user1@example.com');
    expect(records[1].customer_name).toBe('Bob');
  });

  test('handles tags separated by pipe delimiter', () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description,tags\n' +
      'cust-1,user@example.com,Alice,Test,This is a test issue description,urgent|account|high-priority\n'
    );

    const records = parseCSV(csv);
    expect(records[0].tags).toEqual(['urgent', 'account', 'high-priority']);
  });

  test('parses metadata fields from CSV', () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description,metadata_source,metadata_browser,metadata_device_type\n' +
      'cust-1,user@example.com,Alice,Test,This is a test issue description,web_form,Chrome,desktop\n'
    );

    const records = parseCSV(csv);
    expect(records[0].metadata).toEqual({
      source: 'web_form',
      browser: 'Chrome',
      device_type: 'desktop',
    });
  });

  test('normalizes auto_classify string to boolean', () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description,auto_classify\n' +
      'cust-1,user@example.com,Alice,Test,This is a test issue description,true\n'
    );

    const records = parseCSV(csv);
    expect(records[0].auto_classify).toBe(true);
  });

  test('handles empty CSV gracefully', () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description\n'
    );

    const records = parseCSV(csv);
    expect(records.length).toBe(0);
  });

  test('trims whitespace from CSV fields', () => {
    const csv = Buffer.from(
      'customer_id,customer_email,customer_name,subject,description\n' +
      '  cust-1  ,  user@example.com  ,  Alice  ,  Test  ,  This is a test issue description  \n'
    );

    const records = parseCSV(csv);
    expect(records[0].customer_id).toBe('cust-1');
    expect(records[0].customer_email).toBe('user@example.com');
    expect(records[0].customer_name).toBe('Alice');
  });
});
