# Chatomatic Core App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/Express chatbot that answers holiday home guests' questions from a Markdown knowledge base, with a plain-HTML frontend, email digest, and Docker deployment.

**Architecture:** Express server exposes three endpoints (`/`, `/api/chat`, `/api/starters`, `/health`). `lib/knowledge.js` parses `data/knowledge.md` once at startup. `lib/chat.js` calls Claude Haiku with prompt caching (system + knowledge in cached system blocks). Frontend is plain HTML/CSS/JS — no build step. `lib/digest.js` schedules a daily email via node-cron + nodemailer.

**Tech Stack:** Node.js 20, Express 4, `@anthropic-ai/sdk`, `gray-matter`, `express-rate-limit`, `node-cron`, `nodemailer`, `mammoth` (scripts only). Jest + supertest for tests.

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts, Jest config |
| `.gitignore` | Exclude .env, node_modules, data/, GAPS.md |
| `.env.example` | Env var documentation |
| `data/knowledge.md` | Sample knowledge base (owner edits this) |
| `lib/knowledge.js` | Parse knowledge.md once; expose getSystemPrompt, getKnowledgeText, getStarters |
| `lib/logger.js` | Append JSON-line entries to questions.log |
| `lib/chat.js` | Call Claude API with cached prompts; parse {answer, suggestions, answered, touchedRestricted} |
| `lib/digest.js` | Cron-scheduled daily email digest; pure functions exported for testing |
| `server.js` | Express entry point; routes; rate limiting; starts digest cron |
| `public/index.html` | Chat UI shell |
| `public/style.css` | Styles — light blue/green gradient, white bubbles |
| `public/app.js` | All frontend interactivity — no framework |
| `scripts/ingest.js` | One-off: .docx → knowledge.md via mammoth + Claude |
| `scripts/analyze-gaps.js` | Periodic: knowledge.md + questions.log → GAPS.md via Claude |
| `Dockerfile` | Node 20 Alpine, copies app, exposes 3000 |
| `docker-compose.yml` | Container config with volume mount and health check |
| `tests/knowledge.test.js` | Unit tests for knowledge.js |
| `tests/logger.test.js` | Unit tests for logger.js |
| `tests/chat.test.js` | Unit tests for chat.js (mocked Anthropic client) |
| `tests/server.test.js` | Integration tests via supertest (mocked lib modules) |
| `tests/digest.test.js` | Unit tests for pure digest functions |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `data/knowledge.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "chatomatic",
  "version": "1.0.0",
  "description": "Holiday home chatbot powered by Claude",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "jest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "express": "^4.18.0",
    "express-rate-limit": "^7.0.0",
    "gray-matter": "^4.0.3",
    "mammoth": "^1.6.0",
    "node-cron": "^3.0.0",
    "nodemailer": "^6.9.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "supertest": "^6.3.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.env
data/
GAPS.md
```

- [ ] **Step 3: Create `.env.example`**

```env
ANTHROPIC_API_KEY=sk-ant-...
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
DIGEST_EMAIL=you@gmail.com
DIGEST_CRON=0 7 * * *
HOUSE_NAME=Honeysuckle Cottage
RATE_LIMIT_MAX=30
PORT=3000
```

- [ ] **Step 4: Create `data/knowledge.md`** (sample — owner replaces this)

```markdown
---
house_name: Honeysuckle Cottage
owner_contact: owner@email.com
suggested_questions:
  - What's the Wi-Fi password?
  - Where should we park?
  - What time is checkout?
  - Any good restaurants nearby?
arrival_brief:
  - "🔑 Keys: leave on the kitchen hook when you go out"
  - "🌡️ Heating: thermostat in the hallway, default 20°C"
  - "🗑️ Bins: black bin Tuesday · recycling Friday · bags under sink"
  - "📶 Wi-Fi: CottageGuest / sunflower22"
  - "📞 Owner: 07700 900000 if anything urgent"
---

## Wi-Fi
Network: CottageGuest
Password: sunflower22

## Parking
Two spaces in the driveway. Please do not block the gate.

## Checkout
Checkout is by 10am. Leave keys on the kitchen hook. No need to strip beds.

## Alarm Code [RESTRICTED]
The alarm code is 4821. Set it whenever leaving the property.

## Heating
The thermostat is in the hallway. Default setting is 20°C. The boiler is in the under-stairs cupboard.

## Local Restaurants
The Fox & Hound is a 5-minute walk and serves food until 9pm. The Swan in the village does Sunday roasts. Both accept walk-ins.

## Supermarket
Tesco Express is a 10-minute drive. There is also a farm shop 2 miles toward Ashford.

## Bins
Black bin: collected Tuesday morning. Recycling: collected Friday morning. Extra bags under the sink.
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore .env.example data/knowledge.md
git commit -m "feat: project scaffolding — package.json, .env.example, sample knowledge.md"
```

---

## Task 2: `lib/knowledge.js`

**Files:**
- Create: `lib/knowledge.js`
- Create: `tests/knowledge.test.js`

`knowledge.js` reads `data/knowledge.md` on first call (lazy, cached). Uses `KNOWLEDGE_PATH` env var so tests can redirect it. Exports `_resetCache()` for test isolation.

- [ ] **Step 1: Write the failing tests**

Create `tests/knowledge.test.js`:

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');

const SAMPLE_MD = `---
house_name: Test Cottage
owner_contact: test@example.com
suggested_questions:
  - What's the Wi-Fi?
  - Where to park?
arrival_brief:
  - "🔑 Keys: kitchen hook"
  - "📶 Wi-Fi: TestNet / pass123"
---

## Wi-Fi
Network: TestNet | Password: pass123

## Secret Code [RESTRICTED]
The code is 9999.

## Parking
Two spaces available.
`;

let tmpFile;
let knowledge;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `knowledge-test-${Date.now()}.md`);
  fs.writeFileSync(tmpFile, SAMPLE_MD);
  process.env.KNOWLEDGE_PATH = tmpFile;
  jest.resetModules();
  knowledge = require('../lib/knowledge');
});

afterEach(() => {
  fs.unlinkSync(tmpFile);
  delete process.env.KNOWLEDGE_PATH;
  delete process.env.HOUSE_NAME;
});

test('getStarters returns house_name from frontmatter', () => {
  const starters = knowledge.getStarters();
  expect(starters.house_name).toBe('Test Cottage');
});

test('getStarters returns suggested_questions array', () => {
  const starters = knowledge.getStarters();
  expect(starters.suggested_questions).toEqual(["What's the Wi-Fi?", 'Where to park?']);
});

test('getStarters returns arrival_brief array', () => {
  const starters = knowledge.getStarters();
  expect(starters.arrival_brief).toEqual(['🔑 Keys: kitchen hook', '📶 Wi-Fi: TestNet / pass123']);
});

test('HOUSE_NAME env var overrides frontmatter house_name', () => {
  process.env.HOUSE_NAME = 'Override House';
  jest.resetModules();
  const k = require('../lib/knowledge');
  expect(k.getStarters().house_name).toBe('Override House');
});

test('getKnowledgeText returns markdown body (not frontmatter)', () => {
  const text = knowledge.getKnowledgeText();
  expect(text).toContain('## Wi-Fi');
  expect(text).toContain('## Parking');
  expect(text).not.toContain('house_name:');
});

test('getSystemPrompt contains house name', () => {
  const prompt = knowledge.getSystemPrompt();
  expect(prompt).toContain('Test Cottage');
});

test('getSystemPrompt instructs restricted handling', () => {
  const prompt = knowledge.getSystemPrompt();
  expect(prompt).toContain('[RESTRICTED]');
  expect(prompt).toContain("I can't share that here");
});

test('getSystemPrompt instructs JSON response format', () => {
  const prompt = knowledge.getSystemPrompt();
  expect(prompt).toContain('"answer"');
  expect(prompt).toContain('"suggestions"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/knowledge.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../lib/knowledge'`

- [ ] **Step 3: Implement `lib/knowledge.js`**

```javascript
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

let _cache = null;

function getPath() {
  return process.env.KNOWLEDGE_PATH || path.join(__dirname, '../data/knowledge.md');
}

function parse() {
  if (_cache) return _cache;
  const raw = fs.readFileSync(getPath(), 'utf8');
  const { data: frontmatter, content } = matter(raw);
  const houseName = process.env.HOUSE_NAME || frontmatter.house_name || 'Your Holiday Home';
  _cache = { frontmatter, content, houseName };
  return _cache;
}

function _resetCache() {
  _cache = null;
}

function getSystemPrompt() {
  const { houseName } = parse();
  return `You are ${houseName} Assistant, a friendly and helpful guide for guests staying at ${houseName}.

Answer questions using ONLY the information in the knowledge base below. Do not invent, guess, or infer anything not explicitly stated.

If asked about a section marked [RESTRICTED], say: "I can't share that here — please contact the owner directly." Do not quote or summarise the content of restricted sections.

If you don't know the answer, say: "I'm not sure about that — it's best to ask the owner directly."

Always respond in a warm, concise, and friendly tone. Use the guest's question to generate up to 3 relevant follow-up questions they might want to ask next.

Respond ONLY as valid JSON in this exact format:
{
  "answer": "Your answer here.",
  "suggestions": ["Follow-up 1?", "Follow-up 2?", "Follow-up 3?"]
}`;
}

function getKnowledgeText() {
  return parse().content;
}

function getStarters() {
  const { frontmatter, houseName } = parse();
  return {
    house_name: houseName,
    suggested_questions: frontmatter.suggested_questions || [],
    arrival_brief: frontmatter.arrival_brief || []
  };
}

module.exports = { getSystemPrompt, getKnowledgeText, getStarters, _resetCache };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/knowledge.test.js --no-coverage`

Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add lib/knowledge.js tests/knowledge.test.js
git commit -m "feat: lib/knowledge.js — parse knowledge.md, expose getters"
```

---

## Task 3: `lib/logger.js`

**Files:**
- Create: `lib/logger.js`
- Create: `tests/logger.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/logger.test.js`:

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpLog;
let logger;

beforeEach(() => {
  tmpLog = path.join(os.tmpdir(), `logger-test-${Date.now()}.log`);
  process.env.LOG_PATH = tmpLog;
  jest.resetModules();
  logger = require('../lib/logger');
});

afterEach(() => {
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);
  delete process.env.LOG_PATH;
});

test('creates log file and appends a valid JSON line', () => {
  logger.logQuestion({ q: "What's the Wi-Fi?", answered: true, restricted: false });
  const lines = fs.readFileSync(tmpLog, 'utf8').trim().split('\n');
  expect(lines).toHaveLength(1);
  const entry = JSON.parse(lines[0]);
  expect(entry.q).toBe("What's the Wi-Fi?");
  expect(entry.answered).toBe(true);
  expect(entry.restricted).toBe(false);
});

test('ts field is an ISO 8601 string', () => {
  logger.logQuestion({ q: 'Test', answered: true, restricted: false });
  const entry = JSON.parse(fs.readFileSync(tmpLog, 'utf8').trim());
  expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  expect(() => new Date(entry.ts)).not.toThrow();
});

test('appends multiple entries on separate lines', () => {
  logger.logQuestion({ q: 'Q1', answered: true, restricted: false });
  logger.logQuestion({ q: 'Q2', answered: false, restricted: false });
  logger.logQuestion({ q: 'Q3', answered: false, restricted: true });
  const lines = fs.readFileSync(tmpLog, 'utf8').trim().split('\n');
  expect(lines).toHaveLength(3);
  expect(JSON.parse(lines[1]).q).toBe('Q2');
  expect(JSON.parse(lines[2]).restricted).toBe(true);
});

test('coerces answered and restricted to booleans', () => {
  logger.logQuestion({ q: 'Test', answered: 1, restricted: 0 });
  const entry = JSON.parse(fs.readFileSync(tmpLog, 'utf8').trim());
  expect(entry.answered).toBe(true);
  expect(entry.restricted).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/logger.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../lib/logger'`

- [ ] **Step 3: Implement `lib/logger.js`**

```javascript
const fs = require('fs');
const path = require('path');

function getLogPath() {
  return process.env.LOG_PATH || path.join(__dirname, '../data/questions.log');
}

function logQuestion({ q, answered, restricted }) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    q: String(q),
    answered: Boolean(answered),
    restricted: Boolean(restricted)
  });
  fs.appendFileSync(getLogPath(), entry + '\n');
}

module.exports = { logQuestion };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/logger.test.js --no-coverage`

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/logger.js tests/logger.test.js
git commit -m "feat: lib/logger.js — append JSON-line entries to questions.log"
```

---

## Task 4: `lib/chat.js`

**Files:**
- Create: `lib/chat.js`
- Create: `tests/chat.test.js`

`chat.js` uses a `_client` default parameter for testability — no real API calls in tests. `knowledge` module is mocked at the Jest module level.

- [ ] **Step 1: Write the failing tests**

Create `tests/chat.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/chat.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../lib/chat'`

- [ ] **Step 3: Implement `lib/chat.js`**

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/chat.test.js --no-coverage`

Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
git add lib/chat.js tests/chat.test.js
git commit -m "feat: lib/chat.js — Claude Haiku with prompt caching, structured JSON response"
```

---

## Task 5: `server.js`

**Files:**
- Create: `server.js`
- Create: `tests/server.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/server.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/server.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../server'`

- [ ] **Step 3: Implement `server.js`**

```javascript
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const knowledge = require('./lib/knowledge');
const { chat } = require('./lib/chat');
const { logQuestion } = require('./lib/logger');
const digest = require('./lib/digest');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You've sent a lot of questions — give it an hour and try again." }
});

app.get('/health', (req, res) => res.send('OK'));

app.get('/api/starters', (req, res) => {
  res.json(knowledge.getStarters());
});

app.post('/api/chat', limiter, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message must be a non-empty string' });
  }
  try {
    const { answer, suggestions, answered, touchedRestricted } = await chat({ message, history });
    logQuestion({ q: message, answered, restricted: touchedRestricted });
    res.json({ answer, suggestions });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Something went wrong — please try again.' });
  }
});

if (require.main === module) {
  digest.start();
  const PORT = parseInt(process.env.PORT, 10) || 3000;
  app.listen(PORT, () => console.log(`Chatomatic running on port ${PORT}`));
}

module.exports = app;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/server.test.js --no-coverage`

Expected: PASS — 8 tests

- [ ] **Step 5: Run all tests together to confirm nothing broke**

Run: `npx jest --no-coverage`

Expected: PASS — all tests across knowledge, logger, chat, server

- [ ] **Step 6: Commit**

```bash
git add server.js tests/server.test.js
git commit -m "feat: server.js — Express routes, rate limiting, /api/chat, /api/starters, /health"
```

---

## Task 6: Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

No unit tests — manual browser testing after npm start.

- [ ] **Step 1: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chatomatic</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <header id="header">
      <div class="header-text">
        <div id="house-name">Loading...</div>
        <p class="tagline">Ask me anything about your stay</p>
      </div>
      <button id="arrived-btn" style="display:none">🏠 I've arrived</button>
    </header>
    <div id="messages-container">
      <div id="starter-chips"></div>
      <div id="messages"></div>
      <div id="typing" style="display:none">💬 Typing...</div>
      <div id="suggestions"></div>
    </div>
    <div id="input-bar">
      <input id="input" type="text" placeholder="Ask a question..." autocomplete="off">
      <button id="send-btn">&#10148;</button>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/style.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #e0f2fe 0%, #dcfce7 100%);
  min-height: 100vh;
}

#app {
  max-width: 680px;
  margin: 0 auto;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: transparent;
}

#header {
  background: white;
  padding: 1rem 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-shrink: 0;
}

#house-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1e40af;
}

.tagline {
  font-size: 0.8rem;
  color: #6b7280;
  margin-top: 0.15rem;
}

#arrived-btn {
  background: #f59e0b;
  color: white;
  border: none;
  border-radius: 20px;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
  flex-shrink: 0;
}

#arrived-btn:hover { background: #d97706; }

#messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}

#starter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

#messages {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.message {
  max-width: 80%;
  padding: 0.7rem 1rem;
  border-radius: 18px;
  font-size: 0.95rem;
  line-height: 1.55;
  word-wrap: break-word;
}

.user-message {
  background: #3b82f6;
  color: white;
  align-self: flex-end;
  border-bottom-right-radius: 4px;
}

.message-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  align-self: flex-start;
  max-width: 85%;
}

.avatar {
  font-size: 1.1rem;
  flex-shrink: 0;
  margin-top: 0.3rem;
}

.bot-message {
  background: white;
  color: #1f2937;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}

.bot-message ul { padding-left: 1.2rem; margin-top: 0.25rem; }
.bot-message li { margin-bottom: 0.2rem; }

#typing {
  color: #6b7280;
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

#suggestions {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: flex-start;
}

.suggestions-label {
  width: 100%;
  font-size: 0.78rem;
  color: #6b7280;
  margin-bottom: 0.1rem;
}

.chip {
  background: white;
  border: 1.5px solid #bbf7d0;
  color: #065f46;
  padding: 0.35rem 0.8rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.12s;
  font-family: inherit;
}

.chip:hover { background: #d1fae5; }

.suggestion-chip {
  background: #f0fdf4;
  border-color: #22c55e;
}

#input-bar {
  background: white;
  padding: 0.75rem 1rem;
  display: flex;
  gap: 0.5rem;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

#input {
  flex: 1;
  padding: 0.6rem 1rem;
  border: 1.5px solid #d1d5db;
  border-radius: 24px;
  font-size: 0.95rem;
  outline: none;
  font-family: inherit;
}

#input:focus { border-color: #3b82f6; }

#send-btn {
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

#send-btn:hover { background: #2563eb; }

@media (max-width: 480px) {
  #app { max-width: 100%; }
  .message { max-width: 90%; }
  .message-wrapper { max-width: 95%; }
}
```

- [ ] **Step 3: Create `public/app.js`**

```javascript
let history = [];
let starters = null;
let conversationStarted = false;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  container.scrollTop = container.scrollHeight;
}

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.textContent = text;
  document.getElementById('messages').appendChild(div);
  scrollToBottom();
}

function appendBotMessage(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = '🏠';
  const div = document.createElement('div');
  div.className = 'message bot-message';
  div.textContent = text;
  wrapper.appendChild(avatar);
  wrapper.appendChild(div);
  document.getElementById('messages').appendChild(wrapper);
  scrollToBottom();
}

function appendBotMessageHtml(html) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = '🏠';
  const div = document.createElement('div');
  div.className = 'message bot-message';
  div.innerHTML = html;
  wrapper.appendChild(avatar);
  wrapper.appendChild(div);
  document.getElementById('messages').appendChild(wrapper);
  scrollToBottom();
}

function renderSuggestions(suggestions) {
  const container = document.getElementById('suggestions');
  container.innerHTML = '';
  if (!suggestions.length) return;
  const label = document.createElement('p');
  label.className = 'suggestions-label';
  label.textContent = 'You might also want to know:';
  container.appendChild(label);
  suggestions.forEach(s => {
    const chip = document.createElement('button');
    chip.className = 'chip suggestion-chip';
    chip.textContent = s;
    chip.addEventListener('click', () => sendMessage(s));
    container.appendChild(chip);
  });
}

function clearSuggestions() {
  document.getElementById('suggestions').innerHTML = '';
}

function showTyping() {
  document.getElementById('typing').style.display = 'block';
  scrollToBottom();
}

function hideTyping() {
  document.getElementById('typing').style.display = 'none';
}

function hideStarterChips() {
  document.getElementById('starter-chips').style.display = 'none';
}

async function sendMessage(text) {
  if (!text.trim()) return;
  if (!conversationStarted) {
    hideStarterChips();
    conversationStarted = true;
  }
  clearSuggestions();
  appendUserMessage(text);
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history })
    });
    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      appendBotMessage(data.error || 'Something went wrong. Please try again.');
      return;
    }

    appendBotMessage(data.answer);
    renderSuggestions(data.suggestions || []);

    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: data.answer });
    if (history.length > 6) history = history.slice(-6);
  } catch {
    hideTyping();
    appendBotMessage("Hmm, I couldn't connect — please try again.");
  }
}

function handleArrived() {
  localStorage.setItem('chatomatic_arrived', '1');
  document.getElementById('arrived-btn').style.display = 'none';
  if (!conversationStarted) {
    hideStarterChips();
    conversationStarted = true;
  }
  const brief = starters.arrival_brief;
  const html = '<strong>Welcome! Here\'s your arrival checklist:</strong><br><br>' +
    brief.map(item => '• ' + escapeHtml(item)).join('<br>');
  appendBotMessageHtml(html);
}

async function init() {
  starters = await fetch('/api/starters').then(r => r.json());

  document.title = starters.house_name;
  document.getElementById('house-name').textContent = starters.house_name;

  if (!localStorage.getItem('chatomatic_arrived')) {
    const btn = document.getElementById('arrived-btn');
    btn.style.display = 'inline-block';
    btn.addEventListener('click', handleArrived);
  }

  const chipsContainer = document.getElementById('starter-chips');
  starters.suggested_questions.forEach(q => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = q;
    chip.addEventListener('click', () => sendMessage(q));
    chipsContainer.appendChild(chip);
  });

  document.getElementById('input').focus();
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');

  sendBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (text) { input.value = ''; sendMessage(text); }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (text) { input.value = ''; sendMessage(text); }
    }
  });
});
```

- [ ] **Step 4: Verify server starts cleanly**

Copy `.env.example` to `.env`, fill in a real `ANTHROPIC_API_KEY`. Then:

Run: `node server.js`

Expected output: `Chatomatic running on port 3000`

- [ ] **Step 5: Test in browser**

Open `http://localhost:3000`. Verify:
- House name appears in header (from `data/knowledge.md`)
- Starter chips appear
- "I've arrived" button is visible
- Typing a question and pressing Enter sends it
- Bot responds with an answer and green suggestion chips
- Clicking a suggestion chip submits it as a question
- "I've arrived" button triggers arrival brief, then disappears
- Refreshing hides the "I've arrived" button (localStorage set)
- On a narrow browser window, layout is still usable (chips wrap, input fixed to bottom)

Stop server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/style.css public/app.js
git commit -m "feat: frontend — chat UI with starter chips, suggestions, I've arrived button"
```

---

## Task 7: `lib/digest.js`

**Files:**
- Create: `lib/digest.js`
- Create: `tests/digest.test.js`

Pure functions `formatDigest` and `filterLast24h` are unit-tested. `sendDigest` is tested with a mocked nodemailer transport.

- [ ] **Step 1: Write the failing tests**

Create `tests/digest.test.js`:

```javascript
const os = require('os');
const fs = require('fs');
const path = require('path');

jest.mock('nodemailer');
const nodemailer = require('nodemailer');

let digest;
let mockSendMail;

beforeEach(() => {
  mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
  nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });
  jest.resetModules();
  digest = require('../lib/digest');

  process.env.GMAIL_USER = 'sender@gmail.com';
  process.env.GMAIL_APP_PASSWORD = 'testpass';
  process.env.DIGEST_EMAIL = 'owner@gmail.com';
  process.env.HOUSE_NAME = 'Test Cottage';
});

afterEach(() => {
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.DIGEST_EMAIL;
  delete process.env.HOUSE_NAME;
  delete process.env.LOG_PATH;
});

describe('filterLast24h', () => {
  test('keeps entries within the last 24 hours', () => {
    const now = Date.now();
    const entries = [
      { ts: new Date(now - 1000).toISOString(), q: 'Recent' },
      { ts: new Date(now - 23 * 60 * 60 * 1000).toISOString(), q: 'Almost 24h' },
      { ts: new Date(now - 25 * 60 * 60 * 1000).toISOString(), q: 'Old' }
    ];
    const result = digest.filterLast24h(entries);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.q)).not.toContain('Old');
  });
});

describe('formatDigest', () => {
  const entries = [
    { ts: '2026-05-13T10:22:00Z', q: "What's the Wi-Fi?", answered: true, restricted: false },
    { ts: '2026-05-13T11:05:00Z', q: "What's the alarm code?", answered: false, restricted: true },
    { ts: '2026-05-13T14:30:00Z', q: 'Is there a kayak?', answered: false, restricted: false }
  ];

  test('includes summary counts', () => {
    const text = digest.formatDigest(entries, new Date('2026-05-13T07:00:00Z'));
    expect(text).toContain('Questions today: 3');
    expect(text).toContain('Answered: 1');
    expect(text).toContain('Unanswered: 1');
  });

  test('includes UNANSWERED section when there are unanswered questions', () => {
    const text = digest.formatDigest(entries, new Date('2026-05-13T07:00:00Z'));
    expect(text).toContain('UNANSWERED');
    expect(text).toContain('Is there a kayak?');
  });

  test('includes RESTRICTED section', () => {
    const text = digest.formatDigest(entries, new Date('2026-05-13T07:00:00Z'));
    expect(text).toContain('RESTRICTED');
    expect(text).toContain("What's the alarm code?");
  });

  test('includes ALL QUESTIONS section', () => {
    const text = digest.formatDigest(entries, new Date('2026-05-13T07:00:00Z'));
    expect(text).toContain('ALL QUESTIONS');
    expect(text).toContain("What's the Wi-Fi?");
  });

  test('omits UNANSWERED section when all questions were answered', () => {
    const allAnswered = [
      { ts: '2026-05-13T10:22:00Z', q: "Wi-Fi?", answered: true, restricted: false }
    ];
    const text = digest.formatDigest(allAnswered, new Date('2026-05-13T07:00:00Z'));
    expect(text).not.toContain('UNANSWERED');
  });

  test('includes house name', () => {
    const text = digest.formatDigest(entries, new Date('2026-05-13T07:00:00Z'));
    expect(text).toContain('Test Cottage');
  });
});

describe('sendDigest', () => {
  test('does not send email when log file does not exist', async () => {
    process.env.LOG_PATH = path.join(os.tmpdir(), `no-log-${Date.now()}.log`);
    await digest.sendDigest();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('does not send email when log has no entries in last 24h', async () => {
    const tmpLog = path.join(os.tmpdir(), `old-log-${Date.now()}.log`);
    const oldEntry = JSON.stringify({
      ts: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      q: 'Old question', answered: true, restricted: false
    });
    fs.writeFileSync(tmpLog, oldEntry + '\n');
    process.env.LOG_PATH = tmpLog;
    await digest.sendDigest();
    expect(mockSendMail).not.toHaveBeenCalled();
    fs.unlinkSync(tmpLog);
  });

  test('sends email with subject containing house name when questions exist', async () => {
    const tmpLog = path.join(os.tmpdir(), `recent-log-${Date.now()}.log`);
    const recentEntry = JSON.stringify({
      ts: new Date().toISOString(),
      q: 'Is there parking?', answered: true, restricted: false
    });
    fs.writeFileSync(tmpLog, recentEntry + '\n');
    process.env.LOG_PATH = tmpLog;
    await digest.sendDigest();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Test Cottage');
    expect(call.to).toBe('owner@gmail.com');
    fs.unlinkSync(tmpLog);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/digest.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../lib/digest'`

- [ ] **Step 3: Implement `lib/digest.js`**

```javascript
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

function getLogPath() {
  return process.env.LOG_PATH || path.join(__dirname, '../data/questions.log');
}

function readEntries() {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function filterLast24h(entries) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return entries.filter(e => new Date(e.ts) >= cutoff);
}

function formatDigest(entries, date) {
  const houseName = process.env.HOUSE_NAME || 'Your House';
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const answered = entries.filter(e => e.answered);
  const unanswered = entries.filter(e => !e.answered && !e.restricted);
  const restricted = entries.filter(e => e.restricted);

  let text = `${houseName} — Daily Question Digest — ${dateStr}\n\n`;
  text += `Questions today: ${entries.length}  |  Answered: ${answered.length}  |  Unanswered: ${unanswered.length}\n\n`;

  if (unanswered.length) {
    text += `━━━ UNANSWERED — consider adding to knowledge.md ━━━\n`;
    unanswered.forEach(e => { text += `  ${e.ts.substring(11, 16)}  ${e.q}\n`; });
    text += '\n';
  }

  if (restricted.length) {
    text += `━━━ RESTRICTED (correctly handled) ━━━\n`;
    restricted.forEach(e => { text += `  ${e.ts.substring(11, 16)}  ${e.q}\n`; });
    text += '\n';
  }

  text += `━━━ ALL QUESTIONS ━━━\n`;
  entries.forEach(e => {
    const icon = e.restricted ? '🔒' : e.answered ? '✓ ' : '? ';
    text += `  ${e.ts.substring(11, 16)}  ${icon}  ${e.q}\n`;
  });

  return text;
}

async function sendDigest() {
  const entries = filterLast24h(readEntries());
  if (entries.length === 0) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const now = new Date();
  const houseName = process.env.HOUSE_NAME || 'Your House';
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.DIGEST_EMAIL,
    subject: `${houseName} — Question Digest — ${dateStr}`,
    text: formatDigest(entries, now)
  });

  console.log(`Digest sent: ${entries.length} questions`);
}

function start() {
  const schedule = process.env.DIGEST_CRON || '0 7 * * *';
  cron.schedule(schedule, sendDigest);
  console.log(`Digest scheduled: ${schedule}`);
}

module.exports = { start, sendDigest, formatDigest, filterLast24h };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/digest.test.js --no-coverage`

Expected: PASS — 9 tests

- [ ] **Step 5: Run the full test suite**

Run: `npx jest --no-coverage`

Expected: PASS — all tests

- [ ] **Step 6: Commit**

```bash
git add lib/digest.js tests/digest.test.js
git commit -m "feat: lib/digest.js — daily email digest via cron + nodemailer"
```

---

## Task 8: `scripts/ingest.js`

**Files:**
- Create: `scripts/ingest.js`

One-off script — no unit tests. Manual verification with a test document.

- [ ] **Step 1: Implement `scripts/ingest.js`**

```javascript
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');

async function ingest(docxPath) {
  if (!fs.existsSync(docxPath)) {
    console.error(`File not found: ${docxPath}`);
    process.exit(1);
  }

  console.log('Extracting text from document...');
  const result = await mammoth.extractRawText({ path: docxPath });
  const rawText = result.value;
  if (!rawText.trim()) {
    console.error('No text extracted — is this a valid .docx file?');
    process.exit(1);
  }
  console.log(`Extracted ${rawText.length} characters.`);

  const client = new Anthropic();
  console.log('Structuring with Claude...');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Convert this holiday home guide into a structured Markdown knowledge base.

Requirements:
- Organise content under clear ## Markdown headings by topic
- Mark sensitive content (alarm codes, lock codes, financial info, private contacts other than owner) with [RESTRICTED] in the heading, e.g. ## Alarm Code [RESTRICTED]
- Extract 3-4 natural starter questions a guest might ask
- Write a YAML frontmatter block at the very top with:
  - house_name: (from document, or "Holiday Home" if not found)
  - owner_contact: (from document, or "see welcome pack" if not found)
  - suggested_questions: (the 3-4 starter questions as a YAML list)
  - arrival_brief: (exactly 5 bullet strings covering: keys, heating, bins, Wi-Fi, owner contact — format: "emoji Topic: detail")
- Output ONLY the Markdown file content — no explanation, no preamble

DOCUMENT:
${rawText}`
    }]
  });

  const structured = response.content[0].text.trim();
  const outPath = path.join(__dirname, '../data/knowledge.md');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, structured, 'utf8');

  const lines = structured.split('\n');
  const restrictedCount = lines.filter(l => l.includes('[RESTRICTED]')).length;
  const headingCount = lines.filter(l => /^##\s/.test(l)).length;

  console.log(`\nWritten to ${outPath}`);
  console.log(`Sections: ${headingCount}  |  Restricted: ${restrictedCount}`);
  console.log('\nNext steps:');
  console.log('  1. Review data/knowledge.md');
  console.log('  2. Adjust [RESTRICTED] tags as needed');
  console.log('  3. Fill in or verify arrival_brief items');
  console.log('  4. Confirm suggested_questions');
  console.log('  5. Restart the container');
}

const docxPath = process.argv[2];
if (!docxPath) {
  console.error('Usage: node scripts/ingest.js "House Guide.docx"');
  process.exit(1);
}

ingest(path.resolve(docxPath)).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Test with a real .docx file** (if available, otherwise skip)

Run: `node scripts/ingest.js "path/to/any.docx"`

Expected: `data/knowledge.md` written with YAML frontmatter and Markdown sections.

If no .docx is available, defer until initial setup. The script is not required to run the app.

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest.js
git commit -m "feat: scripts/ingest.js — Word doc to knowledge.md via mammoth + Claude"
```

---

## Task 9: `scripts/analyze-gaps.js`

**Files:**
- Create: `scripts/analyze-gaps.js`

- [ ] **Step 1: Implement `scripts/analyze-gaps.js`**

```javascript
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

async function analyzeGaps() {
  const knowledgePath = path.join(__dirname, '../data/knowledge.md');
  const logPath = path.join(__dirname, '../data/questions.log');

  if (!fs.existsSync(knowledgePath)) {
    console.error('data/knowledge.md not found. Run scripts/ingest.js first.');
    process.exit(1);
  }

  const knowledgeText = fs.readFileSync(knowledgePath, 'utf8');

  let unansweredLines = '(no question log yet)';
  if (fs.existsSync(logPath)) {
    const entries = fs.readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .filter(e => !e.answered && !e.restricted);

    if (entries.length) {
      unansweredLines = entries
        .map(e => `  ${e.ts.substring(0, 10)}  "${e.q}"`)
        .join('\n');
    } else {
      unansweredLines = '(none — all logged questions were answered)';
    }
  }

  const client = new Anthropic();
  console.log('Analysing gaps with Claude...');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Analyse this holiday home knowledge base and question log to identify gaps.

KNOWLEDGE BASE:
${knowledgeText}

UNANSWERED QUESTIONS FROM LOG (guests asked, bot had no answer):
${unansweredLines}

Write a gap report with exactly these three sections:
1. ## High priority (guests asked, no answer found)
   List each unanswered question with a brief note on what info to add.
   If there are none, say "None — all logged questions were answered."

2. ## Missing topic areas
   Common holiday home topics not covered at all (e.g. emergency contacts, checkout procedure, laundry, transport).
   Base this on the knowledge base content, not assumptions.

3. ## Thin sections (exist but could be expanded)
   Sections that exist but are vague, very short, or lack useful detail.

Format as Markdown. Be specific and actionable.`
    }]
  });

  const today = new Date().toISOString().substring(0, 10);
  const report = `# Knowledge Gap Report — ${today}\n\n${response.content[0].text.trim()}\n`;
  const outPath = path.join(__dirname, '../GAPS.md');
  fs.writeFileSync(outPath, report, 'utf8');
  console.log(`Gap report written to ${outPath}`);
}

analyzeGaps().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Test manually**

Ensure `data/knowledge.md` exists. Optionally create a minimal `data/questions.log`:

```jsonl
{"ts":"2026-05-13T14:30:00Z","q":"Is there a kayak?","answered":false,"restricted":false}
{"ts":"2026-05-13T16:12:00Z","q":"Where's the nearest pharmacy?","answered":false,"restricted":false}
```

Run: `node scripts/analyze-gaps.js`

Expected: `GAPS.md` written to project root with three sections.

- [ ] **Step 3: Commit**

```bash
git add scripts/analyze-gaps.js
git commit -m "feat: scripts/analyze-gaps.js — generate knowledge gap report via Claude"
```

---

## Task 10: Docker Configuration

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  chatomatic:
    build: .
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - /share/homes/admin/chatomatic/data:/app/data
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Note: The volume path `/share/homes/admin/chatomatic/data` is the QNAP NAS path. Adjust to match your NAS folder structure before deploying.

- [ ] **Step 3: Verify Docker build locally**

Run: `docker build -t chatomatic .`

Expected: Build completes without errors.

- [ ] **Step 4: Verify container starts**

Run: `docker run --rm -p 3000:3000 -e ANTHROPIC_API_KEY=your-key-here chatomatic`

Expected: `Chatomatic running on port 3000`

Open `http://localhost:3000/health` — expect `OK`.

Stop with Ctrl+C.

- [ ] **Step 5: Run the full test suite one final time**

Run: `npx jest --no-coverage`

Expected: PASS — all tests

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: Docker configuration — Dockerfile and docker-compose.yml for QNAP deployment"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| Chat interface (§2.1) — bubbles, chips, history | Task 6 (frontend) |
| Starter chips from frontmatter | Task 2 (knowledge.getStarters) + Task 6 |
| Suggested follow-ups (§2.1) | Task 4 (chat.js) + Task 6 |
| 3-exchange conversation context | Task 6 (app.js — history trimming) |
| No-answer / restricted responses (§2.1) | Task 4 (answered/touchedRestricted) + Task 3 (logger) |
| Knowledge base format (§3) — frontmatter, [RESTRICTED] | Task 2 (knowledge.js) |
| Rate limiting 30 req/IP/hr (§2.3) | Task 5 (server.js rateLimit) |
| "I've arrived" button (§2.4) | Task 6 (app.js handleArrived) |
| Arrival brief from frontmatter, not via Claude | Task 6 (rendered directly) |
| `/api/chat` request/response format (§4.3) | Task 4 + Task 5 |
| Prompt caching — system + knowledge (§4.6) | Task 4 (chat.js cache_control) |
| `/api/starters` returns house_name + questions + brief | Task 2 + Task 5 |
| `/health` route | Task 5 |
| Question log format (§6) | Task 3 (logger.js) |
| Email digest format (§7) | Task 7 (digest.js formatDigest) |
| Digest: no email if 0 questions | Task 7 (sendDigest guard) |
| `DIGEST_CRON` env var | Task 7 (start function) |
| `scripts/ingest.js` (§8.1) | Task 8 |
| `scripts/analyze-gaps.js` (§8.2) | Task 9 |
| Dockerfile + docker-compose.yml (§9) | Task 10 |
| `.env.example` with all vars (§10) | Task 1 |
| `HOUSE_NAME` env var overrides frontmatter | Task 2 (knowledge.js) |
| `RATE_LIMIT_MAX` env var | Task 5 (server.js) |

All spec requirements are covered.
