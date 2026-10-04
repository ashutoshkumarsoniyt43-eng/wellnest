/* ── app.js ── MedAI Health Diagnosis System */

// ─── State ───────────────────────────────────────────────────
const DEFAULT_WEBHOOK = 'https://flacky2008.app.n8n.cloud/webhook/541d0dc8-9fe8-41c0-9bd7-f5326d9de1f0/chat';

const state = {
  webhookUrl: localStorage.getItem('medai_webhook') || DEFAULT_WEBHOOK,
  apiKey:     localStorage.getItem('medai_apikey')  || '',
  history:    JSON.parse(localStorage.getItem('medai_history') || '[]'),
  selectedSymptoms: [],
};

// ─── Symptom Tags ──────────────────────────────────────────────
const SYMPTOMS = [
  'Headache', 'Fever', 'Cough', 'Fatigue', 'Nausea',
  'Vomiting', 'Diarrhea', 'Chest Pain', 'Shortness of Breath',
  'Sore Throat', 'Runny Nose', 'Body Ache', 'Dizziness',
  'Rash', 'Joint Pain', 'Stomach Pain', 'Loss of Appetite',
  'Chills', 'Swelling', 'Back Pain',
];

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSymptomGrid();
  updateConnectionBadge();
  renderHistory();
  scrollNavEffect();
  // Pre-fill webhook input with default
  document.getElementById('webhook-url').value = state.webhookUrl;
});

function buildSymptomGrid() {
  const grid = document.getElementById('symptom-grid');
  grid.innerHTML = SYMPTOMS.map(s => `
    <div class="symptom-chip" data-symptom="${s}" onclick="toggleSymptom(this, '${s}')">${s}</div>
  `).join('');
}

function toggleSymptom(el, symptom) {
  if (el.classList.toggle('selected')) {
    state.selectedSymptoms.push(symptom);
  } else {
    state.selectedSymptoms = state.selectedSymptoms.filter(s => s !== symptom);
  }
}

// ─── Severity ─────────────────────────────────────────────────
function updateSeverity(val) {
  document.getElementById('severity-val').textContent = val;
}

// ─── Navbar Scroll Effect ─────────────────────────────────────
function scrollNavEffect() {
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
  });
}

// ─── Tab Switching ────────────────────────────────────────────
function switchTab(tab) {
  ['diagnose', 'chat', 'history'].forEach(t => {
    document.getElementById(`section-${t}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`section-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'history') renderHistory();
  return false;
}

// ─── Settings Modal ───────────────────────────────────────────
function openSettings() {
  document.getElementById('webhook-url').value = state.webhookUrl;
  document.getElementById('api-key').value     = state.apiKey;
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
  state.webhookUrl = document.getElementById('webhook-url').value.trim();
  state.apiKey     = document.getElementById('api-key').value.trim();
  localStorage.setItem('medai_webhook', state.webhookUrl);
  localStorage.setItem('medai_apikey',  state.apiKey);
  updateConnectionBadge();
  closeSettings();
  showToast('✅ Settings saved! n8n webhook configured.', 'success');
}

function updateConnectionBadge() {
  const badge = document.getElementById('connection-badge');
  if (state.webhookUrl) {
    badge.textContent = 'Connected';
    badge.classList.add('connected');
  } else {
    badge.textContent = 'Not Connected';
    badge.classList.remove('connected');
  }
}

// Click outside modal to close
document.getElementById('settings-modal').addEventListener('click', function(e) {
  if (e.target === this) closeSettings();
});

// ─── Diagnosis Form Submission ────────────────────────────────
async function submitDiagnosis(e) {
  e.preventDefault();

  if (!state.webhookUrl) {
    openSettings();
    showToast('⚙️ Please configure your n8n webhook URL first.', 'warning');
    return;
  }

  // Collect payload
  const payload = {
    type: 'diagnosis',
    patientName:      document.getElementById('patient-name').value.trim(),
    age:              document.getElementById('patient-age').value,
    gender:           document.getElementById('patient-gender').value,
    weight:           document.getElementById('patient-weight').value,
    symptoms:         state.selectedSymptoms,
    symptomDescription: document.getElementById('symptom-text').value.trim(),
    duration:         document.getElementById('duration').value,
    severity:         document.getElementById('severity').value,
    medicalHistory:   document.getElementById('medical-history').value.trim(),
    currentMeds:      document.getElementById('current-meds').value.trim(),
    timestamp:        new Date().toISOString(),
    // n8n chat-compatible field
    chatInput: `Patient: ${document.getElementById('patient-name').value.trim()}, Age: ${document.getElementById('patient-age').value}, Symptoms: ${state.selectedSymptoms.join(', ')}. ${document.getElementById('symptom-text').value.trim()}`,
  };

  setLoading(true);
  hideCards();

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.apiKey) headers['Authorization'] = `Bearer ${state.apiKey}`;

    const res = await fetch(state.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      let data = await res.json();

    // n8n can return array, object, or {output:...} / {text:...} shapes
    if (Array.isArray(data)) data = data[0];

    // If the whole response is a plain text/AI message, wrap it
    if (typeof data === 'string') {
      data = { primary_diagnosis: data, summary: data };
    }
    // Handle n8n AI agent output field
    if (data.output && !data.primary_diagnosis) {
      data.primary_diagnosis = data.output;
      data.summary = data.output;
    }

    renderResult(data, payload);
  } catch (err) {
    renderError(err.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  document.getElementById('submit-text').classList.toggle('hidden', on);
  document.getElementById('submit-loading').classList.toggle('hidden', !on);
  document.getElementById('submit-btn').disabled = on;
}

function hideCards() {
  document.getElementById('result-placeholder').classList.add('hidden');
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('error-card').classList.add('hidden');
}

// ─── Render Result ────────────────────────────────────────────
function renderResult(data, payload) {
  const card = document.getElementById('result-card');

  // Timestamp
  document.getElementById('result-timestamp').textContent =
    `For ${payload.patientName} · ${new Date().toLocaleString()}`;

  // Urgency
  const urgency = (data.urgency || data.severity_level || 'low').toLowerCase();
  const urgencyBadge = document.getElementById('urgency-badge');
  urgencyBadge.textContent = urgency.charAt(0).toUpperCase() + urgency.slice(1) + ' Urgency';
  urgencyBadge.className = `urgency-badge urgency-${urgency.includes('high') ? 'high' : urgency.includes('med') ? 'medium' : 'low'}`;

  // Primary Diagnosis
  document.getElementById('primary-diagnosis').textContent =
    data.primary_diagnosis || data.diagnosis || data.condition || 'See analysis summary';

  // Summary
  document.getElementById('analysis-summary').textContent =
    data.summary || data.analysis || data.description || 'The AI has analyzed your symptoms. Please review the details below and consult a physician.';

  // Possible Conditions
  const conditions = data.possible_conditions || data.conditions || [];
  const condEl = document.getElementById('possible-conditions');
  if (conditions.length) {
    document.getElementById('possible-conditions-section').classList.remove('hidden');
    condEl.innerHTML = conditions.map(c => `
      <div class="condition-item">
        <span class="condition-name">${typeof c === 'string' ? c : c.name || c.condition}</span>
        ${c.probability ? `<span class="condition-prob">${c.probability}</span>` : ''}
      </div>
    `).join('');
  } else {
    document.getElementById('possible-conditions-section').classList.add('hidden');
  }

  // Recommendations
  const recs = data.recommendations || data.advice || [];
  const recsEl = document.getElementById('recommendations-list');
  if (recs.length) {
    document.getElementById('recommendations-section').classList.remove('hidden');
    recsEl.innerHTML = recs.map(r => `<li>${r}</li>`).join('');
  } else {
    document.getElementById('recommendations-section').classList.add('hidden');
  }

  // Medicines
  const meds = data.medications || data.medicines || data.suggested_medications || [];
  const medsEl = document.getElementById('medicines-list');
  if (meds.length) {
    document.getElementById('medicines-section').classList.remove('hidden');
    medsEl.innerHTML = meds.map(m => `
      <div class="med-chip">
        ${typeof m === 'string' ? m : m.name}
        ${m.dosage ? `<small>${m.dosage}</small>` : ''}
      </div>
    `).join('');
  } else {
    document.getElementById('medicines-section').classList.add('hidden');
  }

  card.classList.remove('hidden');

  // Auto-save to history
  const entry = {
    id: Date.now(),
    name: payload.patientName,
    diagnosis: data.primary_diagnosis || data.diagnosis || data.condition || 'Unknown',
    date: new Date().toLocaleString(),
    urgency,
    payload,
    result: data,
  };
  state.history.unshift(entry);
  if (state.history.length > 20) state.history.pop();
  localStorage.setItem('medai_history', JSON.stringify(state.history));
}

function renderError(msg) {
  document.getElementById('error-message').textContent = msg || 'An unexpected error occurred.';
  document.getElementById('error-card').classList.remove('hidden');
  document.getElementById('result-placeholder').classList.add('hidden');
}

// ─── Save to History (manual button) ─────────────────────────
function saveToHistory() {
  showToast('✅ Saved to history!', 'success');
}

// ─── History Rendering ────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!state.history.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No diagnoses yet</h3>
        <p>Your saved diagnoses will appear here.</p>
      </div>`;
    return;
  }

  list.innerHTML = state.history.map(h => `
    <div class="history-item glass-card" onclick="viewHistory(${h.id})">
      <div class="history-icon">🩺</div>
      <div class="history-info">
        <h4>${h.name}</h4>
        <p>${h.diagnosis}</p>
      </div>
      <div class="history-meta">
        <div class="urgency-badge urgency-${h.urgency === 'high' ? 'high' : h.urgency === 'medium' ? 'medium' : 'low'}" style="margin-bottom:4px">
          ${(h.urgency || 'low').charAt(0).toUpperCase() + (h.urgency||'low').slice(1)}
        </div>
        <div class="history-date">${h.date}</div>
      </div>
    </div>
  `).join('');
}

function viewHistory(id) {
  const entry = state.history.find(h => h.id === id);
  if (!entry) return;
  switchTab('diagnose');
  renderResult(entry.result, entry.payload);
  hideCards();
  document.getElementById('result-card').classList.remove('hidden');
  document.getElementById('result-placeholder').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearHistory() {
  if (!confirm('Clear all diagnosis history?')) return;
  state.history = [];
  localStorage.removeItem('medai_history');
  renderHistory();
  showToast('🗑️ History cleared', 'info');
}

// ─── Chat ─────────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;

  appendChatMessage(msg, 'user');
  input.value = '';

  if (!state.webhookUrl) {
    appendChatMessage("⚙️ Please configure the n8n webhook in settings to enable AI responses.", 'bot');
    return;
  }

  // Typing indicator
  const typingId = appendTypingIndicator();

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.apiKey) headers['Authorization'] = `Bearer ${state.apiKey}`;

    const res = await fetch(state.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chatInput: msg,          // n8n AI Agent node reads this field
        message: msg,
        type: 'chat',
        timestamp: new Date().toISOString()
      }),
    });

    removeTypingIndicator(typingId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let data = await res.json();
    if (Array.isArray(data)) data = data[0];

    // Support common n8n AI Agent response shapes
    const reply = data.output || data.reply || data.response || data.message || data.text || JSON.stringify(data);
    appendChatMessage(reply, 'bot');
  } catch (err) {
    removeTypingIndicator(typingId);
    appendChatMessage(`❌ Error: ${err.message}`, 'bot');
  }
}

function appendChatMessage(text, role) {
  const msgs = document.getElementById('chat-messages');
  const time  = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div   = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar ${role === 'bot' ? 'bot-avatar' : 'user-avatar'}">${role === 'bot' ? '🤖' : '👤'}</div>
    <div class="msg-bubble">
      <p>${escapeHtml(text)}</p>
      <span class="msg-time">${time}</span>
    </div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendTypingIndicator() {
  const id   = 'typing-' + Date.now();
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className = 'chat-msg bot'; div.id = id;
  div.innerHTML = `
    <div class="msg-avatar bot-avatar">🤖</div>
    <div class="msg-bubble">
      <p style="display:flex;gap:4px;align-items:center">
        <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span> Analyzing...
      </p>
    </div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function clearChat() {
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = `
    <div class="chat-msg bot">
      <div class="msg-avatar bot-avatar">🤖</div>
      <div class="msg-bubble">
        <p>Chat cleared! How can I assist you with your health questions?</p>
        <span class="msg-time">Now</span>
      </div>
    </div>`;
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:999;
    padding:0.75rem 1.25rem; border-radius:12px;
    font-family:Inter,sans-serif; font-size:0.875rem; font-weight:500;
    background:${type === 'success' ? 'rgba(16,185,129,0.15)' : type === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(244,63,94,0.15)'};
    border:1px solid ${type === 'success' ? 'rgba(16,185,129,0.35)' : type === 'warning' ? 'rgba(245,158,11,0.35)' : 'rgba(244,63,94,0.35)'};
    color:${type === 'success' ? '#34d399' : type === 'warning' ? '#fbbf24' : '#fb7185'};
    backdrop-filter:blur(10px); box-shadow:0 8px 32px rgba(0,0,0,0.3);
    animation:fadeUp 0.3s ease;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Utility ──────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
