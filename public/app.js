let history = [];
let starters = null;
let conversationStarted = false;

marked.use({ breaks: true, gfm: true });

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
  div.innerHTML = DOMPurify.sanitize(marked.parse(text));
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
