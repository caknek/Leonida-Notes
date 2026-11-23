// Estado, persistencia, XP, medallas y bono diario
export const IGN_URL = 'https://www.ign.com/maps/gta-6/leonida';
const KEY = 'leonida-notes.v2';
const OLD_KEY = 'leonida-companion.v1';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const CATS = [
  { id: 'mision', name: 'Misión', emoji: '🎬', color: '#ff5c8d' },
  { id: 'colec', name: 'Coleccionable', emoji: '💎', color: '#39d3c3' },
  { id: 'tienda', name: 'Tienda', emoji: '🛒', color: '#ffb347' },
  { id: 'negocio', name: 'Negocio', emoji: '💼', color: '#e8c37a' },
  { id: 'vehiculo', name: 'Vehículo', emoji: '🚗', color: '#4f9bff' },
  { id: 'arma', name: 'Armas', emoji: '🔫', color: '#c0c6d4' },
  { id: 'actividad', name: 'Actividad', emoji: '🎯', color: '#a77bff' },
  { id: 'escondite', name: 'Escondite', emoji: '🏠', color: '#7ee081' },
  { id: 'interes', name: 'Lugar de interés', emoji: '📸', color: '#ff8a5c' },
  { id: 'peligro', name: 'Peligro', emoji: '⚠️', color: '#ff4f64' },
  { id: 'otro', name: 'Otro', emoji: '📍', color: '#a9b4c8' },
];
export const catById = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

export const PROFILE_COLORS = ['#ff5c8d', '#ff9d4d', '#e8c37a', '#39d3c3', '#4f9bff', '#a77bff', '#7ee081', '#ff4f64'];
export const PROFILE_EMOJIS = ['😎', '🦩', '🐊', '🌴', '🏄', '🕶️', '🔥', '💰', '🚤', '🏍️', '👑', '🐬', '🌅', '🎮', '👩', '👨', '👧', '👦'];
export const LIST_EMOJIS = ['🎬', '🧭', '💎', '🎯', '🏠', '🚗', '🏆', '💰', '🔫', '🚤', '✈️', '🏍️', '👕', '🃏', '📸', '🐊', '🌴', '⭐', '📦', '🎵'];
const DEFAULT_LISTS = [
  ['Misiones principales', '🎬'], ['Misiones secundarias', '🧭'], ['Coleccionables', '💎'], ['Actividades', '🎯'],
  ['Negocios y propiedades', '🏠'], ['Vehículos', '🚗'], ['Logros y trofeos', '🏆'],
];

// ---------------------------------------------------------------- modelo
function blankStats() {
  return { objectives: 0, pinsVisited: 0, pinsCreated: 0, photos: 0, memories: 0, spins: 0, challenges: 0, qrShared: 0 };
}
export function newProfile(name, emoji = '😎', color = PROFILE_COLORS[0]) {
  return {
    id: uid(), name, emoji, color, createdAt: Date.now(),
    lists: DEFAULT_LISTS.map(([n, e]) => ({ id: uid(), name: n, emoji: e, items: [] })),
    pins: [], notes: [], memories: [], photos: [], sessions: [], running: null,
    xp: 0, stats: blankStats(), medals: {}, dayLog: {}, daily: null, me: null, navTarget: null,
  };
}
function fixProfile(p) {
  p.memories ||= []; p.photos ||= []; p.notes ||= []; p.pins ||= []; p.lists ||= []; p.sessions ||= [];
  p.xp ||= 0; p.stats = { ...blankStats(), ...(p.stats || {}) }; p.medals ||= {}; p.dayLog ||= {};
  if (p.daily === undefined) p.daily = null;
  if (p.me === undefined) p.me = null;
  return p;
}
function defaultState() {
  const p = newProfile('Jugador 1');
  return {
    app: 'leonida-notes', version: 2, active: p.id, profiles: [p],
    links: [
      { id: uid(), name: 'Mapa interactivo IGN', url: IGN_URL },
      { id: uid(), name: 'Rockstar Games — GTA VI', url: 'https://www.rockstargames.com/VI' },
    ],
    settings: { hideDone: false, voice: true, voiceRate: 1, mapKm: 12, onboarded: false },
  };
}
function normalize(s) {
  if (!s?.profiles?.length) return defaultState();
  s.app = 'leonida-notes'; s.version = 2;
  s.settings = { hideDone: false, voice: true, voiceRate: 1, mapKm: 12, onboarded: true, ...(s.settings || {}) };
  s.links ||= [];
  s.profiles.forEach(fixProfile);
  if (!s.profiles.some((p) => p.id === s.active)) s.active = s.profiles[0].id;
  return s;
}

export let state;
try {
  const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
  state = normalize(raw ? JSON.parse(raw) : null);
} catch { state = defaultState(); }

export const save = () => localStorage.setItem(KEY, JSON.stringify(state));
export const me = () => state.profiles.find((p) => p.id === state.active) || state.profiles[0];
export function replaceState(s) { state = normalize(s); save(); }
export function resetState() { state = defaultState(); state.settings.onboarded = true; save(); }
export { fixProfile };

// ---------------------------------------------------------------- IndexedDB (imágenes, audio, fotos)
export const idb = (() => {
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
    clear: () => tx('readwrite', (s) => s.clear()),
  };
})();

// ---------------------------------------------------------------- tiempo de juego
export function playedMs(p) {
  let t = p.sessions.reduce((a, s) => a + (s.end - s.start), 0);
  if (p.running) t += Date.now() - p.running;
  return t;
}
function playMsOn(p, day) {
  let t = 0;
  p.sessions.forEach((s) => { if (today(new Date(s.start)) === day) t += s.end - s.start; });
  if (p.running && today(new Date(p.running)) === day) t += Date.now() - p.running;
  return t;
}
function activeDays(p) {
  const days = new Set(Object.keys(p.dayLog).filter((d) => Object.values(p.dayLog[d]).some((v) => v > 0)));
  p.sessions.forEach((s) => days.add(today(new Date(s.start))));
  if (p.running) days.add(today());
  return [...days].sort();
}
export function streaks(p) {
  const days = activeDays(p);
  let best = 0, run = 0, prev = null;
  days.forEach((d) => {
    const cur = new Date(d + 'T12:00:00');
    run = prev && (cur - prev) / 864e5 === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = cur;
  });
  // racha actual: termina hoy o ayer
  let current = 0;
  if (days.length) {
    const last = new Date(days[days.length - 1] + 'T12:00:00');
    const diff = Math.round((new Date(today() + 'T12:00:00') - last) / 864e5);
    if (diff <= 1) {
      current = 1;
      for (let i = days.length - 2; i >= 0; i--) {
        if ((new Date(days[i + 1] + 'T12:00:00') - new Date(days[i] + 'T12:00:00')) / 864e5 === 1) current++;
        else break;
      }
    }
  }
  return { current, best, days: days.length };
}

// ---------------------------------------------------------------- niveles
const TITLES = [[1, 'Turista'], [3, 'Vecino nuevo'], [5, 'Buscavidas'], [8, 'Conocedor de la costa'], [12, 'Leyenda del barrio'], [16, 'Explorador de Leonida'], [20, 'Leyenda de Leonida']];
export function levelInfo(xp) {
  let level = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; level++; need = 100 + 50 * (level - 1); }
  const title = [...TITLES].reverse().find(([l]) => level >= l)[1];
  return { level, title, into: xp - acc, need, pct: Math.round(((xp - acc) / need) * 100) };
}

// ---------------------------------------------------------------- medallas
export const TIERS = [
  { name: 'Bronce', color: '#c98a55' },
  { name: 'Plata', color: '#c9d3e0' },
  { name: 'Oro', color: '#f2c55c' },
  { name: 'Maestro', color: '#7ef0e0' },
];
export const MEDALS = [
  { key: 'hours', name: 'Maratonista', icon: '⏱️', unit: 'horas jugadas', tiers: [1, 10, 50, 100] },
  { key: 'sessions', name: 'Constante', icon: '🎮', unit: 'sesiones', tiers: [5, 25, 100, 250] },
  { key: 'bestStreak', name: 'Racha de fuego', icon: '🔥', unit: 'días seguidos', tiers: [3, 7, 14, 30] },
  { key: 'objectives', name: 'Cumplidor', icon: '✅', unit: 'objetivos completados', tiers: [10, 50, 150, 400] },
  { key: 'listsDone', name: 'Completista', icon: '🏆', unit: 'listas al 100%', tiers: [1, 3, 7, 12] },
  { key: 'pinsVisited', name: 'Explorador', icon: '🧭', unit: 'lugares visitados', tiers: [10, 50, 150, 300] },
  { key: 'pinsCreated', name: 'Cartógrafo', icon: '🗺️', unit: 'pines marcados', tiers: [10, 50, 150, 300] },
  { key: 'photos', name: 'Fotógrafo', icon: '📸', unit: 'fotos editadas', tiers: [1, 10, 30, 100] },
  { key: 'memories', name: 'Narrador', icon: '🎙️', unit: 'memorias guardadas', tiers: [1, 10, 30, 75] },
  { key: 'spins', name: 'Devoto de la ruleta', icon: '🎡', unit: 'giros del bono diario', tiers: [10, 20, 50, 100] },
  { key: 'challenges', name: 'Retador', icon: '⚡', unit: 'retos diarios cumplidos', tiers: [5, 20, 50, 100] },
  { key: 'qrShared', name: 'Generoso', icon: '🤝', unit: 'cosas compartidas', tiers: [1, 5, 15, 40] },
];
export function statValue(p, key) {
  switch (key) {
    case 'hours': return Math.floor(playedMs(p) / 36e5);
    case 'sessions': return p.sessions.length;
    case 'bestStreak': return streaks(p).best;
    case 'listsDone': return p.lists.filter((l) => l.items.length && l.items.every((i) => i.done)).length;
    case 'pinsVisited': return p.pins.filter((x) => x.done).length;
    case 'pinsCreated': return p.pins.length;
    case 'objectives': return p.lists.reduce((a, l) => a + l.items.filter((i) => i.done).length, 0);
    case 'photos': return p.photos.length;
    case 'memories': return p.memories.length;
    default: return p.stats[key] || 0;
  }
}
export function medalTier(p, m) {
  const v = statValue(p, m.key);
  let t = -1;
  m.tiers.forEach((th, i) => { if (v >= th) t = i; });
  return { tier: t, value: v, next: m.tiers[t + 1] ?? null };
}

// ---------------------------------------------------------------- bono diario
export const WHEEL = [
  { id: 'obj3', label: '3 objetivos', icon: '✅', desc: 'Completa 3 objetivos de tus checklists hoy.', type: 'objectives', goal: 3, xp: 60, color: '#39d3c3' },
  { id: 'bonus', label: '+100 XP', icon: '💰', desc: '¡Premio directo! Sumaste 100 XP.', instant: 100, color: '#e8c37a' },
  { id: 'pins2', label: 'Visita 2 lugares', icon: '📍', desc: 'Marca 2 pines como visitados hoy.', type: 'pinsVisited', goal: 2, xp: 70, color: '#ff5c8d' },
  { id: 'play30', label: 'Juega 30 min', icon: '⏱️', desc: 'Registra 30 minutos de juego con el cronómetro.', type: 'playMin', goal: 30, xp: 60, color: '#4f9bff' },
  { id: 'double', label: 'XP doble', icon: '✨', desc: 'Todo lo que hagas hoy da el doble de XP.', instant: 0, double: true, color: '#a77bff' },
  { id: 'photo', label: 'Edita una foto', icon: '📸', desc: 'Guarda una foto en el Estudio.', type: 'photos', goal: 1, xp: 50, color: '#ff9d4d' },
  { id: 'newpin', label: '3 lugares nuevos', icon: '🗺️', desc: 'Marca 3 pines nuevos en tu mapa.', type: 'pinsCreated', goal: 3, xp: 50, color: '#7ee081' },
  { id: 'memo', label: 'Una memoria', icon: '🎙️', desc: 'Graba o escribe una memoria de voz.', type: 'memories', goal: 1, xp: 50, color: '#ff8a5c' },
];
export function dailyStatus(p) {
  const d = p.daily && p.daily.date === today() ? p.daily : null;
  if (!d) return { available: true };
  const seg = WHEEL.find((w) => w.id === d.id);
  let progress = 0;
  if (seg.type === 'playMin') progress = Math.floor(playMsOn(p, d.date) / 6e4);
  else if (seg.type) progress = p.dayLog[d.date]?.[seg.type] || 0;
  return { available: false, d, seg, progress: Math.min(progress, seg.goal || 0), done: seg.type ? progress >= seg.goal : true };
}
export function spinResult() { return Math.floor(Math.random() * WHEEL.length); }

// ---------------------------------------------------------------- eventos → XP, medallas, retos
const XP = { objectives: 10, pinsVisited: 15, pinsCreated: 5, photos: 10, memories: 10, qrShared: 5, spins: 5, playMin: 1 };
let listeners = [];
export const onReward = (fn) => listeners.push(fn);

function grantXp(p, amount, events) {
  const doubled = p.daily?.date === today() && p.daily.id === 'double';
  const real = doubled ? amount * 2 : amount;
  const before = levelInfo(p.xp).level;
  p.xp += real;
  const after = levelInfo(p.xp);
  if (after.level > before) events.push({ kind: 'level', level: after.level, title: after.title });
  return real;
}

export function track(type, n = 1, p = me(), opts = {}) {
  const events = [];
  const medalsBefore = MEDALS.map((m) => medalTier(p, m).tier);
  const challengeBefore = dailyStatus(p);
  if (type in p.stats) p.stats[type] = Math.max(0, (p.stats[type] || 0) + n);
  const day = today();
  p.dayLog[day] ||= {};
  p.dayLog[day][type] = Math.max(0, (p.dayLog[day][type] || 0) + n);
  if (n > 0 && XP[type] && opts.xp !== false) grantXp(p, XP[type] * n, events);
  // medallas nuevas
  MEDALS.forEach((m, i) => {
    const t = medalTier(p, m).tier;
    if (t > medalsBefore[i] && t > (p.medals[m.key] ?? -1)) {
      p.medals[m.key] = t;
      events.push({ kind: 'medal', medal: m, tier: t });
      grantXp(p, 25 * (t + 1), events);
    }
  });
  // reto diario recién cumplido
  const ch = dailyStatus(p);
  if (!challengeBefore.available && !challengeBefore.done && ch.done && !ch.d.claimed && ch.seg.type) {
    events.push({ kind: 'challenge', seg: ch.seg });
  }
  save();
  if (events.length) listeners.forEach((fn) => fn(events));
  return events;
}
export function claimDaily(p = me()) {
  const st = dailyStatus(p);
  if (st.available || !st.done || st.d.claimed) return;
  const events = [];
  st.d.claimed = true;
  p.stats.challenges = (p.stats.challenges || 0) + 1;
  grantXp(p, st.seg.xp, events);
  save();
  track('challenges', 0, p); // revisa medallas
  if (events.length) listeners.forEach((fn) => fn(events));
}
export function applySpin(index, p = me()) {
  const seg = WHEEL[index];
  p.daily = { date: today(), id: seg.id, claimed: !seg.type };
  p.stats.spins = (p.stats.spins || 0) + 1;
  const events = [];
  if (seg.instant) grantXp(p, seg.instant, events);
  save();
  track('spins', 0, p);
  if (events.length) listeners.forEach((fn) => fn(events));
  return seg;
}
export function endSession(p = me()) {
  if (!p.running) return null;
  const s = { start: p.running, end: Date.now() };
  p.running = null;
  if (s.end - s.start > 30000) {
    p.sessions.push(s);
    save();
    track('playMin', Math.floor((s.end - s.start) / 6e4), p);
  } else save();
  return s;
}

// ---------------------------------------------------------------- utilidades de perfil
export function profileProgress(p) {
  let total = 0, done = 0;
  p.lists.forEach((l) => { total += l.items.length; done += l.items.filter((i) => i.done).length; });
  return { total, done, pins: p.pins.length, pinsDone: p.pins.filter((x) => x.done).length };
}
export function freshIds(p) {
  p.id = uid();
  p.lists.forEach((l) => { l.id = uid(); l.items.forEach((i) => (i.id = uid())); });
  const map = {};
  p.pins.forEach((x) => { const n = uid(); map[x.id] = n; x.id = n; });
  p.notes.forEach((x) => (x.id = uid()));
  (p.photos || []).forEach((f) => { f.pinId = map[f.pinId] || null; });
  (p.memories || []).forEach((m) => { m.pinId = map[m.pinId] || null; });
  p.navTarget = null;
  return p;
}
export function mergeInto(target, src) {
  let added = 0;
  (src.lists || []).forEach((sl) => {
    let tl = target.lists.find((l) => l.name.toLowerCase() === sl.name.toLowerCase());
    if (!tl) { tl = { id: uid(), name: sl.name, emoji: sl.emoji || '⭐', items: [] }; target.lists.push(tl); }
    const have = new Set(tl.items.map((i) => i.text.toLowerCase()));
    sl.items.forEach((i) => { if (!have.has(i.text.toLowerCase())) { tl.items.push({ id: uid(), text: i.text, note: i.note || '', done: false }); have.add(i.text.toLowerCase()); added++; } });
  });
  (src.pins || []).forEach((x) => {
    const dup = target.pins.some((y) => Math.abs(y.nx - x.nx) < 0.002 && Math.abs(y.ny - x.ny) < 0.002 && y.cat === x.cat);
    if (!dup) { target.pins.push({ nx: x.nx, ny: x.ny, cat: x.cat, title: x.title, note: x.note || '', id: uid(), done: false, createdAt: Date.now() }); added++; }
  });
  (src.notes || []).forEach((n) => { target.notes.push({ ...n, id: uid(), title: `${n.title || 'Nota'} (de ${src.name || 'otro perfil'})`, updatedAt: Date.now() }); added++; });
  return added;
}

// ---------------------------------------------------------------- distancia y rumbo en el mapa
export function geo(from, to, aspect = 1) {
  const km = state.settings.mapKm || 12;
  const dx = (to.nx - from.nx) * km;
  const dy = (to.ny - from.ny) * km * aspect; // ny crece hacia el norte
  const dist = Math.hypot(dx, dy);
  const ang = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = norte
  const dirs = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
  const dir = dirs[Math.round(((ang + 360) % 360) / 45) % 8];
  return { dist, dir, ang };
}
export function fmtKm(d) {
  if (d < 1) return `${Math.round((d * 1000) / 10) * 10} m`;
  return `${d.toFixed(1).replace('.', ',')} km`;
}
