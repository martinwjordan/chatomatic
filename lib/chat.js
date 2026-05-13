const Anthropic = require('@anthropic-ai/sdk');
const knowledge = require('./knowledge');

let _defaultClient = null;
function getDefaultClient() {
  if (!_defaultClient) _defaultClient = new Anthropic();
  return _defaultClient;
}

async function chat({ message, history = [], _client }) {
  const client = _client || getDefaultClient();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: knowledge.getSystemPrompt(),
        cache_control: { type: 'ephemeral' }
      },
      {
        type: 'text',
        text: `KNOWLEDGE BASE:\n\n${knowledge.getKnowledgeText()}`,
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: [
      ...history,
      { role: 'user', content: message }
    ]
  });

  const raw = response.content[0].text;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { answer: raw, suggestions: [] };
  }

  const answer = String(parsed.answer || '');
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.slice(0, 3).filter(s => typeof s === 'string')
    : [];
  const touchedRestricted = answer.includes("I can't share that here");
  const answered = !answer.includes("I'm not sure") && !touchedRestricted;

  return { answer, suggestions, answered, touchedRestricted };
}

module.exports = { chat };
