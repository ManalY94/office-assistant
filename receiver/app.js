/* ============================================================
   Office Assistant — Cast Web Receiver / standalone kiosk app
   Runs entirely on the display. Calls OpenRouter directly.
   ============================================================ */

// ---------- Storage ----------
const store = (() => {
  // Defensive: if a locked-down browser blocks storage, don't crash — degrade.
  const safe = {
    get(k)    { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k)    { try { localStorage.removeItem(k); } catch (e) {} },
  };
  return {
    get key()    { return safe.get('or_key') || ''; },
    set key(v)   { v ? safe.set('or_key', v) : safe.del('or_key'); },
    get ytKey()  { return safe.get('or_yt') || ''; },
    set ytKey(v) { v ? safe.set('or_yt', v) : safe.del('or_yt'); },
    get model()  { return safe.get('or_model') || ''; },
    set model(v) { v ? safe.set('or_model', v) : safe.del('or_model'); },
    get sys()    { return safe.get('or_sys') || ''; },
    set sys(v)   { safe.set('or_sys', v); },
    get city()   { return safe.get('or_city') || 'London'; },
    set city(v)  { safe.set('or_city', v); },
  };
})();

// Brief on-screen confirmation banner.
function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);' +
    'background:#1c232e;color:#e6edf3;border:1px solid rgba(79,140,255,.6);' +
    'padding:14px 24px;border-radius:14px;font-size:17px;z-index:99;' +
    'box-shadow:0 8px 32px rgba(0,0,0,.55);transition:opacity .4s;';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 5000);
}

// Curated list of free models confirmed working right now (verified by sending
// a real request to each). Kept explicit rather than fetched from the API so
// the picker never offers a model that has no available provider (which is what
// caused the old "missing provider" dead-end). Order matters: the first entry
// is the default, and the whole list doubles as the fallback chain.
const MODEL_CHOICES = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron Ultra 550B · free' },
  { id: 'nvidia/nemotron-3.5-super-vl:free',       label: 'Nemotron 3.5 Super VL · free' },
  { id: 'cohere/north-mini-code:free',             label: 'Cohere North Mini · free' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron Nano Omni · free' },
  { id: 'openrouter/free',                         label: 'OpenRouter Auto · free' },
];
const DEFAULT_MODEL = MODEL_CHOICES[0].id;

// Returns the model to use: the user's saved pick if it's still in the list,
// otherwise the default. Guards against a stale saved id from an older build.
function currentModel() {
  return (store.model && MODEL_CHOICES.some(m => m.id === store.model))
    ? store.model : DEFAULT_MODEL;
}

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
const ytResults = document.getElementById('ytResults');
const webframe  = document.getElementById('webframe');
const ytBackBtn = document.getElementById('ytBack');

// Toggle between the results list and the video/search iframe.
function showYtResults(showIt) {
  ytResults.style.display = showIt ? 'block' : 'none';
  webframe.style.display  = showIt ? 'none' : 'block';
}
// YouTube titles arrive HTML-escaped (&amp;, &#39; …) — decode for display.
function decodeEntities(s) {
  const t = document.createElement('textarea'); t.innerHTML = s; return t.value;
}

function openWebLauncher(mode) {
  webMode = mode;
  document.getElementById('webTitle').firstChild.textContent = mode === 'youtube' ? 'YouTube' : 'Google';
  const bar = document.getElementById('webSearchBar');
  bar.style.display = 'flex';
  const input = document.getElementById('webSearchInput');
  input.placeholder = mode === 'youtube' ? 'Search YouTube…' : 'Search Google…';
  input.value = '';
  ytBackBtn.style.display = 'none';
  if (mode === 'youtube') {
    // Friendly hint instead of auto-searching (saves API quota).
    webframe.src = 'about:blank';
    ytResults.innerHTML = '<div class="ytmsg">Search for videos above ⬆</div>';
    showYtResults(true);
  } else {
    webframe.src = 'https://www.google.com/search?igu=1&q=news';
    showYtResults(false);
  }
  show('webview');
  setTimeout(() => input.focus(), 150);
}

async function runWebSearch() {
  const q = document.getElementById('webSearchInput').value.trim();
  if (!q) return;
  if (webMode !== 'youtube') {
    showYtResults(false);
    webframe.src = 'https://www.google.com/search?igu=1&q=' + encodeURIComponent(q);
    return;
  }
  // YouTube: search via the official Data API (listType=search was removed by
  // Google in 2020, and youtube.com/results can't be framed — so this is the
  // only reliable path). Render tappable results, then embed the chosen video.
  if (!store.ytKey) {
    ytResults.innerHTML = '<div class="ytmsg">YouTube search needs a free API key.<br>It will be added on the next launch.</div>';
    showYtResults(true);
    return;
  }
  ytResults.innerHTML = '<div class="ytmsg">Searching…</div>';
  showYtResults(true);
  try {
    const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12' +
                '&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(store.ytKey);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'API error');
    renderYtResults(j.items || []);
  } catch (e) {
    ytResults.innerHTML = '<div class="ytmsg">⚠️ YouTube search failed:<br>' + (e.message || 'network error') + '</div>';
  }
}

function renderYtResults(items) {
  ytResults.innerHTML = '';
  const vids = items.filter(it => it.id && it.id.videoId);
  if (!vids.length) {
    ytResults.innerHTML = '<div class="ytmsg">No videos found.</div>';
    showYtResults(true);
    return;
  }
  vids.forEach(it => {
    const vid = it.id.videoId;
    const title = decodeEntities(it.snippet.title || '');
    const tn = (it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default)) || {};
    const row = document.createElement('div');
    row.className = 'ytrow';
    const img = document.createElement('img');
    img.className = 'ytthumb'; img.src = tn.url || ''; img.alt = ''; img.loading = 'lazy';
    const t = document.createElement('div');
    t.className = 'yttitle'; t.textContent = title;
    row.appendChild(img); row.appendChild(t);
    row.onclick = () => playVideo(vid);
    ytResults.appendChild(row);
  });
  showYtResults(true);
}

function playVideo(vid) {
  ytBackBtn.style.display = 'block';
  webframe.src = 'https://www.youtube.com/embed/' + vid + '?autoplay=1&rel=0';
  showYtResults(false);
}

ytBackBtn.onclick = () => {
  ytBackBtn.style.display = 'none';
  webframe.src = 'about:blank';
  showYtResults(true);
};

document.getElementById('webSearchBtn').onclick = runWebSearch;
document.getElementById('webSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') runWebSearch(); });
document.getElementById('webHome').onclick = () => {
  webframe.src = 'about:blank';
  ytBackBtn.style.display = 'none';
  showYtResults(false);
  show('home');
};

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
      body: JSON.stringify({ model: currentModel(), messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
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

// ---------- Models (custom touch dropdown) ----------
// The native <select> does not open on the Cast webview, so we render our own
// list. loadModels() is kept as the (re)render entry point because the key
// overlay still calls it after a fresh key is saved.
function renderModelBtn() {
  const m = MODEL_CHOICES.find(x => x.id === currentModel()) || MODEL_CHOICES[0];
  document.getElementById('modelBtn').textContent = m.label + ' ▾';
}

function loadModels() {
  const list = document.getElementById('modelList');
  list.innerHTML = '';
  MODEL_CHOICES.forEach(m => {
    const item = document.createElement('div');
    item.className = 'dropitem' + (m.id === currentModel() ? ' sel' : '');
    item.textContent = m.label;
    item.onclick = (e) => {
      e.stopPropagation();
      store.model = m.id;
      renderModelBtn();
      loadModels();
      list.classList.remove('open');
    };
    list.appendChild(item);
  });
  renderModelBtn();
}

document.getElementById('modelBtn').onclick = (e) => {
  e.stopPropagation();
  document.getElementById('modelList').classList.toggle('open');
};
// Close the dropdown when tapping anywhere outside it.
document.addEventListener('click', () => {
  const l = document.getElementById('modelList');
  if (l) l.classList.remove('open');
});
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

// Streams one completion into botEl and returns the accumulated text, or
// throws if the response is not OK (e.g. "no provider" for a model that is
// temporarily down).
async function streamCompletion(model, messages, botEl) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + store.key,
      'Content-Type': 'application/json',
      'HTTP-Referer': location.origin,
      'X-Title': 'Office Assistant',
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('HTTP ' + res.status + ': ' + err.slice(0, 160));
  }

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
  return full;
}

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

  const messages = (store.sys ? [{ role: 'system', content: store.sys }] : []).concat(history);
  // Try the selected model first, then fall back through the reliable free
  // list. This turns a transient "no provider" error into an automatic retry
  // instead of a dead-end message.
  const primary = currentModel();
  const candidates = [primary].concat(MODEL_CHOICES.map(m => m.id).filter(id => id !== primary));

  let lastErr = '';
  let full = '';
  for (const model of candidates) {
    try {
      full = await streamCompletion(model, messages, botEl);
      break; // success
    } catch (e) {
      lastErr = e.message;
      continue; // try the next model
    }
  }

  if (full) {
    history.push({ role: 'assistant', content: full });
  } else {
    botEl.classList.add('error');
    botEl.textContent = /401|unauthorized|invalid.*key/i.test(lastErr)
      ? '⚠️ API key rejected — check it in Settings.'
      : '⚠️ No free model responded right now. Tap Model to switch, or try again in a minute.';
    history.pop(); // drop the failed user turn from context
  }

  sendBtn.disabled = false;
  chatInput.focus();
}

// ---------- Voice input (speech-to-text) ----------
(function setupVoice() {
  const micBtn = document.getElementById('micBtn');
  if (!micBtn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // The display's browser lacks the free web-speech API, so the only route
    // to voice is capturing the mic directly. Whether that's possible at all
    // depends on if the Cast display exposes its microphone to web apps (it's
    // usually reserved for Google Assistant). Test it on tap so we know whether
    // ANY voice input — free offline engine or paid cloud — can work here.
    micBtn.onclick = async () => {
      toast('🎤 Testing microphone…');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('🎤 VERDICT: MIC BLOCKED — this display gives apps no microphone.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        toast('🎤 VERDICT: MIC WORKS — free voice input can be added.');
      } catch (e) {
        toast('🎤 VERDICT: MIC BLOCKED (' + (e.name || 'denied') + ') — voice not possible here.');
      }
    };
    return;
  }
  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;

  let listening = false;
  let finalText = '';

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    chatInput.value = (finalText + interim).trim();
  };
  rec.onend = () => {
    listening = false;
    micBtn.classList.remove('rec');
    if (finalText.trim()) {
      chatInput.value = finalText.trim();
      send(); // hands-free: speak, then it sends
    }
    finalText = '';
  };
  rec.onerror = (e) => {
    listening = false;
    micBtn.classList.remove('rec');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('🎤 Microphone blocked — allow mic access to use voice.');
    } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
      toast('🎤 Voice input error: ' + e.error);
    }
    finalText = '';
  };

  micBtn.onclick = () => {
    if (listening) { try { rec.stop(); } catch {} return; }
    finalText = '';
    chatInput.value = '';
    try {
      rec.start();
      listening = true;
      micBtn.classList.add('rec');
    } catch {
      toast('🎤 Could not start voice input.');
    }
  };
})();

// One-time key injection via URL fragment (#key=...), with query-param
// fallback. The fragment is NEVER sent to the server, so the key cannot leak
// into GitHub Pages access logs or the public repository.
let keyInjected = false;
(function importKeyFromUrl() {
  const m = location.hash.match(/[#&]key=([^&]+)/) ||
            location.search.match(/[?&]key=([^&#]+)/);
  if (m) {
    try {
      const k = decodeURIComponent(m[1]).trim();
      if (k) { store.key = k; keyInjected = true; }
    } catch (e) { /* malformed: ignore */ }
  }
  // Optional YouTube Data API key (for YouTube search), same secure delivery.
  const y = location.hash.match(/[#&]yt=([^&]+)/) ||
            location.search.match(/[?&]yt=([^&#]+)/);
  if (y) {
    try {
      const k = decodeURIComponent(y[1]).trim();
      if (k) store.ytKey = k;
    } catch (e) { /* malformed: ignore */ }
  }
  // Scrub the secrets out of the visible URL immediately.
  history.replaceState(null, '', location.pathname);
})();

// ---------- Boot: prompt for key if missing ----------
if (keyInjected) {
  toast('✅ API key saved on this display — assistant ready');
} else if (!store.key) {
  document.getElementById('keyOverlay').classList.add('active');
}
refreshSettingsUI();

// ---------- Cast Web Receiver note ----------
// The receiver context is started by an inline script in index.html, right
// after the CAF framework loads and BEFORE app.js. That placement is
// deliberate: it guarantees the session is adopted even if anything in this
// file throws on the device's webview (which would otherwise leave the launch
// reported as CANCELLED). Nothing to do here.
