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
