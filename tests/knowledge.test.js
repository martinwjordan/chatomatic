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

test('getKnowledgeText returns markdown body not frontmatter', () => {
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
