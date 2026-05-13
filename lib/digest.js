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
