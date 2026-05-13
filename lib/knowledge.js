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
