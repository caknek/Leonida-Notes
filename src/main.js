// Leonida Companion — app compañera no oficial (uso personal/familiar)
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';

const IGN_URL = 'https://www.ign.com/maps/gta-6/leonida';
const KEY = 'leonida-companion.v1';
const isNative = Capacitor.isNativePlatform();

// ---------------------------------------------------------------- catálogos
const CATS = [
  { id: 'mision', name: 'Misión', emoji: '🎬', color: '#ff4f8b' },
  { id: 'colec', name: 'Coleccionable', emoji: '💎', color: '#2de2c8' },
  { id: 'tienda', name: 'Tienda', emoji: '🛒', color: '#ffb347' },
  { id: 'negocio', name: 'Negocio', emoji: '💼', color: '#ffd23f' },
  { id: 'vehiculo', name: 'Vehículo', emoji: '🚗', color: '#3a8dff' },
  { id: 'arma', name: 'Armas', emoji: '🔫', color: '#c0c6d4' },
  { id: 'actividad', name: 'Actividad', emoji: '🎯', color: '#a66bff' },
  { id: 'escondite', name: 'Escondite', emoji: '🏠', color: '#7ee081' },
  { id: 'interes', name: 'Lugar de interés', emoji: '📸', color: '#ff7a5c' },
  { id: 'peligro', name: 'Peligro', emoji: '⚠️', color: '#ff4f64' },
  { id: 'otro', name: 'Otro', emoji: '📍', color: '#a99dbb' },
];
const catById = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

const PROFILE_COLORS = ['#ff4f8b', '#ff9a3c', '#ffd23f', '#2de2c8', '#3a8dff', '#a66bff', '#7ee081', '#ff4f64'];
const PROFILE_EMOJIS = ['😎', '🦩', '🐊', '🌴', '🏄', '🕶️', '🔥', '💰', '🚤', '🏍️', '👑', '🐬', '🌅', '🎮', '👩', '👨', '👧', '👦'];
const LIST_EMOJIS = ['🎬', '🧭', '💎', '🎯', '🏠', '🚗', '🏆', '💰', '🔫', '🚤', '✈️', '🏍️', '👕', '🃏', '📸', '🐊', '🌴', '⭐', '📦', '🎵'];

const DEFAULT_LISTS = [
  ['Misiones principales', '🎬'],
  ['Misiones secundarias', '🧭'],
  ['Coleccionables', '💎'],
  ['Actividades', '🎯'],
  ['Negocios y propiedades', '🏠'],
  ['Vehículos', '🚗'],
  ['Logros y trofeos', '🏆'],
];

// ---------------------------------------------------------------- utilidades
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function fmtDur(ms, withSec = false) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (withSec) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'ahora';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  return `hace ${Math.floor(d / 86400)} d`;
}
async function tap(style = ImpactStyle.Light) {
  if (!isNative) return;
  try { await Haptics.impact({ style }); } catch {}
}

// ---------------------------------------------------------------- estado
function newProfile(name, emoji = '😎', color = PROFILE_COLORS[0]) {
  return {
    id: uid(), name, emoji, color, createdAt: Date.now(),
    lists: DEFAULT_LISTS.map(([n, e]) => ({ id: uid(), name: n, emoji: e, items: [] })),
    pins: [], notes: [], sessions: [], running: null,
  };
}
function defaultState() {
  const p = newProfile('Jugador 1');
  return {
    app: 'leonida-companion', version: 1, active: p.id, profiles: [p],
    links: [
      { id: uid(), name: 'Mapa interactivo IGN', url: IGN_URL },
      { id: uid(), name: 'Rockstar Games — GTA VI', url: 'https://www.rockstargames.com/VI' },
    ],
    settings: { hideDone: false },
  };
}
let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || defaultState(); } catch { state = defaultState(); }
if (!state.profiles?.length) state = defaultState();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const me = () => state.profiles.find((p) => p.id === state.active) || state.profiles[0];

// IndexedDB para la imagen del mapa (puede pesar varios MB)
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('leonida-companion', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    del: (k) => tx('readwrite', (s) => s.delete(k)),
  };
})();

// ---------------------------------------------------------------- UI base
const view = $('#view');
const topbar = $('#topbar');
const tabbar = $('#tabbar');
let cleanup = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

let sheetClose = null;
function sheet(html, onMount) {
  closeSheet();
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-act="close-sheet"></div><div class="sheet"><div class="grab"></div>${html}</div>`;
  document.body.classList.add('sheet-open');
  sheetClose = () => { root.innerHTML = ''; sheetClose = null; document.body.classList.remove('sheet-open'); };
  onMount?.(root.querySelector('.sheet'));
  return sheetClose;
}
function closeSheet() { sheetClose?.(); }

function confirmSheet(title, text, okLabel, onOk, danger = true) {
  sheet(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
    <div class="actions"><button class="btn ghost" data-act="close-sheet">Cancelar</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" id="ok">${esc(okLabel)}</button></div>`, (s) => {
    $('#ok', s).onclick = () => { closeSheet(); onOk(); };
  });
}

function setAccent() {
  document.documentElement.style.setProperty('--accent', me().color);
}

function renderTop(title, { back = false, extra = '' } = {}) {
  const p = me();
  topbar.innerHTML = `
    ${back ? '<button class="back" data-act="back">‹</button>' : ''}
    <h1>${esc(title)}</h1>
    ${extra}
    ${back ? '' : `<button class="icon-btn" data-act="go" data-to="more" aria-label="Ajustes">⚙️</button>
    <button class="avatar" data-act="profiles" aria-label="Perfil">${esc(p.emoji)}</button>`}`;
}

const TABS = [
  { id: 'home', ico: '🏠', label: 'Inicio' },
  { id: 'map', ico: '🗺️', label: 'Mi mapa' },
  { id: 'ign', ico: '🧭', label: 'Mapa IGN', cls: 'ign' },
  { id: 'progress', ico: '✅', label: 'Progreso' },
  { id: 'notes', ico: '📝', label: 'Notas' },
];
function renderTabs(active) {
  tabbar.innerHTML = TABS.map((t) => `<button class="${t.cls || ''} ${t.id === active ? 'on' : ''}" data-act="tab" data-to="${t.id}">
    <span class="ico">${t.ico}</span>${t.label}</button>`).join('');
}

// ---------------------------------------------------------------- navegador IGN
async function openUrl(url) {
  if (isNative) {
    await Browser.open({ url, toolbarColor: '#0d0a16', presentationStyle: 'fullscreen' });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

// ---------------------------------------------------------------- cálculos
function profileStats(p) {
  let total = 0, done = 0;
  p.lists.forEach((l) => { total += l.items.length; done += l.items.filter((i) => i.done).length; });
  const pinsDone = p.pins.filter((x) => x.done).length;
  let played = p.sessions.reduce((a, s) => a + (s.end - s.start), 0);
  if (p.running) played += Date.now() - p.running;
  return { total, done, pins: p.pins.length, pinsDone, played };
}

// ---------------------------------------------------------------- vistas
const views = {};

views.home = () => {
  const p = me();
  const st = profileStats(p);
  const overall = pct(st.done + st.pinsDone, st.total + st.pins);
  renderTop(`Hola, ${p.name}`);
  const topLists = [...p.lists].filter((l) => l.items.length).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 3);
  const lastSession = p.sessions[p.sessions.length - 1];

  view.innerHTML = `
    <section class="hero">
      <div class="kicker">Estado de Leonida</div>
      <h2>Tu compañero<br/>de ruta</h2>
      <p>Mapa de IGN en vivo, tus pines, checklists y tiempo de juego en un solo lugar.</p>
      <button class="btn primary" data-act="ign">🧭 Abrir mapa IGN</button>
    </section>

    <div class="card">
      <div class="row between">
        <div>
          <div class="small muted">${p.running ? '<span class="live-dot"></span>&nbsp; Sesión en curso' : 'Sesión de juego'}</div>
          <div class="timer" id="timer">${p.running ? fmtDur(Date.now() - p.running, true) : '00:00:00'}</div>
          <div class="small faint">${lastSession && !p.running ? `Última: ${fmtDur(lastSession.end - lastSession.start)} · ${timeAgo(lastSession.end)}` : p.running ? `Desde ${new Date(p.running).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : 'Cronometra cuánto juegas'}</div>
        </div>
        <button class="btn ${p.running ? 'danger' : 'teal'}" data-act="session">${p.running ? '■ Terminar' : '▶ Empezar'}</button>
      </div>
    </div>

    <div class="card row">
      <div class="ring" style="--p:${overall}" data-label="${overall}%"></div>
      <div class="grow">
        <h3>Progreso total</h3>
        <div class="muted small">${st.done}/${st.total} objetivos · ${st.pinsDone}/${st.pins} pines visitados</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><b>${fmtDur(st.played).replace(' min', 'm').replace(' h', 'h')}</b><span>jugado</span></div>
      <div class="stat"><b>${st.pins}</b><span>pines</span></div>
      <div class="stat"><b>${p.notes.length}</b><span>notas</span></div>
    </div>

    <div class="section-title">Continuar <button class="btn sm ghost" data-act="tab" data-to="progress">Ver todo</button></div>
    ${topLists.length ? topLists.map(listCard).join('') : `<div class="card tap" data-act="tab" data-to="progress"><div class="row"><div class="list-card"><div class="emoji">✅</div></div><div class="grow"><h3>Arma tus checklists</h3><div class="muted small">Pega listas de misiones o coleccionables desde cualquier guía.</div></div></div></div>`}

    <div class="section-title">Accesos rápidos <button class="btn sm ghost" data-act="links">Editar</button></div>
    <div class="menu">
      ${state.links.map((l) => `<button data-act="open-link" data-url="${esc(l.url)}"><span class="mi">🔗</span><span class="grow truncate">${esc(l.name)}</span><span class="chev">↗</span></button>`).join('')}
    </div>
    <p class="disclaimer">App de fans, no oficial. Sin afiliación con Rockstar Games, Take-Two ni IGN.</p>`;

  const iv = setInterval(() => {
    const el = $('#timer');
    if (el && me().running) el.textContent = fmtDur(Date.now() - me().running, true);
  }, 1000);
  return () => clearInterval(iv);
};

function listCard(l) {
  const d = l.items.filter((i) => i.done).length;
  const p = pct(d, l.items.length);
  return `<div class="card tap list-card" data-act="go" data-to="list/${l.id}">
    <div class="emoji">${esc(l.emoji)}</div>
    <div class="grow">
      <div class="row between"><h3 class="truncate">${esc(l.name)}</h3><span class="small muted">${d}/${l.items.length}</span></div>
      <div class="bar" style="margin-top:8px"><i style="width:${p}%"></i></div>
    </div></div>`;
}

// ----- Mapa IGN (pestaña central)
views.ign = () => {
  renderTop('Mapa IGN');
  view.innerHTML = `
    <div class="ign-art">
      <span class="pinA" style="left:22%;top:30%">📍</span>
      <span class="pinB" style="left:58%;top:22%">💎</span>
      <span class="pinC" style="left:70%;top:55%">🎬</span>
    </div>
    <div class="card">
      <h3>Mapa interactivo de Leonida</h3>
      <p class="muted" style="margin:4px 0 14px">Se abre el mapa oficial de IGN siempre actualizado, dentro de la app. Tu sesión de IGN (si inicias sesión allá) se mantiene entre aperturas.</p>
      <button class="btn primary block" data-act="ign">🧭 Abrir mapa ahora</button>
    </div>
    <div class="card">
      <h3>Tip: úsalo junto a tus herramientas</h3>
      <ol class="steps" style="margin-top:12px">
        <li><span>Busca en IGN el coleccionable o lugar que te interesa.</span></li>
        <li><span>Vuelve con el botón atrás y márcalo en <b>Mi mapa</b> o en tu checklist.</span></li>
        <li><span>Inicia el cronómetro de sesión en Inicio para llevar tus horas.</span></li>
      </ol>
    </div>
    <div class="row" style="gap:10px">
      <button class="btn block" data-act="tab" data-to="map">🗺️ Mi mapa</button>
      <button class="btn block" data-act="tab" data-to="progress">✅ Checklists</button>
    </div>`;
};

// ----- Mi mapa (Leaflet sobre una captura propia)
let mapCtx = null;
views.map = async () => {
  renderTop('Mi mapa');
  view.classList.add('full');
  view.innerHTML = `<div id="leaflet"></div>
    <div class="map-overlay-top"><div class="chips" id="map-chips"></div></div>
    <div class="map-fabs">
      <button class="fab" data-act="map-options" aria-label="Imagen del mapa">🖼️</button>
      <button class="fab" data-act="pin-list" aria-label="Lista de pines">☰</button>
      <button class="fab main" id="fab-add" data-act="add-mode" aria-label="Agregar pin">+</button>
    </div>`;

  const img = await idb.get('mapImage').catch(() => null);
  const usingGrid = !img;
  const src = img ? URL.createObjectURL(img) : gridImage();
  const dims = await imgSize(src);
  if (!view.querySelector('#leaflet') || current.name !== 'map') return; // se navegó a otra vista mientras cargaba
  const map = L.map('leaflet', { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, attributionControl: false, zoomControl: false, maxBoundsViscosity: 0.8 });
  const bounds = [[0, 0], [dims.h, dims.w]];
  L.imageOverlay(src, bounds).addTo(map);
  map.fitBounds(bounds);
  map.setMaxBounds(L.latLngBounds(bounds).pad(0.3));
  const layer = L.layerGroup().addTo(map);
  mapCtx = { map, layer, dims, filter: null, adding: false, markers: {} };

  const place = (latlng) => {
    const nx = latlng.lng / dims.w, ny = latlng.lat / dims.h;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return toast('Fuera del mapa');
    setAddMode(false);
    pinForm({ nx, ny });
  };
  map.on('click', (e) => { if (mapCtx.adding) place(e.latlng); });
  map.on('contextmenu', (e) => { tap(ImpactStyle.Medium); place(e.latlng); });

  drawPins();
  if (usingGrid && !me().pins.length && !sessionStorage.getItem('gridHint')) {
    sessionStorage.setItem('gridHint', '1');
    mapOptions(true);
  }
  return () => {
    map.remove();
    if (img) URL.revokeObjectURL(src);
    mapCtx = null;
    view.classList.remove('full');
  };
};

function imgSize(src) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res({ w: 2048, h: 2048 });
    i.src = src;
  });
}
function gridImage() {
  const c = document.createElement('canvas');
  c.width = c.height = 2048;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 2048, 2048);
  grad.addColorStop(0, '#14213a'); grad.addColorStop(1, '#2a1330');
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 2048);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
  for (let i = 0; i <= 2048; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 2048); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(2048, i); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.font = '600 30px Outfit, sans-serif';
  const cols = 'ABCDEFGHIJKLMNOP';
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) if ((x + y) % 4 === 0) g.fillText(`${cols[x]}${y + 1}`, x * 128 + 12, y * 128 + 40);
  return c.toDataURL('image/png');
}

function visiblePins() {
  const p = me();
  return p.pins.filter((x) => (!mapCtx?.filter || x.cat === mapCtx.filter) && (!state.settings.hideDone || !x.done));
}
function drawPins() {
  if (!mapCtx) return;
  const { layer, dims } = mapCtx;
  layer.clearLayers();
  mapCtx.markers = {};
  visiblePins().forEach((pin) => {
    const c = catById(pin.cat);
    const icon = L.divIcon({
      className: '', iconSize: [34, 34], iconAnchor: [17, 34],
      html: `<div class="pin-ico ${pin.done ? 'done' : ''}" style="background:${c.color}"><span>${c.emoji}</span></div>`,
    });
    const m = L.marker([pin.ny * dims.h, pin.nx * dims.w], { icon }).addTo(layer);
    m.on('click', () => pinDetail(pin.id));
    mapCtx.markers[pin.id] = m;
  });
  const used = [...new Set(me().pins.map((x) => x.cat))];
  const chips = $('#map-chips');
  if (chips) chips.innerHTML = `
    <button class="chip ${!mapCtx.filter ? 'on' : ''}" data-act="map-filter" data-cat="">Todos · ${me().pins.length}</button>
    <button class="chip ${state.settings.hideDone ? 'on' : ''}" data-act="toggle-hide">✓ ${state.settings.hideDone ? 'Ocultos' : 'Visibles'}</button>
    ${CATS.filter((c) => used.includes(c.id)).map((c) => `<button class="chip ${mapCtx.filter === c.id ? 'on' : ''}" data-act="map-filter" data-cat="${c.id}"><span class="dot" style="background:${c.color}"></span>${c.emoji} ${c.name}</button>`).join('')}`;
}
function setAddMode(on) {
  if (!mapCtx) return;
  mapCtx.adding = on;
  $('#fab-add')?.classList.toggle('active', on);
  $('#fab-add') && ($('#fab-add').textContent = on ? '×' : '+');
  $('.add-banner')?.remove();
  if (on) view.insertAdjacentHTML('beforeend', '<div class="add-banner">Toca el mapa donde va el pin</div>');
}

function pinForm(pos, existing) {
  const pin = existing || { cat: 'colec', title: '', note: '', done: false, ...pos };
  sheet(`<h2>${existing ? 'Editar pin' : 'Nuevo pin'}</h2>
    <label class="field"><span>Nombre</span><input class="input" id="pf-title" placeholder="Ej. Tienda de armas Vice Beach" value="${esc(pin.title)}" /></label>
    <label class="field"><span>Categoría</span></label>
    <div class="chips" id="pf-cats" style="flex-wrap:wrap">${CATS.map((c) => `<button class="chip ${c.id === pin.cat ? 'on' : ''}" data-cat="${c.id}"><span class="dot" style="background:${c.color}"></span>${c.emoji} ${c.name}</button>`).join('')}</div>
    <label class="field"><span>Notas</span><textarea class="input" id="pf-note" style="min-height:80px" placeholder="Cómo llegar, qué hay, requisitos…">${esc(pin.note)}</textarea></label>
    <div class="actions"><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="pf-save">Guardar</button></div>`, (s) => {
    let cat = pin.cat;
    $('#pf-cats', s).onclick = (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      cat = b.dataset.cat;
      s.querySelectorAll('#pf-cats .chip').forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#pf-save', s).onclick = () => {
      const title = $('#pf-title', s).value.trim() || catById(cat).name;
      const note = $('#pf-note', s).value.trim();
      if (existing) Object.assign(existing, { title, note, cat });
      else me().pins.push({ id: uid(), createdAt: Date.now(), done: false, nx: pin.nx, ny: pin.ny, title, note, cat });
      save(); closeSheet(); drawPins(); tap();
      toast(existing ? 'Pin actualizado' : 'Pin agregado');
    };
    if (!existing) setTimeout(() => $('#pf-title', s)?.focus(), 250);
  });
}

function pinDetail(id) {
  const pin = me().pins.find((x) => x.id === id);
  if (!pin) return;
  const c = catById(pin.cat);
  sheet(`<div class="row" style="margin-bottom:12px">
      <div class="pin-ico" style="background:${c.color};position:relative"><span>${c.emoji}</span></div>
      <div class="grow"><h2 style="margin:0">${esc(pin.title)}</h2><span class="tag">${c.name}</span> <span class="small faint">· ${timeAgo(pin.createdAt)}</span></div>
    </div>
    ${pin.note ? `<p class="muted" style="white-space:pre-wrap">${esc(pin.note)}</p>` : ''}
    <div class="toggle card" style="padding:12px 16px"><span>Visitado / completado</span><button class="switch ${pin.done ? 'on' : ''}" id="pd-done"></button></div>
    <div class="actions"><button class="btn danger" id="pd-del">🗑 Borrar</button><button class="btn" id="pd-edit">✏️ Editar</button><button class="btn primary" id="pd-move">✥ Mover</button></div>`, (s) => {
    $('#pd-done', s).onclick = (e) => { pin.done = !pin.done; e.currentTarget.classList.toggle('on', pin.done); save(); drawPins(); tap(); };
    $('#pd-edit', s).onclick = () => pinForm(null, pin);
    $('#pd-del', s).onclick = () => confirmSheet('¿Borrar pin?', pin.title, 'Borrar', () => { me().pins = me().pins.filter((x) => x.id !== id); save(); drawPins(); toast('Pin borrado'); });
    $('#pd-move', s).onclick = () => {
      closeSheet();
      const m = mapCtx?.markers[id];
      if (!m) return;
      m.dragging.enable();
      toast('Arrastra el pin a su nueva posición');
      m.once('dragend', () => {
        const ll = m.getLatLng();
        pin.nx = Math.min(1, Math.max(0, ll.lng / mapCtx.dims.w));
        pin.ny = Math.min(1, Math.max(0, ll.lat / mapCtx.dims.h));
        save(); drawPins(); toast('Pin movido');
      });
    };
  });
}

function pinList() {
  const render = (q = '') => {
    const pins = me().pins.filter((x) => !q || (x.title + ' ' + x.note).toLowerCase().includes(q.toLowerCase()));
    return pins.length ? pins.map((x) => {
      const c = catById(x.cat);
      return `<div class="item ${x.done ? 'done' : ''}" data-pin="${x.id}"><span style="font-size:20px">${c.emoji}</span><div class="txt"><div class="truncate">${esc(x.title)}</div><div class="note">${c.name}</div></div><span class="faint">›</span></div>`;
    }).join('') : '<div class="empty"><div class="big">📍</div>Sin pines todavía</div>';
  };
  sheet(`<h2>Pines (${me().pins.length})</h2>
    <div class="search"><span>🔍</span><input id="pl-q" placeholder="Buscar pines…" /></div>
    <div id="pl-list">${render()}</div>`, (s) => {
    $('#pl-q', s).oninput = (e) => { $('#pl-list', s).innerHTML = render(e.target.value); };
    $('#pl-list', s).onclick = (e) => {
      const it = e.target.closest('[data-pin]'); if (!it) return;
      const pin = me().pins.find((x) => x.id === it.dataset.pin);
      closeSheet();
      if (mapCtx) {
        if (!mapCtx.markers[pin.id]) { mapCtx.filter = null; state.settings.hideDone = false; save(); drawPins(); }
        mapCtx.map.flyTo([pin.ny * mapCtx.dims.h, pin.nx * mapCtx.dims.w], 1, { duration: 0.6 });
        setTimeout(() => pinDetail(pin.id), 650);
      }
    };
  });
}

function mapOptions(first = false) {
  sheet(`<h2>${first ? 'Configura tu mapa' : 'Imagen del mapa'}</h2>
    <p class="muted">Carga una captura del mapa del juego (desde tu consola o TV) y pon encima tus propios pines. La imagen se guarda solo en este teléfono.</p>
    <input type="file" id="mo-file" accept="image/*" hidden />
    <button class="btn primary block" id="mo-pick">🖼️ Elegir imagen</button>
    <div style="height:10px"></div>
    <button class="btn block" id="mo-grid">▦ Usar cuadrícula (sin imagen)</button>
    <p class="kbd-hint">Los pines guardan su posición relativa: si cambias la imagen por otra del mismo encuadre, quedan en su lugar. Mantén presionado el mapa para soltar un pin rápido.</p>`, (s) => {
    const f = $('#mo-file', s);
    $('#mo-pick', s).onclick = () => f.click();
    f.onchange = async () => {
      const file = f.files[0]; if (!file) return;
      await idb.set('mapImage', file);
      closeSheet(); toast('Mapa actualizado'); route();
    };
    $('#mo-grid', s).onclick = async () => { await idb.del('mapImage'); closeSheet(); route(); };
  });
}

// ----- Progreso (checklists)
views.progress = () => {
  const p = me();
  renderTop('Progreso');
  const st = profileStats(p);
  view.innerHTML = `
    <div class="card row">
      <div class="ring" style="--p:${pct(st.done, st.total)}" data-label="${pct(st.done, st.total)}%"></div>
      <div class="grow"><h3>${st.done} de ${st.total} objetivos</h3><div class="muted small">${p.lists.length} listas · toca una para marcar</div></div>
    </div>
    ${p.lists.map(listCard).join('')}
    <button class="btn block ghost" data-act="new-list">＋ Nueva lista</button>`;
};

views.list = (id) => {
  const p = me();
  const list = p.lists.find((l) => l.id === id);
  if (!list) return go('progress');
  let q = '';
  renderTop(list.name, { back: true, extra: `<button class="icon-btn" data-act="list-menu" data-id="${list.id}">⋯</button>` });
  const draw = () => {
    const d = list.items.filter((i) => i.done).length;
    const items = list.items.filter((i) => (!state.settings.hideDone || !i.done) && (!q || (i.text + ' ' + (i.note || '')).toLowerCase().includes(q)));
    $('#li-head').innerHTML = `<div class="row between"><span class="muted small">${d} de ${list.items.length} completados</span><span class="small" style="font-weight:700">${pct(d, list.items.length)}%</span></div><div class="bar" style="margin:8px 0 14px"><i style="width:${pct(d, list.items.length)}%"></i></div>`;
    $('#li-items').innerHTML = items.length ? items.map((i) => `
      <div class="item ${i.done ? 'done' : ''}">
        <button class="check ${i.done ? 'on' : ''}" data-act="check" data-list="${list.id}" data-id="${i.id}">${i.done ? '✓' : ''}</button>
        <div class="txt" data-act="edit-item" data-list="${list.id}" data-id="${i.id}"><div>${esc(i.text)}</div>${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}</div>
      </div>`).join('') : list.items.length
      ? '<div class="empty"><div class="big">🎉</div>Nada que mostrar con estos filtros</div>'
      : `<div class="empty"><div class="big">${esc(list.emoji)}</div><h3>Lista vacía</h3>Agrega objetivos uno a uno o pega una lista completa desde una guía.<div style="height:14px"></div><button class="btn primary" data-act="bulk" data-id="${list.id}">📋 Pegar lista</button></div>`;
  };
  view.innerHTML = `
    <div id="li-head"></div>
    <div class="search"><span>🔍</span><input id="li-q" placeholder="Buscar en la lista…" /></div>
    <div class="chips"><button class="chip ${state.settings.hideDone ? 'on' : ''}" data-act="toggle-hide">✓ ${state.settings.hideDone ? 'Completados ocultos' : 'Mostrar completados'}</button>
      <button class="chip" data-act="bulk" data-id="${list.id}">📋 Pegar varios</button></div>
    <div id="li-items"></div>
    <form id="li-add" class="search" style="margin-top:6px"><input id="li-new" placeholder="Agregar objetivo…" enterkeyhint="done" /><button class="btn sm primary" type="submit">＋</button></form>`;
  $('#li-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  $('#li-add').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#li-new').value.trim(); if (!v) return;
    list.items.push({ id: uid(), text: v, done: false }); list.touched = Date.now();
    save(); $('#li-new').value = ''; draw();
  };
  views.list.redraw = draw;
  draw();
};

// ----- Notas
views.notes = () => {
  const p = me();
  renderTop('Notas');
  let q = '';
  const draw = () => {
    const notes = [...p.notes].filter((n) => !q || (n.title + ' ' + n.body).toLowerCase().includes(q)).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    $('#nt-list').innerHTML = notes.length ? notes.map((n) => `
      <div class="card tap note-card" data-act="edit-note" data-id="${n.id}">
        <div class="row between"><h3 class="truncate">${n.pinned ? '📌 ' : ''}${esc(n.title || 'Sin título')}</h3><span class="small faint">${timeAgo(n.updatedAt)}</span></div>
        ${n.body ? `<div class="body">${esc(n.body)}</div>` : ''}
      </div>`).join('') : `<div class="empty"><div class="big">📝</div><h3>${q ? 'Sin resultados' : 'Tu bitácora'}</h3>${q ? '' : 'Anota trucos, códigos de vestimenta, rutas, precios o lo que pasó en tu última partida.'}</div>`;
  };
  view.innerHTML = `<div class="search"><span>🔍</span><input id="nt-q" placeholder="Buscar notas…" /></div>
    <button class="btn primary block" data-act="edit-note" style="margin-bottom:14px">＋ Nueva nota</button>
    <div id="nt-list"></div>`;
  $('#nt-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  views.notes.redraw = draw;
  draw();
};

function noteForm(id) {
  const p = me();
  const n = p.notes.find((x) => x.id === id);
  sheet(`<h2>${n ? 'Editar nota' : 'Nueva nota'}</h2>
    <label class="field"><input class="input" id="nf-title" placeholder="Título" value="${esc(n?.title || '')}" /></label>
    <label class="field"><textarea class="input" id="nf-body" style="min-height:200px" placeholder="Escribe aquí…">${esc(n?.body || '')}</textarea></label>
    <div class="toggle" style="margin-bottom:8px"><span>📌 Fijar arriba</span><button class="switch ${n?.pinned ? 'on' : ''}" id="nf-pin"></button></div>
    <div class="actions">${n ? '<button class="btn danger" id="nf-del">🗑</button>' : ''}<button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="nf-save">Guardar</button></div>`, (s) => {
    let pinned = !!n?.pinned;
    $('#nf-pin', s).onclick = (e) => { pinned = !pinned; e.currentTarget.classList.toggle('on', pinned); };
    $('#nf-save', s).onclick = () => {
      const title = $('#nf-title', s).value.trim(), body = $('#nf-body', s).value.trim();
      if (!title && !body) return closeSheet();
      if (n) Object.assign(n, { title, body, pinned, updatedAt: Date.now() });
      else p.notes.push({ id: uid(), title, body, pinned, updatedAt: Date.now() });
      save(); closeSheet(); views.notes.redraw?.();
    };
    if (n) $('#nf-del', s).onclick = () => confirmSheet('¿Borrar nota?', n.title || 'Sin título', 'Borrar', () => { p.notes = p.notes.filter((x) => x.id !== id); save(); views.notes.redraw?.(); });
    if (!n) setTimeout(() => $('#nf-title', s)?.focus(), 250);
  });
}

// ----- Más / ajustes
views.more = () => {
  renderTop('Ajustes', { back: true });
  const p = me();
  view.innerHTML = `
    <div class="card row tap" data-act="profiles">
      <div class="avatar" style="width:54px;height:54px;font-size:28px">${esc(p.emoji)}</div>
      <div class="grow"><h3>${esc(p.name)}</h3><div class="muted small">${state.profiles.length} perfil(es) en este teléfono · toca para cambiar</div></div>
      <span class="faint">›</span>
    </div>
    <div class="section-title">Juego</div>
    <div class="menu">
      <button data-act="sessions"><span class="mi">⏱️</span><span class="grow">Historial de sesiones</span><span class="chev">›</span></button>
      <button data-act="links"><span class="mi">🔗</span><span class="grow">Accesos rápidos</span><span class="chev">›</span></button>
      <button data-act="map-options"><span class="mi">🖼️</span><span class="grow">Imagen de Mi mapa</span><span class="chev">›</span></button>
    </div>
    <div class="section-title">Familia y respaldo</div>
    <div class="menu">
      <button data-act="export-profile"><span class="mi">📤</span><span class="grow">Compartir mi perfil<div class="small muted">Envía pines, listas y notas por WhatsApp</div></span><span class="chev">›</span></button>
      <button data-act="export-all"><span class="mi">💾</span><span class="grow">Respaldo completo<div class="small muted">Todos los perfiles y ajustes</div></span><span class="chev">›</span></button>
      <button data-act="import"><span class="mi">📥</span><span class="grow">Importar archivo<div class="small muted">Perfil compartido o respaldo</div></span><span class="chev">›</span></button>
    </div>
    <div class="section-title">Zona peligrosa</div>
    <div class="menu">
      <button data-act="reset-profile"><span class="mi">♻️</span><span class="grow">Reiniciar progreso de ${esc(p.name)}</span></button>
      <button data-act="wipe"><span class="mi">🧨</span><span class="grow" style="color:#ff7b8f">Borrar todos los datos</span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden />
    <p class="disclaimer">Leonida Companion v1.0 · App de fans para uso personal.<br/>GTA VI y Leonida son marcas de Rockstar Games / Take-Two. El mapa interactivo pertenece a IGN y se muestra desde su sitio.</p>`;
};

// ---------------------------------------------------------------- hojas de perfiles, enlaces, sesiones
function profilesSheet() {
  sheet(`<h2>Perfiles</h2>
    <p class="muted small" style="margin-top:-8px">Cada integrante de la familia lleva su propio progreso.</p>
    <div class="menu">${state.profiles.map((p) => {
      const st = profileStats(p);
      return `<button data-pid="${p.id}"><span class="avatar" style="border-color:${p.color}">${esc(p.emoji)}</span><span class="grow">${esc(p.name)}<div class="small muted">${pct(st.done + st.pinsDone, st.total + st.pins)}% · ${fmtDur(st.played)}</div></span>${p.id === state.active ? '<span class="tag" style="background:var(--teal);color:#04161a">Activo</span>' : ''}<span class="chev" data-edit="${p.id}">✏️</span></button>`;
    }).join('')}</div>
    <button class="btn primary block" id="pf-new">＋ Agregar perfil</button>`, (s) => {
    s.querySelector('.menu').onclick = (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) return profileForm(ed.dataset.edit);
      const b = e.target.closest('[data-pid]'); if (!b) return;
      state.active = b.dataset.pid; save(); setAccent(); closeSheet(); tap(); route();
      toast(`Perfil: ${me().name}`);
    };
    $('#pf-new', s).onclick = () => profileForm();
  });
}
function profileForm(id) {
  const p = state.profiles.find((x) => x.id === id);
  let emoji = p?.emoji || PROFILE_EMOJIS[state.profiles.length % PROFILE_EMOJIS.length];
  let color = p?.color || PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length];
  sheet(`<h2>${p ? 'Editar perfil' : 'Nuevo perfil'}</h2>
    <label class="field"><span>Nombre</span><input class="input" id="pr-name" value="${esc(p?.name || '')}" placeholder="Ej. Miguel" /></label>
    <label class="field"><span>Avatar</span></label><div class="emoji-pick" id="pr-emo">${PROFILE_EMOJIS.map((e) => `<button class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
    <label class="field" style="margin-top:14px"><span>Color</span></label><div class="swatches" id="pr-col">${PROFILE_COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" style="background:${c}" data-c="${c}"></button>`).join('')}</div>
    <div class="actions" style="margin-top:18px">${p && state.profiles.length > 1 ? '<button class="btn danger" id="pr-del">🗑</button>' : ''}<button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="pr-save">Guardar</button></div>`, (s) => {
    $('#pr-emo', s).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; emoji = b.textContent; s.querySelectorAll('#pr-emo button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#pr-col', s).onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; s.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#pr-save', s).onclick = () => {
      const name = $('#pr-name', s).value.trim() || `Jugador ${state.profiles.length + 1}`;
      if (p) Object.assign(p, { name, emoji, color });
      else { const np = newProfile(name, emoji, color); state.profiles.push(np); state.active = np.id; }
      save(); setAccent(); closeSheet(); route();
    };
    if (p && $('#pr-del', s)) $('#pr-del', s).onclick = () => confirmSheet(`¿Borrar a ${p.name}?`, 'Se pierden sus pines, listas, notas y sesiones.', 'Borrar perfil', () => {
      state.profiles = state.profiles.filter((x) => x.id !== p.id);
      if (state.active === p.id) state.active = state.profiles[0].id;
      save(); setAccent(); route();
    });
  });
}

function linksSheet() {
  const draw = () => state.links.map((l) => `<div class="item"><div class="txt"><div class="truncate">${esc(l.name)}</div><div class="note truncate">${esc(l.url)}</div></div><button class="icon-btn" data-del="${l.id}">✕</button></div>`).join('');
  sheet(`<h2>Accesos rápidos</h2>
    <div id="lk-list">${draw()}</div>
    <label class="field" style="margin-top:12px"><span>Nombre</span><input class="input" id="lk-name" placeholder="Ej. Guía de coleccionables" /></label>
    <label class="field"><span>Dirección (URL)</span><input class="input" id="lk-url" type="url" placeholder="https://…" /></label>
    <button class="btn primary block" id="lk-add">＋ Agregar enlace</button>`, (s) => {
    $('#lk-list', s).onclick = (e) => { const b = e.target.closest('[data-del]'); if (!b) return; state.links = state.links.filter((x) => x.id !== b.dataset.del); save(); $('#lk-list', s).innerHTML = draw(); };
    $('#lk-add', s).onclick = () => {
      let url = $('#lk-url', s).value.trim(); const name = $('#lk-name', s).value.trim();
      if (!url) return toast('Falta la URL');
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      state.links.push({ id: uid(), name: name || url, url }); save();
      $('#lk-list', s).innerHTML = draw(); $('#lk-url', s).value = ''; $('#lk-name', s).value = '';
    };
  });
}

function sessionsSheet() {
  const p = me();
  const list = [...p.sessions].reverse();
  const week = p.sessions.filter((s) => s.end > Date.now() - 7 * 864e5).reduce((a, s) => a + s.end - s.start, 0);
  sheet(`<h2>Sesiones de ${esc(p.name)}</h2>
    <div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><b>${fmtDur(profileStats(p).played)}</b><span>total</span></div><div class="stat"><b>${fmtDur(week)}</b><span>últimos 7 días</span></div></div>
    ${list.length ? list.slice(0, 60).map((s) => `<div class="item"><span>🎮</span><div class="txt">${fmtDate(s.start)}</div><b>${fmtDur(s.end - s.start)}</b></div>`).join('') : '<div class="empty">Aún no hay sesiones registradas.</div>'}`);
}

// ---------------------------------------------------------------- listas: menús
function newListSheet(existing) {
  let emoji = existing?.emoji || '⭐';
  sheet(`<h2>${existing ? 'Editar lista' : 'Nueva lista'}</h2>
    <label class="field"><span>Nombre</span><input class="input" id="nl-name" value="${esc(existing?.name || '')}" placeholder="Ej. Barcos" /></label>
    <label class="field"><span>Ícono</span></label><div class="emoji-pick" id="nl-emo">${LIST_EMOJIS.map((e) => `<button class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div class="actions" style="margin-top:18px"><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="nl-save">Guardar</button></div>`, (s) => {
    $('#nl-emo', s).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; emoji = b.textContent; s.querySelectorAll('#nl-emo button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#nl-save', s).onclick = () => {
      const name = $('#nl-name', s).value.trim(); if (!name) return toast('Ponle un nombre');
      if (existing) Object.assign(existing, { name, emoji });
      else { const l = { id: uid(), name, emoji, items: [] }; me().lists.push(l); save(); closeSheet(); return go(`list/${l.id}`); }
      save(); closeSheet(); route();
    };
  });
}
function listMenu(id) {
  const list = me().lists.find((l) => l.id === id);
  sheet(`<h2>${esc(list.emoji)} ${esc(list.name)}</h2>
    <div class="menu">
      <button id="lm-share"><span class="mi">💬</span><span class="grow">Compartir como texto</span></button>
      <button id="lm-bulk"><span class="mi">📋</span><span class="grow">Pegar varios objetivos</span></button>
      <button id="lm-edit"><span class="mi">✏️</span><span class="grow">Renombrar / ícono</span></button>
      <button id="lm-uncheck"><span class="mi">↺</span><span class="grow">Desmarcar todo</span></button>
      <button id="lm-del"><span class="mi">🗑</span><span class="grow" style="color:#ff7b8f">Borrar lista</span></button>
    </div>`, (s) => {
    $('#lm-share', s).onclick = async () => {
      const d = list.items.filter((i) => i.done).length;
      const text = `${list.emoji} ${list.name} — ${d}/${list.items.length}\n\n` + list.items.map((i) => `${i.done ? '✅' : '⬜'} ${i.text}`).join('\n');
      closeSheet();
      try { if (isNative || navigator.share) await Share.share({ title: list.name, text }); else { await navigator.clipboard.writeText(text); toast('Copiado'); } } catch {}
    };
    $('#lm-bulk', s).onclick = () => bulkSheet(id);
    $('#lm-edit', s).onclick = () => newListSheet(list);
    $('#lm-uncheck', s).onclick = () => confirmSheet('¿Desmarcar todo?', 'Los objetivos se mantienen, solo se quita el ✓.', 'Desmarcar', () => { list.items.forEach((i) => (i.done = false)); save(); route(); });
    $('#lm-del', s).onclick = () => confirmSheet('¿Borrar lista?', `${list.name} y sus ${list.items.length} objetivos.`, 'Borrar', () => { me().lists = me().lists.filter((l) => l.id !== id); save(); go('progress'); });
  });
}
function bulkSheet(id) {
  const list = me().lists.find((l) => l.id === id);
  sheet(`<h2>Pegar lista</h2>
    <p class="muted small" style="margin-top:-8px">Un objetivo por línea. Se ignoran viñetas, números y casillas al inicio. Usa “ — ” para agregar una nota: <i>Pistola dorada — en el muelle</i></p>
    <textarea class="input" id="bk-text" style="min-height:220px" placeholder="Misión 1&#10;Misión 2&#10;…"></textarea>
    <div class="actions"><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="bk-save">Agregar</button></div>`, (s) => {
    $('#bk-save', s).onclick = () => {
      const lines = $('#bk-text', s).value.split('\n').map((l) => l.replace(/^\s*([-*•·▪︎◦]|\d+[.)]|\[[ xX✓]?\]|[⬜✅☐☑✔️]+)\s*/u, '').trim()).filter(Boolean);
      const existing = new Set(list.items.map((i) => i.text.toLowerCase()));
      let n = 0;
      lines.forEach((l) => {
        const [text, ...rest] = l.split(/\s+[—–]\s+/);
        if (existing.has(text.toLowerCase())) return;
        existing.add(text.toLowerCase());
        list.items.push({ id: uid(), text, note: rest.join(' — '), done: false }); n++;
      });
      list.touched = Date.now();
      save(); closeSheet(); route(); toast(`${n} objetivos agregados`);
    };
    setTimeout(() => $('#bk-text', s)?.focus(), 250);
  });
}
function itemSheet(listId, itemId) {
  const list = me().lists.find((l) => l.id === listId);
  const it = list.items.find((i) => i.id === itemId);
  sheet(`<h2>Objetivo</h2>
    <label class="field"><span>Nombre</span><input class="input" id="it-text" value="${esc(it.text)}" /></label>
    <label class="field"><span>Nota</span><textarea class="input" id="it-note" style="min-height:90px">${esc(it.note || '')}</textarea></label>
    ${it.doneAt && it.done ? `<p class="small faint">Completado ${fmtDate(it.doneAt)}</p>` : ''}
    <div class="actions"><button class="btn danger" id="it-del">🗑</button><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="it-save">Guardar</button></div>`, (s) => {
    $('#it-save', s).onclick = () => { it.text = $('#it-text', s).value.trim() || it.text; it.note = $('#it-note', s).value.trim(); save(); closeSheet(); views.list.redraw?.(); };
    $('#it-del', s).onclick = () => { list.items = list.items.filter((i) => i.id !== itemId); save(); closeSheet(); views.list.redraw?.(); toast('Objetivo borrado'); };
  });
}

// ---------------------------------------------------------------- exportar / importar
function blobToDataURL(b) { return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
async function dataURLToBlob(u) { return (await fetch(u)).blob(); }

async function exportFile(obj, filename) {
  const json = JSON.stringify(obj);
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Enviar archivo' });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
const stamp = () => new Date().toISOString().slice(0, 10);

function exportSheet(kind) {
  sheet(`<h2>${kind === 'all' ? 'Respaldo completo' : `Compartir perfil de ${esc(me().name)}`}</h2>
    <p class="muted">${kind === 'all' ? 'Guarda este archivo en Drive o WhatsApp. Para restaurar: Ajustes → Importar archivo.' : 'Quien lo importe podrá agregarlo como perfil nuevo o fusionar tus pines y listas con los suyos.'}</p>
    <div class="toggle card" style="padding:12px 16px"><span>Incluir imagen de Mi mapa<div class="small muted">El archivo pesa más</div></span><button class="switch" id="ex-img"></button></div>
    <button class="btn primary block" id="ex-go">📤 Exportar</button>`, (s) => {
    let withImg = false;
    $('#ex-img', s).onclick = (e) => { withImg = !withImg; e.currentTarget.classList.toggle('on', withImg); };
    $('#ex-go', s).onclick = async () => {
      try {
        const img = withImg ? await idb.get('mapImage') : null;
        const mapImage = img ? await blobToDataURL(img) : undefined;
        const obj = kind === 'all'
          ? { app: 'leonida-companion', type: 'full', exportedAt: Date.now(), state, mapImage }
          : { app: 'leonida-companion', type: 'profile', exportedAt: Date.now(), profile: { ...me(), running: null }, mapImage };
        const name = kind === 'all' ? `leonida-respaldo-${stamp()}.json` : `leonida-perfil-${me().name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${stamp()}.json`;
        closeSheet();
        await exportFile(obj, name);
      } catch (err) { toast('No se pudo exportar'); console.error(err); }
    };
  });
}

function freshIds(p) {
  p.id = uid();
  p.lists.forEach((l) => { l.id = uid(); l.items.forEach((i) => (i.id = uid())); });
  p.pins.forEach((x) => (x.id = uid()));
  p.notes.forEach((x) => (x.id = uid()));
  return p;
}
function mergeInto(target, src) {
  let added = 0;
  src.lists.forEach((sl) => {
    let tl = target.lists.find((l) => l.name.toLowerCase() === sl.name.toLowerCase());
    if (!tl) { tl = { id: uid(), name: sl.name, emoji: sl.emoji, items: [] }; target.lists.push(tl); }
    const have = new Set(tl.items.map((i) => i.text.toLowerCase()));
    sl.items.forEach((i) => { if (!have.has(i.text.toLowerCase())) { tl.items.push({ id: uid(), text: i.text, note: i.note, done: false }); added++; } });
  });
  src.pins.forEach((x) => {
    const dup = target.pins.some((y) => Math.abs(y.nx - x.nx) < 0.002 && Math.abs(y.ny - x.ny) < 0.002 && y.cat === x.cat);
    if (!dup) { target.pins.push({ ...x, id: uid(), done: false }); added++; }
  });
  src.notes.forEach((n) => { target.notes.push({ ...n, id: uid(), title: `${n.title || 'Nota'} (de ${src.name})` }); added++; });
  return added;
}

function handleImport(file) {
  const fr = new FileReader();
  fr.onload = async () => {
    let data;
    try { data = JSON.parse(fr.result); } catch { return toast('Archivo inválido'); }
    if (data?.app !== 'leonida-companion') return toast('No es un archivo de Leonida Companion');
    const applyImg = async () => { if (data.mapImage) await idb.set('mapImage', await dataURLToBlob(data.mapImage)); };
    if (data.type === 'full') {
      confirmSheet('¿Restaurar respaldo?', `Reemplaza todo lo de este teléfono con el respaldo del ${new Date(data.exportedAt).toLocaleDateString('es')}.`, 'Restaurar', async () => {
        state = data.state; save(); await applyImg(); setAccent(); go('home'); toast('Respaldo restaurado');
      });
    } else if (data.type === 'profile') {
      const src = data.profile;
      sheet(`<h2>Perfil de ${esc(src.name)}</h2>
        <p class="muted">${src.pins.length} pines · ${src.lists.reduce((a, l) => a + l.items.length, 0)} objetivos · ${src.notes.length} notas</p>
        <button class="btn primary block" id="im-new">＋ Agregar como perfil nuevo</button><div style="height:10px"></div>
        <button class="btn block" id="im-merge">⇄ Fusionar con ${esc(me().name)}</button>
        <p class="kbd-hint">Fusionar suma los objetivos y pines que no tengas (sin marcarlos como hechos).</p>
        ${data.mapImage ? '<div class="toggle card" style="padding:12px 16px;margin-top:12px"><span>Usar también su imagen de mapa</span><button class="switch on" id="im-img"></button></div>' : ''}`, (s) => {
        let useImg = !!data.mapImage;
        $('#im-img', s) && ($('#im-img', s).onclick = (e) => { useImg = !useImg; e.currentTarget.classList.toggle('on', useImg); });
        $('#im-new', s).onclick = async () => {
          const p = freshIds(structuredClone(src)); p.running = null;
          if (state.profiles.some((x) => x.name === p.name)) p.name += ' (importado)';
          state.profiles.push(p); state.active = p.id; save();
          if (useImg) await applyImg();
          closeSheet(); setAccent(); go('home'); toast(`Perfil ${p.name} agregado`);
        };
        $('#im-merge', s).onclick = async () => {
          const n = mergeInto(me(), src); save();
          if (useImg) await applyImg();
          closeSheet(); route(); toast(`${n} elementos agregados`);
        };
      });
    } else toast('Formato desconocido');
  };
  fr.readAsText(file);
}

// ---------------------------------------------------------------- acciones globales
const actions = {
  'close-sheet': closeSheet,
  back: () => history.back(),
  go: (el) => go(el.dataset.to),
  tab: (el) => (el.dataset.to === 'ign' ? (current.name === 'ign' ? openUrl(IGN_URL) : go('ign')) : go(el.dataset.to)),
  ign: () => openUrl(IGN_URL),
  'open-link': (el) => openUrl(el.dataset.url),
  profiles: profilesSheet,
  links: linksSheet,
  sessions: sessionsSheet,
  session: () => {
    const p = me();
    if (p.running) {
      const s = { start: p.running, end: Date.now() };
      if (s.end - s.start > 30000) p.sessions.push(s);
      p.running = null; toast(`Sesión: ${fmtDur(s.end - s.start)}`);
    } else { p.running = Date.now(); toast('¡A jugar! Cronómetro iniciado'); }
    save(); tap(ImpactStyle.Medium); route();
  },
  'add-mode': () => setAddMode(!mapCtx?.adding),
  'pin-list': pinList,
  'map-options': () => mapOptions(),
  'map-filter': (el) => { if (mapCtx) { mapCtx.filter = el.dataset.cat || null; drawPins(); } },
  'toggle-hide': () => { state.settings.hideDone = !state.settings.hideDone; save(); if (mapCtx) drawPins(); else route(); },
  'new-list': () => newListSheet(),
  'list-menu': (el) => listMenu(el.dataset.id),
  bulk: (el) => bulkSheet(el.dataset.id),
  check: (el) => {
    const list = me().lists.find((l) => l.id === el.dataset.list);
    const it = list.items.find((i) => i.id === el.dataset.id);
    it.done = !it.done; it.doneAt = it.done ? Date.now() : null; list.touched = Date.now();
    save(); tap(it.done ? ImpactStyle.Medium : ImpactStyle.Light);
    const left = list.items.filter((i) => !i.done).length;
    if (it.done && !left) toast(`🏆 ¡${list.name} al 100%!`);
    views.list.redraw?.();
  },
  'edit-item': (el) => itemSheet(el.dataset.list, el.dataset.id),
  'edit-note': (el) => noteForm(el.dataset.id),
  'export-profile': () => exportSheet('profile'),
  'export-all': () => exportSheet('all'),
  import: () => { const f = $('#import-file'); f.value = ''; f.onchange = () => f.files[0] && handleImport(f.files[0]); f.click(); },
  'reset-profile': () => confirmSheet(`¿Reiniciar a ${me().name}?`, 'Se desmarcan todos los objetivos y pines, y se borran las sesiones. Las listas, pines y notas se conservan.', 'Reiniciar', () => {
    const p = me(); p.lists.forEach((l) => l.items.forEach((i) => (i.done = false))); p.pins.forEach((x) => (x.done = false)); p.sessions = []; p.running = null; save(); toast('Progreso reiniciado');
  }),
  wipe: () => confirmSheet('¿Borrar TODO?', 'Perfiles, pines, listas, notas, sesiones e imagen del mapa. No se puede deshacer — exporta un respaldo antes.', 'Borrar todo', async () => {
    state = defaultState(); save(); await idb.del('mapImage'); setAccent(); go('home'); toast('Datos borrados');
  }),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

// ---------------------------------------------------------------- router
let current = { name: 'home' };
function go(path) {
  if (location.hash === `#/${path}`) route();
  else location.hash = `#/${path}`;
}
async function route() {
  closeSheet();
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  view.classList.remove('full');
  const [name = 'home', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const fn = views[name] || views.home;
  current = { name: views[name] ? name : 'home', arg };
  const tab = current.name === 'list' ? 'progress' : current.name === 'more' ? '' : current.name;
  renderTabs(tab);
  view.scrollTop = 0;
  const c = await fn(arg);
  cleanup = typeof c === 'function' ? c : null;
}
window.addEventListener('hashchange', route);

// Botón atrás de Android
if (isNative) {
  App.addListener('backButton', () => {
    if (sheetClose) return closeSheet();
    if (mapCtx?.adding) return setAddMode(false);
    if (current.name !== 'home') return history.length > 1 ? history.back() : go('home');
    App.minimizeApp();
  });
  // Si la app se cierra con una sesión corriendo, el cronómetro sigue desde el timestamp guardado.
  App.addListener('resume', () => { if (current.name === 'home') route(); });
}

setAccent();
route();
