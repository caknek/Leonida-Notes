// Utilidades de interfaz: íconos, hojas, avisos, barras
import { me, levelInfo, TIERS } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function fmtDur(ms, withSec = false) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (withSec) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}
export const fmtShortDur = (ms) => { const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4); return h ? `${h}h ${m}m` : `${m}m`; };
export const fmtDate = (ts) => new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'ahora';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  return `hace ${Math.floor(d / 86400)} d`;
}

// ---------------------------------------------------------------- íconos (trazos propios)
const P = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  ign: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M16 16h2v2"/>',
  medal: '<circle cx="12" cy="14" r="6"/><path d="M8.5 9.2L6 3h4l2 4 2-4h4l-2.5 6.2"/><path d="M12 11.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>',
  family: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 2.2-5 5-5s5 2 5 5M13.5 20c0-2.4 1.6-4 3.5-4s3.5 1.6 3.5 4"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  book: '<path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h10M9 8h6"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
export const icon = (name, size = 22) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------------------------------------------------------------- avisos
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

let closer = null;
export const sheetOpen = () => !!closer;
export function sheet(html, onMount, { cls = '' } = {}) {
  closeSheet();
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-act="close-sheet"></div><div class="sheet ${cls}"><div class="grab"></div>${html}</div>`;
  document.body.classList.add('sheet-open');
  let onClose = null;
  closer = () => { root.innerHTML = ''; closer = null; document.body.classList.remove('sheet-open'); onClose?.(); };
  const s = root.querySelector('.sheet');
  const ret = onMount?.(s);
  if (typeof ret === 'function') onClose = ret;
  return closer;
}
export function closeSheet() { closer?.(); }
export function confirmSheet(title, text, okLabel, onOk, danger = true) {
  sheet(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
    <div class="actions"><button class="btn ghost" data-act="close-sheet">Cancelar</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" id="ok">${esc(okLabel)}</button></div>`, (s) => {
    $('#ok', s).onclick = () => { closeSheet(); onOk(); };
  });
}

// Celebraciones (medallas, subir de nivel, retos) en cola
const queue = [];
let showing = false;
export function celebrate(events) {
  queue.push(...events);
  if (!showing) next();
}
function next() {
  const e = queue.shift();
  const el = $('#celebrate');
  if (!e) { showing = false; el.className = ''; el.innerHTML = ''; return; }
  showing = true;
  let html = '';
  if (e.kind === 'medal') {
    const t = TIERS[e.tier];
    html = `<div class="cel-kicker">Medalla obtenida</div><div class="medal big" style="--mc:${t.color}"><span>${e.medal.icon}</span></div>
      <h2>${esc(e.medal.name)}</h2><div class="tier-pill" style="--mc:${t.color}">${t.name}</div><p>${e.medal.tiers[e.tier]} ${esc(e.medal.unit)}</p>`;
  } else if (e.kind === 'level') {
    html = `<div class="cel-kicker">¡Subiste de nivel!</div><div class="lvl-burst">${e.level}</div><h2>${esc(e.title)}</h2><p>Sigue explorando Leonida</p>`;
  } else if (e.kind === 'challenge') {
    html = `<div class="cel-kicker">Reto diario cumplido</div><div class="medal big" style="--mc:${e.seg.color}"><span>${e.seg.icon}</span></div><h2>${esc(e.seg.label)}</h2><p>Reclama ${e.seg.xp} XP en el Bono diario</p>`;
  }
  el.innerHTML = `<div class="cel-card">${html}<button class="btn primary" id="cel-ok">Genial</button></div>`;
  el.className = 'show';
  $('#cel-ok', el).onclick = () => { el.className = ''; setTimeout(next, 180); };
}

// ---------------------------------------------------------------- barras superior e inferior
export function renderTop(title, { back = false, extra = '', sub = '' } = {}) {
  const p = me();
  const lv = levelInfo(p.xp);
  $('#topbar').innerHTML = `
    ${back ? `<button class="back" data-act="back" aria-label="Atrás">‹</button>` : ''}
    <div class="tb-title"><h1>${esc(title)}</h1>${sub ? `<div class="tb-sub">${sub}</div>` : ''}</div>
    ${extra}
    ${back ? '' : `<button class="avatar" data-act="profiles" aria-label="Perfil" style="--pc:${p.color}">${esc(p.emoji)}<b>${lv.level}</b></button>`}`;
}
const TABS = [
  { id: 'home', ico: 'home', label: 'Inicio' },
  { id: 'map', ico: 'compass', label: 'Navegar' },
  { id: 'ign', ico: 'ign', label: 'Mapa IGN', cls: 'ign' },
  { id: 'progress', ico: 'check', label: 'Progreso' },
  { id: 'data', ico: 'medal', label: 'Datos' },
];
export function renderTabs(active) {
  $('#tabbar').innerHTML = TABS.map((t) => `<button class="${t.cls || ''} ${t.id === active ? 'on' : ''}" data-act="tab" data-to="${t.id}">
    <span class="ico">${icon(t.ico, t.cls ? 24 : 22)}</span>${t.label}</button>`).join('');
}
