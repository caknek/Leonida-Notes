// Estudio de fotos: filtros, marcos, stickers y textos sobre tus capturas
import { me, save, uid, idb, track, catById } from '../store.js';
import { $, $$, esc, icon, sheet, closeSheet, confirmSheet, toast, renderTop, fmtDate } from '../ui.js';
import { views, go, route } from '../router.js';
import { actions } from '../actions.js';
import { tap, shareBlob } from '../native.js';

const FILTERS = [
  { id: 'normal', name: 'Normal', f: 'none' },
  { id: 'sunset', name: 'Atardecer', f: 'saturate(1.25) contrast(1.05)', tint: ['rgba(255,92,141,.35)', 'rgba(255,157,77,.25)'], blend: 'soft-light' },
  { id: 'neon', name: 'Neón', f: 'saturate(1.6) contrast(1.15)', tint: ['rgba(255,0,170,.28)', 'rgba(0,230,210,.28)'], blend: 'overlay' },
  { id: 'night', name: 'Noche', f: 'brightness(.92) contrast(1.15) saturate(.8)', tint: ['rgba(30,60,160,.45)', 'rgba(10,18,32,.35)'], blend: 'multiply' },
  { id: 'retro', name: 'Retro', f: 'sepia(.55) contrast(1.1) saturate(.9)', vignette: true },
  { id: 'bw', name: 'B/N', f: 'grayscale(1) contrast(1.2)', vignette: true },
  { id: 'vivid', name: 'Vívido', f: 'saturate(1.5) contrast(1.1)' },
];
const FRAMES = [
  { id: 'none', name: 'Sin marco', pad: 0, bottom: 0 },
  { id: 'postal', name: 'Postal', pad: 0.035, bottom: 0.16 },
  { id: 'polaroid', name: 'Instantánea', pad: 0.05, bottom: 0.2 },
  { id: 'neon', name: 'Neón', pad: 0, bottom: 0 },
  { id: 'cine', name: 'Cine', pad: 0, bottom: 0 },
  { id: 'mag', name: 'Revista', pad: 0, bottom: 0 },
];
const STICKERS = ['🌴', '🌅', '🐊', '🦩', '💰', '💎', '🔥', '😎', '🚗', '🏍️', '🚤', '💥', '⭐', '❤️', '👑', '🎯', '📍', '🌊', '🍹', '💸', '🚁', '⚡', '🏆', '🎉', 'GG', '¡ÉPICO!', 'LOL', '#Leonida'];
const COLORS = ['#ffffff', '#e8c37a', '#ff5c8d', '#39d3c3', '#111111'];

let pending = null; // Blob a editar

views.studio = () => {
  const p = me();
  renderTop('Estudio de fotos', { back: true });
  $('#view').innerHTML = `
    <section class="studio-hero">
      <div class="polaroids"><span>🌴</span><span>🌅</span><span>🚤</span></div>
      <h2>Tus mejores momentos</h2>
      <p>Toma una foto a la tele o importa una captura y decórala con filtros, marcos y stickers.</p>
      <input type="file" id="st-file" accept="image/*" hidden />
      <button class="btn primary" id="st-new">${icon('camera', 18)} Nueva foto</button>
    </section>
    <div class="section-title"><span class="orn">Álbum · ${p.photos.length}</span></div>
    <div class="album" id="album">${p.photos.length ? '' : '<div class="empty" style="grid-column:1/-1"><div class="big">🖼️</div>Tus fotos editadas aparecerán aquí.</div>'}</div>`;
  const f = $('#st-file');
  $('#st-new').onclick = () => f.click();
  f.onchange = () => { if (f.files[0]) { pending = f.files[0]; go('editor'); } };
  const urls = [];
  [...p.photos].sort((a, b) => b.createdAt - a.createdAt).forEach(async (ph) => {
    const el = document.createElement('button');
    el.className = 'album-item'; el.dataset.id = ph.id;
    $('#album').appendChild(el);
    const blob = await idb.get('photo:' + ph.id);
    if (!blob) return;
    const u = URL.createObjectURL(blob); urls.push(u);
    el.style.backgroundImage = `url(${u})`;
    el.onclick = () => viewer(ph, u);
  });
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
};

function viewer(ph, url) {
  const p = me();
  const pin = p.pins.find((x) => x.id === ph.pinId);
  sheet(`<img class="viewer-img" src="${url}" alt="" />
    <div class="small muted" style="margin:10px 0">${fmtDate(ph.createdAt)}${pin ? ` · ${catById(pin.cat).emoji} ${esc(pin.title)}` : ''}</div>
    <label class="field"><span>Lugar</span><select class="input" id="vw-pin"><option value="">— Ninguno —</option>${p.pins.map((x) => `<option value="${x.id}" ${x.id === ph.pinId ? 'selected' : ''}>${catById(x.cat).emoji} ${esc(x.title)}</option>`).join('')}</select></label>
    <div class="actions"><button class="btn danger" id="vw-del">🗑</button><button class="btn primary" id="vw-share">${icon('share', 18)} Compartir</button></div>`, (s) => {
    $('#vw-pin', s).onchange = (e) => { ph.pinId = e.target.value || null; save(); toast('Foto vinculada'); };
    $('#vw-share', s).onclick = async () => { const b = await idb.get('photo:' + ph.id); if (b) shareBlob(b, `leonida-${ph.id}.jpg`, 'Foto de Leonida'); };
    $('#vw-del', s).onclick = () => confirmSheet('¿Borrar foto?', 'Se elimina del álbum.', 'Borrar', async () => {
      p.photos = p.photos.filter((x) => x.id !== ph.id); save(); await idb.del('photo:' + ph.id); route();
    });
  });
}

// ---------------------------------------------------------------- editor
views.editor = async () => {
  if (!pending) return go('studio');
  renderTop('Editar foto', { back: true, extra: `<button class="btn sm primary" data-act="ed-save">Guardar</button>` });
  const view = $('#view');
  view.classList.add('editor-view');
  const srcUrl = URL.createObjectURL(pending);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = srcUrl; }).catch(() => null);
  if (!img) { toast('No se pudo abrir la imagen'); return go('studio'); }
  await Promise.all(['700 40px "Playfair Display"', '600 40px Outfit', '800 40px Outfit'].map((f) => document.fonts.load(f).catch(() => {})));

  const st = { filter: 'sunset', frame: 'postal', stickers: [], sel: -1, caption: '', capPos: 'bottom', capColor: '#ffffff', date: true, pick: STICKERS[0], tab: 'filters' };
  view.innerHTML = `
    <div class="ed-stage"><canvas id="ed-canvas"></canvas></div>
    <div class="ed-panel">
      <div class="ed-tabs">${[['filters', 'Filtros'], ['frames', 'Marcos'], ['stickers', 'Stickers'], ['text', 'Texto']].map(([k, n]) => `<button data-tab="${k}" class="${k === st.tab ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="ed-body" id="ed-body"></div>
    </div>`;
  const cv = $('#ed-canvas');
  const ctx = cv.getContext('2d');

  const layout = (W) => {
    const fr = FRAMES.find((f) => f.id === st.frame);
    const pad = fr.pad * W, bottom = fr.bottom * W;
    const iw = W - pad * 2, ih = iw * (img.naturalHeight / img.naturalWidth);
    return { W, H: Math.round(pad + ih + (bottom || pad)), pad, iw, ih, fr };
  };
  const render = (c, W, forExport = false) => {
    const L = layout(W);
    c.canvas.width = W; c.canvas.height = L.H;
    paint(c, img, st, L, forExport);
  };
  const fit = () => {
    const stage = $('.ed-stage');
    if (!stage) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxW = stage.clientWidth - 20, maxH = stage.clientHeight - 20;
    const L1 = layout(1000);
    const scale = Math.min(maxW / 1000, maxH / L1.H);
    cv.style.width = `${1000 * scale}px`; cv.style.height = `${L1.H * scale}px`;
    render(ctx, Math.round(1000 * scale * dpr));
  };
  const redraw = () => render(ctx, cv.width);

  // panel
  const body = () => {
    const b = $('#ed-body');
    if (st.tab === 'filters') {
      b.innerHTML = `<div class="ed-row">${FILTERS.map((f) => `<button class="ed-opt ${f.id === st.filter ? 'on' : ''}" data-filter="${f.id}"><span class="swatch-img" style="filter:${f.f}"></span>${f.name}</button>`).join('')}</div>`;
      const sw = URL.createObjectURL(pending); $$('.swatch-img', b).forEach((x) => (x.style.backgroundImage = `url(${sw})`));
    } else if (st.tab === 'frames') {
      b.innerHTML = `<div class="ed-row">${FRAMES.map((f) => `<button class="ed-opt ${f.id === st.frame ? 'on' : ''}" data-frame="${f.id}"><span class="frame-prev fp-${f.id}"></span>${f.name}</button>`).join('')}</div>`;
    } else if (st.tab === 'stickers') {
      b.innerHTML = `<div class="ed-stickers">${STICKERS.map((s) => `<button class="${s === st.pick ? 'on' : ''}" data-sticker="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <div class="row" style="gap:10px;margin-top:10px"><span class="small muted grow">${st.sel >= 0 ? 'Arrastra para mover · tamaño:' : 'Toca la foto para pegar el sticker'}</span>
        ${st.sel >= 0 ? `<input type="range" id="ed-size" min="0.04" max="0.5" step="0.01" value="${st.stickers[st.sel].s}" style="width:120px" /><button class="icon-btn" id="ed-del">🗑</button>` : ''}</div>`;
    } else {
      b.innerHTML = `<input class="input" id="ed-cap" placeholder="Escribe un texto…" value="${esc(st.caption)}" maxlength="60" />
        <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="chip ${st.capPos === 'top' ? 'on' : ''}" data-cap="top">Arriba</button><button class="chip ${st.capPos === 'bottom' ? 'on' : ''}" data-cap="bottom">Abajo</button>
          ${COLORS.map((c) => `<button class="swatch sm ${c === st.capColor ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
          <button class="chip ${st.date ? 'on' : ''}" data-date="1">📅 Fecha</button>
        </div>`;
      $('#ed-cap').oninput = (e) => { st.caption = e.target.value; redraw(); };
    }
    const size = $('#ed-size'); if (size) size.oninput = (e) => { st.stickers[st.sel].s = +e.target.value; redraw(); };
    const del = $('#ed-del'); if (del) del.onclick = () => { st.stickers.splice(st.sel, 1); st.sel = -1; redraw(); body(); };
  };
  $('.ed-panel').onclick = (e) => {
    const t = e.target.closest('[data-tab]'); if (t) { st.tab = t.dataset.tab; $$('.ed-tabs button').forEach((x) => x.classList.toggle('on', x === t)); return body(); }
    const f = e.target.closest('[data-filter]'); if (f) { st.filter = f.dataset.filter; redraw(); return body(); }
    const fr = e.target.closest('[data-frame]'); if (fr) { st.frame = fr.dataset.frame; fit(); return body(); }
    const s = e.target.closest('[data-sticker]'); if (s) { st.pick = s.dataset.sticker; if (st.sel >= 0) { st.stickers[st.sel].e = st.pick; redraw(); } return body(); }
    const c = e.target.closest('[data-cap]'); if (c) { st.capPos = c.dataset.cap; redraw(); return body(); }
    const col = e.target.closest('[data-color]'); if (col) { st.capColor = col.dataset.color; redraw(); return body(); }
    if (e.target.closest('[data-date]')) { st.date = !st.date; redraw(); return body(); }
  };

  // stickers: tocar para pegar, arrastrar para mover
  let drag = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  cv.onpointerdown = (e) => {
    const p = pos(e);
    const ratio = cv.height / cv.width;
    const hit = [...st.stickers].map((s, i) => ({ s, i })).reverse().find(({ s }) => Math.abs(s.x - p.x) < s.s * 0.6 && Math.abs(s.y - p.y) < (s.s * 0.6) / ratio);
    if (hit) { st.sel = hit.i; drag = { dx: p.x - hit.s.x, dy: p.y - hit.s.y }; cv.setPointerCapture(e.pointerId); }
    else if (st.tab === 'stickers') { st.stickers.push({ e: st.pick, x: p.x, y: p.y, s: 0.14 }); st.sel = st.stickers.length - 1; tap(); }
    else { st.sel = -1; }
    redraw(); if (st.tab === 'stickers') body();
  };
  cv.onpointermove = (e) => { if (!drag) return; const p = pos(e); const s = st.stickers[st.sel]; s.x = p.x - drag.dx; s.y = p.y - drag.dy; redraw(); };
  cv.onpointerup = () => { drag = null; };

  views.editor.save = async () => {
    const out = document.createElement('canvas').getContext('2d');
    const prevSel = st.sel; st.sel = -1;
    render(out, Math.min(1600, Math.max(1000, img.naturalWidth)), true);
    st.sel = prevSel;
    const blob = await new Promise((r) => out.canvas.toBlob(r, 'image/jpeg', 0.9));
    const id = uid();
    await idb.set('photo:' + id, blob);
    me().photos.push({ id, createdAt: Date.now(), pinId: me().navTarget || null });
    save();
    pending = null;
    track('photos');
    toast('Foto guardada en el álbum');
    go('studio');
    setTimeout(() => sheet(`<h2>¡Foto lista!</h2><p class="muted">Se guardó en tu álbum. ¿La compartes?</p>
      <div class="actions"><button class="btn ghost" data-act="close-sheet">Después</button><button class="btn primary" id="sh-go">${icon('share', 18)} Compartir</button></div>`,
      (s) => { $('#sh-go', s).onclick = () => { closeSheet(); shareBlob(blob, `leonida-${id}.jpg`, 'Foto de Leonida'); }; }), 300);
  };

  body();
  requestAnimationFrame(fit);
  window.addEventListener('resize', fit);
  return () => { window.removeEventListener('resize', fit); URL.revokeObjectURL(srcUrl); };
};
actions['ed-save'] = () => views.editor.save?.();

// ---------------------------------------------------------------- pintado
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function paint(c, img, st, L, forExport) {
  const { W, H, pad, iw, ih, fr } = L;
  const u = W / 1000; // unidad relativa
  const F = FILTERS.find((f) => f.id === st.filter);
  // fondo del marco
  if (fr.id === 'postal') { c.fillStyle = '#f6efe0'; c.fillRect(0, 0, W, H); }
  else if (fr.id === 'polaroid') { c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, W, H); }
  else { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
  // foto con filtro
  c.save();
  c.filter = F.f;
  c.drawImage(img, pad, pad, iw, ih);
  c.filter = 'none';
  if (F.tint) {
    const g = c.createLinearGradient(0, pad, 0, pad + ih);
    g.addColorStop(0, F.tint[0]); g.addColorStop(1, F.tint[1]);
    c.globalCompositeOperation = F.blend; c.fillStyle = g; c.fillRect(pad, pad, iw, ih);
    c.globalCompositeOperation = 'source-over';
  }
  if (F.vignette) {
    const g = c.createRadialGradient(pad + iw / 2, pad + ih / 2, Math.min(iw, ih) * 0.35, pad + iw / 2, pad + ih / 2, Math.max(iw, ih) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = g; c.fillRect(pad, pad, iw, ih);
  }
  c.restore();

  // marcos sobre la foto
  if (fr.id === 'postal') {
    c.strokeStyle = '#d9c9a3'; c.lineWidth = 3 * u; c.strokeRect(pad, pad, iw, ih);
    const by = pad + ih;
    c.fillStyle = '#7a6a55'; c.font = `600 ${26 * u}px Outfit`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText('SALUDOS DESDE', pad + 4 * u, by + 50 * u);
    const g = c.createLinearGradient(0, by + 60 * u, 0, by + 150 * u);
    g.addColorStop(0, '#ff9d4d'); g.addColorStop(0.5, '#ff5c8d'); g.addColorStop(1, '#a77bff');
    c.font = `700 ${92 * u}px "Playfair Display"`; c.fillStyle = g;
    c.fillText('Leonida', pad, by + 135 * u);
    c.font = `600 ${24 * u}px Outfit`; c.fillStyle = '#7a6a55'; c.textAlign = 'right';
    if (st.caption && st.capPos === 'bottom') { c.fillText(st.caption, W - pad, by + 135 * u); }
    // estampilla
    c.save(); c.translate(W - pad - 70 * u, by + 58 * u); c.rotate(0.08);
    c.strokeStyle = '#ff5c8d'; c.setLineDash([6 * u, 5 * u]); c.lineWidth = 3 * u; rr(c, -58 * u, -36 * u, 116 * u, 72 * u, 6 * u); c.stroke();
    c.setLineDash([]); c.fillStyle = '#ff5c8d'; c.textAlign = 'center'; c.font = `800 ${22 * u}px Outfit`; c.fillText('CORREO', 0, -4 * u); c.font = `600 ${16 * u}px Outfit`; c.fillText('LEONIDA', 0, 20 * u);
    c.restore();
  } else if (fr.id === 'polaroid') {
    c.fillStyle = '#2a2a2a'; c.textAlign = 'center'; c.font = `italic 600 ${44 * u}px "Playfair Display"`;
    c.fillText(st.caption || 'Leonida', W / 2, pad + ih + (H - pad - ih) * 0.6);
  } else if (fr.id === 'neon') {
    c.save();
    [['#ff2fa0', 18], ['#2de2d0', 44]].forEach(([col, inset]) => {
      c.shadowColor = col; c.shadowBlur = 30 * u; c.strokeStyle = col; c.lineWidth = 7 * u;
      rr(c, inset * u, inset * u, W - inset * 2 * u, H - inset * 2 * u, 28 * u); c.stroke();
    });
    c.restore();
  } else if (fr.id === 'cine') {
    const bar = H * 0.11;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, bar); c.fillRect(0, H - bar, W, bar);
    if (st.caption) { c.fillStyle = st.capColor; c.font = `600 ${34 * u}px Outfit`; c.textAlign = 'center'; c.fillText(st.caption, W / 2, H - bar / 2 + 12 * u); }
  } else if (fr.id === 'mag') {
    const g = c.createLinearGradient(0, 0, 0, H * 0.3); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.3);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `700 ${150 * u}px "Playfair Display"`; c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 12 * u;
    c.fillText('LEONIDA', W / 2, 150 * u);
    c.shadowBlur = 0; c.font = `700 ${22 * u}px Outfit`; c.fillStyle = '#e8c37a';
    c.fillText(`EDICIÓN ESPECIAL · ${new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' }).toUpperCase()}`, W / 2, 190 * u);
  }

  // texto libre (si el marco no lo usó)
  const usedCaption = (fr.id === 'polaroid') || (fr.id === 'cine') || (fr.id === 'postal' && st.capPos === 'bottom');
  if (st.caption && !usedCaption) {
    c.save();
    c.font = `800 ${56 * u}px Outfit`; c.textAlign = 'center'; c.fillStyle = st.capColor;
    c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 10 * u; c.lineWidth = 6 * u; c.strokeStyle = 'rgba(0,0,0,.35)';
    const y = st.capPos === 'top' ? pad + (fr.id === 'mag' ? 260 : 80) * u : pad + ih - 50 * u;
    c.strokeText(st.caption, W / 2, y); c.fillText(st.caption, W / 2, y);
    c.restore();
  }
  // fecha estilo cámara
  if (st.date) {
    const d = new Date();
    const txt = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}`;
    c.save(); c.font = `700 ${34 * u}px "Courier New", monospace`; c.textAlign = 'right';
    c.fillStyle = '#ff9d4d'; c.shadowColor = '#ff5c1d'; c.shadowBlur = 8 * u;
    const bottomY = fr.id === 'cine' ? H - H * 0.11 - 20 * u : pad + ih - 22 * u;
    c.fillText(txt, pad + iw - 24 * u, bottomY); c.restore();
  }
  // stickers
  st.stickers.forEach((s, i) => {
    const size = s.s * W;
    const x = s.x * W, y = s.y * H;
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const isText = /^[#¡A-Z]/.test(s.e);
    if (isText) {
      c.font = `800 ${size * 0.45}px Outfit`; c.fillStyle = '#fff'; c.lineWidth = size * 0.08; c.strokeStyle = '#ff5c8d';
      c.translate(x, y); c.rotate(-0.12); c.strokeText(s.e, 0, 0); c.fillText(s.e, 0, 0);
    } else {
      c.font = `${size}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = size * 0.08;
      c.fillText(s.e, x, y);
    }
    c.restore();
    if (!forExport && i === st.sel) {
      c.save(); c.strokeStyle = '#e8c37a'; c.setLineDash([8 * u, 6 * u]); c.lineWidth = 3 * u;
      c.strokeRect(x - size * 0.6, y - size * 0.6, size * 1.2, size * 1.2); c.restore();
    }
  });
}
