// Ajustes: perfiles, voz, enlaces, respaldo
import { state, me, save, uid, idb, newProfile, fixProfile, freshIds, mergeInto, levelInfo, playedMs, replaceState, resetState, PROFILE_COLORS, PROFILE_EMOJIS } from '../store.js';
import { $, $$, esc, icon, sheet, closeSheet, confirmSheet, toast, renderTop, fmtShortDur } from '../ui.js';
import { views, go, route } from '../router.js';
import { actions } from '../actions.js';
import { tap, speak, shareJson, openUrl } from '../native.js';

export const setAccent = () => document.documentElement.style.setProperty('--accent', me().color);

views.settings = () => {
  const p = me();
  const lv = levelInfo(p.xp);
  renderTop('Ajustes', { back: true });
  $('#view').innerHTML = `
    <div class="card row tap" data-act="profiles">
      <div class="player-av sm" style="--pc:${p.color}">${esc(p.emoji)}</div>
      <div class="grow"><h3>${esc(p.name)}</h3><div class="muted small">Nivel ${lv.level} · ${state.profiles.length} perfil(es) · toca para cambiar</div></div>
      <span class="faint">›</span>
    </div>
    <div class="section-title"><span class="orn">Guía de voz</span></div>
    <div class="menu">
      <div class="stat-row"><span class="mi">${icon('speaker', 20)}</span><span class="grow">Voz activada</span><button class="switch ${state.settings.voice ? 'on' : ''}" id="st-voice"></button></div>
      <div class="stat-row"><span class="mi">🐢</span><span class="grow">Velocidad</span><input type="range" id="st-rate" min="0.6" max="1.6" step="0.1" value="${state.settings.voiceRate}" style="width:130px" /></div>
      <button data-act="voice-test"><span class="mi">▶</span><span class="grow">Probar voz</span></button>
    </div>
    <div class="section-title"><span class="orn">Juego</span></div>
    <div class="menu">
      <button data-act="go" data-to="sessions"><span class="mi">${icon('clock', 20)}</span><span class="grow">Historial de sesiones</span><span class="chev">›</span></button>
      <button data-act="links"><span class="mi">${icon('ign', 20)}</span><span class="grow">Accesos rápidos</span><span class="chev">›</span></button>
      <button data-act="tab" data-to="map"><span class="mi">${icon('image', 20)}</span><span class="grow">Imagen y escala del mapa<div class="small muted">En Navegación → botón de imagen</div></span><span class="chev">›</span></button>
    </div>
    <div class="section-title"><span class="orn">Familia y respaldo</span></div>
    <div class="menu">
      <button data-act="go" data-to="qr"><span class="mi">${icon('qr', 20)}</span><span class="grow">Compartir por QR<div class="small muted">Lugares, listas o tu perfil</div></span><span class="chev">›</span></button>
      <button data-act="export-profile"><span class="mi">📤</span><span class="grow">Enviar mi perfil como archivo<div class="small muted">Por WhatsApp o Drive</div></span><span class="chev">›</span></button>
      <button data-act="export-all"><span class="mi">💾</span><span class="grow">Respaldo completo<div class="small muted">Todos los perfiles, fotos y memorias opcionales</div></span><span class="chev">›</span></button>
      <button data-act="import"><span class="mi">📥</span><span class="grow">Importar archivo</span><span class="chev">›</span></button>
    </div>
    <div class="section-title"><span class="orn">Zona peligrosa</span></div>
    <div class="menu">
      <button data-act="reset-profile"><span class="mi">♻️</span><span class="grow">Reiniciar progreso de ${esc(p.name)}</span></button>
      <button data-act="wipe"><span class="mi">🧨</span><span class="grow danger-text">Borrar todos los datos</span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden />
    <p class="disclaimer">Leonida Notes v2 · App de fans para uso personal y familiar.<br/>GTA VI y Leonida son marcas de Rockstar Games / Take-Two. El mapa interactivo pertenece a IGN y se muestra desde su sitio. Inspirada en el concepto de apps compañeras; sin relación con Nintendo.</p>`;
  $('#st-voice').onclick = (e) => { state.settings.voice = !state.settings.voice; save(); e.currentTarget.classList.toggle('on', state.settings.voice); };
  $('#st-rate').onchange = (e) => { state.settings.voiceRate = +e.target.value; save(); speak('Así sonará la guía', true); };
};
actions['voice-test'] = () => speak('Hola. Soy tu guía de Leonida. Te diré cuánto falta y hacia dónde ir.', true);

// ---------------------------------------------------------------- perfiles
actions.profiles = () => {
  sheet(`<h2>Perfiles</h2>
    <p class="muted small" style="margin-top:-8px">Cada integrante de la familia lleva su propio progreso, nivel y medallas.</p>
    <div class="menu">${state.profiles.map((p) => {
      const lv = levelInfo(p.xp);
      return `<button data-pid="${p.id}"><span class="player-av xs" style="--pc:${p.color}">${esc(p.emoji)}</span><span class="grow">${esc(p.name)}<div class="small muted">Nv ${lv.level} · ${fmtShortDur(playedMs(p))}</div></span>${p.id === state.active ? '<span class="tag ok">Activo</span>' : ''}<span class="chev" data-edit="${p.id}">✏️</span></button>`;
    }).join('')}</div>
    <button class="btn primary block" id="pf-new">＋ Agregar perfil</button>`, (s) => {
    s.querySelector('.menu').onclick = (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) return profileForm(ed.dataset.edit);
      const b = e.target.closest('[data-pid]'); if (!b) return;
      state.active = b.dataset.pid; save(); setAccent(); closeSheet(); tap(); route();
      toast(`Perfil: ${me().name}`);
    };
    $('#pf-new', s).onclick = () => profileForm();
  });
};
export function profileForm(id, { first = false } = {}) {
  const p = state.profiles.find((x) => x.id === id);
  let emoji = p?.emoji || PROFILE_EMOJIS[state.profiles.length % PROFILE_EMOJIS.length];
  let color = p?.color || PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length];
  sheet(`${first ? '<div class="center welcome-ico">🌴</div><h2 class="center">Bienvenido a Leonida Notes</h2><p class="muted center" style="margin-top:-8px">Tu cuaderno de viaje: navegación con voz, medallas, bono diario, fotos y memorias. ¿Cómo te llamas?</p>' : `<h2>${p ? 'Editar perfil' : 'Nuevo perfil'}</h2>`}
    <label class="field"><span>Nombre</span><input class="input" id="pr-name" value="${esc(p && !first ? p.name : '')}" placeholder="Ej. Miguel" /></label>
    <label class="field"><span>Avatar</span></label><div class="emoji-pick" id="pr-emo">${PROFILE_EMOJIS.map((e) => `<button class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
    <label class="field" style="margin-top:14px"><span>Color</span></label><div class="swatches" id="pr-col">${PROFILE_COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" style="background:${c}" data-c="${c}"></button>`).join('')}</div>
    <div class="actions" style="margin-top:18px">${p && !first && state.profiles.length > 1 ? '<button class="btn danger" id="pr-del">🗑</button>' : ''}${first ? '' : '<button class="btn ghost" data-act="close-sheet">Cancelar</button>'}<button class="btn primary" id="pr-save">${first ? 'Empezar' : 'Guardar'}</button></div>`, (s) => {
    $('#pr-emo', s).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; emoji = b.textContent; $$('#pr-emo button', s).forEach((x) => x.classList.toggle('on', x === b)); };
    $('#pr-col', s).onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; $$('.swatch', s).forEach((x) => x.classList.toggle('on', x === b)); };
    $('#pr-save', s).onclick = () => {
      const name = $('#pr-name', s).value.trim() || (p?.name ?? `Jugador ${state.profiles.length + 1}`);
      if (p) Object.assign(p, { name, emoji, color });
      else { const np = newProfile(name, emoji, color); state.profiles.push(np); state.active = np.id; }
      if (first) state.settings.onboarded = true;
      save(); setAccent(); closeSheet(); route();
      if (first) speak(`Bienvenido, ${name}. Empieza girando tu bono diario.`);
    };
    if (p && $('#pr-del', s)) $('#pr-del', s).onclick = () => confirmSheet(`¿Borrar a ${p.name}?`, 'Se pierden sus pines, listas, notas, fotos, memorias y medallas.', 'Borrar perfil', () => {
      state.profiles = state.profiles.filter((x) => x.id !== p.id);
      if (state.active === p.id) state.active = state.profiles[0].id;
      save(); setAccent(); route();
    });
  });
}

actions.links = () => {
  const draw = () => state.links.map((l) => `<div class="item"><div class="txt"><div class="truncate">${esc(l.name)}</div><div class="note truncate">${esc(l.url)}</div></div><button class="icon-btn" data-del="${l.id}">✕</button></div>`).join('');
  sheet(`<h2>Accesos rápidos</h2>
    <div id="lk-list">${draw()}</div>
    <label class="field" style="margin-top:12px"><span>Nombre</span><input class="input" id="lk-name" placeholder="Ej. Guía de coleccionables" /></label>
    <label class="field"><span>Dirección (URL)</span><input class="input" id="lk-url" type="url" placeholder="https://…" /></label>
    <button class="btn primary block" id="lk-add">＋ Agregar enlace</button>`, (s) => {
    $('#lk-list', s).onclick = (e) => { const b = e.target.closest('[data-del]'); if (!b) return; state.links = state.links.filter((x) => x.id !== b.dataset.del); save(); $('#lk-list', s).innerHTML = draw(); };
    $('#lk-add', s).onclick = () => {
      let url = $('#lk-url', s).value.trim(); const name = $('#lk-name', s).value.trim();
      if (!url) return toast('Falta la URL');
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      state.links.push({ id: uid(), name: name || url, url }); save();
      $('#lk-list', s).innerHTML = draw(); $('#lk-url', s).value = ''; $('#lk-name', s).value = '';
    };
  });
};
actions['open-link'] = (el) => openUrl(el.dataset.url);

// ---------------------------------------------------------------- respaldo
const blobToDataURL = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
const dataURLToBlob = async (u) => (await fetch(u)).blob();
const stamp = () => new Date().toISOString().slice(0, 10);

async function collectMedia(profiles) {
  const media = {};
  for (const p of profiles) {
    for (const f of p.photos) { const b = await idb.get('photo:' + f.id); if (b) media['photo:' + f.id] = await blobToDataURL(b); }
    for (const m of p.memories) if (m.kind === 'audio') { const b = await idb.get('audio:' + m.id); if (b) media['audio:' + m.id] = await blobToDataURL(b); }
  }
  return media;
}
async function restoreMedia(media = {}) {
  for (const [k, v] of Object.entries(media)) await idb.set(k, await dataURLToBlob(v));
}

function exportSheet(kind) {
  sheet(`<h2>${kind === 'all' ? 'Respaldo completo' : `Enviar perfil de ${esc(me().name)}`}</h2>
    <p class="muted">${kind === 'all' ? 'Guarda este archivo en Drive o WhatsApp. Para restaurar: Ajustes → Importar archivo.' : 'Quien lo importe podrá agregarlo como perfil nuevo o sumar tus pines y listas a los suyos.'}</p>
    <div class="toggle card" style="padding:12px 16px"><span>Incluir imagen del mapa</span><button class="switch" id="ex-img"></button></div>
    <div class="toggle card" style="padding:12px 16px"><span>Incluir fotos y audios<div class="small muted">El archivo puede pesar bastante</div></span><button class="switch" id="ex-media"></button></div>
    <button class="btn primary block" id="ex-go">📤 Exportar</button>`, (s) => {
    let withImg = false, withMedia = false;
    $('#ex-img', s).onclick = (e) => { withImg = !withImg; e.currentTarget.classList.toggle('on', withImg); };
    $('#ex-media', s).onclick = (e) => { withMedia = !withMedia; e.currentTarget.classList.toggle('on', withMedia); };
    $('#ex-go', s).onclick = async () => {
      try {
        $('#ex-go', s).disabled = true; $('#ex-go', s).textContent = 'Preparando…';
        const img = withImg ? await idb.get('mapImage') : null;
        const mapImage = img ? await blobToDataURL(img) : undefined;
        const profiles = kind === 'all' ? state.profiles : [me()];
        const media = withMedia ? await collectMedia(profiles) : undefined;
        const obj = kind === 'all'
          ? { app: 'leonida-notes', type: 'full', exportedAt: Date.now(), state, mapImage, media }
          : { app: 'leonida-notes', type: 'profile', exportedAt: Date.now(), profile: { ...me(), running: null }, mapImage, media };
        const name = kind === 'all' ? `leonida-respaldo-${stamp()}.json` : `leonida-perfil-${me().name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${stamp()}.json`;
        closeSheet();
        await shareJson(obj, name);
      } catch (err) { console.error(err); toast('No se pudo exportar'); }
    };
  });
}
actions['export-profile'] = () => exportSheet('profile');
actions['export-all'] = () => exportSheet('all');

function handleImport(file) {
  const fr = new FileReader();
  fr.onload = async () => {
    let data;
    try { data = JSON.parse(fr.result); } catch { return toast('Archivo inválido'); }
    if (!['leonida-notes', 'leonida-companion'].includes(data?.app)) return toast('No es un archivo de Leonida Notes');
    const applyImg = async () => { if (data.mapImage) await idb.set('mapImage', await dataURLToBlob(data.mapImage)); };
    if (data.type === 'full') {
      confirmSheet('¿Restaurar respaldo?', `Reemplaza todo lo de este teléfono con el respaldo del ${new Date(data.exportedAt).toLocaleDateString('es')}.`, 'Restaurar', async () => {
        replaceState(data.state); await applyImg(); await restoreMedia(data.media); setAccent(); go('home'); toast('Respaldo restaurado');
      });
    } else if (data.type === 'profile') {
      const src = fixProfile(structuredClone(data.profile));
      sheet(`<h2>Perfil de ${esc(src.name)}</h2>
        <p class="muted">${src.pins.length} pines · ${src.lists.reduce((a, l) => a + l.items.length, 0)} objetivos · ${src.notes.length} notas</p>
        <button class="btn primary block" id="im-new">＋ Agregar como perfil nuevo</button><div style="height:10px"></div>
        <button class="btn block" id="im-merge">⇄ Sumar a ${esc(me().name)}</button>
        <p class="kbd-hint">Sumar agrega los objetivos y pines que no tengas (sin marcarlos como hechos).</p>
        ${data.mapImage ? '<div class="toggle card" style="padding:12px 16px;margin-top:12px"><span>Usar también su imagen de mapa</span><button class="switch on" id="im-img"></button></div>' : ''}`, (s) => {
        let useImg = !!data.mapImage;
        $('#im-img', s) && ($('#im-img', s).onclick = (e) => { useImg = !useImg; e.currentTarget.classList.toggle('on', useImg); });
        $('#im-new', s).onclick = async () => {
          const p = src; p.running = null;
          freshIds(p);
          if (state.profiles.some((x) => x.name === p.name)) p.name += ' (importado)';
          state.profiles.push(p); state.active = p.id; save();
          if (useImg) await applyImg();
          await restoreMedia(data.media);
          closeSheet(); setAccent(); go('home'); toast(`Perfil ${p.name} agregado`);
        };
        $('#im-merge', s).onclick = async () => {
          const n = mergeInto(me(), src); save();
          if (useImg) await applyImg();
          closeSheet(); route(); toast(`${n} elementos agregados`);
        };
      });
    } else toast('Formato desconocido');
  };
  fr.readAsText(file);
}
actions.import = () => { const f = $('#import-file'); f.value = ''; f.onchange = () => f.files[0] && handleImport(f.files[0]); f.click(); };

actions['reset-profile'] = () => confirmSheet(`¿Reiniciar a ${me().name}?`, 'Se desmarcan objetivos y pines y se borran sesiones, XP, medallas y retos. Las listas, pines, notas, fotos y memorias se conservan.', 'Reiniciar', () => {
  const p = me();
  p.lists.forEach((l) => l.items.forEach((i) => { i.done = false; i.xp = false; }));
  p.pins.forEach((x) => { x.done = false; x.xp = false; });
  Object.assign(p, { sessions: [], running: null, xp: 0, medals: {}, dayLog: {}, daily: null });
  p.stats = fixProfile({}).stats;
  save(); toast('Progreso reiniciado'); route();
});
actions.wipe = () => confirmSheet('¿Borrar TODO?', 'Perfiles, pines, listas, notas, fotos, memorias, medallas e imagen del mapa. No se puede deshacer: exporta un respaldo antes.', 'Borrar todo', async () => {
  resetState(); await idb.clear(); setAccent(); go('home'); toast('Datos borrados');
});
