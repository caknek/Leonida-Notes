// Navegación: mapa propio con pines, posición, rutas, guía de voz y progreso de descubrimiento
import L from 'leaflet';
import { state, me, save, uid, CATS, catById, idb, track, geo, fmtKm } from '../store.js';
import { $, $$, esc, pct, icon, sheet, closeSheet, confirmSheet, toast, renderTop, timeAgo } from '../ui.js';
import { views, route, isCurrent } from '../router.js';
import { actions } from '../actions.js';
import { tap, ImpactStyle, speak } from '../native.js';
import { playMemory } from './memories.js';

export let mapCtx = null;

views.map = async () => {
  renderTop('Navegación', { sub: 'Tu mapa de Leonida' });
  const view = $('#view');
  view.classList.add('full');
  view.innerHTML = `<div id="leaflet"></div>
    <div class="map-overlay-top"><div class="chips" id="map-chips"></div></div>
    <div class="map-fabs left">
      <button class="fab sm" data-act="map-options" aria-label="Imagen del mapa">${icon('image', 20)}</button>
      <button class="fab sm" data-act="discovery" aria-label="Progreso de descubrimiento">${icon('chart', 20)}</button>
      <button class="fab sm" id="fab-me" data-act="me-mode" aria-label="Fijar mi posición">${icon('target', 20)}</button>
    </div>
    <div class="map-fabs">
      <button class="fab sm" data-act="pin-list" aria-label="Lista de pines">${icon('list', 20)}</button>
      <button class="fab" data-act="nav-menu" aria-label="Navegar">${icon('compass', 24)}</button>
      <button class="fab main" id="fab-add" data-act="add-mode" aria-label="Agregar pin">${icon('plus', 28)}</button>
    </div>
    <div id="nav-card"></div>`;

  const img = await idb.get('mapImage').catch(() => null);
  const src = img ? URL.createObjectURL(img) : gridImage();
  const dims = await imgSize(src);
  if (!$('#leaflet')) return () => img && URL.revokeObjectURL(src);

  const map = L.map('leaflet', { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, attributionControl: false, zoomControl: false, maxBoundsViscosity: 0.8 });
  const bounds = [[0, 0], [dims.h, dims.w]];
  L.imageOverlay(src, bounds).addTo(map);
  map.fitBounds(bounds);
  map.setMaxBounds(L.latLngBounds(bounds).pad(0.3));
  const layer = L.layerGroup().addTo(map);
  const navLayer = L.layerGroup().addTo(map);
  mapCtx = { map, layer, navLayer, dims, aspect: dims.h / dims.w, filter: null, mode: null, markers: {} };

  const toNorm = (ll) => ({ nx: ll.lng / dims.w, ny: ll.lat / dims.h });
  const inside = (n) => n.nx >= 0 && n.nx <= 1 && n.ny >= 0 && n.ny <= 1;
  const onPick = (ll, quick = false) => {
    const n = toNorm(ll);
    if (!inside(n)) return toast('Fuera del mapa');
    if (mapCtx.mode === 'me') { setMe(n); setMode(null); return; }
    if (mapCtx.mode === 'add' || quick) { setMode(null); pinForm(n); }
  };
  map.on('click', (e) => mapCtx.mode && onPick(e.latlng));
  map.on('contextmenu', (e) => { tap(ImpactStyle.Medium); onPick(e.latlng, true); });

  drawAll();
  if (!img && !me().pins.length && !sessionStorage.getItem('gridHint')) {
    sessionStorage.setItem('gridHint', '1');
    mapOptions(true);
  }
  return () => {
    map.remove();
    if (img) URL.revokeObjectURL(src);
    mapCtx = null;
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
  grad.addColorStop(0, '#0f2236'); grad.addColorStop(1, '#22162f');
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 2048);
  g.strokeStyle = 'rgba(232,195,122,0.10)'; g.lineWidth = 2;
  for (let i = 0; i <= 2048; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 2048); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(2048, i); g.stroke(); }
  g.fillStyle = 'rgba(243,234,215,0.28)'; g.font = '600 30px Outfit, sans-serif';
  const cols = 'ABCDEFGHIJKLMNOP';
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) if ((x + y) % 4 === 0) g.fillText(`${cols[x]}${16 - y}`, x * 128 + 12, y * 128 + 40);
  // rosa de los vientos
  g.save(); g.translate(1880, 170); g.strokeStyle = 'rgba(232,195,122,.5)'; g.fillStyle = 'rgba(232,195,122,.5)'; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(0, -95); g.lineTo(14, 0); g.lineTo(0, 95); g.lineTo(-14, 0); g.closePath(); g.fill();
  g.font = '700 34px Outfit, sans-serif'; g.textAlign = 'center'; g.fillText('N', 0, -105); g.restore();
  return c.toDataURL('image/png');
}

const visible = () => me().pins.filter((x) => (!mapCtx?.filter || x.cat === mapCtx.filter) && (!state.settings.hideDone || !x.done));
const llOf = (n) => [n.ny * mapCtx.dims.h, n.nx * mapCtx.dims.w];

export function drawAll() {
  if (!mapCtx) return;
  const p = me();
  const { layer } = mapCtx;
  layer.clearLayers();
  mapCtx.markers = {};
  visible().forEach((pin) => {
    const c = catById(pin.cat);
    const target = p.navTarget === pin.id;
    const extras = (p.photos.some((f) => f.pinId === pin.id) ? '📷' : '') + (p.memories.some((m) => m.pinId === pin.id) ? '🎙' : '');
    const icn = L.divIcon({
      className: '', iconSize: [34, 34], iconAnchor: [17, 34],
      html: `<div class="pin-ico ${pin.done ? 'done' : ''} ${target ? 'target' : ''}" style="background:${c.color}"><span>${c.emoji}</span>${extras ? `<em>${extras}</em>` : ''}</div>`,
    });
    const m = L.marker(llOf(pin), { icon: icn }).addTo(layer);
    m.on('click', () => pinDetail(pin.id));
    mapCtx.markers[pin.id] = m;
  });
  if (p.me) {
    L.marker(llOf(p.me), { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="me-dot"></div>' }), zIndexOffset: 1000 })
      .addTo(layer).on('click', () => toast('Tu posición'));
  }
  drawNav();
  const used = [...new Set(p.pins.map((x) => x.cat))];
  const chips = $('#map-chips');
  if (chips) chips.innerHTML = `
    <button class="chip ${!mapCtx.filter ? 'on' : ''}" data-act="map-filter" data-cat="">Todos · ${p.pins.length}</button>
    <button class="chip ${state.settings.hideDone ? 'on' : ''}" data-act="toggle-hide">✓ ${state.settings.hideDone ? 'Ocultos' : 'Visibles'}</button>
    ${CATS.filter((c) => used.includes(c.id)).map((c) => `<button class="chip ${mapCtx.filter === c.id ? 'on' : ''}" data-act="map-filter" data-cat="${c.id}"><span class="dot" style="background:${c.color}"></span>${c.emoji} ${c.name}</button>`).join('')}`;
}

// ---------------------------------------------------------------- modos
function setMode(mode) {
  if (!mapCtx) return;
  mapCtx.mode = mode;
  $('#fab-add')?.classList.toggle('active', mode === 'add');
  $('#fab-me')?.classList.toggle('active', mode === 'me');
  $('.add-banner')?.remove();
  if (mode) $('#view').insertAdjacentHTML('beforeend', `<div class="add-banner">${mode === 'add' ? 'Toca el mapa donde va el pin' : 'Toca el mapa donde estás en el juego'}</div>`);
}
export const exitMode = () => { if (mapCtx?.mode) { setMode(null); return true; } return false; };
function setMe(n) {
  const p = me();
  p.me = { nx: n.nx, ny: n.ny };
  save(); drawAll(); tap();
  toast('Posición actualizada');
  if (p.navTarget) announce();
}

// ---------------------------------------------------------------- navegación
function navInfo() {
  const p = me();
  const pin = p.pins.find((x) => x.id === p.navTarget);
  if (!pin) return null;
  if (!p.me) return { pin };
  return { pin, ...geo(p.me, pin, mapCtx?.aspect ?? 1) };
}
function drawNav() {
  if (!mapCtx) return;
  mapCtx.navLayer.clearLayers();
  const card = $('#nav-card');
  const info = navInfo();
  if (!info) { if (card) card.innerHTML = ''; return; }
  const p = me();
  if (p.me) {
    L.polyline([llOf(p.me), llOf(info.pin)], { color: '#e8c37a', weight: 4, dashArray: '2 10', lineCap: 'round', opacity: 0.95 }).addTo(mapCtx.navLayer);
  }
  const c = catById(info.pin.cat);
  card.innerHTML = `<div class="nav-card">
    <div class="nav-arrow" style="transform:rotate(${(info.ang ?? 90) - 90}deg)">${p.me ? '➤' : '?'}</div>
    <div class="grow">
      <div class="small muted">Rumbo a ${c.emoji} ${esc(c.name)}</div>
      <b class="truncate">${esc(info.pin.title)}</b>
      <div class="small">${p.me ? `${fmtKm(info.dist)} al ${info.dir}` : 'Fija tu posición con ◎ para ver distancia'}</div>
    </div>
    <button class="icon-btn" data-act="nav-speak" aria-label="Repetir indicación">${icon('speaker', 20)}</button>
    <button class="btn sm teal" data-act="nav-arrive">Llegué</button>
    <button class="icon-btn" data-act="nav-stop" aria-label="Terminar">${icon('close', 18)}</button>
  </div>`;
}
function announce() {
  const info = navInfo();
  if (!info) return;
  const name = info.pin.title;
  if (!me().me) return speak(`Destino: ${name}. Fija tu posición en el mapa para guiarte.`);
  if (info.dist < 0.05) return speak(`Ya estás en ${name}.`);
  speak(`${name} está a ${fmtKm(info.dist).replace('km', 'kilómetros').replace(' m', ' metros')} hacia el ${info.dir}.`);
}
export function navigateTo(pinId, { fly = true } = {}) {
  const p = me();
  p.navTarget = pinId; save();
  drawAll();
  const pin = p.pins.find((x) => x.id === pinId);
  if (fly && mapCtx && pin) {
    const pts = p.me ? [llOf(p.me), llOf(pin)] : [llOf(pin)];
    if (pts.length > 1) mapCtx.map.flyToBounds(L.latLngBounds(pts).pad(0.4), { duration: 0.7, maxZoom: 1 });
    else mapCtx.map.flyTo(pts[0], 0.5, { duration: 0.7 });
  }
  announce();
}
function nearest(cat, excludeId) {
  const p = me();
  const from = p.me || { nx: 0.5, ny: 0.5 };
  return p.pins.filter((x) => !x.done && x.id !== excludeId && (!cat || x.cat === cat))
    .map((x) => ({ x, d: geo(from, x, mapCtx?.aspect ?? 1).dist }))
    .sort((a, b) => a.d - b.d)[0]?.x;
}
actions['nav-menu'] = () => {
  const p = me();
  const cats = CATS.map((c) => ({ c, left: p.pins.filter((x) => x.cat === c.id && !x.done).length, total: p.pins.filter((x) => x.cat === c.id).length })).filter((o) => o.total);
  sheet(`<h2>¿A dónde vamos?</h2>
    <p class="muted small" style="margin-top:-8px">La guía te lleva al lugar pendiente más cercano${p.me ? '' : ' (fija tu posición con ◎ para mayor precisión)'}.</p>
    <button class="btn primary block" data-nearest="">🧭 Lo más cercano (cualquier tipo)</button>
    <div class="nav-cats">${cats.map(({ c, left, total }) => `<button class="nav-cat" data-nearest="${c.id}" ${left ? '' : 'disabled'} style="--cc:${c.color}">
      <span>${c.emoji}</span><b>${c.name}</b><small>${left ? `${left} pendientes` : 'Completado ✓'}</small><i style="width:${pct(total - left, total)}%"></i></button>`).join('')}</div>
    ${cats.length ? '' : '<div class="empty">Aún no tienes pines. Toca ＋ para marcar lugares.</div>'}
    <div class="toggle card" style="padding:12px 16px;margin-top:12px"><span>${icon('speaker', 18)} Guía de voz</span><button class="switch ${state.settings.voice ? 'on' : ''}" id="nv-voice"></button></div>`, (s) => {
    s.onclick = (e) => {
      const b = e.target.closest('[data-nearest]'); if (!b) return;
      const t = nearest(b.dataset.nearest || null);
      if (!t) return toast('No quedan lugares pendientes');
      closeSheet(); navigateTo(t.id);
    };
    $('#nv-voice', s).onclick = (e) => { e.stopPropagation(); state.settings.voice = !state.settings.voice; save(); e.currentTarget.classList.toggle('on', state.settings.voice); };
  });
};
actions['nav-speak'] = () => announce();
actions['nav-stop'] = () => { me().navTarget = null; save(); drawAll(); };
actions['nav-arrive'] = () => {
  const p = me();
  const pin = p.pins.find((x) => x.id === p.navTarget);
  if (!pin) return;
  const wasDone = pin.done;
  pin.done = true; pin.doneAt = Date.now();
  p.me = { nx: pin.nx, ny: pin.ny };
  p.navTarget = null; save();
  if (!wasDone) track('pinsVisited', 1, p, { xp: !pin.xp });
  pin.xp = true; save();
  tap(ImpactStyle.Medium);
  const nx = nearest(pin.cat, pin.id);
  const mem = p.memories.find((m) => m.pinId === pin.id);
  drawAll();
  if (mem) playMemory(mem);
  sheet(`<div class="center"><div class="arrive-ico">✓</div><h2 style="margin-bottom:4px">¡Llegaste!</h2><p class="muted">${esc(pin.title)} marcado como visitado.</p></div>
    ${nx ? `<div class="card row"><span style="font-size:24px">${catById(nx.cat).emoji}</span><div class="grow"><div class="small muted">Siguiente más cercano</div><b>${esc(nx.title)}</b><div class="small">${fmtKm(geo(p.me, nx, mapCtx?.aspect ?? 1).dist)}</div></div></div>
      <div class="actions"><button class="btn ghost" data-act="close-sheet">Listo</button><button class="btn primary" id="ar-next">Ir al siguiente</button></div>`
      : '<div class="actions"><button class="btn primary" data-act="close-sheet">Listo</button></div>'}`, (s) => {
    $('#ar-next', s) && ($('#ar-next', s).onclick = () => { closeSheet(); navigateTo(nx.id); });
  });
  if (!mem) speak(`Llegaste a ${pin.title}.${nx ? ` El siguiente más cercano es ${nx.title}.` : ''}`);
};

// ---------------------------------------------------------------- pines
function pinForm(pos, existing) {
  const pin = existing || { cat: 'colec', title: '', note: '', done: false, ...pos };
  sheet(`<h2>${existing ? 'Editar pin' : 'Nuevo pin'}</h2>
    <label class="field"><span>Nombre</span><input class="input" id="pf-title" placeholder="Ej. Tienda de armas del muelle" value="${esc(pin.title)}" /></label>
    <label class="field"><span>Categoría</span></label>
    <div class="chips wrap" id="pf-cats">${CATS.map((c) => `<button class="chip ${c.id === pin.cat ? 'on' : ''}" data-cat="${c.id}"><span class="dot" style="background:${c.color}"></span>${c.emoji} ${c.name}</button>`).join('')}</div>
    <label class="field"><span>Notas</span><textarea class="input" id="pf-note" style="min-height:80px" placeholder="Cómo llegar, qué hay, requisitos…">${esc(pin.note)}</textarea></label>
    <div class="actions"><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="pf-save">Guardar</button></div>`, (s) => {
    let cat = pin.cat;
    $('#pf-cats', s).onclick = (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      cat = b.dataset.cat;
      $$('#pf-cats .chip', s).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#pf-save', s).onclick = () => {
      const title = $('#pf-title', s).value.trim() || catById(cat).name;
      const note = $('#pf-note', s).value.trim();
      closeSheet();
      if (existing) { Object.assign(existing, { title, note, cat }); save(); toast('Pin actualizado'); }
      else { me().pins.push({ id: uid(), createdAt: Date.now(), done: false, nx: pin.nx, ny: pin.ny, title, note, cat }); save(); track('pinsCreated'); toast('Pin agregado'); }
      drawAll(); tap();
    };
    if (!existing) setTimeout(() => $('#pf-title', s)?.focus(), 250);
  });
}

export async function pinDetail(id) {
  const p = me();
  const pin = p.pins.find((x) => x.id === id);
  if (!pin) return;
  const c = catById(pin.cat);
  const photos = p.photos.filter((f) => f.pinId === id);
  const mems = p.memories.filter((m) => m.pinId === id);
  const dist = p.me && mapCtx ? geo(p.me, pin, mapCtx.aspect) : null;
  const urls = [];
  sheet(`<div class="row" style="margin-bottom:12px">
      <div class="pin-ico static" style="background:${c.color}"><span>${c.emoji}</span></div>
      <div class="grow"><h2 style="margin:0">${esc(pin.title)}</h2><span class="tag">${c.name}</span> <span class="small faint">${dist ? `· ${fmtKm(dist.dist)} al ${dist.dir}` : `· ${timeAgo(pin.createdAt)}`}</span></div>
    </div>
    ${pin.note ? `<p class="muted pre">${esc(pin.note)}</p>` : ''}
    ${photos.length ? `<div class="thumbs" id="pd-photos">${photos.map((f) => `<div class="thumb" data-photo="${f.id}"></div>`).join('')}</div>` : ''}
    ${mems.length ? mems.map((m) => `<button class="mem-chip" data-mem="${m.id}">${m.kind === 'audio' ? '▶' : '🔊'} ${esc(m.title)}</button>`).join('') : ''}
    <div class="toggle card" style="padding:12px 16px"><span>Visitado / completado</span><button class="switch ${pin.done ? 'on' : ''}" id="pd-done"></button></div>
    <div class="actions wrap">
      <button class="btn teal" id="pd-nav">${icon('compass', 18)} Navegar aquí</button>
      ${pin.note ? `<button class="btn" id="pd-say">${icon('speaker', 18)}</button>` : ''}
      <button class="btn" id="pd-edit">✏️</button><button class="btn" id="pd-move">✥</button><button class="btn danger" id="pd-del">🗑</button>
    </div>`, (s) => {
    $('#pd-done', s).onclick = (e) => {
      pin.done = !pin.done; pin.doneAt = pin.done ? Date.now() : null;
      e.currentTarget.classList.toggle('on', pin.done); save();
      track('pinsVisited', pin.done ? 1 : -1, p, { xp: pin.done && !pin.xp });
      if (pin.done) { pin.xp = true; save(); }
      drawAll(); tap();
    };
    $('#pd-nav', s).onclick = () => { closeSheet(); navigateTo(id); };
    $('#pd-say', s) && ($('#pd-say', s).onclick = () => speak(`${pin.title}. ${pin.note}`, true));
    $('#pd-edit', s).onclick = () => pinForm(null, pin);
    $('#pd-del', s).onclick = () => confirmSheet('¿Borrar pin?', pin.title, 'Borrar', () => {
      p.pins = p.pins.filter((x) => x.id !== id);
      if (p.navTarget === id) p.navTarget = null;
      p.photos.forEach((f) => { if (f.pinId === id) f.pinId = null; });
      p.memories.forEach((m) => { if (m.pinId === id) m.pinId = null; });
      save(); drawAll(); toast('Pin borrado');
    });
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
        save(); drawAll(); toast('Pin movido');
      });
    };
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mem]');
      if (b) playMemory(p.memories.find((m) => m.id === b.dataset.mem));
    });
    // miniaturas
    $$('[data-photo]', s).forEach(async (el) => {
      const blob = await idb.get('photo:' + el.dataset.photo);
      if (!blob) return;
      const u = URL.createObjectURL(blob); urls.push(u);
      el.style.backgroundImage = `url(${u})`;
      el.onclick = () => window.open(u, '_blank');
    });
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  });
}

actions['pin-list'] = () => {
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
      if (!mapCtx) return;
      if (!mapCtx.markers[pin.id]) { mapCtx.filter = null; state.settings.hideDone = false; save(); drawAll(); }
      mapCtx.map.flyTo(llOf(pin), 1, { duration: 0.6 });
      setTimeout(() => pinDetail(pin.id), 650);
    };
  });
};

actions.discovery = () => {
  const p = me();
  const rows = CATS.map((c) => ({ c, t: p.pins.filter((x) => x.cat === c.id).length, d: p.pins.filter((x) => x.cat === c.id && x.done).length })).filter((r) => r.t);
  const total = p.pins.length, done = p.pins.filter((x) => x.done).length;
  sheet(`<h2>Progreso de descubrimiento</h2>
    <div class="card row"><div class="ring" style="--p:${pct(done, total)}" data-label="${pct(done, total)}%"></div><div class="grow"><h3>${done} de ${total} lugares</h3><div class="small muted">visitados en tu mapa</div></div></div>
    ${rows.length ? rows.map(({ c, t, d }) => `<div class="disc-row"><span>${c.emoji}</span><div class="grow"><div class="row between"><b>${c.name}</b><span class="small muted">${d}/${t}</span></div><div class="bar thin"><i style="width:${pct(d, t)}%;background:${c.color}"></i></div></div></div>`).join('') : '<div class="empty">Marca lugares para ver tu avance por categoría.</div>'}`);
};

function mapOptions(first = false) {
  sheet(`<h2>${first ? 'Configura tu mapa' : 'Mapa'}</h2>
    <p class="muted">Carga una foto o captura del mapa del juego y marca encima tus lugares. La imagen se guarda solo en este teléfono.</p>
    <input type="file" id="mo-file" accept="image/*" hidden />
    <button class="btn primary block" id="mo-pick">${icon('image', 18)} Elegir imagen</button>
    <div style="height:10px"></div>
    <button class="btn block" id="mo-grid">▦ Usar cuadrícula (sin imagen)</button>
    <label class="field" style="margin-top:16px"><span>Ancho del mapa en km (para calcular distancias)</span><input class="input" id="mo-km" type="number" min="1" max="200" step="0.5" value="${state.settings.mapKm}" /></label>
    <p class="kbd-hint">Los pines guardan su posición relativa: si cambias la imagen por otra del mismo encuadre, quedan en su lugar. Mantén presionado el mapa para soltar un pin rápido.</p>`, (s) => {
    const f = $('#mo-file', s);
    $('#mo-pick', s).onclick = () => f.click();
    f.onchange = async () => {
      const file = f.files[0]; if (!file) return;
      await idb.set('mapImage', file);
      closeSheet(); toast('Mapa actualizado'); route();
    };
    $('#mo-grid', s).onclick = async () => { await idb.del('mapImage'); closeSheet(); route(); };
    $('#mo-km', s).onchange = (e) => { const v = parseFloat(e.target.value); if (v > 0) { state.settings.mapKm = v; save(); drawAll(); } };
  });
}

actions['add-mode'] = () => setMode(mapCtx?.mode === 'add' ? null : 'add');
actions['me-mode'] = () => setMode(mapCtx?.mode === 'me' ? null : 'me');
actions['map-options'] = () => mapOptions();
actions['map-filter'] = (el) => { if (mapCtx) { mapCtx.filter = el.dataset.cat || null; drawAll(); } };
actions['toggle-hide'] = () => { state.settings.hideDone = !state.settings.hideDone; save(); if (mapCtx && isCurrent('map')) drawAll(); else route(); };
