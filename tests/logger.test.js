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
