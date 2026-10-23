'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- helpers ----------

let toastTimer;
function toast(text, bad = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('bad', bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, bad ? 4000 : 2000);
}

async function api(path, body, method) {
  const opts = { method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401) { showPairing(); throw new Error('Not paired'); }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

function run(fn) {
  return async (...args) => {
    try { await fn(...args); } catch (e) { if (e.message !== 'Not paired') toast(e.message, true); }
  };
}

const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
};

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) e.append(c);
  return e;
}

// ---------- pairing ----------

function showPairing(laptop) {
  $('#app-view').hidden = true;
  $('#pair-view').hidden = false;
  if (laptop) $('#pair-laptop').textContent = laptop;
  const pin = new URLSearchParams(location.search).get('pin');
  if (pin) $('#pair-pin').value = pin;
  if (!$('#pair-name').value) {
    const ua = navigator.userAgent;
    $('#pair-name').value = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android phone' : 'My phone';
  }
  if (ws) ws.close();
}

$('#pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#pair-error').textContent = '';
  try {
    await api('/api/pair', { pin: $('#pair-pin').value, name: $('#pair-name').value });
    history.replaceState(null, '', '/');  // the PIN must not stay in the address bar
    start();
  } catch (err) {
    $('#pair-error').textContent = err.message;
  }
});

// ---------- tabs ----------

let currentTab = 'screen';
function goto(tab) {
  currentTab = tab;
  $$('.tab').forEach((s) => { s.hidden = s.dataset.tab !== tab; });
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.goto === tab));
  if (tab !== 'screen' && tab !== 'pad') $('#keyboard').hidden = true;
  if (tab === 'controls') loadInfo();
  if (tab === 'files' && !filePath) openFolder('');
  if (tab === 'more') { loadDevices(); loadProcs(); }
  streaming = tab === 'screen';
  if (streaming) requestFrame();
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => goto(b.dataset.goto)));

// ---------- live connection ----------

let ws = null;
let wsReady = false;
let streaming = true;
let frameInFlight = false;
let lastFrameAt = 0;
let monitorIndex = 0;
let reconnectDelay = 500;

const QUALITY = {
  fast: { w: 960, q: 45, fps: 12 },
  balanced: { w: 1280, q: 60, fps: 10 },
  sharp: { w: 1920, q: 75, fps: 6 },
};

function setConn(state) {
  $('#conn-dot').className = 'dot ' + (state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : '');
  $('#conn-text').textContent = state === 'ok' ? 'Connected' : state === 'bad' ? 'Reconnecting…' : 'Connecting…';
}

function connect() {
  setConn('wait');
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`);
  ws.binaryType = 'blob';
  ws.onopen = () => {
    wsReady = true;
    reconnectDelay = 500;
    setConn('ok');
    send({ t: 'monitors' });
    frameInFlight = false;
    requestFrame();
  };
  ws.onclose = () => {
    wsReady = false;
    setConn('bad');
    if (!$('#app-view').hidden) {
      setTimeout(checkStillPaired, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 8000);
    }
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return showFrame(ev.data);
    const msg = JSON.parse(ev.data);
    if (msg.t === 'monitors') setMonitors(msg.monitors);
    else if (msg.t === 'error') toast(msg.error, true);
  };
}

async function checkStillPaired() {
  try {
    const s = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
    if (!s.paired) return showPairing(s.laptop);
  } catch { /* laptop unreachable: keep retrying */ }
  connect();
}

function send(msg) {
  if (wsReady && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// ---------- screen ----------

const screenImg = $('#screen');
let frameUrl = null;

function requestFrame() {
  if (!streaming || frameInFlight || !wsReady || document.hidden) return;
  const q = QUALITY[$('#quality').value];
  const wait = Math.max(0, 1000 / q.fps - (performance.now() - lastFrameAt));
  frameInFlight = true;
  setTimeout(() => {
    lastFrameAt = performance.now();
    if (!wsReady) { frameInFlight = false; return; }
    send({ t: 'frame', m: monitorIndex, w: Math.min(q.w, Math.round(screen.width * devicePixelRatio * 1.5) || q.w), q: q.q });
  }, wait);
}

function showFrame(blob) {
  const url = URL.createObjectURL(blob);
  screenImg.onload = () => {
    if (frameUrl) URL.revokeObjectURL(frameUrl);
    frameUrl = url;
    $('#screen-hint').hidden = true;
    frameInFlight = false;
    requestFrame();
  };
  screenImg.onerror = () => { frameInFlight = false; requestFrame(); };
  screenImg.src = url;
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { frameInFlight = false; requestFrame(); } });

function setMonitors(list) {
  const sel = $('#monitor');
  sel.replaceChildren(...list.map((m, i) => el('option', { value: i, textContent: `Screen ${i + 1}` })));
  sel.hidden = list.length < 2;
}
$('#monitor').addEventListener('change', (e) => { monitorIndex = +e.target.value; send({ t: 'abs', x: 0.5, y: 0.5, m: monitorIndex }); });
$('#quality').addEventListener('change', (e) => { try { localStorage.setItem('quality', e.target.value); } catch {} });
try { const q = localStorage.getItem('quality'); if (q && QUALITY[q]) $('#quality').value = q; } catch {}

// Gestures on the live screen: positions are sent as 0..1 of the picture.
(function screenGestures() {
  const wrap = $('#screen-wrap');
  let start = null;
  let holdTimer = null;
  let mode = null; // 'tap' | 'drag' | 'scroll' | 'held'
  let lastScrollY = 0;
  let lastScrollX = 0;

  const pos = (t) => {
    const r = screenImg.getBoundingClientRect();
    return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height };
  };
  const mid = (ts) => ({ clientX: (ts[0].clientX + ts[1].clientX) / 2, clientY: (ts[0].clientY + ts[1].clientY) / 2 });

  wrap.addEventListener('touchstart', (e) => {
    e.preventDefault();
    clearTimeout(holdTimer);
    if (e.touches.length === 2) {
      if (mode === 'drag') send({ t: 'up' });
      mode = 'scroll';
      const m = mid(e.touches);
      lastScrollX = m.clientX; lastScrollY = m.clientY;
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY, p: pos(t), time: Date.now() };
    mode = 'tap';
    holdTimer = setTimeout(() => {
      if (mode !== 'tap') return;
      mode = 'held';
      send({ t: 'click', b: 'right', ...start.p, m: monitorIndex });
      navigator.vibrate && navigator.vibrate(30);
    }, 550);
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (mode === 'scroll' && e.touches.length === 2) {
      const m = mid(e.touches);
      const dy = m.clientY - lastScrollY;
      const dx = m.clientX - lastScrollX;
      if (Math.abs(dy) > 18 || Math.abs(dx) > 18) {
        send({ t: 'scroll', dx: Math.trunc(-dx / 18), dy: Math.trunc(dy / 18) });
        lastScrollX = m.clientX; lastScrollY = m.clientY;
      }
      return;
    }
    if (e.touches.length !== 1 || !start) return;
    const t = e.touches[0];
    if (mode === 'tap' && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) {
      clearTimeout(holdTimer);
      mode = 'drag';
      send({ t: 'abs', ...start.p, m: monitorIndex });
      send({ t: 'down' });
    }
    if (mode === 'drag') send({ t: 'abs', ...pos(t) });
  }, { passive: false });

  wrap.addEventListener('touchend', (e) => {
    e.preventDefault();
    clearTimeout(holdTimer);
    if (e.touches.length > 0) return;
    if (mode === 'tap' && start) send({ t: 'click', b: 'left', ...start.p, m: monitorIndex });
    if (mode === 'drag') send({ t: 'up' });
    mode = null;
    start = null;
  }, { passive: false });

  // Mouse support, for using it from a tablet or computer browser.
  wrap.addEventListener('mousedown', (e) => { send({ t: 'abs', ...pos(e), m: monitorIndex }); send({ t: 'down', b: ['left', 'middle', 'right'][e.button] }); });
  wrap.addEventListener('mousemove', (e) => { if (e.buttons) send({ t: 'abs', ...pos(e) }); });
  wrap.addEventListener('mouseup', (e) => send({ t: 'up', b: ['left', 'middle', 'right'][e.button] }));
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); send({ t: 'scroll', dx: Math.sign(e.deltaX), dy: -Math.sign(e.deltaY) }); }, { passive: false });
})();

// ---------- touchpad ----------

(function touchpad() {
  const pad = $('#pad');
  let last = null;
  let startInfo = null;
  let moved = false;
  let fingers = 0;
  let dragging = false;
  let holdTimer = null;
  let pending = { dx: 0, dy: 0 };
  let raf = 0;

  const flush = () => {
    raf = 0;
    if (pending.dx || pending.dy) send({ t: 'move', dx: pending.dx, dy: pending.dy });
    pending = { dx: 0, dy: 0 };
  };

  pad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fingers = Math.max(fingers, e.touches.length);
    const t = e.touches[0];
    last = { x: t.clientX, y: t.clientY };
    if (e.touches.length === 1) {
      startInfo = { time: Date.now() };
      moved = false;
      holdTimer = setTimeout(() => {
        if (moved) return;
        dragging = true;
        pad.classList.add('dragging');
        send({ t: 'down' });
        navigator.vibrate && navigator.vibrate(30);
      }, 450);
    } else {
      clearTimeout(holdTimer);
    }
  }, { passive: false });

  pad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - last.x;
    const dy = t.clientY - last.y;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    if (!moved && Math.hypot(dx, dy) > 3) { moved = true; if (!dragging) clearTimeout(holdTimer); }
    if (e.touches.length >= 2) {
      if (Math.abs(dy) > 14 || Math.abs(dx) > 14) {
        send({ t: 'scroll', dx: Math.trunc(-dx / 14), dy: Math.trunc(dy / 14) });
        last = { x: t.clientX, y: t.clientY };
      }
      return;
    }
    // Faster finger = bigger jump, so both precise and quick moves work.
    const speed = +$('#speed').value;
    const accel = 1 + Math.min(Math.hypot(dx, dy) / 12, 2);
    pending.dx += dx * speed * accel;
    pending.dy += dy * speed * accel;
    if (!raf) raf = requestAnimationFrame(flush);
    last = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  pad.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) return;
    clearTimeout(holdTimer);
    const quick = startInfo && Date.now() - startInfo.time < 250;
    if (dragging) {
      send({ t: 'up' });
      dragging = false;
      pad.classList.remove('dragging');
    } else if (!moved && quick) {
      send({ t: 'click', b: fingers >= 2 ? 'right' : 'left' });
    }
    fingers = 0;
  }, { passive: false });
})();

$$('[data-click]').forEach((b) => b.addEventListener('click', () => send({ t: 'click', b: b.dataset.click })));

// ---------- keyboard ----------

const mods = new Set();
let isMac = false;

function pressKey(key) {
  const combo = [...mods, key];
  send({ t: 'keys', keys: combo });
  if (mods.size) { mods.clear(); $$('[data-mod]').forEach((b) => b.classList.remove('on')); }
}

$$('[data-key]').forEach((b) => b.addEventListener('click', () => pressKey(b.dataset.key)));
$$('[data-mod]').forEach((b) => b.addEventListener('click', () => {
  const m = b.dataset.mod;
  if (mods.has(m)) mods.delete(m); else mods.add(m);
  b.classList.toggle('on', mods.has(m));
}));

function toggleKeyboard() {
  const kb = $('#keyboard');
  kb.hidden = !kb.hidden;
  if (!kb.hidden) $('#live-input').focus();
}

// Whatever is typed in the box is sent as it changes, then the box is cleared
// on Enter. Comparing old and new text works with every phone keyboard,
// including autocorrect and swipe typing.
(function liveTyping() {
  const input = $('#live-input');
  let prev = '';
  input.addEventListener('input', () => {
    const now = input.value;
    if (mods.size && now.length === prev.length + 1 && now.startsWith(prev)) {
      // A modifier is on: send a shortcut like Ctrl+C instead of the letter.
      pressKey(now.slice(-1));
      input.value = prev;
      return;
    }
    let same = 0;
    while (same < prev.length && same < now.length && prev[same] === now[same]) same++;
    const removed = prev.length - same;
    for (let i = 0; i < removed; i++) send({ t: 'keys', keys: ['backspace'] });
    const added = now.slice(same);
    if (added) send({ t: 'type', text: added });
    prev = now;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); send({ t: 'keys', keys: ['enter'] }); input.value = ''; prev = ''; }
    else if (e.key === 'Backspace' && input.value === '') { e.preventDefault(); send({ t: 'keys', keys: ['backspace'] }); }
  });
  input.addEventListener('blur', () => { input.value = ''; prev = ''; });
})();

function buildShortcuts() {
  const mod = isMac ? 'cmd' : 'ctrl';
  const list = [
    ['Copy', [mod, 'c']], ['Paste', [mod, 'v']], ['Cut', [mod, 'x']],
    ['Undo', [mod, 'z']], ['Select all', [mod, 'a']], ['Save', [mod, 's']],
    ['Switch app', isMac ? ['cmd', 'tab'] : ['alt', 'tab']],
    ['Close window', isMac ? ['cmd', 'w'] : ['alt', 'f4']],
    ['New tab', [mod, 't']],
    ['Show desktop', isMac ? ['f11'] : ['cmd', 'd']],
    ['Find', [mod, 'f']],
    isMac ? ['Spotlight', ['cmd', 'space']] : ['Start menu', ['cmd']],
    isMac ? ['Force quit', ['cmd', 'alt', 'esc']] : ['Task manager', ['ctrl', 'shift', 'esc']],
    ['Refresh', isMac ? ['cmd', 'r'] : ['f5']],
    ['Screenshot', isMac ? ['cmd', 'shift', '3'] : ['cmd', 'printscreen']],
  ];
  $('#shortcuts').replaceChildren(...list.map(([label, keys]) => {
    const b = el('button', { textContent: label, title: keys.join('+') });
    b.addEventListener('click', () => send({ t: 'keys', keys }));
    return b;
  }));
  if (isMac) { $('.os-cmd').textContent = 'Cmd'; $('.os-alt').textContent = 'Option'; }
}

// ---------- controls ----------

$$('[data-power]').forEach((b) => b.addEventListener('click', run(async () => {
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  await api('/api/power', { action: b.dataset.power });
  toast('Done');
})));

$$('[data-open]').forEach((f) => f.addEventListener('submit', run(async (e) => {
  e.preventDefault();
  const input = $('input', f);
  await api('/api/open', { kind: f.dataset.open, target: input.value });
  toast('Opened on laptop');
  input.value = '';
})));

const actions = {
  'kbd-toggle': toggleKeyboard,
  fullscreen: () => {
    const w = $('#screen-wrap');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (w.requestFullscreen) w.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')?.catch(() => {})).catch(() => {});
    else toast('Full screen is not supported here. Turn your phone sideways instead.');
  },
  'clip-send': run(async () => {
    await api('/api/clipboard', { text: $('#clip-text').value });
    toast('Copied on laptop');
  }),
  'clip-get': run(async () => {
    const { text } = await api('/api/clipboard');
    $('#clip-text').value = text;
    try { await navigator.clipboard.writeText(text); toast('Copied to this phone'); } catch { toast('Shown in the box'); }
  }),
  'file-up': () => { if (fileParent) openFolder(fileParent); },
  'file-mkdir': run(async () => {
    const name = prompt('New folder name');
    if (!name) return;
    await api('/api/files/mkdir', { path: filePath, name });
    openFolder(filePath);
  }),
  'file-hidden': () => {
    showHidden = !showHidden;
    $('#hidden-btn').classList.toggle('on', showHidden);
    openFolder(filePath);
  },
  procs: () => loadProcs(),
  unpair: run(async () => {
    if (!confirm('Unpair this phone? You will need a new PIN from the laptop to connect again.')) return;
    await api('/api/unpair', {});
    showPairing();
  }),
};
$$('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));

let infoTimer = null;
const loadInfo = run(async () => {
  const i = await api('/api/info');
  $('#laptop-name').textContent = i.name;
  if (i.battery) $('#battery').textContent = `${i.battery.plugged ? '⚡' : '🔋'} ${i.battery.percent}%`;
  const tiles = [
    ['CPU', `${Math.round(i.cpu)}%`],
    ['Memory', `${Math.round(i.memory.percent)}%`, `${fmtBytes(i.memory.used)} of ${fmtBytes(i.memory.total)}`],
    ['Disk', `${Math.round(i.disk.percent)}%`, `${fmtBytes(i.disk.total - i.disk.used)} free`],
    ['Battery', i.battery ? `${i.battery.percent}%` : '—', i.battery ? (i.battery.plugged ? 'Charging' : 'On battery') : 'No battery'],
  ];
  $('#info').replaceChildren(...tiles.map(([label, value, sub]) =>
    el('div', {}, el('span', { textContent: label }), el('b', { textContent: value }), el('span', { textContent: sub || '' }))));
  if (!isMac && /Darwin/.test(i.os)) { isMac = true; buildShortcuts(); }
  clearTimeout(infoTimer);
  if (currentTab === 'controls') infoTimer = setTimeout(loadInfo, 5000);
});

// ---------- files ----------

let filePath = '';
let fileParent = null;
let showHidden = false;

const openFolder = run(async (path) => {
  const data = await api(`/api/files?path=${encodeURIComponent(path)}&hidden=${showHidden ? 1 : 0}`);
  filePath = data.path;
  fileParent = data.parent;
  $('#file-path').textContent = data.path;
  const sep = data.path.includes('\\') ? '\\' : '/';
  const join = (name) => data.path.endsWith(sep) ? data.path + name : data.path + sep + name;
  $('#file-list').replaceChildren(...(data.entries.length ? data.entries.map((f) => {
    const full = join(f.name);
    const li = el('li', { className: 'clickable' },
      el('span', { textContent: f.dir ? '📁' : fileIcon(f.name) }),
      el('div', { className: 'grow' }, el('div', { textContent: f.name }),
        el('div', { className: 'sub', textContent: f.dir ? 'Folder' : fmtBytes(f.size) })));
    if (f.dir) {
      li.addEventListener('click', () => openFolder(full));
    } else {
      const q = encodeURIComponent(full);
      const view = el('button', { textContent: 'Open', onclick: (e) => { e.stopPropagation(); window.open(`/api/files/download?view=1&path=${q}`, '_blank'); } });
      const dl = el('button', { textContent: 'Save', onclick: (e) => { e.stopPropagation(); location.href = `/api/files/download?path=${q}`; } });
      li.append(view, dl);
    }
    const del = el('button', { textContent: '🗑', className: 'danger', title: 'Delete' });
    del.addEventListener('click', run(async (e) => {
      e.stopPropagation();
      if (!confirm(`Permanently delete "${f.name}"${f.dir ? ' and everything inside it' : ''}?`)) return;
      await api('/api/files/delete', { path: full });
      toast('Deleted');
      openFolder(filePath);
    }));
    li.append(del);
    return li;
  }) : [el('li', { className: 'muted', textContent: 'This folder is empty' })]));
});

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'].includes(ext)) return '🖼';
  if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext)) return '🎵';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return '📄';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜';
  return '📄';
}

const loadRoots = run(async () => {
  const roots = await api('/api/files/roots');
  $('#file-roots').replaceChildren(...roots.map((r) => el('button', { textContent: r.name, onclick: () => openFolder(r.path) })));
});

$('#upload').addEventListener('change', run(async (e) => {
  const fd = new FormData();
  for (const f of e.target.files) fd.append('file', f, f.name);
  if (!e.target.files.length) return;
  toast('Uploading…');
  const { saved } = await api(`/api/files/upload?path=${encodeURIComponent(filePath)}`, fd);
  toast(`Uploaded ${saved.length} file(s)`);
  e.target.value = '';
  openFolder(filePath);
}));

// ---------- terminal ----------

let termCwd = '';
$('#term-form').addEventListener('submit', run(async (e) => {
  e.preventDefault();
  const input = $('#term-in');
  const command = input.value.trim();
  if (!command) return;
  const out = $('#term-out');
  out.textContent += `$ ${command}\n`;
  input.value = '';
  out.scrollTop = out.scrollHeight;
  const r = await api('/api/exec', { command, cwd: termCwd });
  termCwd = r.cwd;
  $('#term-cwd').textContent = `In folder: ${r.cwd}`;
  out.textContent += r.output + (r.code ? `[exit code ${r.code}]\n` : '');
  if (out.textContent.length > 100000) out.textContent = out.textContent.slice(-100000);
  out.scrollTop = out.scrollHeight;
}));

// ---------- processes & devices ----------

const loadProcs = run(async () => {
  const procs = await api('/api/processes');
  $('#proc-list').replaceChildren(...procs.map((p) => {
    const b = el('button', { textContent: 'Close', className: 'danger' });
    b.addEventListener('click', run(async () => {
      if (!confirm(`Close ${p.name}? Unsaved work in it may be lost.`)) return;
      await api('/api/kill', { pid: p.pid });
      toast(`Closed ${p.name}`);
      loadProcs();
    }));
    return el('li', {}, el('div', { className: 'grow' }, el('div', { textContent: p.name }),
      el('div', { className: 'sub', textContent: `${fmtBytes(p.memory)} · PID ${p.pid}` })), b);
  }));
});

const loadDevices = run(async () => {
  const list = await api('/api/devices');
  $('#device-list').replaceChildren(...list.map((d) => {
    const li = el('li', {}, el('div', { className: 'grow' },
      el('div', { textContent: d.name + (d.this ? ' (this phone)' : '') }),
      el('div', { className: 'sub', textContent: `Last used ${new Date(d.last_seen * 1000).toLocaleString()}` })));
    if (!d.this) {
      const b = el('button', { textContent: 'Remove', className: 'danger' });
      b.addEventListener('click', run(async () => {
        if (!confirm(`Remove ${d.name}? It will no longer be able to control the laptop.`)) return;
        await api('/api/devices/revoke', { id: d.id });
        loadDevices();
      }));
      li.append(b);
    }
    return li;
  }));
});

// ---------- start ----------

async function start() {
  let s;
  try {
    s = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
  } catch {
    document.body.textContent = 'Cannot reach the laptop. Is Laptop Remote running, and is this phone on the same Wi-Fi?';
    return;
  }
  if (!s.paired) return showPairing(s.laptop);
  $('#pair-view').hidden = true;
  $('#app-view').hidden = false;
  $('#laptop-name').textContent = s.laptop;
  buildShortcuts();
  loadRoots();
  loadInfo();
  connect();
  goto('screen');
}

start();
