require('dotenv').config();
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
