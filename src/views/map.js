// Navegación: mapa con capas, ayudas configurables, ruta, guía de voz, paquetes de marcadores e IGN integrado
import L from '../leaflet-setup.js';
import 'leaflet.markercluster';
import { state, me, save, uid, CATS, GROUPS, catById, idb, track, geo, fmtKm, IGN_URL } from '../store.js';
import { $, $$, esc, pct, icon, sheet, closeSheet, confirmSheet, toast, renderTop, timeAgo } from '../ui.js';
import { views, route, isCurrent } from '../router.js';
import { actions } from '../actions.js';
import { tap, ImpactStyle, speak, openUrl, onBrowserClosed, shareJson, shareBlob } from '../native.js';
import { playMemory } from './memories.js';
import { drawBaseMap } from '../basemap.js';

export let mapCtx = null;
const A = () => state.settings; // ayudas y capas
const revealed = new Set(); // pines revelados en modo sin spoilers (solo esta sesión)
let atlasCache = null;
const say = (km) => fmtKm(km).replace('km', 'kilómetros').replace(' m', ' metros');

// ---------------------------------------------------------------- vista
views.map = async () => {
  renderTop('Navegación', { sub: 'Carta de Leonida' });
  const view = $('#view');
  view.classList.add('full');
  view.innerHTML = `<div id="leaflet"></div>
    <div class="map-top">
      <div class="map-seg"><button class="on">${icon('map', 16)} Mi mapa</button><button data-act="ign-from-map">${icon('ign', 16)} Mapa IGN ↗</button></div>
      <button class="map-tool" data-act="layers" aria-label="Capas">${icon('layers', 20)}<span id="hidden-badge"></span></button>
      <button class="map-tool" data-act="assists" aria-label="Ayudas">${icon('gear', 20)}</button>
    </div>
    <div class="map-chips chips" id="map-chips"></div>
    <div class="compass-rose" aria-hidden="true"><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="rgba(10,18,32,.75)" stroke="#e8c37a" stroke-width="1.5"/><path d="M30 10l5 20-5 20-5-20z" fill="#e8c37a"/><path d="M30 10l5 20h-10z" fill="#ff5c8d"/><text x="30" y="7" text-anchor="middle" font-size="8" fill="#e8c37a" font-weight="700">N</text></svg></div>
    <div class="scale-bar" id="scale-bar"></div>
    <div class="map-fabs left">
      <button class="fab sm" id="fab-me" data-act="me-mode" aria-label="Fijar mi posición">${icon('target', 20)}</button>
      <button class="fab sm" data-act="discovery" aria-label="Progreso de descubrimiento">${icon('chart', 20)}</button>
    </div>
    <div class="map-fabs">
      <button class="fab sm" data-act="pin-list" aria-label="Buscar lugares">${icon('list', 20)}</button>
      <button class="fab" data-act="nav-menu" aria-label="Navegar">${icon('compass', 24)}</button>
      <button class="fab main" id="fab-add" data-act="add-mode" aria-label="Agregar marcador">${icon('plus', 28)}</button>
    </div>
    <div id="nav-card"></div>`;

  if (!A().base) { A().base = (await idb.get('mapImage').catch(() => null)) ? 'image' : 'atlas'; save(); }
  const base = A().base;
  const img = base === 'image' ? await idb.get('mapImage').catch(() => null) : null;
  let src, revoke = null;
  if (img) { src = URL.createObjectURL(img); revoke = src; }
  else if (base === 'grid') src = gridImage();
  else src = atlasCache || (atlasCache = drawBaseMap());
  const dims = await imgSize(src);
  if (!$('#leaflet')) return () => revoke && URL.revokeObjectURL(revoke);

  const map = L.map('leaflet', { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, attributionControl: false, zoomControl: false, maxBoundsViscosity: 0.8 });
  const bounds = [[0, 0], [dims.h, dims.w]];
  L.imageOverlay(src, bounds, { className: 'base-layer' }).addTo(map);
  map.fitBounds(bounds, { paddingTopLeft: [0, 40] });
  map.setMaxBounds(L.latLngBounds(bounds).pad(0.3));
  const navLayer = L.layerGroup().addTo(map);
  mapCtx = { map, layer: null, navLayer, meLayer: L.layerGroup().addTo(map), dims, aspect: dims.h / dims.w, mode: null, markers: {} };

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
  const zoomCls = () => { $('#leaflet')?.classList.toggle('show-labels', A().labels && map.getZoom() >= -0.5); updateScale(); };
  map.on('zoomend', zoomCls);
  zoomCls();

  drawAll();
  if (!me().pins.length && !sessionStorage.getItem('mapHint')) {
    sessionStorage.setItem('mapHint', '1');
    setTimeout(() => toast('Mantén presionado el mapa para marcar un lugar'), 600);
  }
  return () => {
    map.remove();
    if (revoke) URL.revokeObjectURL(revoke);
    mapCtx = null;
  };
};

function updateScale() {
  const el = $('#scale-bar');
  if (!el || !mapCtx) return;
  const pxPerUnit = Math.pow(2, mapCtx.map.getZoom());
  const kmPerUnit = (A().mapKm || 12) / mapCtx.dims.w;
  const target = (90 / pxPerUnit) * kmPerUnit;
  const nice = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50].find((v) => v >= target) || target;
  const px = (nice / kmPerUnit) * pxPerUnit;
  el.innerHTML = `<i style="width:${Math.round(px)}px"></i><span>${fmtKm(nice)}</span>`;
}

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
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) if ((x + y) % 4 === 0) g.fillText(`${cols[x]}${y + 1}`, x * 128 + 12, y * 128 + 40);
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------- visibilidad
export function isVisible(pin) {
  const s = A();
  if (s.hiddenCats.includes(pin.cat)) return false;
  if (pin.pack && s.hiddenPacks.includes(pin.pack)) return false;
  if (s.hideDone && pin.done) return false;
  return true;
}
const isSecret = (pin) => A().spoilers && !pin.done && !revealed.has(pin.id);
const llOf = (n) => [n.ny * mapCtx.dims.h, n.nx * mapCtx.dims.w];

function markerIcon(pin, target) {
  const c = catById(pin.cat);
  const p = me();
  const secret = isSecret(pin);
  const extras = (p.photos.some((f) => f.pinId === pin.id) ? '📷' : '') + (p.memories.some((m) => m.pinId === pin.id) ? '🎙' : '');
  return L.divIcon({
    className: '', iconSize: [36, 46], iconAnchor: [18, 44],
    html: `<div class="mk ${pin.done ? 'done' : ''} ${target ? 'target' : ''} ${secret ? 'secret' : ''}" style="--c:${secret ? '#8a93a6' : c.color}">
      <div class="mk-head"><span>${secret ? '?' : c.emoji}</span></div><div class="mk-tail"></div>
      ${extras && !secret ? `<em>${extras}</em>` : ''}
      <b class="mk-label">${secret ? 'Sin descubrir' : esc(pin.title)}</b></div>`,
  });
}

export function drawAll() {
  if (!mapCtx) return;
  const p = me();
  const { map } = mapCtx;
  if (mapCtx.layer) map.removeLayer(mapCtx.layer);
  mapCtx.layer = A().cluster
    ? L.markerClusterGroup({
      showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 1, maxClusterRadius: 48,
      iconCreateFunction: (cl) => {
        const ms = cl.getAllChildMarkers();
        const cats = {};
        ms.forEach((m) => { cats[m.options.cat] = (cats[m.options.cat] || 0) + 1; });
        const c = catById(Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0]);
        return L.divIcon({ className: '', iconSize: [46, 46], html: `<div class="mk-cluster" style="--c:${c.color}"><span>${c.emoji}</span><b>${ms.length}</b></div>` });
      },
    })
    : L.layerGroup();
  mapCtx.markers = {};
  p.pins.filter(isVisible).forEach((pin) => {
    const m = L.marker(llOf(pin), { icon: markerIcon(pin, p.navTarget === pin.id), cat: pin.cat });
    m.on('click', () => pinDetail(pin.id));
    mapCtx.layer.addLayer(m);
    mapCtx.markers[pin.id] = m;
  });
  mapCtx.layer.addTo(map);
  mapCtx.meLayer.clearLayers();
  if (p.me) {
    L.marker(llOf(p.me), { icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: '<div class="me-dot"></div>' }), zIndexOffset: 1000 })
      .addTo(mapCtx.meLayer).on('click', () => toast('Tu posición'));
  }
  drawNav();
  drawChips();
}

function drawChips() {
  const p = me();
  const el = $('#map-chips');
  if (!el) return;
  const hidden = A().hiddenCats;
  el.innerHTML = GROUPS.map((g) => {
    const cats = CATS.filter((c) => c.group === g.id);
    const count = p.pins.filter((x) => cats.some((c) => c.id === x.cat)).length;
    const on = cats.some((c) => !hidden.includes(c.id));
    return `<button class="chip ${on ? 'on' : 'off'}" data-act="group-toggle" data-group="${g.id}"><span class="dot" style="background:${g.color}"></span>${g.name}${count ? ` · ${count}` : ''}</button>`;
  }).join('');
  const nHidden = hidden.length + A().hiddenPacks.length + (A().hideDone ? 1 : 0);
  const b = $('#hidden-badge'); if (b) b.textContent = nHidden ? String(nHidden) : '';
}
actions['group-toggle'] = (el) => {
  const cats = CATS.filter((c) => c.group === el.dataset.group).map((c) => c.id);
  const s = A();
  const anyOn = cats.some((c) => !s.hiddenCats.includes(c));
  s.hiddenCats = anyOn ? [...new Set([...s.hiddenCats, ...cats])] : s.hiddenCats.filter((c) => !cats.includes(c));
  save(); drawAll(); tap();
};

// ---------------------------------------------------------------- modos
function setMode(mode, msg) {
  if (!mapCtx) return;
  mapCtx.mode = mode;
  $('#fab-add')?.classList.toggle('active', mode === 'add');
  $('#fab-me')?.classList.toggle('active', mode === 'me');
  $('.add-banner')?.remove();
  if (mode) $('#view').insertAdjacentHTML('beforeend', `<div class="add-banner">${msg || (mode === 'add' ? 'Toca el mapa donde va el marcador' : 'Toca el mapa donde estás en el juego')}</div>`);
}
export const exitMode = () => { if (mapCtx?.mode) { setMode(null); return true; } return false; };

function setMe(n) {
  const p = me();
  p.me = { nx: n.nx, ny: n.ny };
  save(); drawAll(); tap();
  if (p.navTarget) announce();
  else proximity();
}
function proximity() {
  if (!A().proximity || !mapCtx) return toast('Posición actualizada');
  const p = me();
  const near = p.pins.filter((x) => !x.done && isVisible(x)).map((x) => ({ x, d: geo(p.me, x, mapCtx.aspect).dist })).filter((o) => o.d <= A().proxKm).sort((a, b) => a.d - b.d);
  if (!near.length) return toast('Posición actualizada');
  const first = near[0];
  const name = isSecret(first.x) ? `algo sin descubrir (${catById(first.x.cat).name.toLowerCase()})` : first.x.title;
  toast(`📡 Cerca: ${near.length} lugar${near.length > 1 ? 'es' : ''} pendiente${near.length > 1 ? 's' : ''}`);
  speak(`Tienes ${name} a ${say(first.d)}.${near.length > 1 ? ` Y ${near.length - 1} más cerca de ti.` : ''}`);
  tap(ImpactStyle.Medium);
}

// IGN en la misma pantalla: se abre dentro de la app y, al volver, quedas listo para marcar lo que viste
actions['ign-from-map'] = () => { sessionStorage.setItem('fromIgn', '1'); openUrl(IGN_URL); };
onBrowserClosed(() => {
  if (!sessionStorage.getItem('fromIgn')) return;
  sessionStorage.removeItem('fromIgn');
  if (isCurrent('map') && mapCtx) setMode('add', '¿Viste algo en IGN? Toca el mapa para marcarlo');
});

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
  if (p.me && A().route) {
    L.polyline([llOf(p.me), llOf(info.pin)], { color: '#0a1220', weight: 8, opacity: 0.5, lineCap: 'round' }).addTo(mapCtx.navLayer);
    L.polyline([llOf(p.me), llOf(info.pin)], { color: '#e8c37a', weight: 4, dashArray: '2 10', lineCap: 'round', opacity: 0.95 }).addTo(mapCtx.navLayer);
  }
  const c = catById(info.pin.cat);
  const secret = isSecret(info.pin);
  const showDist = p.me && A().distance;
  card.innerHTML = `<div class="nav-card">
    <div class="nav-arrow" style="transform:rotate(${showDist ? info.ang - 90 : 0}deg)">${showDist ? '➤' : c.emoji}</div>
    <div class="grow">
      <div class="small muted">Rumbo a ${c.emoji} ${esc(c.name)}</div>
      <b class="truncate">${secret ? 'Lugar sin descubrir' : esc(info.pin.title)}</b>
      <div class="small">${showDist ? `${fmtKm(info.dist)} al ${info.dir}` : p.me ? 'Sigue la línea dorada' : 'Fija tu posición con ◎'}</div>
    </div>
    <button class="icon-btn" data-act="nav-speak" aria-label="Repetir indicación">${icon('speaker', 20)}</button>
    <button class="btn sm teal" data-act="nav-arrive">Llegué</button>
    <button class="icon-btn" data-act="nav-stop" aria-label="Terminar">${icon('close', 18)}</button>
  </div>`;
}
function announce() {
  const info = navInfo();
  if (!info) return;
  const name = isSecret(info.pin) ? `un lugar de tipo ${catById(info.pin.cat).name}` : info.pin.title;
  if (!me().me) return speak(`Destino: ${name}. Fija tu posición en el mapa para guiarte.`);
  if (info.dist < 0.05) return speak(`Ya estás en ${name}.`);
  speak(A().distance ? `${name} está a ${say(info.dist)} hacia el ${info.dir}.` : `Rumbo a ${name}.`);
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
function nearest(cat, excludeId, group) {
  const p = me();
  const from = p.me || { nx: 0.5, ny: 0.5 };
  return p.pins.filter((x) => !x.done && x.id !== excludeId && isVisible(x) && (!cat || x.cat === cat) && (!group || catById(x.cat).group === group))
    .map((x) => ({ x, d: geo(from, x, mapCtx?.aspect ?? 1).dist }))
    .sort((a, b) => a.d - b.d)[0]?.x;
}
actions['nav-menu'] = () => {
  const p = me();
  const cats = CATS.map((c) => ({ c, left: p.pins.filter((x) => x.cat === c.id && !x.done && isVisible(x)).length, total: p.pins.filter((x) => x.cat === c.id).length })).filter((o) => o.total);
  sheet(`<h2>¿A dónde vamos?</h2>
    <p class="muted small" style="margin-top:-8px">Te guío al lugar pendiente más cercano${p.me ? '' : ' (fija tu posición con ◎ para más precisión)'}. Solo uso las capas visibles.</p>
    <button class="btn primary block" data-nearest="">🧭 Lo más cercano (cualquier tipo)</button>
    ${GROUPS.map((g) => {
      const list = cats.filter((o) => o.c.group === g.id);
      if (!list.length) return '';
      return `<div class="nav-group"><span style="color:${g.color}">◆</span> ${g.name}</div><div class="nav-cats">${list.map(({ c, left, total }) => `<button class="nav-cat" data-nearest="${c.id}" ${left ? '' : 'disabled'} style="--cc:${c.color}">
        <span>${c.emoji}</span><b>${c.name}</b><small>${left ? `${left} pendientes` : 'Completado ✓'}</small><i style="width:${pct(total - left, total)}%"></i></button>`).join('')}</div>`;
    }).join('')}
    ${cats.length ? '' : '<div class="empty">Aún no tienes marcadores. Mantén presionado el mapa, toca ＋ o importa un paquete en Capas.</div>'}`, (s) => {
    s.onclick = (e) => {
      const b = e.target.closest('[data-nearest]'); if (!b) return;
      const t = nearest(b.dataset.nearest || null);
      if (!t) return toast('No quedan lugares pendientes visibles');
      closeSheet(); navigateTo(t.id);
    };
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
  const nx = A().arrive ? nearest(pin.cat, pin.id) || nearest(null, pin.id, catById(pin.cat).group) : null;
  const mem = p.memories.find((m) => m.pinId === pin.id);
  drawAll();
  if (mem) playMemory(mem);
  sheet(`<div class="center"><div class="arrive-ico">✓</div><h2 style="margin-bottom:4px">¡Llegaste!</h2><p class="muted">${esc(pin.title)} marcado como visitado.</p></div>
    ${pin.note ? `<div class="card small pre">${esc(pin.note)}</div>` : ''}
    ${nx ? `<div class="card row"><span style="font-size:24px">${catById(nx.cat).emoji}</span><div class="grow"><div class="small muted">Siguiente más cercano</div><b>${isSecret(nx) ? 'Lugar sin descubrir' : esc(nx.title)}</b><div class="small">${fmtKm(geo(p.me, nx, mapCtx?.aspect ?? 1).dist)}</div></div></div>
      <div class="actions"><button class="btn ghost" data-act="close-sheet">Listo</button><button class="btn primary" id="ar-next">Ir al siguiente</button></div>`
      : '<div class="actions"><button class="btn primary" data-act="close-sheet">Listo</button></div>'}`, (s) => {
    $('#ar-next', s) && ($('#ar-next', s).onclick = () => { closeSheet(); navigateTo(nx.id); });
  });
  if (!mem) speak(`Llegaste a ${pin.title}.${nx ? ` El siguiente más cercano está a ${say(geo(p.me, nx, mapCtx?.aspect ?? 1).dist)}.` : ''}`);
};

// ---------------------------------------------------------------- marcadores
function catPicker(selected) {
  return GROUPS.map((g) => `<div class="cat-group"><div class="cat-group-name" style="color:${g.color}">${g.name}</div><div class="chips wrap">${CATS.filter((c) => c.group === g.id).map((c) => `<button class="chip ${c.id === selected ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${c.name}</button>`).join('')}</div></div>`).join('');
}
function pinForm(pos, existing) {
  const pin = existing || { cat: 'colec', title: '', note: '', done: false, ...pos };
  sheet(`<h2>${existing ? 'Editar marcador' : 'Nuevo marcador'}</h2>
    <label class="field"><span>Nombre</span><input class="input" id="pf-title" placeholder="Ej. Armería del muelle" value="${esc(pin.title)}" /></label>
    <label class="field"><span>Tipo</span></label>
    <div id="pf-cats" class="cat-picker">${catPicker(pin.cat)}</div>
    <label class="field" style="margin-top:12px"><span>Notas</span><textarea class="input" id="pf-note" style="min-height:80px" placeholder="Cómo llegar, requisitos, horario…">${esc(pin.note)}</textarea></label>
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
      if (existing) { Object.assign(existing, { title, note, cat }); save(); toast('Marcador actualizado'); }
      else {
        me().pins.push({ id: uid(), createdAt: Date.now(), done: false, nx: pin.nx, ny: pin.ny, title, note, cat }); save(); track('pinsCreated'); toast('Marcador agregado');
        if (A().hiddenCats.includes(cat)) { A().hiddenCats = A().hiddenCats.filter((c) => c !== cat); save(); }
      }
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
  const secret = isSecret(pin);
  const photos = p.photos.filter((f) => f.pinId === id);
  const mems = p.memories.filter((m) => m.pinId === id);
  const dist = p.me && mapCtx ? geo(p.me, pin, mapCtx.aspect) : null;
  const pack = pin.pack ? p.packs.find((k) => k.id === pin.pack) : null;
  const urls = [];
  sheet(`<div class="row" style="margin-bottom:12px">
      <div class="mk static ${pin.done ? 'done' : ''}" style="--c:${c.color}"><div class="mk-head"><span>${secret ? '?' : c.emoji}</span></div></div>
      <div class="grow"><h2 style="margin:0">${secret ? 'Lugar sin descubrir' : esc(pin.title)}</h2><span class="tag" style="color:${c.color}">${c.name}</span>${pack ? ` <span class="tag">📦 ${esc(pack.name)}</span>` : ''} <span class="small faint">${dist && A().distance ? `· ${fmtKm(dist.dist)} al ${dist.dir}` : `· ${timeAgo(pin.createdAt)}`}</span></div>
    </div>
    ${secret ? `<div class="card small muted">Modo sin spoilers: el nombre y las notas se muestran cuando lo visitas.<div style="margin-top:8px"><button class="btn sm ghost" id="pd-reveal">👁 Revelar ahora</button></div></div>` : pin.note ? `<p class="muted pre">${esc(pin.note)}</p>` : ''}
    ${photos.length ? `<div class="thumbs">${photos.map((f) => `<div class="thumb" data-photo="${f.id}"></div>`).join('')}</div>` : ''}
    ${mems.map((m) => `<button class="mem-chip" data-mem="${m.id}">${m.kind === 'audio' ? '▶' : '🔊'} ${esc(m.title)}</button>`).join('')}
    <div class="toggle card" style="padding:12px 16px"><span>Visitado / completado</span><button class="switch ${pin.done ? 'on' : ''}" id="pd-done"></button></div>
    <div class="actions wrap">
      <button class="btn teal" id="pd-nav">${icon('compass', 18)} Navegar aquí</button>
      ${pin.note && !secret ? `<button class="btn" id="pd-say">${icon('speaker', 18)}</button>` : ''}
      <button class="btn" id="pd-edit">✏️</button><button class="btn" id="pd-move">✥</button><button class="btn danger" id="pd-del">🗑</button>
    </div>`, (s) => {
    $('#pd-reveal', s) && ($('#pd-reveal', s).onclick = () => { revealed.add(id); drawAll(); pinDetail(id); });
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
    $('#pd-del', s).onclick = () => confirmSheet('¿Borrar marcador?', pin.title, 'Borrar', () => {
      p.pins = p.pins.filter((x) => x.id !== id);
      if (p.navTarget === id) p.navTarget = null;
      p.photos.forEach((f) => { if (f.pinId === id) f.pinId = null; });
      p.memories.forEach((m) => { if (m.pinId === id) m.pinId = null; });
      save(); drawAll(); toast('Marcador borrado');
    });
    $('#pd-move', s).onclick = () => {
      closeSheet();
      if (!mapCtx) return;
      const old = mapCtx.markers[id];
      if (old) mapCtx.layer.removeLayer(old);
      const m = L.marker(llOf(pin), { icon: markerIcon(pin, false), draggable: true }).addTo(mapCtx.map);
      toast('Arrastra el marcador a su nueva posición');
      m.once('dragend', () => {
        const ll = m.getLatLng();
        pin.nx = Math.min(1, Math.max(0, ll.lng / mapCtx.dims.w));
        pin.ny = Math.min(1, Math.max(0, ll.lat / mapCtx.dims.h));
        mapCtx.map.removeLayer(m);
        save(); drawAll(); toast('Marcador movido');
      });
    };
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mem]');
      if (b) playMemory(p.memories.find((m) => m.id === b.dataset.mem));
    });
    $$('[data-photo]', s).forEach(async (el) => {
      const blob = await idb.get('photo:' + el.dataset.photo);
      if (!blob) return;
      const u = URL.createObjectURL(blob); urls.push(u);
      el.style.backgroundImage = `url(${u})`;
    });
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  });
}

actions['pin-list'] = () => {
  const render = (q = '') => {
    const pins = me().pins.filter((x) => !q || ((isSecret(x) ? '' : x.title + ' ' + x.note) + ' ' + catById(x.cat).name).toLowerCase().includes(q.toLowerCase()));
    return pins.length ? pins.slice(0, 200).map((x) => {
      const c = catById(x.cat);
      return `<div class="item ${x.done ? 'done' : ''} ${isVisible(x) ? '' : 'hidden-pin'}" data-pin="${x.id}"><span style="font-size:20px">${c.emoji}</span><div class="txt"><div class="truncate">${isSecret(x) ? 'Sin descubrir' : esc(x.title)}</div><div class="note">${c.name}${isVisible(x) ? '' : ' · capa oculta'}</div></div><span class="faint">›</span></div>`;
    }).join('') : '<div class="empty"><div class="big">📍</div>Sin resultados</div>';
  };
  sheet(`<h2>Buscar lugares (${me().pins.length})</h2>
    <div class="search"><span>🔍</span><input id="pl-q" placeholder="Nombre, nota o tipo…" /></div>
    <div id="pl-list">${render()}</div>`, (s) => {
    $('#pl-q', s).oninput = (e) => { $('#pl-list', s).innerHTML = render(e.target.value); };
    $('#pl-list', s).onclick = (e) => {
      const it = e.target.closest('[data-pin]'); if (!it) return;
      const pin = me().pins.find((x) => x.id === it.dataset.pin);
      closeSheet();
      if (!mapCtx) return;
      if (!isVisible(pin)) {
        A().hiddenCats = A().hiddenCats.filter((c) => c !== pin.cat);
        if (pin.pack) A().hiddenPacks = A().hiddenPacks.filter((k) => k !== pin.pack);
        if (pin.done) A().hideDone = false;
        save(); drawAll();
      }
      mapCtx.map.flyTo(llOf(pin), 1.5, { duration: 0.6 });
      setTimeout(() => pinDetail(pin.id), 650);
    };
  });
};

actions.discovery = () => {
  const p = me();
  const total = p.pins.length, done = p.pins.filter((x) => x.done).length;
  sheet(`<h2>Progreso de descubrimiento</h2>
    <div class="card row"><div class="ring" style="--p:${pct(done, total)}" data-label="${pct(done, total)}%"></div><div class="grow"><h3>${done} de ${total} lugares</h3><div class="small muted">visitados en tu mapa</div></div></div>
    ${GROUPS.map((g) => {
      const rows = CATS.filter((c) => c.group === g.id).map((c) => ({ c, t: p.pins.filter((x) => x.cat === c.id).length, d: p.pins.filter((x) => x.cat === c.id && x.done).length })).filter((r) => r.t);
      if (!rows.length) return '';
      const gt = rows.reduce((a, r) => a + r.t, 0), gd = rows.reduce((a, r) => a + r.d, 0);
      return `<div class="nav-group"><span style="color:${g.color}">◆</span> ${g.name} <span class="faint small">· ${gd}/${gt}</span></div>
        ${rows.map(({ c, t, d }) => `<div class="disc-row"><span>${c.emoji}</span><div class="grow"><div class="row between"><b>${c.name}</b><span class="small muted">${d}/${t}</span></div><div class="bar thin"><i style="width:${pct(d, t)}%;background:${c.color}"></i></div></div></div>`).join('')}`;
    }).join('') || '<div class="empty">Marca lugares para ver tu avance por categoría.</div>'}`);
};

// ---------------------------------------------------------------- capas
actions.layers = () => {
  const p = me();
  const draw = () => {
    const s = A();
    const counts = {};
    p.pins.forEach((x) => { counts[x.cat] = (counts[x.cat] || 0) + 1; });
    return `<h2>Capas del mapa</h2>
      <div class="section-title" style="margin-top:0"><span class="orn">Fondo</span></div>
      <div class="base-opts">
        <button class="base-opt ${(s.base || 'atlas') === 'atlas' ? 'on' : ''}" data-base="atlas"><span class="bp-atlas"></span>Carta ilustrada</button>
        <button class="base-opt ${s.base === 'image' ? 'on' : ''}" data-base="image"><span class="bp-image">${icon('image', 22)}</span>Mi captura</button>
        <button class="base-opt ${s.base === 'grid' ? 'on' : ''}" data-base="grid"><span class="bp-grid"></span>Cuadrícula</button>
      </div>
      <input type="file" id="ly-file" accept="image/*" hidden />
      <p class="kbd-hint">“Mi captura”: sube una foto o captura del mapa del juego para que coincida exacto. <a href="#" id="ly-change">Cambiar imagen</a></p>
      <label class="field"><span>Ancho del mapa en km (para distancias)</span><input class="input" id="ly-km" type="number" min="1" max="200" step="0.5" value="${s.mapKm}" /></label>

      <div class="section-title"><span class="orn">Qué ver</span><button class="btn sm ghost" data-all="1">Todo</button><button class="btn sm ghost" data-all="0">Nada</button></div>
      <div class="toggle card" style="padding:10px 14px"><span>✓ Mostrar completados</span><button class="switch ${s.hideDone ? '' : 'on'}" data-done="1"></button></div>
      ${GROUPS.map((g) => {
        const cats = CATS.filter((c) => c.group === g.id);
        const on = cats.filter((c) => !s.hiddenCats.includes(c.id)).length;
        return `<div class="layer-group">
          <div class="layer-head"><span class="dot" style="background:${g.color}"></span><b class="grow">${g.name}</b><span class="small faint">${on}/${cats.length}</span><button class="switch ${on ? 'on' : ''}" data-group="${g.id}"></button></div>
          <div class="chips wrap">${cats.map((c) => `<button class="chip ${s.hiddenCats.includes(c.id) ? 'off' : 'on'}" data-cat="${c.id}">${c.emoji} ${c.name}${counts[c.id] ? ` <small>${counts[c.id]}</small>` : ''}</button>`).join('')}</div>
        </div>`;
      }).join('')}

      <div class="section-title"><span class="orn">Paquetes de marcadores</span></div>
      ${p.packs.length ? p.packs.map((k) => `<div class="layer-head card" style="padding:10px 14px"><span>📦</span><span class="grow"><b>${esc(k.name)}</b><div class="small muted">${p.pins.filter((x) => x.pack === k.id).length} marcadores</div></span><button class="icon-btn" data-delpack="${k.id}">🗑</button><button class="switch ${s.hiddenPacks.includes(k.id) ? '' : 'on'}" data-pack="${k.id}"></button></div>`).join('')
        : '<p class="muted small">Un paquete trae muchos marcadores de una vez (CSV, JSON o GeoJSON). Puedes armarlo desde una guía con la plantilla, recibirlo de tu familia o exportar el tuyo.</p>'}
      <input type="file" id="pk-file" accept=".csv,.json,.geojson,text/csv,application/json" hidden />
      <div class="row" style="gap:8px">
        <button class="btn primary" id="pk-import" style="flex:1">📥 Importar paquete</button>
        <button class="btn" id="pk-template" style="flex:1">📄 Plantilla CSV</button>
      </div>
      <button class="btn ghost block" id="pk-export" style="margin-top:8px">📤 Exportar mis marcadores</button>`;
  };
  sheet(draw(), (sh) => {
    const redraw = () => { const y = sh.scrollTop; sh.innerHTML = `<div class="grab"></div>${draw()}`; sh.scrollTop = y; bind(); drawAll(); };
    const bind = () => {
      $('#ly-km', sh).onchange = (e) => { const v = parseFloat(e.target.value); if (v > 0) { A().mapKm = v; save(); drawAll(); } };
      const f = $('#ly-file', sh);
      f.onchange = async () => { const file = f.files[0]; if (!file) return; await idb.set('mapImage', file); A().base = 'image'; save(); closeSheet(); toast('Captura cargada'); route(); };
      $('#ly-change', sh).onclick = (e) => { e.preventDefault(); f.click(); };
      $('#pk-import', sh).onclick = () => $('#pk-file', sh).click();
      $('#pk-file', sh).onchange = (e) => { const file = e.target.files[0]; if (file) importPack(file); };
      $('#pk-template', sh).onclick = () => shareBlob(new Blob(['﻿' + TEMPLATE], { type: 'text/csv' }), 'plantilla-marcadores-leonida.csv', 'Plantilla de marcadores');
      $('#pk-export', sh).onclick = exportPack;
    };
    sh.onclick = async (e) => {
      const t = e.target.closest('[data-base],[data-all],[data-done],[data-group],[data-cat],[data-pack],[data-delpack]');
      if (!t) return;
      const s = A();
      if (t.dataset.base) {
        if (t.dataset.base === 'image') {
          const has = await idb.get('mapImage').catch(() => null);
          if (!has) return $('#ly-file', sh).click();
        }
        s.base = t.dataset.base; save(); closeSheet(); route(); return;
      }
      if (t.dataset.all) s.hiddenCats = t.dataset.all === '1' ? [] : CATS.map((c) => c.id);
      else if (t.dataset.done) s.hideDone = !s.hideDone;
      else if (t.dataset.group) {
        const cats = CATS.filter((c) => c.group === t.dataset.group).map((c) => c.id);
        const anyOn = cats.some((c) => !s.hiddenCats.includes(c));
        s.hiddenCats = anyOn ? [...new Set([...s.hiddenCats, ...cats])] : s.hiddenCats.filter((c) => !cats.includes(c));
      } else if (t.dataset.cat) {
        const c = t.dataset.cat;
        s.hiddenCats = s.hiddenCats.includes(c) ? s.hiddenCats.filter((x) => x !== c) : [...s.hiddenCats, c];
      } else if (t.dataset.pack) {
        const k = t.dataset.pack;
        s.hiddenPacks = s.hiddenPacks.includes(k) ? s.hiddenPacks.filter((x) => x !== k) : [...s.hiddenPacks, k];
      } else if (t.dataset.delpack) {
        const k = p.packs.find((x) => x.id === t.dataset.delpack);
        return confirmSheet(`¿Quitar “${k.name}”?`, 'Se borran sus marcadores de tu mapa.', 'Quitar paquete', () => {
          p.pins = p.pins.filter((x) => x.pack !== k.id); p.packs = p.packs.filter((x) => x.id !== k.id);
          s.hiddenPacks = s.hiddenPacks.filter((x) => x !== k.id); save(); drawAll(); toast('Paquete quitado');
        });
      }
      save(); tap(); redraw();
    };
    bind();
  });
};

// ---------------------------------------------------------------- ayudas
const ASSISTS = [
  ['voice', '🔊', 'Guía de voz', 'Indicaciones habladas, avisos y llegadas'],
  ['route', '〰️', 'Línea de ruta', 'Dibuja el camino hacia tu destino'],
  ['distance', '📏', 'Distancia y rumbo', 'Kilómetros y dirección (norte, sureste…)'],
  ['proximity', '📡', 'Aviso de cercanía', 'Te avisa de lugares pendientes al fijar tu posición'],
  ['arrive', '⏭️', 'Siguiente al llegar', 'Propone el siguiente lugar más cercano'],
  ['spoilers', '🙈', 'Modo sin spoilers', 'Oculta nombres y notas hasta que visitas el lugar'],
  ['labels', '🏷️', 'Nombres en el mapa', 'Muestra el nombre de cada marcador al acercarte'],
  ['cluster', '🫧', 'Agrupar marcadores', 'Junta los marcadores cercanos al alejar el mapa'],
];
const PRESETS = {
  full: { voice: true, route: true, distance: true, proximity: true, arrive: true, spoilers: false, labels: true, cluster: true },
  explorer: { voice: false, route: false, distance: true, proximity: true, arrive: false, spoilers: true, labels: false, cluster: true },
  purist: { voice: false, route: false, distance: false, proximity: false, arrive: false, spoilers: true, labels: false, cluster: true },
};
actions.assists = () => {
  const draw = () => {
    const s = A();
    return `<h2>Ayudas</h2>
      <p class="muted small" style="margin-top:-8px">Tú decides cuánta ayuda quieres. Prueba un perfil o ajusta cada una.</p>
      <div class="preset-row"><button class="btn sm" data-preset="full">🧭 Todas</button><button class="btn sm" data-preset="explorer">🗺️ Explorador</button><button class="btn sm" data-preset="purist">🎮 Purista</button></div>
      <div class="menu">${ASSISTS.map(([k, ic, name, desc]) => `<div class="stat-row"><span class="mi">${ic}</span><span class="grow">${name}<div class="small muted">${desc}</div></span><button class="switch ${s[k] ? 'on' : ''}" data-k="${k}"></button></div>`).join('')}</div>
      ${s.proximity ? `<label class="field"><span>Radio de cercanía: <b id="px-v">${fmtKm(s.proxKm)}</b></span><input type="range" id="px" min="0.1" max="2" step="0.1" value="${s.proxKm}" style="width:100%" /></label>` : ''}`;
  };
  sheet(draw(), (sh) => {
    const bind = () => {
      const px = $('#px', sh);
      if (px) px.oninput = (e) => { A().proxKm = +e.target.value; $('#px-v', sh).textContent = fmtKm(A().proxKm); save(); };
    };
    sh.onclick = (e) => {
      const t = e.target.closest('[data-k],[data-preset]'); if (!t) return;
      if (t.dataset.preset) Object.assign(A(), PRESETS[t.dataset.preset]);
      else A()[t.dataset.k] = !A()[t.dataset.k];
      save(); tap();
      sh.innerHTML = `<div class="grab"></div>${draw()}`; bind();
      if (mapCtx) { drawAll(); $('#leaflet')?.classList.toggle('show-labels', A().labels && mapCtx.map.getZoom() >= -0.5); }
      if (t.dataset.preset) toast(`Ayudas: ${t.textContent.trim()}`);
    };
    bind();
  });
};

// ---------------------------------------------------------------- paquetes (CSV / JSON / GeoJSON)
const TEMPLATE = `nombre,tipo,x,y,nota
Armería del muelle,armeria,62.5,48.1,Abre de noche
Coleccionable 1,coleccionable,40,55.2,Detrás del faro
Carrera de la costa,carrera,70,30,Necesitas moto
# x = % desde la izquierda del mapa (0-100). y = % desde arriba (0-100)
# tipo: nombre o id de la categoría (mision, tienda, playa, gasolinera, mirador…)
`;
const norm = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const SYN = { coleccionable: 'colec', coleccionables: 'colec', armeria: 'arma', armas: 'arma', gasolinera: 'gasolina', tatuaje: 'barberia', tatuajes: 'barberia', casino: 'minijuego', atraco: 'golpe', aeropuerto: 'aereo', helipuerto: 'aereo', muelle: 'barco', puerto: 'barco', club: 'fiesta', restaurante: 'comida', comisaria: 'policia', propiedad: 'escondite', casa: 'escondite', auto: 'vehiculo', coche: 'vehiculo', carro: 'vehiculo', moto: 'vehiculo', mission: 'mision', store: 'tienda', shop: 'tienda', collectible: 'colec', race: 'carrera', viewpoint: 'mirador', beach: 'playa', gas: 'gasolina', weapon: 'arma', clothes: 'ropa', safehouse: 'escondite', business: 'negocio', activity: 'actividad' };
function resolveCat(v) {
  const n = norm(v);
  if (!n) return 'otro';
  if (SYN[n]) return SYN[n];
  const byId = CATS.find((c) => c.id === n); if (byId) return byId.id;
  const byEmoji = CATS.find((c) => c.emoji === String(v).trim()); if (byEmoji) return byEmoji.id;
  const byName = CATS.find((c) => norm(c.name) === n || norm(c.name).split(/[ /]+/).includes(n)); if (byName) return byName.id;
  const partial = CATS.find((c) => norm(c.name).includes(n)); if (partial) return partial.id;
  return 'otro';
}
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return [];
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  let rows = lines.map(split);
  let idx = { name: 0, cat: 1, x: 2, y: 3, note: 4 };
  const head = rows[0].map(norm);
  if (head.some((h) => ['x', 'nombre', 'name', 'tipo', 'categoria', 'category'].includes(h))) {
    const find = (...ks) => head.findIndex((h) => ks.includes(h));
    idx = { name: find('nombre', 'name', 'titulo', 'title'), cat: find('tipo', 'categoria', 'category', 'cat', 'type'), x: find('x', 'lng', 'lon'), y: find('y', 'lat'), note: find('nota', 'note', 'notas', 'descripcion', 'description') };
    rows = rows.slice(1);
  }
  return rows.map((r) => ({ name: r[idx.name], cat: r[idx.cat], x: parseFloat(String(r[idx.x]).replace(',', '.')), y: parseFloat(String(r[idx.y]).replace(',', '.')), note: idx.note >= 0 ? r[idx.note] : '' }));
}
function parseJson(text) {
  const d = JSON.parse(text);
  if (d.type === 'FeatureCollection') {
    return { name: d.name, items: d.features.filter((f) => f.geometry?.type === 'Point').map((f) => ({ name: f.properties?.name || f.properties?.nombre, cat: f.properties?.category || f.properties?.tipo || f.properties?.categoria, x: f.geometry.coordinates[0], y: f.geometry.coordinates[1], note: f.properties?.note || f.properties?.nota || f.properties?.description })) };
  }
  const arr = Array.isArray(d) ? d : d.marcadores || d.markers || d.items || [];
  return { name: d.nombre || d.name || d.pack, items: arr.map((m) => ({ name: m.nombre || m.name || m.title, cat: m.tipo || m.categoria || m.category || m.cat, x: m.x, y: m.y, note: m.nota || m.note || '' })) };
}
function importPack(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let items = [], name = file.name.replace(/\.(csv|json|geojson)$/i, '');
    try {
      if (/\.csv$/i.test(file.name) || !/^\s*[[{]/.test(fr.result)) items = parseCsv(fr.result);
      else { const r = parseJson(fr.result); items = r.items; if (r.name) name = r.name; }
    } catch { return toast('No pude leer el archivo'); }
    items = items.filter((m) => Number.isFinite(+m.x) && Number.isFinite(+m.y));
    if (!items.length) return toast('El archivo no tiene marcadores válidos');
    const asFraction = items.every((m) => +m.x <= 1 && +m.y <= 1);
    const p = me();
    const pack = { id: uid(), name: name || 'Paquete', createdAt: Date.now() };
    const unknown = new Set();
    let n = 0;
    items.forEach((m) => {
      const nx = asFraction ? +m.x : +m.x / 100, ny = asFraction ? +m.y : +m.y / 100;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
      const cat = resolveCat(m.cat || '');
      if (cat === 'otro' && m.cat && norm(m.cat) !== 'otro') unknown.add(m.cat);
      // en los paquetes "y" se mide desde arriba; en el mapa ny crece hacia el norte
      p.pins.push({ id: uid(), nx, ny: 1 - ny, cat, title: String(m.name || catById(cat).name).slice(0, 80), note: m.note || '', done: false, createdAt: Date.now(), pack: pack.id });
      n++;
    });
    p.packs.push(pack);
    save(); closeSheet(); drawAll();
    toast(`📦 ${n} marcadores importados`);
    if (unknown.size) setTimeout(() => toast(`Como “Otro”: ${[...unknown].slice(0, 3).join(', ')}`), 2600);
  };
  fr.readAsText(file);
}
async function exportPack() {
  const p = me();
  const obj = {
    app: 'leonida-notes', type: 'pack', nombre: `Marcadores de ${p.name}`,
    marcadores: p.pins.map((x) => ({ nombre: x.title, tipo: x.cat, x: +(x.nx * 100).toFixed(2), y: +((1 - x.ny) * 100).toFixed(2), nota: x.note || '' })),
  };
  await shareJson(obj, `paquete-${p.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.json`);
}

actions['add-mode'] = () => setMode(mapCtx?.mode === 'add' ? null : 'add');
actions['me-mode'] = () => setMode(mapCtx?.mode === 'me' ? null : 'me');
actions['map-options'] = () => actions.layers();
actions['toggle-hide'] = () => { state.settings.hideDone = !state.settings.hideDone; save(); if (mapCtx && isCurrent('map')) drawAll(); else route(); };
