const CATEGORY_KEYWORDS = {
  account_access:  ['login', 'password', '2fa', 'sign in', 'access', 'locked out', 'account'],
  technical_issue: ['bug', 'error', 'crash', 'broken', 'not working', 'fails', 'exception'],
  billing_question:['payment', 'invoice', 'refund', 'charge', 'billing', 'subscription', 'price'],
  feature_request: ['enhancement', 'suggestion', 'would be great', 'feature', 'improvement', 'request'],
  bug_report:      ['reproduce', 'steps to reproduce', 'defect', 'regression'],
};

// Ordered highest → lowest so first match wins on priority
const PRIORITY_KEYWORDS = [
  { level: 'urgent', keywords: ["can't access", 'critical', 'production down', 'security', 'outage', 'urgent'] },
  { level: 'high',   keywords: ['important', 'blocking', 'asap'] },
  { level: 'low',    keywords: ['minor', 'cosmetic', 'suggestion', 'nice to have'] },
];

function classify(subject, description) {
  const text = `${subject} ${description}`.toLowerCase();

  // Find best category by most keyword hits
  let bestCategory = 'other';
  let bestMatches = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = keywords.filter(kw => text.includes(kw));
    if (matched.length > bestMatches.length) {
      bestCategory = category;
      bestMatches = matched;
    }
  }

  // Confidence: ratio of matched keywords to total in winning category
  let confidence = 0.0;
  if (bestCategory !== 'other') {
    const total = CATEGORY_KEYWORDS[bestCategory].length;
    confidence = Math.max(0.1, bestMatches.length / total);
    confidence = Math.round(confidence * 100) / 100;
  }

  // Priority: first rule whose keyword appears in text
  let priority = 'medium';
  const priorityKeywordsFound = [];

  for (const { level, keywords } of PRIORITY_KEYWORDS) {
    const matched = keywords.filter(kw => text.includes(kw));
    if (matched.length > 0) {
      priority = level;
      priorityKeywordsFound.push(...matched);
      break;
    }
  }

  const allKeywords = [...new Set([...bestMatches, ...priorityKeywordsFound])];

  const reasoningParts = [];
  if (bestMatches.length) reasoningParts.push(`Category keywords matched: ${bestMatches.join(', ')}`);
  if (priorityKeywordsFound.length) reasoningParts.push(`Priority keywords matched: ${priorityKeywordsFound.join(', ')}`);
  if (!reasoningParts.length) reasoningParts.push('No keywords matched; defaulted to other/medium');

  return {
    category: bestCategory,
    priority,
    confidence,
    reasoning: reasoningParts.join('; '),
    keywords_found: allKeywords,
  };
}

module.exports = { classify };
