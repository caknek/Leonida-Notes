// Compartir por código QR: pines, listas y perfiles entre teléfonos de la familia
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import LZString from 'lz-string';
import { state, me, save, uid, catById, track, mergeInto, newProfile, fixProfile } from '../store.js';
import { $, esc, icon, sheet, closeSheet, toast, renderTop } from '../ui.js';
import { views, route, go } from '../router.js';
import { actions } from '../actions.js';
import { tap, ImpactStyle, shareBlob } from '../native.js';

const PREFIX = 'LN1:';
const MAX = 2800;
const r4 = (n) => Math.round(n * 10000) / 10000;

function payloadFor(kind, id) {
  const p = me();
  if (kind === 'pin') {
    const x = p.pins.find((y) => y.id === id);
    return { t: 'pin', title: x.title, d: [r4(x.nx), r4(x.ny), x.cat, x.title, x.note || ''] };
  }
  if (kind === 'list') {
    const l = p.lists.find((y) => y.id === id);
    return { t: 'list', title: l.name, d: { n: l.name, e: l.emoji, i: l.items.map((i) => (i.note ? [i.text, i.note] : [i.text])) } };
  }
  return {
    t: 'profile', title: p.name,
    d: { n: p.name, e: p.emoji, c: p.color, l: p.lists.filter((l) => l.items.length).map((l) => ({ n: l.name, e: l.emoji, i: l.items.map((i) => [i.text]) })), p: p.pins.map((x) => [r4(x.nx), r4(x.ny), x.cat, x.title]) },
  };
}
const encode = (obj) => PREFIX + LZString.compressToBase64(JSON.stringify(obj));
function decode(text) {
  if (!text?.startsWith(PREFIX)) return null;
  try { return JSON.parse(LZString.decompressFromBase64(text.slice(PREFIX.length))); } catch { return null; }
}

let stream = null, raf = null;
function stopCam() {
  cancelAnimationFrame(raf); raf = null;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
}

views.qr = (arg) => {
  const mode = arg === 'scan' ? 'scan' : 'share';
  renderTop('Compartir QR', { back: true });
  const p = me();
  $('#view').innerHTML = `
    <div class="seg"><button class="${mode === 'share' ? 'on' : ''}" data-act="go" data-to="qr">Compartir</button><button class="${mode === 'scan' ? 'on' : ''}" data-act="go" data-to="qr/scan">Escanear</button></div>
    <div id="qr-body"></div>`;
  const body = $('#qr-body');
  if (mode === 'share') {
    body.innerHTML = `
      <p class="muted small">Elige qué compartir. Quien lo escanee con Leonida Notes lo recibe al instante, sin internet.</p>
      <div class="qr-kinds">
        <button class="qr-kind on" data-kind="pin"><span>📍</span>Un lugar</button>
        <button class="qr-kind" data-kind="list"><span>✅</span>Una lista</button>
        <button class="qr-kind" data-kind="profile"><span>👤</span>Mi perfil</button>
      </div>
      <div id="qr-pick"></div>
      <div id="qr-out"></div>`;
    let kind = 'pin';
    const pick = () => {
      const el = $('#qr-pick');
      if (kind === 'profile') { el.innerHTML = `<div class="card small muted">Incluye tus listas y pines (sin fotos, audios ni progreso marcado).</div>`; return make(); }
      const opts = kind === 'pin' ? p.pins.map((x) => [x.id, `${catById(x.cat).emoji} ${x.title}`]) : p.lists.filter((l) => l.items.length).map((l) => [l.id, `${l.emoji} ${l.name} (${l.items.length})`]);
      if (!opts.length) { el.innerHTML = `<div class="empty">${kind === 'pin' ? 'Aún no tienes pines.' : 'Tus listas están vacías.'}</div>`; $('#qr-out').innerHTML = ''; return; }
      el.innerHTML = `<select class="input" id="qr-sel">${opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>`;
      $('#qr-sel').onchange = make;
      make();
    };
    const make = async () => {
      const id = $('#qr-sel')?.value;
      const obj = payloadFor(kind, id);
      const text = encode(obj);
      const out = $('#qr-out');
      if (text.length > MAX) {
        out.innerHTML = `<div class="card"><b>Demasiado grande para un QR</b><p class="muted small">Usa Ajustes → Compartir mi perfil para enviarlo como archivo por WhatsApp.</p></div>`;
        return;
      }
      out.innerHTML = `<div class="qr-card"><canvas id="qr-canvas"></canvas><div class="qr-label">${esc(obj.title)}</div><div class="small muted">Leonida Notes · ${kind === 'pin' ? 'Lugar' : kind === 'list' ? 'Lista' : 'Perfil'}</div></div>
        <button class="btn primary block" id="qr-share">${icon('share', 18)} Enviar como imagen</button>`;
      await QRCode.toCanvas($('#qr-canvas'), text, { errorCorrectionLevel: 'L', margin: 2, width: 280, color: { dark: '#0a1220', light: '#f6efe0' } });
      $('#qr-share').onclick = async () => {
        const blob = await qrImage(text, obj.title);
        await shareBlob(blob, 'leonida-qr.png', `QR: ${obj.title}`);
        track('qrShared');
      };
    };
    body.onclick = (e) => {
      const k = e.target.closest('[data-kind]'); if (!k) return;
      kind = k.dataset.kind;
      body.querySelectorAll('.qr-kind').forEach((x) => x.classList.toggle('on', x === k));
      pick();
    };
    pick();
  } else {
    body.innerHTML = `
      <div class="scanner"><video id="qr-video" playsinline muted></video><div class="scan-frame"><i></i></div><div class="scan-hint" id="scan-hint">Apunta al código QR</div></div>
      <input type="file" id="qr-file" accept="image/*" hidden />
      <button class="btn block" id="qr-img">${icon('image', 18)} Leer QR desde una imagen</button>`;
    $('#qr-img').onclick = () => $('#qr-file').click();
    $('#qr-file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const bmp = await createImageBitmap(f);
      const sc = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = bmp.width * sc; c.height = bmp.height * sc;
      const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, c.width, c.height);
      const res = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (!res) return toast('No encontré un QR en la imagen');
      handle(res.data);
    };
    startCam();
  }
  return stopCam;
};

async function startCam() {
  const video = $('#qr-video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    $('#scan-hint').textContent = 'Permite la cámara o usa una imagen';
    return;
  }
  if (!video) return stopCam();
  video.srcObject = stream;
  await video.play().catch(() => {});
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  let last = 0;
  const loop = (t) => {
    if (!stream) return;
    raf = requestAnimationFrame(loop);
    if (t - last < 220 || video.readyState < 2) return;
    last = t;
    const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
    c.width = w; c.height = h;
    g.drawImage(video, 0, 0, w, h);
    const res = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
    if (res?.data) {
      const obj = decode(res.data);
      if (obj) { stopCam(); tap(ImpactStyle.Heavy); handle(res.data); }
      else $('#scan-hint').textContent = 'Ese QR no es de Leonida Notes';
    }
  };
  raf = requestAnimationFrame(loop);
}

function handle(text) {
  const obj = decode(text);
  if (!obj) return toast('QR no reconocido');
  const p = me();
  if (obj.t === 'pin') {
    const [nx, ny, cat, title, note] = obj.d;
    const c = catById(cat);
    sheet(`<h2>Lugar recibido</h2><div class="card row"><span style="font-size:28px">${c.emoji}</span><div class="grow"><b>${esc(title)}</b><div class="small muted">${c.name}</div>${note ? `<p class="small muted pre">${esc(note)}</p>` : ''}</div></div>
      <div class="actions"><button class="btn ghost" data-act="close-sheet">Ignorar</button><button class="btn primary" id="rc-ok">Agregar a mi mapa</button></div>`, (s) => {
      $('#rc-ok', s).onclick = () => {
        p.pins.push({ id: uid(), nx, ny, cat, title, note, done: false, createdAt: Date.now() });
        save(); closeSheet(); toast('Lugar agregado'); go('map');
      };
      return () => views.qr && location.hash.includes('scan') && route();
    });
  } else if (obj.t === 'list') {
    const d = obj.d;
    sheet(`<h2>Lista recibida</h2><div class="card row"><span style="font-size:28px">${esc(d.e)}</span><div class="grow"><b>${esc(d.n)}</b><div class="small muted">${d.i.length} objetivos</div></div></div>
      <div class="actions"><button class="btn ghost" data-act="close-sheet">Ignorar</button><button class="btn primary" id="rc-ok">Agregar</button></div>`, (s) => {
      $('#rc-ok', s).onclick = () => {
        const n = mergeInto(p, { lists: [{ name: d.n, emoji: d.e, items: d.i.map(([text, note]) => ({ text, note })) }] });
        save(); closeSheet(); toast(`${n} objetivos agregados`); go('progress');
      };
      return () => location.hash.includes('scan') && route();
    });
  } else if (obj.t === 'profile') {
    const d = obj.d;
    const src = { name: d.n, lists: d.l.map((l) => ({ name: l.n, emoji: l.e, items: l.i.map(([text]) => ({ text })) })), pins: d.p.map(([nx, ny, cat, title]) => ({ nx, ny, cat, title })), notes: [] };
    sheet(`<h2>Perfil de ${esc(d.n)}</h2><p class="muted">${src.pins.length} pines · ${src.lists.reduce((a, l) => a + l.items.length, 0)} objetivos</p>
      <button class="btn primary block" id="rc-new">＋ Agregar como perfil nuevo</button><div style="height:10px"></div>
      <button class="btn block" id="rc-merge">⇄ Sumar a ${esc(p.name)}</button>`, (s) => {
      $('#rc-new', s).onclick = () => {
        const np = fixProfile(newProfile(d.n + (state.profiles.some((x) => x.name === d.n) ? ' (QR)' : ''), d.e, d.c));
        np.lists = [];
        mergeInto(np, src);
        state.profiles.push(np); save(); closeSheet(); toast('Perfil agregado'); go('home');
      };
      $('#rc-merge', s).onclick = () => { const n = mergeInto(p, src); save(); closeSheet(); toast(`${n} elementos agregados`); go('home'); };
      return () => location.hash.includes('scan') && route();
    });
  }
}

async function qrImage(text, title) {
  const W = 900, H = 1120;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#13233a'); bg.addColorStop(1, '#2a1636');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e8c37a'; g.lineWidth = 4; g.strokeRect(30, 30, W - 60, H - 60);
  await document.fonts.load('700 60px "Playfair Display"').catch(() => {});
  g.fillStyle = '#e8c37a'; g.textAlign = 'center'; g.font = '700 64px "Playfair Display"'; g.fillText('Leonida Notes', W / 2, 140);
  const q = document.createElement('canvas');
  await QRCode.toCanvas(q, text, { errorCorrectionLevel: 'L', margin: 2, width: 640, color: { dark: '#0a1220', light: '#f6efe0' } });
  g.drawImage(q, (W - 640) / 2, 200, 640, 640);
  g.fillStyle = '#f3ead7'; g.font = '700 44px Outfit'; g.fillText(title.slice(0, 32), W / 2, 920);
  g.fillStyle = 'rgba(243,234,215,.7)'; g.font = '500 30px Outfit'; g.fillText('Escanéalo en Leonida Notes → Compartir QR', W / 2, 980);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
actions['qr-scan'] = () => go('qr/scan');
