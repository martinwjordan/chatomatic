require('dotenv').config();
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
  - arrival_brief: (exactly 5 bullet strings covering: keys, heating, bins, Wi-Fi, owner contact — format: "emoji Topic: detail" — IMPORTANT: each item MUST be wrapped in double quotes in the YAML so colons inside the text are not misinterpreted, e.g. - "🔑 Keys: detail here")
- Output ONLY the Markdown file content — no explanation, no preamble

DOCUMENT:
${rawText}`
    }]
  });

  const structured = response.content[0].text.trim().replace(/^```(?:yaml|markdown|md)?\s*/i, '').replace(/\s*```$/, '');
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
