/* Grade do horário, bandeja de cartões não colocados e arrastar-e-soltar. */
'use strict';

const Grid = {
  drag: null,
  badCards: new Set(), // cartões envolvidos em erros (choques, posição inadequada)

  lessonMap() { return new Map(Store.data.lessons.map(l => [l.id, l])); },

  /* O cartão aparece na linha desta entidade? */
  involves(card, lesson, view, id) {
    if (view === 'classes') return lesson.classIds.indexOf(id) >= 0;
    if (view === 'teachers') return lesson.teacherIds.indexOf(id) >= 0;
    return card.roomId === id;
  },

  /* Linhas de texto de um cartão conforme a visão (usado na tela e no PDF). */
  cardLines(card, lesson, view, big) {
    const D = Store.data;
    const subj = Core.find(D.subjects, lesson.subjectId), room = Core.find(D.rooms, card.roomId);
    const sName = subj ? subj.name : '?', sAbbr = subj ? subj.abbr || subj.name : '?';
    const tShort = lesson.teacherIds.length ? Fmt.teachers(lesson, true) : '', cShort = lesson.classIds.length ? Fmt.classes(lesson, true) : '';
    const rShort = room ? room.abbr || room.name : '';
    let lines;
    if (view === 'tray') lines = [sAbbr, cShort || tShort];
    else if (big) lines = view === 'classes' ? [sName, Fmt.teachers(lesson), rShort] : view === 'teachers' ? [sName, cShort, rShort] : [sName, cShort, tShort];
    else lines = view === 'classes' ? [sAbbr, tShort] : view === 'teachers' ? [cShort || sAbbr, sAbbr] : [cShort || sAbbr, sAbbr];
    return lines.filter((t, i) => t || i === 0);
  },

  /* Faixa (lane) de um cartão quando vários dividem a mesma célula: grupos de uma divisão ou sala compartilhada. */
  lane(c, lesson, view, ent, items) {
    const gid = view === 'classes' && lesson.groups ? lesson.groups[ent.id] : null;
    const dv = gid && (ent.divisions || []).find(x => x.groups.some(g => g.id === gid));
    if (dv) return { k: dv.groups.length, lane: dv.groups.findIndex(g => g.id === gid) };
    const overlap = (a, b) => a.period < b.period + b.duration && b.period < a.period + a.duration;
    const cluster = items.filter(o => o === c || overlap(o, c)).sort((a, b) => (a.id < b.id ? -1 : 1));
    return cluster.length > 1 ? { k: cluster.length, lane: cluster.indexOf(c) } : { k: 1, lane: 0 };
  },

  cardEl(card, lesson, view, big) {
    const D = Store.data;
    const subj = Core.find(D.subjects, lesson.subjectId), room = Core.find(D.rooms, card.roomId);
    const bg = Fmt.color(lesson);
    const sName = subj ? subj.name : '?';
    const lines = Grid.cardLines(card, lesson, view, big);
    const el = h('div', {
      class: 'card' + (card.locked ? ' locked' : '') + (Store.ui.selected === card.id ? ' selected' : '') + (Grid.badCards.has(card.id) ? ' conflict' : ''),
      style: 'background:' + bg + ';color:' + UI.textColor(bg),
      title: sName + '\nProfessor: ' + Fmt.teachers(lesson) + '\nTurma: ' + Fmt.classes(lesson) + (room ? '\nSala: ' + room.name : '') +
        (card.day != null ? '\n' + Core.slotLabel(D.school, card.day, card.period) : '') + (card.locked ? '\n🔒 travado' : '')
    }, lines.map((t, i) => h('span', { class: i ? 'l2' : 'l1' }, t)), card.locked ? h('i', { class: 'lock' }, '🔒') : null);
    el.dataset.card = card.id;
    return el;
  },

  /* opts: {view, entity ('all' ou id), interactive} */
  render(host, opts) {
    const D = Store.data, sch = D.school, days = Core.dayList(sch), periods = Core.periodList(sch), NP = periods.length, p0 = periods[0];
    const view = opts.view, list = D[view];
    const single = opts.entity !== 'all' ? Core.find(list, opts.entity) : null;
    const lessons = Grid.lessonMap();
    if (opts.interactive) Grid.endDrag();
    host.textContent = '';
    if (!list.length) {
      host.appendChild(h('div', { class: 'empty big' }, 'Nenhum registro em "' + TYPES[view].title + '" ainda.',
        opts.interactive ? h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: () => App.wizard() }, '🎩 Abrir o assistente'),
          h('button', { class: 'btn', onclick: () => App.sample() }, 'Carregar escola de exemplo')) : null));
      return;
    }
    const rows = single ? days.map(d => ({ ent: single, label: d.name, days: [d] })) : list.map(e => ({ ent: e, label: e.abbr || e.name, title: e.name, days: days }));
    const ncols = single ? NP : days.length * NP;
    const head = single ? 1 : 2;
    const grid = h('div', { class: 'tt ' + (single ? 'single' : 'summary') + (opts.interactive ? '' : ' static') });
    grid.style.gridTemplateColumns = opts.interactive ? 'var(--lw) repeat(' + ncols + ', var(--cw))' : 'minmax(54px, auto) repeat(' + ncols + ', minmax(0, 1fr))';
    grid.style.gridTemplateRows = 'repeat(' + head + ', auto) repeat(' + rows.length + ', var(--ch))';
    const at = (el, row, col, span, rowSpan) => { el.style.gridRow = row + (rowSpan ? ' / span ' + rowSpan : ''); el.style.gridColumn = col + (span ? ' / span ' + span : ''); grid.appendChild(el); return el; };

    at(h('div', { class: 'th corner' }, single ? single.name : ''), 1, 1, 0, head);
    if (single) {
      periods.forEach((p, i) => at(h('div', { class: 'th' }, h('b', null, String(p)), sch.bells[p] ? h('small', null, sch.bells[p]) : null), 1, 2 + i));
    } else {
      days.forEach((d, di) => {
        at(h('div', { class: 'th day' }, d.name.toUpperCase()), 1, 2 + di * NP, NP);
        periods.forEach((p, i) => at(h('div', { class: 'th per' + (i === 0 ? ' dstart' : '') }, String(p)), 2, 2 + di * NP + i));
      });
    }

    const byEnt = new Map();
    D.cards.forEach(c => {
      if (c.day == null) return;
      const l = lessons.get(c.lessonId);
      const ids = view === 'classes' ? l.classIds : view === 'teachers' ? l.teacherIds : (c.roomId ? [c.roomId] : []);
      ids.forEach(id => { if (!byEnt.has(id)) byEnt.set(id, []); byEnt.get(id).push(c); });
    });
    const selCard = Store.ui.selected && Core.find(D.cards, Store.ui.selected);

    rows.forEach((r, ri) => {
      const row = head + 1 + ri;
      at(h('div', { class: 'th rowh', title: r.title || '' }, r.label), row, 1);
      r.days.forEach((d, dpos) => {
        periods.forEach((p, i) => {
          const cell = h('div', { class: 'cell' + (i === 0 ? ' dstart' : '') + ((r.ent.timeOff || {})[d.index + '-' + p] === 2 ? ' off' : '') });
          cell.dataset.ent = r.ent.id; cell.dataset.day = d.index; cell.dataset.period = p;
          at(cell, row, 2 + dpos * NP + i);
        });
        const items = (byEnt.get(r.ent.id) || []).filter(c => c.day === d.index);
        items.forEach(c => {
          const l = lessons.get(c.lessonId);
          const ln = Grid.lane(c, l, view, r.ent, items), k = ln.k, lane = ln.lane;
          const el = Grid.cardEl(c, l, view, !!single);
          if (k > 1) { el.style.height = 'calc(100% / ' + k + ')'; el.style.transform = 'translateY(' + lane * 100 + '%)'; el.classList.add('split'); }
          if (selCard && selCard.lessonId === c.lessonId) el.classList.add('same');
          if (opts.interactive) Grid.bindCard(el, c);
          at(el, row, 2 + dpos * NP + (c.period - p0), c.duration);
        });
      });
    });

    if (opts.interactive) {
      grid.addEventListener('dragover', e => {
        const cell = e.target.closest('.cell');
        if (cell && !cell.classList.contains('drop-no') && Grid.drag) e.preventDefault();
      });
      grid.addEventListener('drop', e => { const cell = e.target.closest('.cell'); if (cell) { e.preventDefault(); Grid.drop(cell); } });
      grid.addEventListener('click', e => { if (!e.target.closest('.card') && Store.ui.selected) { Store.ui.selected = null; Store.saveUi(); } });
    }
    host.appendChild(grid);
  },

  bindCard(el, card) {
    el.draggable = !card.locked;
    el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; Grid.beginDrag(card.id); });
    el.addEventListener('dragend', () => Grid.endDrag());
    el.addEventListener('click', e => { e.stopPropagation(); Store.ui.selected = Store.ui.selected === card.id ? null : card.id; Store.saveUi(); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); Grid.cardMenu(card, e.clientX, e.clientY); });
    el.addEventListener('dblclick', async () => { const l = Core.find(Store.data.lessons, card.lessonId); if (l && await Dialogs.lesson(l)) Store.commit(); });
  },

  beginDrag(cardId) {
    const M = Solver.buildModel(Store.data, {});
    M.loadAll();
    const m = M.cards.find(x => x.id === cardId);
    Grid.drag = { M: M, m: m };
    const view = Store.ui.view;
    // adiado: mudar o DOM dentro do dragstart cancela o arrasto em alguns navegadores
    setTimeout(() => {
      if (!Grid.drag) return;
      document.body.classList.add('dragging');
      document.querySelectorAll('#grid .cell').forEach(cell => {
        const ent = cell.dataset.ent;
        const ok = view === 'classes' ? m.lesson.classIds.indexOf(ent) >= 0 : view === 'teachers' ? m.lesson.teacherIds.indexOf(ent) >= 0 : m.rooms.some(r => r.id === ent);
        const info = ok ? M.inspect(m, +cell.dataset.day, +cell.dataset.period, view === 'rooms' ? ent : null) : null;
        // verde: livre; amarelo: choca com outros cartões; vermelho: desobedece tempo livre / cartão travado
        cell.classList.add(!info || !info.inRange ? 'drop-no' : info.inadequate || info.locked ? 'drop-bad' : info.cards.length ? 'drop-eject' : info.reasons.length ? 'drop-warn' : 'drop-ok');
        if (info && info.reasons.length) cell.title = info.reasons.join('\n');
      });
    }, 0);
  },

  endDrag() {
    Grid.drag = null;
    document.body.classList.remove('dragging');
    document.querySelectorAll('#grid .cell').forEach(c => { c.classList.remove('drop-no', 'drop-ok', 'drop-eject', 'drop-bad', 'drop-warn'); c.removeAttribute('title'); });
  },

  /* Escolha manual: valida a posição e, se ela desobedece alguma restrição, explica e deixa o usuário decidir. */
  drop(cell) {
    if (!Grid.drag) return;
    const D = Store.data, M = Grid.drag.M, m = Grid.drag.m, day = +cell.dataset.day, period = +cell.dataset.period;
    const info = M.inspect(m, day, period, Store.ui.view === 'rooms' ? cell.dataset.ent : null);
    Grid.endDrag();
    if (!info.inRange) { UI.toast('A aula não cabe nessa posição.', 'bad'); return; }
    const softBefore = new Set(Solver.verify(D).filter(i => i.level === 'warn').map(i => i.text));
    const apply = eject => {
      if (eject) info.cards.forEach(j => { const c = M.cards[j].ref; if (!c.locked) { c.day = null; c.period = null; c.roomId = null; } });
      m.ref.day = day; m.ref.period = period; m.ref.roomId = info.room ? info.room.id : null;
      Store.ui.selected = m.ref.id;
      Store.commit();
      const fresh = Solver.verify(D).filter(i => i.level === 'warn' && !softBefore.has(i.text)).map(i => i.text);
      if (fresh.length) UI.toast('⚠ Esta escolha quebra ' + fresh.length + ' condição(ões): ' + fresh.slice(0, 2).join(' ') + (fresh.length > 2 ? ' …' : ''), 'warn');
      else if (eject && info.cards.length) UI.toast(info.cards.length + ' cartão(ões) em conflito voltaram para a bandeja.');
    };
    if (!info.reasons.length) { apply(false); return; }
    const canEject = info.cards.some(j => !M.cards[j].locked);
    UI.modal({
      title: 'Esta escolha desobedece restrições', width: 560, noFocus: true,
      body: h('div', null,
        h('p', null, h('b', null, M.cardName(m)), ' em ', h('b', null, Core.slotLabel(D.school, day, period)), ':'),
        h('div', { class: 'msg-list small' }, info.reasons.map(t => h('div', { class: /condicional/.test(t) ? 'warn' : 'bad' }, '✖ ' + t))),
        h('p', { class: 'hint' }, 'Você pode manter a escolha (os cartões em conflito ficam marcados em vermelho e aparecem na Verificação)' + (canEject ? ', devolver os conflitantes à bandeja' : '') + ' ou cancelar.')),
      buttons: [
        canEject ? { label: 'Devolver conflitantes à bandeja', left: true, onClick: x => { x.close(); apply(true); } } : null,
        { label: 'Colocar mesmo assim', left: true, onClick: x => { x.close(); apply(false); } },
        { label: 'Cancelar', primary: true }].filter(Boolean)
    });
  },

  unplace(card) { card.day = null; card.period = null; card.roomId = null; card.locked = false; Store.commit(); },

  cardMenu(card, x, y) {
    const D = Store.data, l = Core.find(D.lessons, card.lessonId), placed = card.day != null;
    const items = [{ head: Fmt.subject(l) + ' — ' + Fmt.classes(l) }];
    if (placed) {
      items.push({ label: card.locked ? '🔓 Destravar cartão' : '🔒 Travar cartão', onClick: () => { card.locked = !card.locked; Store.commit(); } });
      items.push({ label: '↩ Remover do horário', disabled: card.locked, onClick: () => Grid.unplace(card) });
      const rooms = Core.candidateRoomIds(D, l);
      if (rooms.length > 1) {
        items.push({ sep: true }, { head: 'Trocar sala' });
        const M = Solver.buildModel(D, {}); M.loadAll();
        const m = M.cards.find(z => z.id === card.id);
        rooms.forEach(id => {
          const r = Core.find(D.rooms, id), res = M.inspect(m, card.day, card.period, id);
          const free = !res.cards.some(j => M.cards[j].rooms.indexOf(r) >= 0 && M.cards[j].room === r);
          items.push({ label: (card.roomId === id ? '● ' : '○ ') + r.name + (free || card.roomId === id ? '' : ' (ocupada)'), disabled: !free || card.roomId === id, onClick: () => { card.roomId = id; Store.commit(); } });
        });
      }
    }
    items.push({ sep: true }, { label: '✏️ Editar aula…', onClick: async () => { if (await Dialogs.lesson(l)) Store.commit(); } });
    UI.menu(x, y, items);
  },

  renderTray(host) {
    const D = Store.data, ui = Store.ui, lessons = Grid.lessonMap();
    host.textContent = '';
    const single = ui.entity !== 'all' && Core.find(D[ui.view], ui.entity);
    const groups = new Map();
    let total = 0;
    D.cards.forEach(c => {
      if (c.day != null) return;
      total++;
      const l = lessons.get(c.lessonId);
      if (single && !Core.lessonInvolves(D, l, ui.view, single.id)) return;
      const key = c.lessonId + '|' + c.duration;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    });
    host.appendChild(h('div', { class: 'tray-head' }, total ? 'Cartões não colocados: ' + total + (single ? ' (mostrando os de ' + single.name + ')' : '') : (D.cards.length ? 'Todos os cartões estão no horário.' : 'Sem cartões — cadastre aulas para criar cartões.')));
    const box = h('div', { class: 'tray-cards' });
    groups.forEach(list => {
      const c = list[0], l = lessons.get(c.lessonId);
      const el = Grid.cardEl(c, l, 'tray', false);
      el.style.width = 'calc(var(--cw) * ' + c.duration + ' + 14px)';
      el.appendChild(h('b', { class: 'count' }, String(list.length)));
      Grid.bindCard(el, c);
      box.appendChild(el);
    });
    host.appendChild(box);
    host.ondragover = e => { if (Grid.drag && Grid.drag.m.day >= 0) e.preventDefault(); };
    host.ondrop = e => { e.preventDefault(); if (!Grid.drag) return; const c = Grid.drag.m.ref; Grid.endDrag(); Grid.unplace(c); };
  },

  renderInfo(host) {
    const D = Store.data, card = Store.ui.selected && Core.find(D.cards, Store.ui.selected);
    host.textContent = '';
    if (!card) {
      host.appendChild(h('div', { class: 'hint' }, 'Clique em um cartão para ver os detalhes. Arraste cartões entre a grade e a bandeja; clique com o botão direito para travar, trocar a sala ou remover.'));
      return;
    }
    const l = Core.find(D.lessons, card.lessonId), room = Core.find(D.rooms, card.roomId);
    const line = (k, v) => h('div', null, h('b', null, k + ': '), v);
    host.appendChild(h('div', { class: 'info-card' },
      h('div', { class: 'info-title' }, h('i', { class: 'swatch', style: 'background:' + Fmt.color(l) }), Fmt.subject(l)),
      line('Professor', Fmt.teachers(l)), line('Turma', Fmt.classes(l)),
      line('Sala', room ? room.name : (card.day != null ? '—' : Fmt.rooms(l))),
      line('Posição', card.day != null ? Core.slotLabel(D.school, card.day, card.period) + (card.duration > 1 ? ' (' + Fmt.duration(card.duration).toLowerCase() + ')' : '') : 'não colocado'),
      card.locked ? h('div', null, '🔒 Travado') : null,
      (App.issues || []).filter(i => (i.cards || []).indexOf(card.id) >= 0).map(i => h('div', { class: 'info-issue' }, '✖ ' + i.text))));
  }
};
