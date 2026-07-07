const { parseXML } = require('../src/services/importService');

describe('XML Import', () => {
  test('parses valid XML with multiple tickets', async () => {
    const xml = Buffer.from(`
      <tickets>
        <ticket>
          <customer_id>cust-1</customer_id>
          <customer_email>user1@example.com</customer_email>
          <customer_name>Alice</customer_name>
          <subject>Issue 1</subject>
          <description>This is a test issue with minimum length</description>
        </ticket>
        <ticket>
          <customer_id>cust-2</customer_id>
          <customer_email>user2@example.com</customer_email>
          <customer_name>Bob</customer_name>
          <subject>Issue 2</subject>
          <description>This is another test issue with more details</description>
        </ticket>
      </tickets>
    `);

    const records = await parseXML(xml);
    expect(records.length).toBe(2);
    expect(records[0].customer_id).toBe('cust-1');
    expect(records[1].customer_name).toBe('Bob');
  });

  test('parses XML with metadata', async () => {
    const xml = Buffer.from(`
      <tickets>
        <ticket>
          <customer_id>cust-1</customer_id>
          <customer_email>user@example.com</customer_email>
          <customer_name>Alice</customer_name>
          <subject>Test</subject>
          <description>This is a test issue description</description>
          <metadata>
            <source>web_form</source>
            <browser>Chrome</browser>
            <device_type>desktop</device_type>
          </metadata>
        </ticket>
      </tickets>
    `);

    const records = await parseXML(xml);
    expect(records[0].metadata).toBeDefined();
    expect(records[0].metadata.source).toBe('web_form');
    expect(records[0].metadata.device_type).toBe('desktop');
  });

  test('parses XML with tags', async () => {
    const xml = Buffer.from(`
      <tickets>
        <ticket>
          <customer_id>cust-1</customer_id>
          <customer_email>user@example.com</customer_email>
          <customer_name>Alice</customer_name>
          <subject>Test</subject>
          <description>This is a test issue description</description>
          <tags>
            <tag>urgent</tag>
            <tag>account</tag>
            <tag>login</tag>
          </tags>
        </ticket>
      </tickets>
    `);

    const records = await parseXML(xml);
    expect(records[0].tags).toEqual(['urgent', 'account', 'login']);
  });

  test('parses XML with single tag', async () => {
    const xml = Buffer.from(`
      <tickets>
        <ticket>
          <customer_id>cust-1</customer_id>
          <customer_email>user@example.com</customer_email>
          <customer_name>Alice</customer_name>
          <subject>Test</subject>
          <description>This is a test issue description</description>
          <tags>
            <tag>urgent</tag>
          </tags>
        </ticket>
      </tickets>
    `);

    const records = await parseXML(xml);
    expect(records[0].tags).toEqual(['urgent']);
  });

  test('handles empty XML', async () => {
    const xml = Buffer.from('<tickets></tickets>');

    const records = await parseXML(xml);
    expect(records.length).toBe(0);
  });
});
