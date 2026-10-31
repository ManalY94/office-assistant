/* ============================================================
   Office Assistant — Cast Web Receiver / standalone kiosk app
   Runs entirely on the display. Calls OpenRouter directly.
   ============================================================ */

// ---------- Storage ----------
const store = {
  get key()   { return localStorage.getItem('or_key') || ''; },
  set key(v)  { v ? localStorage.setItem('or_key', v) : localStorage.removeItem('or_key'); },
  get model() { return localStorage.getItem('or_model') || ''; },
  set model(v){ v ? localStorage.setItem('or_model', v) : localStorage.removeItem('or_model'); },
  get sys()   { return localStorage.getItem('or_sys') || ''; },
  set sys(v)  { localStorage.setItem('or_sys', v); },
  get city()  { return localStorage.getItem('or_city') || 'London'; },
  set city(v) { localStorage.setItem('or_city', v); },
};

const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';

// ---------- Navigation ----------
const screens = ['home', 'chat', 'webview', 'settings'];
function show(id) {
  screens.forEach(s => document.getElementById(s).classList.toggle('active', s === id));
  if (id === 'chat') setTimeout(() => document.getElementById('chatInput').focus(), 120);
}
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('home'));
document.querySelectorAll('[data-open]').forEach(t => t.onclick = () => {
  const target = t.dataset.open;
  if (target === 'youtube') openWebLauncher('youtube');
  else if (target === 'search') openWebLauncher('search');
  else show(target);
  if (target === 'settings') refreshSettingsUI();
});

// ---------- Clock ----------
function tickClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('bigClock').textContent = time;
  document.getElementById('statusClock').textContent = time;
  document.getElementById('bigDate').textContent = date;
}
tickClock(); setInterval(tickClock, 1000 * 10);

// ---------- Weather (Open-Meteo, no key) ----------
const WMO = {
  0:['☀️','Clear'], 1:['🌤️','Mostly clear'], 2:['⛅','Partly cloudy'], 3:['☁️','Overcast'],
  45:['🌫️','Foggy'], 48:['🌫️','Foggy'],
  51:['🌦️','Light drizzle'], 53:['🌦️','Drizzle'], 55:['🌧️','Dense drizzle'],
  61:['🌧️','Light rain'], 63:['🌧️','Rain'], 65:['🌧️','Heavy rain'],
  71:['🌨️','Light snow'], 73:['🌨️','Snow'], 75:['❄️','Heavy snow'],
  80:['🌦️','Rain showers'], 81:['🌧️','Rain showers'], 82:['⛈️','Violent showers'],
  95:['⛈️','Thunderstorm'], 96:['⛈️','Thunderstorm + hail'], 99:['⛈️','Thunderstorm + hail'],
};
async function loadWeather() {
  try {
    const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(store.city)}&count=1`)).json();
    if (!geo.results || !geo.results.length) return;
    const { latitude, longitude } = geo.results[0];
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`)).json();
    const code = w.current.weather_code;
    const [icon, cond] = WMO[code] || ['🌡️', '—'];
    document.getElementById('wIcon').textContent = icon;
    document.getElementById('wTemp').textContent = Math.round(w.current.temperature_2m) + '°';
    document.getElementById('wCond').textContent = cond + ' · ' + store.city;
    document.getElementById('weatherTile').style.display = 'inline-flex';
  } catch (e) { /* silent — weather is non-critical */ }
}
loadWeather(); setInterval(loadWeather, 1000 * 60 * 30);

// ---------- Web view (YouTube / Google with a real search bar) ----------
let webMode = 'search';
function openWebLauncher(mode) {
  webMode = mode;
  document.getElementById('webTitle').firstChild.textContent = mode === 'youtube' ? 'YouTube' : 'Google';
  const bar = document.getElementById('webSearchBar');
  bar.style.display = 'flex';
  const input = document.getElementById('webSearchInput');
  input.placeholder = mode === 'youtube' ? 'Search YouTube…' : 'Search Google…';
  input.value = '';
  // Start on a friendly homepage inside the frame
  document.getElementById('webframe').src =
    mode === 'youtube' ? 'https://www.youtube.com/embed?listType=search&list=' + encodeURIComponent('trending')
                       : 'https://www.google.com/search?igu=1&q=news';
  show('webview');
  setTimeout(() => input.focus(), 150);
}
function runWebSearch() {
  const q = document.getElementById('webSearchInput').value.trim();
  if (!q) return;
  document.getElementById('webframe').src = webMode === 'youtube'
    ? 'https://www.youtube.com/embed?listType=search&list=' + encodeURIComponent(q)
    : 'https://www.google.com/search?igu=1&q=' + encodeURIComponent(q);
}
document.getElementById('webSearchBtn').onclick = runWebSearch;
document.getElementById('webSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') runWebSearch(); });
document.getElementById('webHome').onclick = () => { document.getElementById('webframe').src = 'about:blank'; show('home'); };

// ---------- Settings UI ----------
function refreshSettingsUI() {
  document.getElementById('apiKeyInput').placeholder = store.key ? '•••••••• (key saved)' : 'sk-or-v1-…';
  document.getElementById('sysInput').value = store.sys;
}
document.getElementById('saveKey').onclick = () => {
  const v = document.getElementById('apiKeyInput').value.trim();
  if (v) { store.key = v; document.getElementById('apiKeyInput').value = ''; }
  store.sys = document.getElementById('sysInput').value;
  refreshSettingsUI();
  setStatus('ok', 'Saved locally on this display.');
};
document.getElementById('clearKey').onclick = () => {
  store.key = ''; refreshSettingsUI(); setStatus('bad', 'Key cleared.');
};
document.getElementById('testKey').onclick = async () => {
  setStatus('', 'Testing…');
  const r = await testKey();
  r ? setStatus('ok', 'Connected to OpenRouter.') : setStatus('bad', 'Failed — check key.');
};
function setStatus(cls, text) {
  const el = document.getElementById('keyStatus');
  el.innerHTML = `<span class="status-pill ${cls}">${cls === 'ok' ? '●' : cls === 'bad' ? '●' : '○'} ${text}</span>`;
}
async function testKey() {
  if (!store.key) return false;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + store.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: store.model || DEFAULT_MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
    });
    return res.ok;
  } catch { return false; }
}

// ---------- Key overlay ----------
document.getElementById('overlaySave').onclick = () => {
  const v = document.getElementById('overlayKey').value.trim();
  if (v) store.key = v;
  document.getElementById('keyOverlay').classList.remove('active');
  loadModels();
};
document.getElementById('overlayLater').onclick = () =>
  document.getElementById('keyOverlay').classList.remove('active');

// ---------- Models ----------
let models = [];
async function loadModels() {
  const sel = document.getElementById('modelSelect');
  try {
    const data = await (await fetch('https://openrouter.ai/api/v1/models')).json();
    // Prefer known free models; fall back to a curated list.
    models = data.data
      .filter(m => (m.pricing && parseFloat(m.pricing.prompt) === 0) || m.id.endsWith(':free'))
      .map(m => m.id);
  } catch { models = []; }
  if (!models.length) {
    models = [
      'google/gemma-4-26b-a4b-it:free',
      'nvidia/nemotron-3.5-lightning:free',
      'nvidia/nemotron-3.5-super-vl:free',
      'openrouter/free',
    ];
  }
  sel.innerHTML = '';
  models.forEach(id => {
    const o = document.createElement('option');
    o.value = id; o.textContent = id.split('/').pop().replace(':free', ' (free)');
    sel.appendChild(o);
  });
  if (store.model && models.includes(store.model)) sel.value = store.model;
  sel.onchange = () => { store.model = sel.value; };
}
loadModels();

// ---------- Chat ----------
const chatlog = document.getElementById('chatlog');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const history = [];

function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  el.textContent = text;
  chatlog.appendChild(el);
  chatlog.scrollTop = chatlog.scrollHeight;
  return el;
}

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
sendBtn.onclick = send;

async function send() {
  const text = chatInput.value.trim();
  if (!text) return;

  if (!store.key) {
    document.getElementById('keyOverlay').classList.add('active');
    return;
  }

  chatInput.value = ''; chatInput.style.height = 'auto';
  addMsg('user', text);
  history.push({ role: 'user', content: text });

  sendBtn.disabled = true;
  const botEl = addMsg('bot', '');
  botEl.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + store.key,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'Office Assistant',
      },
      body: JSON.stringify({
        model: store.model || DEFAULT_MODEL,
        messages: (store.sys ? [{ role: 'system', content: store.sys }] : []).concat(history),
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', full = '';
    botEl.textContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; botEl.textContent = full; chatlog.scrollTop = chatlog.scrollHeight; }
        } catch {}
      }
    }
    if (full) history.push({ role: 'assistant', content: full });
    else botEl.textContent = '…';
  } catch (e) {
    botEl.classList.add('error');
    botEl.textContent = '⚠️ ' + e.message;
    history.pop(); // drop the failed user turn from context
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

// One-time key injection via URL fragment (#key=...).
// A fragment is NEVER sent to the server, so the key cannot leak into
// GitHub Pages access logs or the public repository.
(function importKeyFromHash() {
  const m = location.hash.match(/[#&]key=([^&]+)/);
  if (!m) return;
  try {
    const k = decodeURIComponent(m[1]).trim();
    if (k) store.key = k;
  } catch (e) { /* malformed fragment: ignore */ }
  // Scrub the secret out of the visible URL immediately.
  history.replaceState(null, '', location.pathname + location.search);
})();

// ---------- Boot: prompt for key if missing ----------
if (!store.key) {
  document.getElementById('keyOverlay').classList.add('active');
}
refreshSettingsUI();

// ---------- Cast Web Receiver init (no-op if opened in a normal browser) ----------
window.__onGCastApiAvailable = function (isAvailable) {
  if (!isAvailable || !window.cast || !cast.framework) return;
  const ctx = cast.framework.CastReceiverContext.getInstance();
  const options = new cast.framework.CastReceiverOptions();
  options.maxInactivity = 60 * 60 * 1000; // keep alive 1h after sender disconnect
  options.customNamespaces = { 'json': 'urn:x-cast:office.assistant' };
  ctx.init(options);
};
