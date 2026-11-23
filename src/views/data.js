// Mis datos de juego (estadísticas y medallas) y Datos familiares (comparación entre perfiles)
import { state, me, MEDALS, TIERS, medalTier, statValue, streaks, playedMs, levelInfo, profileProgress } from '../store.js';
import { $, esc, pct, sheet, renderTop, fmtShortDur } from '../ui.js';
import { views } from '../router.js';
import { actions } from '../actions.js';
import { playerCard } from './home.js';

function medalHtml(p, m) {
  const { tier, value, next } = medalTier(p, m);
  const t = TIERS[tier];
  const base = tier >= 0 ? m.tiers[tier] : 0;
  const prog = next ? pct(value - base, next - base) : 100;
  return `<button class="medal-cell ${tier < 0 ? 'locked' : ''}" data-act="medal" data-key="${m.key}">
    <div class="medal" style="--mc:${t ? t.color : '#3a4660'}"><span>${m.icon}</span>${tier >= 0 ? `<em>${['I', 'II', 'III', '★'][tier]}</em>` : ''}</div>
    <b>${esc(m.name)}</b>
    <small>${t ? t.name : 'Sin medalla'}</small>
    <span class="bar thin"><i style="width:${prog}%"></i></span>
  </button>`;
}

const STAT_ROWS = (p) => {
  const s = streaks(p);
  const prog = profileProgress(p);
  const longest = p.sessions.reduce((a, x) => Math.max(a, x.end - x.start), 0);
  return [
    ['⏱️', 'Tiempo jugado', fmtShortDur(playedMs(p))],
    ['🎮', 'Sesiones', p.sessions.length],
    ['🏁', 'Sesión más larga', fmtShortDur(longest)],
    ['📅', 'Días jugados', s.days],
    ['🔥', 'Racha actual / mejor', `${s.current} / ${s.best}`],
    ['✅', 'Objetivos completados', `${prog.done} de ${prog.total}`],
    ['🏆', 'Listas al 100%', statValue(p, 'listsDone')],
    ['📍', 'Lugares marcados', prog.pins],
    ['🧭', 'Lugares visitados', prog.pinsDone],
    ['📸', 'Fotos editadas', p.photos.length],
    ['🎙️', 'Memorias', p.memories.length],
    ['🎡', 'Giros del bono', p.stats.spins || 0],
    ['⚡', 'Retos cumplidos', p.stats.challenges || 0],
    ['🤝', 'Cosas compartidas', p.stats.qrShared || 0],
    ['⭐', 'XP total', p.xp],
  ];
};

views.data = () => {
  const p = me();
  renderTop('Mis datos', { sub: 'Medallas y récords' });
  const earned = MEDALS.filter((m) => medalTier(p, m).tier >= 0).length;
  $('#view').innerHTML = `
    ${playerCard(p)}
    <div class="seg"><button class="on">Mis datos</button><button data-act="go" data-to="family">Familia</button></div>
    <div class="section-title"><span class="orn">Medallas · ${earned}/${MEDALS.length}</span></div>
    <div class="medal-grid">${MEDALS.map((m) => medalHtml(p, m)).join('')}</div>
    <div class="section-title"><span class="orn">Estadísticas</span></div>
    <div class="menu stat-list">${STAT_ROWS(p).map(([i, l, v]) => `<div class="stat-row"><span class="mi">${i}</span><span class="grow">${l}</span><b>${v}</b></div>`).join('')}</div>`;
};

actions.medal = (el) => {
  const p = me();
  const m = MEDALS.find((x) => x.key === el.dataset.key);
  const { tier, value } = medalTier(p, m);
  sheet(`<div class="center"><div class="medal big" style="--mc:${tier >= 0 ? TIERS[tier].color : '#3a4660'}"><span>${m.icon}</span></div><h2 style="margin:10px 0 2px">${esc(m.name)}</h2><p class="muted">${value} ${esc(m.unit)}</p></div>
    <div class="tier-list">${m.tiers.map((th, i) => `<div class="tier-row ${tier >= i ? 'got' : ''}" style="--mc:${TIERS[i].color}"><span class="tdot"></span><b>${TIERS[i].name}</b><span class="grow"></span><span>${th} ${esc(m.unit)}</span>${tier >= i ? '<span>✓</span>' : ''}</div>`).join('')}</div>`);
};

views.family = () => {
  renderTop('Datos familiares', { back: true });
  const ps = state.profiles;
  const metrics = [
    ['Nivel', (p) => levelInfo(p.xp).level, (v) => `Nv ${v}`],
    ['Tiempo jugado', (p) => playedMs(p), fmtShortDur],
    ['Objetivos completados', (p) => profileProgress(p).done, String],
    ['Lugares visitados', (p) => profileProgress(p).pinsDone, String],
    ['Medallas', (p) => MEDALS.filter((m) => medalTier(p, m).tier >= 0).length, String],
    ['Mejor racha (días)', (p) => streaks(p).best, String],
    ['Fotos', (p) => p.photos.length, String],
  ];
  $('#view').innerHTML = `
    <div class="seg"><button data-act="go" data-to="data">Mis datos</button><button class="on">Familia</button></div>
    ${ps.length < 2 ? `<div class="card center"><div style="font-size:40px">👨‍👩‍👧</div><h3>Agrega a tu familia</h3><p class="muted small">Crea un perfil por persona (toca tu avatar arriba) o importa el de alguien por QR para comparar avances.</p><button class="btn primary" data-act="profiles">Gestionar perfiles</button></div>` : ''}
    <div class="podium">${[...ps].sort((a, b) => b.xp - a.xp).slice(0, 3).map((p, i) => `<div class="pod pod-${i + 1}" style="--pc:${p.color}"><div class="pod-av">${esc(p.emoji)}</div><b class="truncate">${esc(p.name)}</b><small>${p.xp} XP</small><div class="pod-step">${i + 1}</div></div>`).join('')}</div>
    ${metrics.map(([label, fn, fmt]) => {
      const vals = ps.map((p) => ({ p, v: fn(p) }));
      const max = Math.max(...vals.map((x) => x.v), 1);
      const avg = vals.reduce((a, x) => a + x.v, 0) / vals.length;
      return `<div class="card fam-metric"><div class="row between"><h3>${label}</h3><span class="small muted">promedio ${fmt(Math.round(avg))}</span></div>
        ${vals.sort((a, b) => b.v - a.v).map(({ p, v }) => `<div class="fam-row ${p.id === state.active ? 'me' : ''}"><span class="fam-av">${esc(p.emoji)}</span><span class="fam-name truncate">${esc(p.name)}</span><span class="fam-bar"><i style="width:${(v / max) * 100}%;background:${p.color}"></i></span><b>${fmt(v)}</b></div>`).join('')}</div>`;
    }).join('')}`;
};
