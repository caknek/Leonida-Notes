// Leonida Notes — app compañera no oficial para GTA VI (uso personal/familiar)
import { App } from '@capacitor/app';
import { state, me, onReward } from './store.js';
import { closeSheet, sheetOpen, celebrate } from './ui.js';
import { go, route, current } from './router.js';
import { actions } from './actions.js';
import { isNative, speak } from './native.js';
import './views/home.js';
import { exitMode } from './views/map.js';
import './views/memories.js';
import './views/studio.js';
import './views/qr.js';
import './views/data.js';
import './views/progress.js';
import { setAccent, profileForm } from './views/settings.js';

const MAIN_TABS = ['home', 'map', 'ign', 'progress', 'data'];

Object.assign(actions, {
  'close-sheet': closeSheet,
  back: () => (history.length > 1 ? history.back() : go('home')),
  go: (el) => go(el.dataset.to),
  tab: (el) => (el.dataset.to === 'ign' && current.name === 'ign' ? actions.ign() : go(el.dataset.to)),
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

// XP, medallas, niveles y retos → celebración + voz
onReward((events) => {
  celebrate(events);
  const e = events.find((x) => x.kind === 'level') || events.find((x) => x.kind === 'medal') || events[0];
  if (e.kind === 'level') speak(`¡Subiste al nivel ${e.level}! Ahora eres ${e.title}.`);
  else if (e.kind === 'medal') speak(`Nueva medalla: ${e.medal.name}.`);
  else if (e.kind === 'challenge') speak('¡Reto diario cumplido! Reclama tu premio.');
});

window.addEventListener('hashchange', route);

if (isNative) {
  App.addListener('backButton', () => {
    if (document.querySelector('#celebrate.show')) return document.querySelector('#cel-ok')?.click();
    if (sheetOpen()) return closeSheet();
    if (exitMode()) return;
    if (current.name !== 'home') return MAIN_TABS.includes(current.name) ? go('home') : history.back();
    App.minimizeApp();
  });
  App.addListener('resume', () => { if (current.name === 'home' || current.name === 'daily') route(); });
}

setAccent();
route().then(() => {
  if (!state.settings.onboarded) profileForm(me().id, { first: true });
});
