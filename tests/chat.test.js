jest.mock('../lib/knowledge', () => ({
  getSystemPrompt: () => 'You are Test Cottage Assistant. Respond as JSON { "answer": "...", "suggestions": [...] }',
  getKnowledgeText: () => '## Wi-Fi\nNetwork: TestNet | Password: pass123\n\n## Secret [RESTRICTED]\nCode: 9999'
}));

const { chat } = require('../lib/chat');

function makeClient(responseText) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: responseText }]
      })
    }
  };
}

test('returns parsed answer and suggestions', async () => {
  const client = makeClient(JSON.stringify({
    answer: 'The Wi-Fi password is pass123.',
    suggestions: ['Is there a smart TV?', 'What time is checkout?']
  }));
  const result = await chat({ message: "What's the Wi-Fi?", _client: client });
  expect(result.answer).toBe('The Wi-Fi password is pass123.');
  expect(result.suggestions).toEqual(['Is there a smart TV?', 'What time is checkout?']);
  expect(result.answered).toBe(true);
  expect(result.touchedRestricted).toBe(false);
});

test('answered is false when bot says it does not know', async () => {
  const client = makeClient(JSON.stringify({
    answer: "I'm not sure about that — it's best to ask the owner directly.",
    suggestions: []
  }));
  const result = await chat({ message: 'Is there a kayak?', _client: client });
  expect(result.answered).toBe(false);
  expect(result.touchedRestricted).toBe(false);
});

test('touchedRestricted is true when bot refuses restricted content', async () => {
  const client = makeClient(JSON.stringify({
    answer: "I can't share that here — please contact the owner directly.",
    suggestions: []
  }));
  const result = await chat({ message: 'What is the alarm code?', _client: client });
  expect(result.answered).toBe(false);
  expect(result.touchedRestricted).toBe(true);
});

test('sends system prompt with cache_control: ephemeral', async () => {
  const client = makeClient(JSON.stringify({ answer: 'OK', suggestions: [] }));
  await chat({ message: 'Test', _client: client });
  const call = client.messages.create.mock.calls[0][0];
  expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' });
  expect(call.system[0].text).toContain('Test Cottage Assistant');
});

test('sends knowledge block with cache_control: ephemeral', async () => {
  const client = makeClient(JSON.stringify({ answer: 'OK', suggestions: [] }));
  await chat({ message: 'Test', _client: client });
  const call = client.messages.create.mock.calls[0][0];
  expect(call.system[1].cache_control).toEqual({ type: 'ephemeral' });
  expect(call.system[1].text).toContain('Wi-Fi');
});

test('uses claude-haiku-4-5-20251001 model', async () => {
  const client = makeClient(JSON.stringify({ answer: 'OK', suggestions: [] }));
  await chat({ message: 'Test', _client: client });
  const call = client.messages.create.mock.calls[0][0];
  expect(call.model).toBe('claude-haiku-4-5-20251001');
});

test('includes conversation history in messages array', async () => {
  const client = makeClient(JSON.stringify({ answer: 'OK', suggestions: [] }));
  const history = [
    { role: 'user', content: 'Where is parking?' },
    { role: 'assistant', content: 'Two spaces in the driveway.' }
  ];
  await chat({ message: 'Can I park a van?', history, _client: client });
  const call = client.messages.create.mock.calls[0][0];
  expect(call.messages).toHaveLength(3);
  expect(call.messages[0]).toEqual({ role: 'user', content: 'Where is parking?' });
  expect(call.messages[2]).toEqual({ role: 'user', content: 'Can I park a van?' });
});

test('caps suggestions at 3', async () => {
  const client = makeClient(JSON.stringify({
    answer: 'Sure.',
    suggestions: ['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?']
  }));
  const result = await chat({ message: 'Test', _client: client });
  expect(result.suggestions).toHaveLength(3);
});

test('handles malformed JSON gracefully', async () => {
  const client = makeClient('not json at all');
  const result = await chat({ message: 'Test', _client: client });
  expect(result.answer).toBe('not json at all');
  expect(result.suggestions).toEqual([]);
});

test('strips markdown code fences from response', async () => {
  const client = makeClient('```json\n' + JSON.stringify({ answer: 'Wi-Fi is pass123.', suggestions: ['Q1?'] }) + '\n```');
  const result = await chat({ message: 'Test', _client: client });
  expect(result.answer).toBe('Wi-Fi is pass123.');
  expect(result.suggestions).toEqual(['Q1?']);
});
