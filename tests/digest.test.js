const os = require('os');
const fs = require('fs');
const path = require('path');

jest.mock('nodemailer');

let digest;
let nodemailer;
let mockSendMail;

beforeEach(() => {
  jest.resetModules();
  nodemailer = require('nodemailer');
  mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
  nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });
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
      { ts: '2026-05-13T10:22:00Z', q: 'Wi-Fi?', answered: true, restricted: false }
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
