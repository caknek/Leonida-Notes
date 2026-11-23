// Checklists de progreso
import { state, me, save, uid, profileProgress, track, LIST_EMOJIS } from '../store.js';
import { $, $$, esc, pct, icon, sheet, closeSheet, confirmSheet, toast, renderTop, fmtDate } from '../ui.js';
import { views, go, route } from '../router.js';
import { actions } from '../actions.js';
import { tap, ImpactStyle, shareText } from '../native.js';
import { listCard } from './home.js';

views.progress = () => {
  const p = me();
  renderTop('Progreso', { sub: 'Tus checklists' });
  const st = profileProgress(p);
  $('#view').innerHTML = `
    <div class="card row">
      <div class="ring" style="--p:${pct(st.done, st.total)}" data-label="${pct(st.done, st.total)}%"></div>
      <div class="grow"><h3>${st.done} de ${st.total} objetivos</h3><div class="muted small">${p.lists.length} listas · pega listas desde cualquier guía</div></div>
    </div>
    ${p.lists.map(listCard).join('')}
    <div class="row" style="gap:10px"><button class="btn block ghost" data-act="new-list">＋ Nueva lista</button><button class="btn block ghost" data-act="go" data-to="qr/scan">${icon('qr', 18)} Recibir</button></div>`;
};

views.list = (id) => {
  const p = me();
  const list = p.lists.find((l) => l.id === id);
  if (!list) return go('progress');
  let q = '';
  renderTop(list.name, { back: true, extra: `<button class="icon-btn" data-act="list-menu" data-id="${list.id}">⋯</button>` });
  const draw = () => {
    const d = list.items.filter((i) => i.done).length;
    const items = list.items.filter((i) => (!state.settings.hideDone || !i.done) && (!q || (i.text + ' ' + (i.note || '')).toLowerCase().includes(q)));
    $('#li-head').innerHTML = `<div class="row between"><span class="muted small">${d} de ${list.items.length} completados</span><span class="small" style="font-weight:700">${pct(d, list.items.length)}%</span></div><div class="bar" style="margin:8px 0 14px"><i style="width:${pct(d, list.items.length)}%"></i></div>`;
    $('#li-items').innerHTML = items.length ? items.map((i) => `
      <div class="item ${i.done ? 'done' : ''}">
        <button class="check ${i.done ? 'on' : ''}" data-act="check" data-list="${list.id}" data-id="${i.id}">${i.done ? '✓' : ''}</button>
        <div class="txt" data-act="edit-item" data-list="${list.id}" data-id="${i.id}"><div>${esc(i.text)}</div>${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}</div>
      </div>`).join('') : list.items.length
      ? '<div class="empty"><div class="big">🎉</div>Nada que mostrar con estos filtros</div>'
      : `<div class="empty"><div class="big">${esc(list.emoji)}</div><h3>Lista vacía</h3>Agrega objetivos uno a uno o pega una lista completa desde una guía.<div style="height:14px"></div><button class="btn primary" data-act="bulk" data-id="${list.id}">📋 Pegar lista</button></div>`;
  };
  $('#view').innerHTML = `
    <div id="li-head"></div>
    <div class="search"><span>🔍</span><input id="li-q" placeholder="Buscar en la lista…" /></div>
    <div class="chips"><button class="chip ${state.settings.hideDone ? 'on' : ''}" data-act="toggle-hide">✓ ${state.settings.hideDone ? 'Completados ocultos' : 'Mostrar completados'}</button>
      <button class="chip" data-act="bulk" data-id="${list.id}">📋 Pegar varios</button></div>
    <div id="li-items"></div>
    <form id="li-add" class="search" style="margin-top:6px"><input id="li-new" placeholder="Agregar objetivo…" enterkeyhint="done" /><button class="btn sm primary" type="submit">＋</button></form>`;
  $('#li-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  $('#li-add').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#li-new').value.trim(); if (!v) return;
    list.items.push({ id: uid(), text: v, done: false }); list.touched = Date.now();
    save(); $('#li-new').value = ''; draw();
  };
  views.list.redraw = draw;
  draw();
};

actions.check = (el) => {
  const list = me().lists.find((l) => l.id === el.dataset.list);
  const it = list.items.find((i) => i.id === el.dataset.id);
  it.done = !it.done; it.doneAt = it.done ? Date.now() : null; list.touched = Date.now();
  save();
  tap(it.done ? ImpactStyle.Medium : ImpactStyle.Light);
  views.list.redraw?.();
  track('objectives', it.done ? 1 : -1, me(), { xp: it.done && !it.xp });
  if (it.done) { it.xp = true; save(); }
  if (it.done && list.items.every((i) => i.done)) toast(`🏆 ¡${list.name} al 100%!`);
};

actions['new-list'] = (el, existing) => {
  let emoji = existing?.emoji || '⭐';
  sheet(`<h2>${existing ? 'Editar lista' : 'Nueva lista'}</h2>
    <label class="field"><span>Nombre</span><input class="input" id="nl-name" value="${esc(existing?.name || '')}" placeholder="Ej. Barcos" /></label>
    <label class="field"><span>Ícono</span></label><div class="emoji-pick" id="nl-emo">${LIST_EMOJIS.map((e) => `<button class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div class="actions" style="margin-top:18px"><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="nl-save">Guardar</button></div>`, (s) => {
    $('#nl-emo', s).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; emoji = b.textContent; $$('#nl-emo button', s).forEach((x) => x.classList.toggle('on', x === b)); };
    $('#nl-save', s).onclick = () => {
      const name = $('#nl-name', s).value.trim(); if (!name) return toast('Ponle un nombre');
      if (existing) Object.assign(existing, { name, emoji });
      else { const l = { id: uid(), name, emoji, items: [] }; me().lists.push(l); save(); closeSheet(); return go(`list/${l.id}`); }
      save(); closeSheet(); route();
    };
  });
};
actions['list-menu'] = (el) => {
  const id = el.dataset.id;
  const list = me().lists.find((l) => l.id === id);
  sheet(`<h2>${esc(list.emoji)} ${esc(list.name)}</h2>
    <div class="menu">
      <button id="lm-qr"><span class="mi">${icon('qr', 20)}</span><span class="grow">Compartir por QR</span></button>
      <button id="lm-share"><span class="mi">💬</span><span class="grow">Compartir como texto</span></button>
      <button id="lm-bulk"><span class="mi">📋</span><span class="grow">Pegar varios objetivos</span></button>
      <button id="lm-edit"><span class="mi">✏️</span><span class="grow">Renombrar / ícono</span></button>
      <button id="lm-uncheck"><span class="mi">↺</span><span class="grow">Desmarcar todo</span></button>
      <button id="lm-del"><span class="mi">🗑</span><span class="grow danger-text">Borrar lista</span></button>
    </div>`, (s) => {
    $('#lm-qr', s).onclick = () => { closeSheet(); go('qr'); };
    $('#lm-share', s).onclick = async () => {
      const d = list.items.filter((i) => i.done).length;
      const text = `${list.emoji} ${list.name} — ${d}/${list.items.length}\n\n` + list.items.map((i) => `${i.done ? '✅' : '⬜'} ${i.text}`).join('\n');
      closeSheet();
      if ((await shareText(list.name, text)) === 'copied') toast('Copiado');
    };
    $('#lm-bulk', s).onclick = () => actions.bulk({ dataset: { id } });
    $('#lm-edit', s).onclick = () => actions['new-list'](null, list);
    $('#lm-uncheck', s).onclick = () => confirmSheet('¿Desmarcar todo?', 'Los objetivos se mantienen, solo se quita el ✓.', 'Desmarcar', () => { list.items.forEach((i) => (i.done = false)); save(); route(); });
    $('#lm-del', s).onclick = () => confirmSheet('¿Borrar lista?', `${list.name} y sus ${list.items.length} objetivos.`, 'Borrar', () => { me().lists = me().lists.filter((l) => l.id !== id); save(); go('progress'); });
  });
};
actions.bulk = (el) => {
  const list = me().lists.find((l) => l.id === el.dataset.id);
  sheet(`<h2>Pegar lista</h2>
    <p class="muted small" style="margin-top:-8px">Un objetivo por línea. Se ignoran viñetas, números y casillas al inicio. Usa “ — ” para agregar una nota: <i>Pistola dorada — en el muelle</i></p>
    <textarea class="input" id="bk-text" style="min-height:220px" placeholder="Misión 1&#10;Misión 2&#10;…"></textarea>
    <div class="actions"><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="bk-save">Agregar</button></div>`, (s) => {
    $('#bk-save', s).onclick = () => {
      const lines = $('#bk-text', s).value.split('\n').map((l) => l.replace(/^\s*([-*•·▪◦]|\d+[.)]|\[[ xX✓]?\]|[⬜✅☐☑✔]+️?)\s*/u, '').trim()).filter(Boolean);
      const existing = new Set(list.items.map((i) => i.text.toLowerCase()));
      let n = 0;
      lines.forEach((l) => {
        const [text, ...rest] = l.split(/\s+[—–]\s+/);
        if (existing.has(text.toLowerCase())) return;
        existing.add(text.toLowerCase());
        list.items.push({ id: uid(), text, note: rest.join(' — '), done: false }); n++;
      });
      list.touched = Date.now();
      save(); closeSheet(); route(); toast(`${n} objetivos agregados`);
    };
    setTimeout(() => $('#bk-text', s)?.focus(), 250);
  });
};
actions['edit-item'] = (el) => {
  const list = me().lists.find((l) => l.id === el.dataset.list);
  const it = list.items.find((i) => i.id === el.dataset.id);
  sheet(`<h2>Objetivo</h2>
    <label class="field"><span>Nombre</span><input class="input" id="it-text" value="${esc(it.text)}" /></label>
    <label class="field"><span>Nota</span><textarea class="input" id="it-note" style="min-height:90px">${esc(it.note || '')}</textarea></label>
    ${it.doneAt && it.done ? `<p class="small faint">Completado ${fmtDate(it.doneAt)}</p>` : ''}
    <div class="actions"><button class="btn danger" id="it-del">🗑</button><button class="btn ghost" data-act="close-sheet">Cancelar</button><button class="btn primary" id="it-save">Guardar</button></div>`, (s) => {
    $('#it-save', s).onclick = () => { it.text = $('#it-text', s).value.trim() || it.text; it.note = $('#it-note', s).value.trim(); save(); closeSheet(); views.list.redraw?.(); };
    $('#it-del', s).onclick = () => { list.items = list.items.filter((i) => i.id !== it.id); save(); closeSheet(); views.list.redraw?.(); toast('Objetivo borrado'); };
  });
};
