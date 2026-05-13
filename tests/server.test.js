jest.mock('../lib/knowledge', () => ({
  getStarters: () => ({
    house_name: 'Test Cottage',
    suggested_questions: ["What's the Wi-Fi?"],
    arrival_brief: ['🔑 Keys: kitchen hook']
  }),
  getSystemPrompt: () => 'prompt',
  getKnowledgeText: () => 'knowledge',
  _resetCache: jest.fn()
}));

jest.mock('../lib/chat', () => ({
  chat: jest.fn().mockResolvedValue({
    answer: 'The Wi-Fi password is pass123.',
    suggestions: ['What time is checkout?'],
    answered: true,
    touchedRestricted: false
  })
}));

jest.mock('../lib/logger', () => ({
  logQuestion: jest.fn()
}));

jest.mock('../lib/digest', () => ({
  start: jest.fn()
}));

const request = require('supertest');
const app = require('../server');
const { chat } = require('../lib/chat');
const { logQuestion } = require('../lib/logger');

afterEach(() => jest.clearAllMocks());

describe('GET /health', () => {
  test('returns 200 with OK body', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });
});

describe('GET /api/starters', () => {
  test('returns house_name, suggested_questions, arrival_brief', async () => {
    const res = await request(app).get('/api/starters');
    expect(res.status).toBe(200);
    expect(res.body.house_name).toBe('Test Cottage');
    expect(res.body.suggested_questions).toEqual(["What's the Wi-Fi?"]);
    expect(res.body.arrival_brief).toEqual(['🔑 Keys: kitchen hook']);
  });
});

describe('POST /api/chat', () => {
  test('returns answer and suggestions', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: "What's the Wi-Fi?", history: [] });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('The Wi-Fi password is pass123.');
    expect(res.body.suggestions).toEqual(['What time is checkout?']);
  });

  test('calls chat() with message and history', async () => {
    await request(app)
      .post('/api/chat')
      .send({
        message: 'Test question',
        history: [{ role: 'user', content: 'prev' }, { role: 'assistant', content: 'prev reply' }]
      });
    expect(chat).toHaveBeenCalledWith({
      message: 'Test question',
      history: [{ role: 'user', content: 'prev' }, { role: 'assistant', content: 'prev reply' }]
    });
  });

  test('calls logQuestion with correct flags', async () => {
    await request(app).post('/api/chat').send({ message: 'Test question' });
    expect(logQuestion).toHaveBeenCalledWith({
      q: 'Test question',
      answered: true,
      restricted: false
    });
  });

  test('returns 400 when message is missing', async () => {
    const res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when message is not a string', async () => {
    const res = await request(app).post('/api/chat').send({ message: 42 });
    expect(res.status).toBe(400);
  });

  test('returns 500 and does not crash when chat() throws', async () => {
    chat.mockRejectedValueOnce(new Error('API failure'));
    const res = await request(app).post('/api/chat').send({ message: 'Test' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});
