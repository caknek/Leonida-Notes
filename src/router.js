// Enrutador por hash
import { $, closeSheet, renderTabs } from './ui.js';

export const views = {};
export const current = { name: 'home', arg: null };
let cleanup = null;
let seq = 0;

const TAB_OF = { list: 'progress', studio: 'home', editor: 'home', memories: 'home', qr: 'home', daily: 'home', notes: 'home', sessions: 'home', settings: '', family: 'data' };

export function go(path) {
  if (location.hash === `#/${path}`) route();
  else location.hash = `#/${path}`;
}
export async function route() {
  closeSheet();
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  const view = $('#view');
  view.className = '';
  const [name = 'home', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const key = views[name] ? name : 'home';
  current.name = key; current.arg = rest.join('/') || null;
  renderTabs(TAB_OF[key] ?? key);
  document.body.dataset.view = key;
  view.scrollTop = 0;
  const my = ++seq;
  const c = await views[key](current.arg);
  if (my !== seq) { if (typeof c === 'function') c(); return; } // se navegó a otra vista mientras cargaba
  cleanup = typeof c === 'function' ? c : null;
}
export const isCurrent = (name) => current.name === name;
