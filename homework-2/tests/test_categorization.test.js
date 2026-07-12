const { classify } = require('../src/services/classificationService');

describe('Ticket Classification', () => {
  test('classifies account access issues', () => {
    const result = classify('Cannot login', 'I cannot sign in to my account after resetting password');
    expect(result.category).toBe('account_access');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.keywords_found).toContain('login');
  });

  test('classifies technical issues', () => {
    const result = classify('App crashes', 'The app crashes when I try to upload files');
    expect(result.category).toBe('technical_issue');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.keywords_found).toContain('crash');
  });

  test('classifies billing questions', () => {
    const result = classify('Unexpected charge', 'I see a charge on my invoice that I did not authorize');
    expect(result.category).toBe('billing_question');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.keywords_found).toContain('invoice');
  });

  test('classifies feature requests', () => {
    const result = classify('Dark mode', 'Would be great if the app had a dark mode feature');
    expect(result.category).toBe('feature_request');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.keywords_found).toContain('feature');
  });

  test('classifies bug reports', () => {
    const result = classify('Reproduction steps', 'Steps to reproduce: 1) Open app 2) Click button 3) Bug occurs');
    expect(result.category).toBe('bug_report');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.keywords_found).toContain('reproduce');
  });

  test('defaults to other category when no keywords match', () => {
    const result = classify('Random title', 'Random description without any specific keywords');
    expect(result.category).toBe('other');
    expect(result.confidence).toBe(0);
  });

  test('assigns urgent priority for critical issues', () => {
    const result = classify('Production down', 'The production server is down and critical for our business');
    expect(result.priority).toBe('urgent');
    expect(result.keywords_found).toContain('production down');
  });

  test('assigns high priority for blocking issues', () => {
    const result = classify('Blocking issue', 'This is blocking us from completing important work');
    expect(result.priority).toBe('high');
    expect(result.keywords_found).toContain('blocking');
  });

  test('assigns low priority for minor issues', () => {
    const result = classify('Minor cosmetic issue', 'There is a minor cosmetic issue with the UI');
    expect(result.priority).toBe('low');
    expect(result.keywords_found).toContain('minor');
  });

  test('defaults to medium priority when no priority keywords match', () => {
    const result = classify('Generic issue', 'This is a generic issue without priority indicators');
    expect(result.priority).toBe('medium');
  });

  test('includes reasoning in classification result', () => {
    const result = classify('Password reset', 'I need help with password reset for my account');
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  test('calculates confidence score correctly', () => {
    const result = classify('Login issue', 'I cannot login or sign in to my account');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
