// Inicio, bono diario, sesiones y bitácora
import { state, me, save, uid, levelInfo, streaks, playedMs, profileProgress, dailyStatus, WHEEL, spinResult, applySpin, claimDaily, endSession, IGN_URL } from '../store.js';
import { $, esc, pct, icon, sheet, closeSheet, confirmSheet, toast, renderTop, fmtDur, fmtShortDur, fmtDate, timeAgo } from '../ui.js';
import { views, go, route, isCurrent } from '../router.js';
import { actions } from '../actions.js';
import { tap, ImpactStyle, openUrl, speak } from '../native.js';

const FEATURES = [
  { to: 'map', ico: 'compass', name: 'Navegación', sub: 'Capas, ruta y voz', c: '#39d3c3' },
  { to: 'ign', ico: 'ign', name: 'Mapa IGN', sub: 'Mapa interactivo', c: '#ff9d4d' },
  { to: 'memories', ico: 'mic', name: 'Memorias de voz', sub: 'Graba recuerdos', c: '#ff5c8d' },
  { to: 'studio', ico: 'camera', name: 'Estudio de fotos', sub: 'Marcos y stickers', c: '#e8c37a' },
  { to: 'qr', ico: 'qr', name: 'Compartir QR', sub: 'Pines y listas', c: '#4f9bff' },
  { to: 'data', ico: 'medal', name: 'Mis datos', sub: 'Medallas y récords', c: '#f2c55c' },
  { to: 'family', ico: 'family', name: 'Datos familiares', sub: 'Compara progreso', c: '#7ee081' },
  { to: 'daily', ico: 'wheel', name: 'Bono diario', sub: 'Ruleta y retos', c: '#a77bff' },
  { to: 'progress', ico: 'check', name: 'Checklists', sub: 'Misiones y más', c: '#39d3c3' },
  { to: 'notes', ico: 'book', name: 'Bitácora', sub: 'Tus notas', c: '#f3ead7' },
  { to: 'sessions', ico: 'clock', name: 'Sesiones', sub: 'Tiempo de juego', c: '#4f9bff' },
  { to: 'settings', ico: 'gear', name: 'Ajustes', sub: 'Perfiles y respaldo', c: '#a9b4c8' },
];

export function playerCard(p, { compact = false } = {}) {
  const lv = levelInfo(p.xp);
  const st = streaks(p);
  return `<section class="player ${compact ? 'compact' : ''}" style="--pc:${p.color}">
    <div class="player-av">${esc(p.emoji)}</div>
    <div class="grow">
      <div class="player-name">${esc(p.name)}</div>
      <div class="player-title">Nivel ${lv.level} · ${esc(lv.title)}</div>
      <div class="xpbar"><i style="width:${lv.pct}%"></i></div>
      <div class="player-meta"><span>${lv.into}/${lv.need} XP</span><span>🔥 ${st.current} día${st.current === 1 ? '' : 's'}</span><span>⏱ ${fmtShortDur(playedMs(p))}</span></div>
    </div>
  </section>`;
}

function dailyBanner(p) {
  const st = dailyStatus(p);
  if (st.available) return `<button class="daily-banner ready" data-act="go" data-to="daily"><span class="db-ico">${icon('wheel', 26)}</span><span class="grow"><b>Tu bono diario está listo</b><small>Gira la ruleta y gana XP o un reto</small></span><span class="db-cta">Girar</span></button>`;
  if (st.seg.type && !st.d.claimed) {
    return `<button class="daily-banner" data-act="go" data-to="daily"><span class="db-ico" style="color:${st.seg.color}">${st.seg.icon}</span><span class="grow"><b>Reto: ${esc(st.seg.label)}</b><small>${st.done ? '¡Cumplido! Toca para reclamar' : `${st.progress}/${st.seg.goal} · +${st.seg.xp} XP`}</small><span class="bar thin"><i style="width:${pct(st.progress, st.seg.goal)}%"></i></span></span><span class="db-cta ${st.done ? '' : 'ghost'}">${st.done ? 'Reclamar' : 'Ver'}</span></button>`;
  }
  return '';
}

export function listCard(l) {
  const d = l.items.filter((i) => i.done).length;
  const p = pct(d, l.items.length);
  return `<div class="card tap list-card" data-act="go" data-to="list/${l.id}">
    <div class="emoji">${esc(l.emoji)}</div>
    <div class="grow">
      <div class="row between"><h3 class="truncate">${esc(l.name)}</h3><span class="small muted">${d}/${l.items.length}</span></div>
      <div class="bar" style="margin-top:8px"><i style="width:${p}%"></i></div>
    </div></div>`;
}

// ---------------------------------------------------------------- Inicio
views.home = () => {
  const p = me();
  renderTop('Leonida Notes', { sub: new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) });
  const prog = profileProgress(p);
  const overall = pct(prog.done + prog.pinsDone, prog.total + prog.pins);
  const topLists = [...p.lists].filter((l) => l.items.length).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 2);
  const daily = dailyStatus(p);
  $('#view').innerHTML = `
    ${playerCard(p)}
    ${dailyBanner(p)}
    <div class="session-strip ${p.running ? 'live' : ''}">
      <div class="grow">
        <div class="small muted">${p.running ? '<span class="live-dot"></span>&nbsp; Jugando ahora' : 'Sesión de juego'}</div>
        <div class="timer" id="timer">${p.running ? fmtDur(Date.now() - p.running, true) : '00:00:00'}</div>
      </div>
      <div class="mini-ring" style="--p:${overall}" title="Progreso total"><span>${overall}%</span></div>
      <button class="btn ${p.running ? 'danger' : 'teal'}" data-act="session">${p.running ? '■ Terminar' : '▶ Jugar'}</button>
    </div>

    <div class="section-title"><span class="orn">Funciones</span></div>
    <div class="feature-grid">
      ${FEATURES.map((f) => `<button class="feature" data-act="${f.to === 'ign' ? 'ign' : 'go'}" data-to="${f.to}" style="--fc:${f.c}">
        <span class="f-ico">${icon(f.ico, 26)}</span><span class="f-name">${f.name}</span><span class="f-sub">${f.sub}</span>
        ${f.to === 'daily' && (daily.available || (daily.done && !daily.d?.claimed)) ? '<span class="f-badge">!</span>' : ''}
      </button>`).join('')}
    </div>

    ${topLists.length ? `<div class="section-title"><span class="orn">Continuar</span></div>${topLists.map(listCard).join('')}` : ''}

    <div class="section-title"><span class="orn">Accesos rápidos</span> <button class="btn sm ghost" data-act="links">Editar</button></div>
    <div class="menu">
      ${state.links.map((l) => `<button data-act="open-link" data-url="${esc(l.url)}"><span class="mi">${icon('ign', 20)}</span><span class="grow truncate">${esc(l.name)}</span><span class="chev">↗</span></button>`).join('')}
    </div>
    <p class="disclaimer">App de fans, no oficial. Sin afiliación con Rockstar Games, Take-Two, Nintendo ni IGN.</p>`;
  const iv = setInterval(() => {
    const el = $('#timer');
    if (el && me().running) el.textContent = fmtDur(Date.now() - me().running, true);
  }, 1000);
  return () => clearInterval(iv);
};

actions.session = () => {
  const p = me();
  if (p.running) {
    const s = endSession(p);
    if (s) toast(`Sesión guardada: ${fmtDur(s.end - s.start)}`);
  } else {
    p.running = Date.now(); save();
    toast('¡A jugar! Cronómetro iniciado');
  }
  tap(ImpactStyle.Medium); route();
};

// ---------------------------------------------------------------- Mapa IGN
views.ign = () => {
  renderTop('Mapa IGN', { sub: 'Mapa interactivo de Leonida' });
  $('#view').innerHTML = `
    <div class="ign-art">
      <span style="left:20%;top:34%">📍</span><span style="left:56%;top:22%">💎</span><span style="left:72%;top:56%">🎬</span><span style="left:38%;top:62%">🚗</span>
      <div class="ign-art-label">IGN · Leonida</div>
    </div>
    <button class="btn primary block lg" data-act="ign">${icon('ign', 20)} Abrir mapa interactivo</button>
    <p class="small muted center" style="margin:10px 0 18px">Se abre dentro de la app, siempre actualizado. Si inicias sesión en IGN, tu progreso allá se mantiene.</p>
    <div class="card">
      <h3>Úsalo junto a Leonida Notes</h3>
      <ol class="steps" style="margin-top:12px">
        <li><span>Ubica en IGN lo que buscas (coleccionables, tiendas, misiones).</span></li>
        <li><span>Vuelve con el botón atrás y márcalo en <b>Navegación</b> para tener tu ruta y guía de voz.</span></li>
        <li><span>Al llegar en el juego, toca <b>Llegué</b>: sumas XP y la guía te lleva al siguiente más cercano.</span></li>
      </ol>
    </div>
    <div class="row" style="gap:10px">
      <button class="btn block" data-act="tab" data-to="map">${icon('compass', 18)} Navegación</button>
      <button class="btn block" data-act="tab" data-to="progress">${icon('check', 18)} Checklists</button>
    </div>`;
};
actions.ign = () => openUrl(IGN_URL);

// ---------------------------------------------------------------- Bono diario
function wheelSvg() {
  const n = WHEEL.length, r = 150, cx = 160, cy = 160;
  const seg = (i) => {
    const a0 = ((i / n) * 360 - 90 - 180 / n) * Math.PI / 180, a1 = (((i + 1) / n) * 360 - 90 - 180 / n) * Math.PI / 180;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const am = ((i / n) * 360 - 90) * Math.PI / 180;
    const tx = cx + r * 0.66 * Math.cos(am), ty = cy + r * 0.66 * Math.sin(am);
    return `<path d="M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}Z" fill="${WHEEL[i].color}" opacity="${i % 2 ? 0.82 : 1}"/>
      <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="26" transform="rotate(${(i / n) * 360} ${tx} ${ty})">${WHEEL[i].icon}</text>`;
  };
  return `<svg viewBox="0 0 320 320" class="wheel-svg"><circle cx="160" cy="160" r="158" fill="#0a1220" stroke="#e8c37a" stroke-width="3"/>${WHEEL.map((_, i) => seg(i)).join('')}
    <circle cx="160" cy="160" r="30" fill="#0a1220" stroke="#e8c37a" stroke-width="3"/></svg>`;
}
views.daily = () => {
  const p = me();
  renderTop('Bono diario', { back: true });
  const st = dailyStatus(p);
  const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
  $('#view').innerHTML = `
    <div class="wheel-wrap">
      <div class="wheel-pointer"></div>
      <div class="wheel" id="wheel" style="transform:rotate(${st.available ? 0 : -WHEEL.findIndex((w) => w.id === st.d.id) * (360 / WHEEL.length)}deg)">${wheelSvg()}</div>
      <button class="wheel-hub" data-act="spin" ${st.available ? '' : 'disabled'}>${st.available ? 'GIRAR' : '✓'}</button>
    </div>
    <div id="daily-result">${st.available
      ? `<p class="center muted">Una vez al día. Puede tocarte XP directo, XP doble o un reto con premio.</p>`
      : resultCard(p)}</div>
    <div class="card"><div class="row between"><span class="muted small">Giros totales</span><b>${p.stats.spins || 0}</b></div>
      ${st.available ? '' : `<div class="row between" style="margin-top:6px"><span class="muted small">Próximo giro</span><b id="countdown">${fmtDur(tomorrow - Date.now(), true)}</b></div>`}</div>
    <div class="section-title"><span class="orn">Premios posibles</span></div>
    <div class="prize-list">${WHEEL.map((w) => `<div class="prize"><span style="background:${w.color}">${w.icon}</span><div><b>${esc(w.label)}</b><small>${esc(w.desc)}${w.xp ? ` · +${w.xp} XP` : ''}</small></div></div>`).join('')}</div>`;
  const iv = setInterval(() => { const el = $('#countdown'); if (el) el.textContent = fmtDur(tomorrow - Date.now(), true); }, 1000);
  return () => clearInterval(iv);
};
function resultCard(p) {
  const st = dailyStatus(p);
  const seg = st.seg;
  return `<div class="card reward" style="--rc:${seg.color}">
    <div class="row"><div class="reward-ico">${seg.icon}</div><div class="grow"><div class="small muted">Premio de hoy</div><h3>${esc(seg.label)}</h3></div></div>
    <p class="muted" style="margin:8px 0 10px">${esc(seg.desc)}</p>
    ${seg.type ? `<div class="row between small"><span>${st.progress}/${seg.goal}</span><span>+${seg.xp} XP</span></div><div class="bar" style="margin:6px 0 12px"><i style="width:${pct(st.progress, seg.goal)}%"></i></div>
      ${st.d.claimed ? '<div class="tag ok">Reclamado ✓</div>' : `<button class="btn primary block" data-act="claim" ${st.done ? '' : 'disabled'}>${st.done ? `Reclamar ${seg.xp} XP` : 'En progreso…'}</button>`}`
      : `<div class="tag ok">${seg.double ? 'XP doble activo hasta medianoche' : 'Aplicado ✓'}</div>`}
  </div>`;
}
actions.spin = () => {
  const p = me();
  if (!dailyStatus(p).available) return;
  const idx = spinResult();
  const n = WHEEL.length;
  const target = 360 * 6 - idx * (360 / n) + (Math.random() * 16 - 8);
  const w = $('#wheel');
  $('.wheel-hub').disabled = true;
  w.style.transition = 'transform 4.2s cubic-bezier(.12,.75,.12,1)';
  requestAnimationFrame(() => (w.style.transform = `rotate(${target}deg)`));
  tap(ImpactStyle.Heavy);
  setTimeout(() => {
    const seg = applySpin(idx, p);
    tap(ImpactStyle.Medium);
    speak(seg.type ? `Reto del día: ${seg.desc}` : seg.desc);
    if (isCurrent('daily')) route();
  }, 4400);
};
actions.claim = () => { claimDaily(me()); tap(ImpactStyle.Medium); route(); };

// ---------------------------------------------------------------- Sesiones
views.sessions = () => {
  const p = me();
  renderTop('Sesiones', { back: true });
  const list = [...p.sessions].reverse();
  const week = p.sessions.filter((s) => s.end > Date.now() - 7 * 864e5).reduce((a, s) => a + s.end - s.start, 0);
  const longest = p.sessions.reduce((a, s) => Math.max(a, s.end - s.start), 0);
  // barras de los últimos 7 días
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const per = days.map((d) => p.sessions.filter((s) => s.start >= +d && s.start < +d + 864e5).reduce((a, s) => a + s.end - s.start, 0));
  const max = Math.max(...per, 1);
  $('#view').innerHTML = `
    <div class="stats"><div class="stat"><b>${fmtShortDur(playedMs(p))}</b><span>total</span></div><div class="stat"><b>${fmtShortDur(week)}</b><span>7 días</span></div><div class="stat"><b>${fmtShortDur(longest)}</b><span>récord</span></div></div>
    <div class="card"><h3>Última semana</h3><div class="week-bars">${per.map((v, i) => `<div class="wb"><i style="height:${Math.max(3, (v / max) * 100)}%"></i><span>${days[i].toLocaleDateString('es', { weekday: 'narrow' })}</span></div>`).join('')}</div></div>
    <button class="btn ${p.running ? 'danger' : 'teal'} block" data-act="session" style="margin-bottom:14px">${p.running ? '■ Terminar sesión' : '▶ Empezar sesión'}</button>
    <div class="section-title"><span class="orn">Historial</span></div>
    ${list.length ? list.slice(0, 100).map((s) => `<div class="item"><span>🎮</span><div class="txt">${fmtDate(s.start)}</div><b>${fmtDur(s.end - s.start)}</b></div>`).join('') : '<div class="empty"><div class="big">⏱️</div>Aún no hay sesiones. Toca “Empezar” cuando prendas la consola.</div>'}`;
};

// ---------------------------------------------------------------- Bitácora
views.notes = () => {
  const p = me();
  renderTop('Bitácora', { back: true });
  let q = '';
  const draw = () => {
    const notes = [...p.notes].filter((n) => !q || (n.title + ' ' + n.body).toLowerCase().includes(q)).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    $('#nt-list').innerHTML = notes.length ? notes.map((n) => `
      <div class="card tap note-card" data-act="edit-note" data-id="${n.id}">
        <div class="row between"><h3 class="truncate">${n.pinned ? '📌 ' : ''}${esc(n.title || 'Sin título')}</h3><span class="small faint">${timeAgo(n.updatedAt)}</span></div>
        ${n.body ? `<div class="body">${esc(n.body)}</div>` : ''}
      </div>`).join('') : `<div class="empty"><div class="big">📖</div><h3>${q ? 'Sin resultados' : 'Tu bitácora'}</h3>${q ? '' : 'Anota trucos, rutas, precios o lo que pasó en tu última partida.'}</div>`;
  };
  $('#view').innerHTML = `<div class="search"><span>🔍</span><input id="nt-q" placeholder="Buscar notas…" /></div>
    <button class="btn primary block" data-act="edit-note" style="margin-bottom:14px">＋ Nueva nota</button>
    <div id="nt-list"></div>`;
  $('#nt-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  views.notes.redraw = draw;
  draw();
};
actions['edit-note'] = (el) => {
  const p = me();
  const id = el.dataset.id;
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
};
