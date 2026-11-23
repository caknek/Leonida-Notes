// Memorias de voz: grabaciones propias o textos narrados por la guía de voz
import { me, save, uid, idb, track, catById } from '../store.js';
import { $, esc, icon, sheet, closeSheet, confirmSheet, toast, renderTop, fmtDate } from '../ui.js';
import { views, isCurrent } from '../router.js';
import { actions } from '../actions.js';
import { tap, ImpactStyle, speak, stopSpeak, shareBlob } from '../native.js';

let audioEl = null, audioUrl = null, playingId = null;
export async function playMemory(m) {
  if (!m) return;
  stopAudio();
  if (m.kind === 'text') { playingId = null; return speak(`${m.title}. ${m.text}`, true); }
  const blob = await idb.get('audio:' + m.id);
  if (!blob) return toast('No se encontró el audio');
  audioUrl = URL.createObjectURL(blob);
  audioEl = new Audio(audioUrl);
  playingId = m.id;
  audioEl.onended = () => { stopAudio(); refresh(); };
  audioEl.play().catch(() => toast('No se pudo reproducir'));
  refresh();
}
function stopAudio() {
  stopSpeak();
  if (audioEl) { audioEl.pause(); audioEl = null; }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  playingId = null;
}
const refresh = () => { if (isCurrent('memories')) views.memories.redraw?.(); };
const fmtSec = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

views.memories = () => {
  const p = me();
  renderTop('Memorias de voz', { back: true });
  $('#view').innerHTML = `
    <section class="mem-hero">
      <div class="mem-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <h2>Guarda tus recuerdos</h2>
      <p>Graba lo que pasó en un lugar o escribe una memoria para que la guía la narre. Si la vinculas a un pin, suena cuando llegas.</p>
      <div class="row" style="gap:10px;justify-content:center">
        <button class="btn primary" data-act="mem-record">${icon('mic', 18)} Grabar</button>
        <button class="btn" data-act="mem-text">✍️ Escribir</button>
      </div>
    </section>
    <div class="section-title"><span class="orn">Tus memorias</span></div>
    <div id="mem-list"></div>`;
  const draw = () => {
    const list = [...me().memories].sort((a, b) => b.createdAt - a.createdAt);
    $('#mem-list').innerHTML = list.length ? list.map((m) => {
      const pin = p.pins.find((x) => x.id === m.pinId);
      return `<div class="mem-item ${playingId === m.id ? 'playing' : ''}">
        <button class="mem-play" data-act="mem-play" data-id="${m.id}">${playingId === m.id ? '❚❚' : m.kind === 'audio' ? '▶' : icon('speaker', 18)}</button>
        <div class="grow" data-act="mem-edit" data-id="${m.id}">
          <b class="truncate">${esc(m.title)}</b>
          <div class="small muted">${m.kind === 'audio' ? fmtSec(m.dur || 0) : 'Narrada'} · ${fmtDate(m.createdAt)}${pin ? ` · ${catById(pin.cat).emoji} ${esc(pin.title)}` : ''}</div>
        </div>
      </div>`;
    }).join('') : '<div class="empty"><div class="big">🎙️</div>Aún no hay memorias.</div>';
  };
  views.memories.redraw = draw;
  draw();
  return () => stopAudio();
};

actions['mem-play'] = (el) => {
  if (playingId === el.dataset.id) { stopAudio(); return refresh(); }
  playMemory(me().memories.find((m) => m.id === el.dataset.id));
};

function pinSelect(selected) {
  const pins = me().pins;
  return `<label class="field"><span>Vincular a un lugar (opcional)</span><select class="input" id="ms-pin"><option value="">— Ninguno —</option>
    ${pins.map((x) => `<option value="${x.id}" ${x.id === selected ? 'selected' : ''}>${catById(x.cat).emoji} ${esc(x.title)}</option>`).join('')}</select></label>`;
}

actions['mem-text'] = (el, existing) => {
  const m = existing;
  sheet(`<h2>${m ? 'Editar memoria' : 'Memoria narrada'}</h2>
    <label class="field"><span>Título</span><input class="input" id="ms-title" value="${esc(m?.title || '')}" placeholder="Ej. La primera vez en la playa" /></label>
    <label class="field"><span>Texto que leerá la guía</span><textarea class="input" id="ms-text" placeholder="Cuenta lo que pasó…">${esc(m?.text || '')}</textarea></label>
    ${pinSelect(m?.pinId)}
    <div class="actions"><button class="btn" id="ms-try">${icon('speaker', 18)} Escuchar</button><button class="btn primary" id="ms-save">Guardar</button></div>`, (s) => {
    $('#ms-try', s).onclick = () => speak($('#ms-text', s).value || 'Escribe algo primero', true);
    $('#ms-save', s).onclick = () => {
      const title = $('#ms-title', s).value.trim() || 'Memoria';
      const text = $('#ms-text', s).value.trim();
      if (!text) return toast('Escribe el texto');
      const pinId = $('#ms-pin', s).value || null;
      closeSheet();
      if (m) { Object.assign(m, { title, text, pinId }); save(); }
      else { me().memories.push({ id: uid(), kind: 'text', title, text, pinId, createdAt: Date.now() }); save(); track('memories'); }
      refresh(); toast('Memoria guardada');
    };
  });
};

actions['mem-edit'] = (el) => {
  const p = me();
  const m = p.memories.find((x) => x.id === el.dataset.id);
  if (!m) return;
  if (m.kind === 'text') {
    actions['mem-text'](el, m);
    setTimeout(() => $('.sheet .actions')?.insertAdjacentHTML('afterbegin', '<button class="btn danger" id="ms-del">🗑</button>'), 0);
  } else {
    sheet(`<h2>Editar memoria</h2>
      <label class="field"><span>Título</span><input class="input" id="ms-title" value="${esc(m.title)}" /></label>
      ${pinSelect(m.pinId)}
      <div class="actions"><button class="btn danger" id="ms-del">🗑</button><button class="btn" id="ms-share">${icon('share', 18)}</button><button class="btn primary" id="ms-save">Guardar</button></div>`, (s) => {
      $('#ms-save', s).onclick = () => { m.title = $('#ms-title', s).value.trim() || m.title; m.pinId = $('#ms-pin', s).value || null; save(); closeSheet(); refresh(); };
      $('#ms-share', s).onclick = async () => { const b = await idb.get('audio:' + m.id); if (b) shareBlob(b, `memoria-${m.id}.${(b.type.split('/')[1] || 'webm').split(';')[0]}`, m.title); };
    });
  }
  setTimeout(() => {
    const del = $('#ms-del');
    if (del) del.onclick = () => confirmSheet('¿Borrar memoria?', m.title, 'Borrar', async () => {
      stopAudio();
      p.memories = p.memories.filter((x) => x.id !== m.id); save();
      await idb.del('audio:' + m.id).catch(() => {});
      refresh();
    });
  }, 0);
};

// Grabadora
actions['mem-record'] = async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este dispositivo no permite grabar');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return toast('Permite el micrófono para grabar'); }
  stopAudio();
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const an = ac.createAnalyser(); an.fftSize = 64;
  ac.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.frequencyBinCount);
  const started = Date.now();
  let raf, finished = false;
  const finish = (keep) => {
    if (finished) return; finished = true;
    cancelAnimationFrame(raf);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      ac.close();
      if (keep && chunks.length) saveRecording(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }), (Date.now() - started) / 1000);
    };
    if (rec.state !== 'inactive') rec.stop();
  };
  sheet(`<div class="center rec-sheet">
      <div class="rec-dot"></div>
      <div class="timer" id="rec-t">0:00</div>
      <div class="rec-bars" id="rec-bars">${'<i></i>'.repeat(16)}</div>
      <p class="muted small">Grabando… máximo 5 minutos</p>
      <div class="actions"><button class="btn ghost" id="rec-cancel">Descartar</button><button class="btn primary" id="rec-stop">■ Detener y guardar</button></div>
    </div>`, (s) => {
    $('#rec-cancel', s).onclick = () => { finish(false); closeSheet(); };
    $('#rec-stop', s).onclick = () => { finish(true); closeSheet(); };
    const bars = [...$('#rec-bars', s).children];
    const loop = () => {
      an.getByteFrequencyData(buf);
      bars.forEach((b, i) => (b.style.height = `${8 + (buf[i] / 255) * 56}px`));
      const sec = (Date.now() - started) / 1000;
      const t = $('#rec-t'); if (t) t.textContent = fmtSec(sec);
      if (sec > 300) { finish(true); closeSheet(); return; }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => finish(false); // cerrar la hoja de otra forma descarta
  });
  rec.start(250);
  tap(ImpactStyle.Medium);
};

function saveRecording(blob, dur) {
  const id = uid();
  sheet(`<h2>Guardar memoria</h2>
    <label class="field"><span>Título</span><input class="input" id="ms-title" placeholder="Ej. Persecución en el puente" /></label>
    ${pinSelect(me().navTarget)}
    <div class="actions"><button class="btn" id="ms-play">▶ Oír</button><button class="btn primary" id="ms-save">Guardar</button></div>`, (s) => {
    const u = URL.createObjectURL(blob);
    let a = null;
    $('#ms-play', s).onclick = () => { a?.pause(); a = new Audio(u); a.play(); };
    $('#ms-save', s).onclick = async () => {
      await idb.set('audio:' + id, blob);
      me().memories.push({ id, kind: 'audio', title: $('#ms-title', s).value.trim() || `Memoria ${me().memories.length + 1}`, pinId: $('#ms-pin', s).value || null, dur, createdAt: Date.now() });
      save(); closeSheet(); track('memories'); refresh(); toast('Memoria guardada');
    };
    setTimeout(() => $('#ms-title', s)?.focus(), 250);
    return () => { a?.pause(); URL.revokeObjectURL(u); };
  });
}
