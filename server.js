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
