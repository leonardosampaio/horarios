/* Janelas de cadastro: escola, disciplinas, turmas, salas, professores, aulas e relações. */
'use strict';

const TYPES = {
  subjects: { title: 'Disciplinas', one: 'Disciplina', icon: '📘', list: 'Inserir disciplinas:', nameLabel: 'Nome da disciplina:', prefix: 's', nova: 'Nova' },
  classes: { title: 'Turmas', one: 'Turma', icon: '👥', list: 'Inserir turmas:', nameLabel: 'Nome da turma:', prefix: 'c', nova: 'Nova' },
  rooms: { title: 'Salas', one: 'Sala', icon: '🏠', list: 'Inserir salas:', nameLabel: 'Nome da sala:', prefix: 'r', nova: 'Nova' },
  teachers: { title: 'Professores', one: 'Professor', icon: '🎓', list: 'Inserir professores:', nameLabel: 'Nome:', prefix: 't', nova: 'Novo' }
};

/* Textos de exibição de uma aula. */
const Fmt = {
  subject(l) { const s = Core.find(Store.data.subjects, l.subjectId); return s ? s.name : '—'; },
  teachers(l, short) {
    if (!l.teacherIds.length) return l.autoTeacher ? '★ automático' : '—';
    return l.teacherIds.map(id => { const t = Core.find(Store.data.teachers, id); return t ? (short ? t.abbr || t.name : t.name) : '?'; }).join(' + ');
  },
  group(cls, gid) {
    for (const dv of cls.divisions || []) for (const g of dv.groups) if (g.id === gid) return g.name;
    return '';
  },
  classes(l, short) {
    if (!l.classIds.length) return '—';
    return l.classIds.map(id => {
      const c = Core.find(Store.data.classes, id);
      if (!c) return '?';
      const g = l.groups && l.groups[id] ? Fmt.group(c, l.groups[id]) : '';
      return (short ? c.abbr || c.name : c.name) + (g ? ' (' + g + ')' : '');
    }).join(' + ');
  },
  rooms(l) { return Core.candidateRoomIds(Store.data, l).map(id => Core.find(Store.data.rooms, id).name).join(', ') || '—'; },
  /* Comparação para ordenar listagens: números por valor; texto em pt-BR, sem diferenciar maiúsculas e com "6º A" < "10º A". */
  cmp(a, b) { return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }); },
  duration(n) { return Core.DURATION_NAMES[n] || n + ' tempos'; },
  color(l) {
    const t = Core.find(Store.data.teachers, l.teacherIds[0]), s = Core.find(Store.data.subjects, l.subjectId);
    const first = Store.ui.colorBy === 'subject' ? s : t, second = Store.ui.colorBy === 'subject' ? t : s;
    return (first && first.color) || (second && second.color) || '#b0bec5';
  }
};

const Dialogs = {
  /* ---------- Escola ---------- */
  schoolForm() {
    const s = Store.data.school;
    const set = (k, v) => { s[k] = v; Store.commit(); };
    const text = k => h('input', { type: 'text', value: s[k] || '', oninput: e => set(k, e.target.value) });
    const nums = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push({ value: i, label: String(i) }); return o; };
    return h('div', { class: 'school-form' },
      h('fieldset', null, h('legend', null, 'Sua escola'), h('div', { class: 'fs-ico' }, '🏫'),
        h('div', { class: 'fs-body' }, UI.field('Nome da escola:', text('name')), UI.field('Ano letivo:', text('year')), UI.field('Nome do registro:', text('registry')))),
      h('fieldset', null, h('legend', null, 'Dias da semana'), h('div', { class: 'fs-ico' }, '📅'),
        h('div', { class: 'fs-body' },
          UI.field('Aulas/dia:', UI.select(nums(1, 15), s.periodsPerDay, v => set('periodsPerDay', +v))),
          UI.field('Número de dias:', UI.select(nums(1, 7), s.days, v => set('days', +v))),
          UI.check('Trabalhar com aulas 0 (zero).', s.zeroPeriod, v => set('zeroPeriod', v)),
          UI.check('Mostrar o número do dia em vez do nome do dia. (Ex: Dia 1 em vez de segunda-feira)', s.dayNumbers, v => set('dayNumbers', v)),
          UI.field('Fim de semana:', UI.select([{ value: 'sab-dom', label: 'Sábado - Domingo' }, { value: 'sex-sab', label: 'Sexta - Sábado' }], s.weekend, v => set('weekend', v))))),
      h('fieldset', null, h('legend', null, 'Outros'),
        h('div', { class: 'fs-body row big-buttons' },
          h('button', { class: 'btn big', onclick: () => Dialogs.customFields() }, '🗂️ Campos personalizados'),
          h('button', { class: 'btn big', onclick: () => Dialogs.params() }, '🧮 Parâmetros'),
          h('button', { class: 'btn big', onclick: () => Dialogs.bells() }, '🔔 Toques (horário das aulas)'))));
  },

  school() {
    UI.modal({ title: 'Escola', width: 680, body: Dialogs.schoolForm(), buttons: [{ label: 'Fechar', primary: true }] });
  },

  customFields() {
    const fields = Store.data.school.customFields;
    let sel = 0;
    const box = h('div', { class: 'table-wrap', style: 'height:220px' });
    const draw = () => {
      box.textContent = '';
      box.appendChild(h('table', { class: 'grid-table' },
        h('thead', null, h('tr', null, h('th', null, 'Nome'), h('th', null, 'Valor'))),
        h('tbody', null, fields.map((f, i) => h('tr', { class: i === sel ? 'sel' : '', onclick: () => { if (sel !== i) { sel = i; draw(); } } },
          h('td', null, f.name),
          h('td', null, h('input', { type: 'text', class: 'cell-input', value: f.value || '', oninput: e => { f.value = e.target.value; Store.commit(); } })))))));
    };
    draw();
    UI.modal({
      title: 'Campos personalizados', width: 600, body: box, buttons: [
        { label: 'Adicionar', left: true, onClick: async () => { const n = await UI.askText('Novo campo', 'Nome do campo:'); if (n) { fields.push({ name: n, value: '' }); sel = fields.length - 1; Store.commit(); draw(); } } },
        { label: 'Renomear', left: true, onClick: async () => { if (!fields[sel]) return; const n = await UI.askText('Renomear campo', 'Nome do campo:', fields[sel].name); if (n) { fields[sel].name = n; Store.commit(); draw(); } } },
        { label: 'Remover', left: true, onClick: () => { if (fields[sel]) { fields.splice(sel, 1); sel = Math.max(0, sel - 1); Store.commit(); draw(); } } },
        { label: 'Fechar', primary: true }]
    });
  },

  params() {
    const p = Object.assign({}, Store.data.school.params);
    const num = k => h('input', { type: 'number', min: 0, max: 99, class: 'num', value: p[k], oninput: e => { p[k] = Math.max(0, +e.target.value || 0); } });
    const box = (key, title, text, extra) => h('div', { class: 'param' }, UI.check(title, p[key], v => { p[key] = v; }), h('p', null, text), extra || null);
    UI.modal({
      title: 'Parâmetros', width: 640,
      body: h('div', { class: 'params' },
        box('different', 'Criar horários diferentes', 'Um horário diferente é criado a cada geração. Recomendamos o uso desta opção.'),
        box('distribution', 'Verificar distribuição', 'O programa distribui as aulas uniformemente. Por exemplo, se a aula é dada 2 vezes por semana, deve haver ao menos 1 dia de intervalo entre estas 2 aulas.'),
        box('exhaustion', 'Verificar esgotamento', 'Número máximo de períodos consecutivos que os professores lecionam e que não estão limitados explicitamente nas suas "Restrições".', num('maxConsecutive')),
        box('teacherGaps', 'Verificar janelas dos professores', 'Número máximo de janelas (por semana) do professor que não esteja limitado em suas "Restrições".', num('maxGaps')),
        box('allowZero', 'Permitir as aulas 0 (zero)', 'O programa pode colocar cartões nas aulas 0 (zero) também, o que pode facilitar o processo de criação de horários.')),
      buttons: [{ label: 'OK', primary: true, onClick: m => { Store.data.school.params = p; Store.commit(); m.close(); } }, { label: 'Cancelar' }]
    });
  },

  bells() {
    const sch = Store.data.school, bells = Object.assign({}, sch.bells);
    const start = h('input', { type: 'time', value: '07:00' }), len = h('input', { type: 'number', class: 'num', value: 50, min: 5 });
    const rows = h('div', { class: 'bells' });
    const draw = () => {
      rows.textContent = '';
      Core.periodList(sch).forEach(p => rows.appendChild(UI.field(p + 'ª aula:', h('input', { type: 'text', placeholder: '07:00-07:50', value: bells[p] || '', oninput: e => { bells[p] = e.target.value.trim(); } }))));
    };
    draw();
    const fill = () => {
      const m = /^(\d+):(\d+)$/.exec(start.value); if (!m) return;
      let t = +m[1] * 60 + +m[2];
      const f = n => String(Math.floor(n / 60) % 24).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
      Core.periodList(sch).forEach(p => { bells[p] = f(t) + '-' + f(t + (+len.value || 50)); t += +len.value || 50; });
      draw();
    };
    UI.modal({
      title: 'Toques — horário das aulas', width: 420,
      body: h('div', null, h('div', { class: 'row' }, UI.field('Início:', start), UI.field('Duração (min):', len), h('button', { class: 'btn', onclick: fill }, 'Preencher')), rows),
      buttons: [{ label: 'OK', primary: true, onClick: m => { sch.bells = bells; Store.commit(); m.close(); } }, { label: 'Cancelar' }]
    });
  },

  /* ---------- Listas de disciplinas / turmas / salas / professores ---------- */
  miniTimeOff(ent) {
    const sch = Store.data.school, days = Core.dayList(sch), periods = Core.periodList(sch);
    const el = h('div', { class: 'mini-off', style: 'grid-template-columns:repeat(' + periods.length + ',5px)' });
    days.forEach(d => periods.forEach(p => el.appendChild(h('i', { class: 'o' + ((ent.timeOff || {})[d.index + '-' + p] || 0) }))));
    return el;
  },

  columns(type) {
    const D = Store.data;
    const cols = [
      { label: 'Nome', cell: e => h('span', null, e.color ? h('i', { class: 'swatch', style: 'background:' + e.color }) : null, e.name) },
      { label: 'Abrev.', cell: e => e.abbr },
      { label: 'Quant.', cls: 'num', cell: e => String(Core.periodsOf(D, type, e.id)), key: e => Core.periodsOf(D, type, e.id) },
      // ordena pelo número de posições indisponíveis (inadequadas pesam mais que condicionais)
      { label: 'Tempo livre', cell: e => Dialogs.miniTimeOff(e), key: e => Object.keys(e.timeOff || {}).reduce((n, k) => n + (e.timeOff[k] === 2 ? 100 : 1), 0) }
    ];
    if (type === 'subjects') cols.push({ label: 'Máx./dia', cell: e => e.maxPerDay != null ? String(e.maxPerDay) : '' },
      { label: 'Salas da disciplina', cell: e => (e.roomIds || []).map(id => (Core.find(D.rooms, id) || {}).name).filter(Boolean).join(', ') });
    if (type === 'classes') cols.push({ label: 'Sala fixa', cell: e => (Core.find(D.rooms, e.homeRoomId) || {}).name || '' },
      { label: 'Entrada na 2ª aula', cell: e => e.allowLateStart ? 'Sim' : '' },
      { label: 'Coordenador', cell: e => D.teachers.filter(t => t.classTeacherOf === e.id).map(t => t.name).join(', ') });
    if (type === 'rooms') cols.push({ label: 'Tipo', cell: e => e.type || '' }, { label: 'Prédio', cell: e => e.building || '' },
      { label: 'Compart.', cell: e => e.shared ? 'Sim' : '' },
      { label: 'Sala fixa de', cell: e => D.classes.filter(c => c.homeRoomId === e.id).map(c => c.name).join(', ') });
    if (type === 'teachers') cols.push({ label: 'Especialidades', cell: e => (e.subjectIds || []).map(id => (Core.find(D.subjects, id) || {}).abbr).filter(Boolean).join(', ') },
      { label: 'Coordenador de', cell: e => (Core.find(D.classes, e.classTeacherOf) || {}).name || '' });
    return cols;
  },

  entityPanel(type, opts) {
    opts = opts || {};
    let sel = null;
    const sort = { type: null, col: -1, dir: 1 }; // só para marcar ▲/▼ no título: a ordem em si fica no documento
    const root = h('div', { class: 'ent-panel' });
    const draw = () => {
      const D = Store.data, T = TYPES[type], list = D[type];
      const ent = sel && Core.find(list, sel);
      if (!ent) sel = null;
      const cols = Dialogs.columns(type);
      const after = () => { Store.commit(); draw(); };
      const btn = (label, fn, disabled, cls) => h('button', { class: 'btn side ' + (cls || ''), disabled: !!disabled, onclick: fn }, label);
      const edit = async () => { if (ent && await Dialogs.entityForm(type, ent)) after(); };
      const move = dir => {
        const i = list.indexOf(ent), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        list.splice(i, 1); list.splice(j, 0, ent); sort.col = -1; after();
      };
      // Clique no título da coluna reordena o próprio cadastro (é a ordem das linhas na grade e no PDF, a mesma
      // que os botões ↑ ↓ ajustam): 1º clique crescente, 2º decrescente.
      const sortBy = i => {
        sort.dir = sort.type === type && sort.col === i ? -sort.dir : 1;
        sort.type = type; sort.col = i;
        const c = cols[i], key = c.key || (e => { const v = c.cell(e); return v && v.nodeType ? v.textContent : String(v == null ? '' : v); });
        const sorted = list.map((e, k) => [key(e), k, e]).sort((a, b) => sort.dir * Fmt.cmp(a[0], b[0]) || a[1] - b[1]).map(x => x[2]);
        list.splice.apply(list, [0, list.length].concat(sorted));
        after();
      };
      const mark = i => (sort.type === type && sort.col === i ? (sort.dir === 1 ? '▲' : '▼') : '↕');
      root.textContent = '';
      root.appendChild(h('div', { class: 'ent-side' }, Object.keys(TYPES).map(k => h('button', {
        class: 'ent-tab' + (k === type ? ' active' : ''), title: TYPES[k].title,
        onclick: () => { if (k === type) return; type = k; sel = null; if (opts.onType) opts.onType(k); draw(); }
      }, h('span', { class: 'ico' }, TYPES[k].icon), h('span', null, TYPES[k].title)))));
      root.appendChild(h('div', { class: 'ent-main' }, h('div', { class: 'ent-label' }, T.list),
        h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table' },
          h('thead', null, h('tr', null, cols.map((c, i) => h('th', { class: 'sortable' + (mark(i) !== '↕' ? ' sorted' : ''), title: 'Ordenar por ' + c.label.toLowerCase(), onclick: () => sortBy(i) },
            c.label, h('span', { class: 'sort-mark' }, mark(i)))))),
          h('tbody', null, list.map(e => h('tr', {
            class: e.id === sel ? 'sel' : '', onclick: () => { sel = e.id; draw(); }, ondblclick: () => { sel = e.id; draw(); edit(); }
          }, cols.map(c => h('td', { class: c.cls || '' }, c.cell(e))))))),
          !list.length ? h('div', { class: 'empty' }, 'Nenhum registro. Clique em "' + T.nova + '".') : null)));
      root.appendChild(h('div', { class: 'ent-actions' },
        btn('➕ ' + T.nova, async () => { const e = await Dialogs.entityForm(type, null); if (e) { sel = e.id; after(); } }, false, 'strong'),
        btn('✏️ Editar', edit, !ent),
        btn('➖ Remover', async () => {
          const n = D.lessons.filter(l => Core.lessonInvolves(D, l, type, ent.id)).length;
          const cascade = (type === 'subjects' || type === 'classes') && n;
          if (cascade && !await UI.confirm('Remover "' + ent.name + '" e as ' + n + ' aula(s) ligadas a ela?', 'Remover')) return;
          Core.removeEntity(D, type, ent.id); sel = null; after();
        }, !ent),
        h('div', { class: 'gap' }),
        btn('📚 Aulas', () => Dialogs.lessons({ type: type, id: ent.id }, draw), !ent),
        btn('🕒 Tempo livre', () => Dialogs.timeOff(type, ent, draw), !ent),
        type !== 'rooms' ? btn('🛠️ Restrições', () => Dialogs.restrictions(type, ent, draw), !ent) : null,
        type === 'classes' ? [h('div', { class: 'gap' }), btn('✂️ Divisões', () => Dialogs.divisions(ent, draw), !ent)] : null,
        type === 'rooms' ? [h('div', { class: 'gap' }),
          btn('🗑️ Remover todas', async () => { if (await UI.confirm('Remover todas as salas?', 'Remover')) { list.slice().forEach(r => Core.removeEntity(D, 'rooms', r.id)); after(); } }, !list.length),
          btn('🏗️ Criar', () => {
            let n = 0;
            D.classes.forEach(c => {
              if (c.homeRoomId) return;
              const r = { id: Core.uid('r'), name: 'Sala ' + c.name, abbr: 'S' + (c.abbr || c.name), type: 'Sala de aula', building: '', shared: false, timeOff: {} };
              list.push(r); c.homeRoomId = r.id; n++;
            });
            UI.toast(n ? n + ' sala(s) fixa(s) criada(s), uma para cada turma.' : 'Todas as turmas já têm sala fixa.');
            after();
          }, !D.classes.length)] : null,
        h('div', { class: 'grow' }),
        h('div', { class: 'row' }, btn('↑', () => move(-1), !ent, 'tiny'), btn('↓', () => move(1), !ent, 'tiny'))));
    };
    draw();
    return { el: root, refresh: draw };
  },

  entities(type) {
    const panel = Dialogs.entityPanel(type, { onType: k => modal.setTitle(TYPES[k].title) });
    const modal = UI.modal({ title: TYPES[type].title, width: 900, className: 'tall', body: panel.el, noFocus: true, buttons: [{ label: 'Fechar', primary: true }] });
  },

  entityForm(type, ent) {
    const D = Store.data, T = TYPES[type], isNew = !ent;
    const w = Object.assign({ name: '', abbr: '' }, ent || {});
    if (isNew && (type === 'subjects' || type === 'teachers')) w.color = Core.PALETTE[D[type].length % Core.PALETTE.length];
    if (type === 'teachers') { w.subjectIds = (w.subjectIds || []).slice(); w.gender = w.gender || 'F'; }
    let homeOf = type === 'rooms' && ent ? D.classes.filter(c => c.homeRoomId === ent.id).map(c => c.id) : [];
    let abbrTouched = !!w.abbr;
    const abbr = h('input', { type: 'text', value: w.abbr, oninput: e => { w.abbr = e.target.value; abbrTouched = true; } });
    const name = h('input', { type: 'text', value: w.name, oninput: e => {
      w.name = e.target.value;
      if (!abbrTouched) { w.abbr = type === 'classes' ? w.name.replace(/\s+/g, '') : Core.suggestAbbr(w.name); abbr.value = w.abbr; }
    } });
    const color = () => UI.field('Cor:', h('input', { type: 'color', value: w.color || '#b0bec5', oninput: e => { w.color = e.target.value; } }));
    const opt = (list, none) => [{ value: '', label: none }].concat(list.map(x => ({ value: x.id, label: x.name })));
    const body = h('div', { class: 'form' }, UI.field(T.nameLabel, name), UI.field('Abreviatura:', abbr));
    if (type === 'subjects') body.appendChild(color());
    if (type === 'classes') body.appendChild(UI.field('Sala fixa:', UI.select(opt(D.rooms, '(nenhuma)'), w.homeRoomId || '', v => { w.homeRoomId = v || null; }),
      'Sala onde a turma tem aula quando a aula usa "Sala fixa".'));
    if (type === 'rooms') {
      const homeTxt = h('span', { class: 'hint' });
      const drawHome = () => { homeTxt.textContent = homeOf.map(id => Core.find(D.classes, id).name).join(', ') || '(nenhuma turma)'; };
      drawHome();
      body.appendChild(UI.field('Tipo:', h('input', { type: 'text', value: w.type || '', placeholder: 'Sala de aula, Laboratório, Quadra…', oninput: e => { w.type = e.target.value; } })));
      body.appendChild(UI.field('Prédio:', h('input', { type: 'text', value: w.building || '', oninput: e => { w.building = e.target.value; } })));
      body.appendChild(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sala fixa de:'), h('div', { class: 'row' }, homeTxt,
        h('button', { class: 'btn', onclick: async () => { const r = await UI.pickMany('Turmas com sala fixa aqui', D.classes.map(c => ({ id: c.id, label: c.name })), homeOf); if (r) { homeOf = r; drawHome(); } } }, 'Modificar'))));
      body.appendChild(UI.check('Sala compartilhada (várias aulas ao mesmo tempo, ex.: quadra ou pátio)', w.shared, v => { w.shared = v; }));
    }
    if (type === 'teachers') {
      body.appendChild(UI.field('Gênero:', UI.select([{ value: 'F', label: 'Mulher' }, { value: 'M', label: 'Homem' }], w.gender, v => { w.gender = v; })));
      body.appendChild(color());
      body.appendChild(UI.field('Professor coordenador da turma:', UI.select(opt(D.classes, '(nenhuma)'), w.classTeacherOf || '', v => { w.classTeacherOf = v || null; })));
      body.appendChild(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Especialidades (disciplinas que leciona):'),
        h('div', { class: 'checklist' }, D.subjects.length ? D.subjects.map(s => UI.check(s.name, w.subjectIds.indexOf(s.id) >= 0, v => {
          w.subjectIds = w.subjectIds.filter(x => x !== s.id); if (v) w.subjectIds.push(s.id);
        })) : h('span', { class: 'hint' }, 'Cadastre as disciplinas primeiro.'))));
    }
    return new Promise(resolve => {
      let result = null;
      UI.modal({
        title: T.one, width: 460, body: body, onClose: () => resolve(result),
        buttons: [{ label: 'OK', primary: true, onClick: m => {
          w.name = w.name.trim(); w.abbr = (w.abbr || '').trim() || Core.suggestAbbr(w.name);
          if (!w.name) { UI.toast('Informe o nome.', 'bad'); name.focus(); return; }
          if (isNew) {
            ent = Object.assign({ id: Core.uid(T.prefix), timeOff: {} }, w);
            if (type === 'classes') ent.divisions = Core.defaultDivisions();
            if (type === 'subjects') ent.roomIds = [];
            D[type].push(ent);
          } else Object.assign(ent, w);
          if (type === 'rooms') D.classes.forEach(c => { if (homeOf.indexOf(c.id) >= 0) c.homeRoomId = ent.id; else if (c.homeRoomId === ent.id) c.homeRoomId = null; });
          result = ent; m.close();
        } }, { label: 'Cancelar' }]
      });
    });
  },

  timeOff(type, ent, done) {
    const sch = Store.data.school, days = Core.dayList(sch), periods = Core.periodList(sch);
    const off = Object.assign({}, ent.timeOff || {});
    const SYM = ['✔', '?', '✖'];
    const grid = h('div', { class: 'off-grid', style: 'grid-template-columns:90px repeat(' + periods.length + ',1fr)' });
    const get = (d, p) => off[d + '-' + p] || 0;
    const put = (d, p, v) => { if (v) off[d + '-' + p] = v; else delete off[d + '-' + p]; };
    const draw = () => {
      grid.textContent = '';
      grid.appendChild(h('div', { class: 'off-h' }));
      periods.forEach(p => grid.appendChild(h('div', { class: 'off-h click', title: 'Alterar a coluna', onclick: () => { const v = (get(0, p) + 1) % 3; days.forEach(d => put(d.index, p, v)); draw(); } }, String(p))));
      days.forEach(d => {
        grid.appendChild(h('div', { class: 'off-h click', title: 'Alterar a linha', onclick: () => { const v = (get(d.index, periods[0]) + 1) % 3; periods.forEach(p => put(d.index, p, v)); draw(); } }, d.name));
        periods.forEach(p => {
          const v = get(d.index, p);
          grid.appendChild(h('div', {
            class: 'off-c o' + v,
            onclick: () => { put(d.index, p, (v + 1) % 3); draw(); },
            oncontextmenu: e => { e.preventDefault(); put(d.index, p, (v + 2) % 3); draw(); }
          }, SYM[v]));
        });
      });
    };
    draw();
    UI.modal({
      title: 'Tempo livre — ' + ent.name, width: Math.min(820, 200 + periods.length * 56), noFocus: true,
      body: h('div', null, grid,
        h('div', { class: 'legend' }, 'Legenda: ', h('b', { class: 'o0' }, '✔'), ' Adequado ', h('b', { class: 'o1' }, '?'), ' Condicional ', h('b', { class: 'o2' }, '✖'), ' Inadequado'),
        h('p', { class: 'hint' }, 'Clique para alternar; clique no dia ou no número da aula para alterar a linha/coluna inteira.')),
      buttons: [
        { label: 'Aplicar a todos', left: true, onClick: async m => {
          if (!await UI.confirm('Copiar este tempo livre para todos os registros de "' + TYPES[type].title + '"?')) return;
          Store.data[type].forEach(e => { e.timeOff = Object.assign({}, off); }); Store.commit(); m.close(); if (done) done();
        } },
        { label: 'Limpar', left: true, onClick: () => { Object.keys(off).forEach(k => delete off[k]); draw(); } },
        { label: 'OK', primary: true, onClick: m => { ent.timeOff = off; Store.commit(); m.close(); if (done) done(); } }, { label: 'Cancelar' }]
    });
  },

  restrictions(type, ent, done) {
    const D = Store.data, w = {};
    const num = (key, label, hint) => {
      w[key] = ent[key] != null ? ent[key] : null;
      return UI.field(label, h('input', { type: 'number', class: 'num', min: 0, value: w[key] == null ? '' : w[key], placeholder: '—', oninput: e => { w[key] = e.target.value === '' ? null : Math.max(0, +e.target.value); } }), hint);
    };
    const body = h('div', { class: 'form' });
    if (type === 'subjects') {
      w.roomIds = (ent.roomIds || []).slice();
      const txt = h('span', { class: 'hint' });
      const drawRooms = () => { txt.textContent = w.roomIds.map(id => (Core.find(D.rooms, id) || {}).name).join(', ') || '(nenhuma — usa a sala fixa da turma)'; };
      drawRooms();
      body.appendChild(num('maxPerDay', 'Máx. de aulas por dia (por turma):', 'Em branco = sem limite.'));
      body.appendChild(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Salas de aula da disciplina:'), h('div', { class: 'row' }, txt,
        h('button', { class: 'btn', onclick: async () => { const r = await UI.pickMany('Salas da disciplina', D.rooms.map(x => ({ id: x.id, label: x.name })), w.roomIds); if (r) { w.roomIds = r; drawRooms(); } } }, 'Salas de aula')),
        h('span', { class: 'hint' }, 'Sugeridas automaticamente ao criar novas aulas desta disciplina.')));
    } else if (type === 'classes') {
      w.allowLateStart = !!ent.allowLateStart;
      body.appendChild(UI.check('Permitir a entrada na 2ª aula do dia.', w.allowLateStart, v => { w.allowLateStart = v; }));
      body.appendChild(h('p', { class: 'hint' }, 'Sem esta opção, o gerador procura começar todos os dias na 1ª aula e sem janelas.'));
    } else if (type === 'teachers') {
      body.appendChild(num('maxGaps', 'Máx. de janelas por semana:', 'Em branco = usa o valor de Parâmetros.'));
      body.appendChild(num('maxPerDay', 'Máx. de aulas por dia:', 'Em branco = sem limite.'));
      body.appendChild(num('maxConsecutive', 'Máx. de aulas consecutivas:', 'Em branco = usa o valor de Parâmetros.'));
    }
    UI.modal({
      title: 'Restrições — ' + ent.name, width: 480, body: body,
      buttons: [{ label: 'OK', primary: true, onClick: m => { Object.assign(ent, w); Store.commit(); m.close(); if (done) done(); } }, { label: 'Cancelar' }]
    });
  },

  divisions(cls, done) {
    const D = Store.data;
    const box = h('div', { class: 'divs' });
    const ask = current => UI.askText('Divisão', 'Nomes dos grupos (separados por vírgula):', current || 'Grupo 1, Grupo 2');
    const parse = txt => (txt || '').split(',').map(s => s.trim()).filter(Boolean);
    const draw = () => {
      box.textContent = '';
      box.appendChild(h('div', { class: 'div-row whole' }, h('div', { class: 'div-g' }, 'Turma completa')));
      cls.divisions.forEach(dv => box.appendChild(h('div', { class: 'div-row' },
        dv.groups.map(g => h('div', { class: 'div-g' }, g.name)),
        h('button', { class: 'btn', onclick: async () => {
          const names = parse(await ask(dv.groups.map(g => g.name).join(', ')));
          if (names.length < 2) return;
          const gone = dv.groups.slice(names.length).map(g => g.id);
          dv.groups = names.map((n, i) => ({ id: dv.groups[i] ? dv.groups[i].id : Core.uid('g'), name: n }));
          D.lessons.forEach(l => { if (gone.indexOf(l.groups[cls.id]) >= 0) delete l.groups[cls.id]; });
          Store.commit(); draw();
        } }, 'Editar'),
        h('button', { class: 'btn', onclick: () => {
          const ids = dv.groups.map(g => g.id);
          D.lessons.forEach(l => { if (ids.indexOf(l.groups[cls.id]) >= 0) delete l.groups[cls.id]; });
          cls.divisions = cls.divisions.filter(x => x !== dv); Store.commit(); draw();
        } }, 'Remover'))));
    };
    draw();
    UI.modal({
      title: 'Definir divisões — ' + cls.name, width: 520, body: box, onClose: () => done && done(),
      buttons: [{ label: 'Adicionar divisão', left: true, onClick: async () => {
        const names = parse(await ask());
        if (names.length < 2) { if (names.length) UI.toast('Uma divisão precisa de pelo menos 2 grupos.', 'bad'); return; }
        cls.divisions.push({ id: Core.uid('d'), groups: names.map(n => ({ id: Core.uid('g'), name: n })) }); Store.commit(); draw();
      } }, { label: 'OK', primary: true }]
    });
  },

  /* ---------- Aulas (contrato) ---------- */
  lessons(filter, done) {
    const D = Store.data;
    let sel = null;
    const ent = filter && Core.find(D[filter.type], filter.id);
    const box = h('div', { class: 'table-wrap', style: 'height:340px' });
    const total = h('span', { class: 'hint' });
    // ordenação só da listagem (não muda a ordem das aulas no documento): clique no título da coluna
    // alterna crescente → decrescente → ordem original
    const COLS = [
      { label: 'Disciplina', key: l => Fmt.subject(l) }, { label: 'Professor', key: l => Fmt.teachers(l) }, { label: 'Turma', key: l => Fmt.classes(l) },
      { label: 'Quant.', key: l => l.count }, { label: 'Duração', key: l => l.duration }, { label: 'Salas', key: l => Fmt.rooms(l) }];
    const sort = { col: -1, dir: 1 };
    const list = () => {
      const ls = D.lessons.filter(l => !filter || Core.lessonInvolves(D, l, filter.type, filter.id));
      if (sort.col < 0) return ls;
      const key = COLS[sort.col].key;
      // o índice original desempata, para a ordem ficar estável nos dois sentidos
      return ls.map((l, i) => [key(l), i, l]).sort((a, b) => sort.dir * Fmt.cmp(a[0], b[0]) || a[1] - b[1]).map(x => x[2]);
    };
    const sortBy = i => {
      if (sort.col !== i) { sort.col = i; sort.dir = 1; } else if (sort.dir === 1) sort.dir = -1; else sort.col = -1;
      draw();
    };
    const draw = () => {
      const ls = list();
      if (sel && !ls.some(l => l.id === sel)) sel = null;
      box.textContent = '';
      box.appendChild(h('table', { class: 'grid-table' },
        h('thead', null, h('tr', null, COLS.map((c, i) => h('th', { class: 'sortable' + (sort.col === i ? ' sorted' : ''), title: 'Ordenar por ' + c.label.toLowerCase(), onclick: () => sortBy(i) },
          c.label, h('span', { class: 'sort-mark' }, sort.col === i ? (sort.dir === 1 ? '▲' : '▼') : '↕'))))),
        h('tbody', null, ls.map(l => h('tr', { class: l.id === sel ? 'sel' : '', onclick: () => { sel = l.id; draw(); }, ondblclick: () => { sel = l.id; edit(); } },
          h('td', null, h('i', { class: 'swatch', style: 'background:' + Fmt.color(l) }), Fmt.subject(l)),
          h('td', null, Fmt.teachers(l)), h('td', null, Fmt.classes(l)), h('td', { class: 'num' }, String(l.count)),
          h('td', null, Fmt.duration(l.duration)), h('td', null, Fmt.rooms(l)))))));
      if (!ls.length) box.appendChild(h('div', { class: 'empty' }, 'Nenhuma aula. Clique em "Nova aula".'));
      total.textContent = ls.length + ' aula(s), ' + ls.reduce((s, l) => s + l.count, 0) + ' tempo(s) por semana';
    };
    const preset = () => {
      if (!filter) return {};
      if (filter.type === 'subjects') return { subjectId: filter.id };
      if (filter.type === 'classes') return { classIds: [filter.id] };
      if (filter.type === 'teachers') return { teacherIds: [filter.id] };
      return { roomIds: [filter.id], homeRoom: false };
    };
    const after = () => { Store.commit(); draw(); };
    const edit = async () => { const l = Core.find(D.lessons, sel); if (l && await Dialogs.lesson(l)) after(); };
    draw();
    UI.modal({
      title: 'Contrato' + (ent ? ' — ' + ent.name : ' — todas as aulas'), width: 860, noFocus: true, onClose: () => done && done(),
      body: h('div', null, ent ? h('div', { class: 'contract-head' }, h('span', { class: 'ico' }, TYPES[filter.type].icon), h('div', null, h('b', null, ent.name), h('div', { class: 'hint' }, ent.abbr || ''))) : null, box, total),
      buttons: [
        { label: 'Nova aula', left: true, primary: true, onClick: async () => { const l = await Dialogs.lesson(null, preset()); if (l) { sel = l.id; after(); } } },
        { label: 'Editar aula', left: true, onClick: edit },
        { label: 'Remover', left: true, onClick: () => { if (sel) { D.lessons = D.lessons.filter(l => l.id !== sel); sel = null; after(); } } },
        { label: 'Copiar para', left: true, onClick: async () => {
          const l = Core.find(D.lessons, sel);
          if (!l) { UI.toast('Selecione uma aula.'); return; }
          const ids = await UI.pickMany('Copiar aula para as turmas', D.classes.filter(c => l.classIds.indexOf(c.id) < 0).map(c => ({ id: c.id, label: c.name })), []);
          if (!ids || !ids.length) return;
          ids.forEach(id => D.lessons.push(Object.assign(JSON.parse(JSON.stringify(l)), { id: Core.uid('l'), classIds: [id], groups: {} })));
          after(); UI.toast('Aula copiada para ' + ids.length + ' turma(s).');
        } },
        filter && filter.type === 'classes' ? { label: 'Adicionar mais', left: true, onClick: async () => { if (await Dialogs.addMany(ent)) after(); } } : null,
        // só na listagem geral: troca o professor de todas as aulas por "automático" (escolhido pela especialidade na criação)
        !filter ? { label: '★ Professores automáticos', left: true, onClick: async () => {
          const plan = Solver.autoTeacherPlan(D, false), todo = plan.todo, skip = plan.skip;
          if (!todo.length) { UI.toast(skip.length ? 'Nenhuma aula alterada: falta professor com a especialidade das disciplinas.' : 'Todas as aulas já estão com professor automático.'); return; }
          if (!await UI.confirm('Trocar o professor de ' + todo.length + ' aula(s) por "automático"?\nOs professores atuais dessas aulas serão removidos; na próxima criação do horário, cada aula recebe um professor com a especialidade da disciplina.' +
            (skip.length ? '\n\n' + skip.length + ' aula(s) ficam como estão, porque nenhum professor tem a especialidade da disciplina.' : ''), 'Trocar')) return;
          Solver.setAutoTeachers(D, false);
          after();
          UI.toast(todo.length + ' aula(s) agora com professor automático.' + (skip.length ? ' ' + skip.length + ' mantida(s) sem alteração.' : ''));
        } } : null,
        { label: 'Fechar' }].filter(Boolean)
    });
  },

  teacherOptions(subjectId) {
    const D = Store.data;
    const ok = t => (t.subjectIds || []).indexOf(subjectId) >= 0;
    const sorted = D.teachers.slice().sort((a, b) => ok(b) - ok(a));
    return [{ value: '', label: '(sem professor)' }, { value: '__auto', label: '★ Automático — pela especialidade' }]
      .concat(sorted.map(t => ({ value: t.id, label: t.name + ' (' + (t.abbr || '') + ')' + (ok(t) ? '  ✓ especialista' : '') })));
  },

  lesson(lesson, preset) {
    const D = Store.data;
    const w = lesson ? JSON.parse(JSON.stringify(lesson)) : Object.assign({
      id: Core.uid('l'), subjectId: D.subjects.length === 1 ? D.subjects[0].id : '', teacherIds: [], autoTeacher: false, classIds: [], groups: {},
      count: 1, duration: 1, homeRoom: true, sharedRoom: false, roomIds: []
    }, JSON.parse(JSON.stringify(preset || {})));
    // Com mais de uma turma marcada: false = uma aula separada para cada turma; true = turmas reunidas na mesma aula.
    let joined = !!lesson && w.classIds.length > 1;
    let classScroll = 0;
    const body = h('div', { class: 'lesson-form' });
    const section = (icon, kids, side) => h('div', { class: 'ls' }, h('div', { class: 'ico' }, icon), h('div', { class: 'ls-main' }, kids), h('div', { class: 'ls-side' }, side || null));
    const names = (ids, list) => ids.map(id => (Core.find(list, id) || {}).name).filter(Boolean).join(', ');
    const draw = () => {
      const cls = w.classIds.length === 1 ? Core.find(D.classes, w.classIds[0]) : null;
      const groupOpts = [{ value: '', label: 'Turma completa' }];
      if (cls) cls.divisions.forEach(dv => dv.groups.forEach(g => groupOpts.push({ value: g.id, label: g.name })));
      const home = names(w.classIds.map(id => (Core.find(D.classes, id) || {}).homeRoomId).filter(Boolean), D.rooms);
      body.textContent = '';
      body.appendChild(section('🎓', [
        h('div', { class: 'field-label' }, 'Professor'),
        UI.select(Dialogs.teacherOptions(w.subjectId), w.teacherIds.length ? w.teacherIds[0] : (w.autoTeacher ? '__auto' : ''), v => {
          w.autoTeacher = v === '__auto'; w.teacherIds = v && v !== '__auto' ? [v] : []; draw();
        }),
        w.teacherIds.length > 1 ? h('div', { class: 'hint' }, 'Professores: ' + names(w.teacherIds, D.teachers)) : null,
        w.autoTeacher && !w.teacherIds.length ? h('div', { class: 'hint' }, 'O professor será escolhido na criação do horário entre os que têm a disciplina como especialidade.') : null
      ], h('button', { class: 'btn', onclick: async () => {
        const r = await UI.pickMany('Professores da aula', D.teachers.map(t => ({ id: t.id, label: t.name })), w.teacherIds);
        if (r) { w.teacherIds = r; if (r.length) w.autoTeacher = false; draw(); }
      } }, 'Mais professores')));
      body.appendChild(section('📘', [
        h('div', { class: 'field-label' }, 'Disciplina'),
        UI.select([{ value: '', label: '' }].concat(D.subjects.map(s => ({ value: s.id, label: s.name }))), w.subjectId, v => {
          w.subjectId = v;
          const s = Core.find(D.subjects, v);
          if (!lesson && s && (s.roomIds || []).length && !w.roomIds.length) { w.roomIds = s.roomIds.slice(); w.homeRoom = false; }
          draw();
        })]));
      const setClasses = ids => {
        w.classIds = D.classes.map(c => c.id).filter(id => ids.indexOf(id) >= 0); // mantém a ordem do cadastro
        if (w.classIds.length !== 1 || !w.groups[w.classIds[0]]) w.groups = {};
        draw();
      };
      const classList = h('div', { class: 'checklist classes', onscroll: e => { classScroll = e.target.scrollTop; } },
        D.classes.length ? D.classes.map(c => UI.check(c.name, w.classIds.indexOf(c.id) >= 0, v => setClasses(v ? w.classIds.concat(c.id) : w.classIds.filter(x => x !== c.id))))
          : h('span', { class: 'hint' }, 'Nenhuma turma cadastrada.'));
      const mode = (label, hint, value) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'lesson-classes', checked: joined === value, onchange: () => { joined = value; draw(); } }), h('span', null, label, h('small', null, hint)));
      body.appendChild(section('👥', [
        h('div', { class: 'field-label' }, 'Turma', h('span', { class: 'hint' }, w.classIds.length ? '  ' + w.classIds.length + ' selecionada(s)' : '  nenhuma (aula sem turma)')),
        classList,
        w.classIds.length > 1 ? h('div', { class: 'modes' },
          mode('Uma aula para cada turma', 'Cria ' + w.classIds.length + ' aulas iguais, uma por turma (' + w.count + ' aula(s)/semana em cada).', false),
          mode('Turmas reunidas', 'Uma única aula em que as ' + w.classIds.length + ' turmas ficam juntas, no mesmo horário.', true)) : null,
        cls ? h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Parte da turma:'),
          h('select', { onchange: e => { if (e.target.value) w.groups[cls.id] = e.target.value; else delete w.groups[cls.id]; } },
            groupOpts.map(o => h('option', { value: o.value, selected: (w.groups[cls.id] || '') === o.value }, o.label)))) : null
      ], [
        h('button', { class: 'btn', disabled: !D.classes.length, onclick: () => setClasses(w.classIds.length === D.classes.length ? [] : D.classes.map(c => c.id)) }, w.classIds.length === D.classes.length && D.classes.length ? 'Desmarcar todas' : 'Marcar todas'),
        h('button', { class: 'btn', disabled: !cls, onclick: () => Dialogs.divisions(cls, draw) }, 'Adicionar divisão')]));
      classList.scrollTop = classScroll;
      body.appendChild(section('🔴', [
        h('div', { class: 'field-label' }, 'Aulas/semana'),
        h('div', { class: 'row' },
          h('input', { type: 'number', class: 'num', min: 1, max: 60, value: w.count, oninput: e => { w.count = Math.max(1, Math.min(60, +e.target.value || 1)); }, onchange: () => { if (w.classIds.length > 1) draw(); } }),
          UI.select([1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ value: n, label: Core.DURATION_NAMES[n] || String(n) })), w.duration, v => { w.duration = +v; }))]));
      body.appendChild(section('🏠', [
        UI.check('Sala fixa' + (w.classIds.length > 1 && !joined ? ' (a de cada turma)' : home ? ' — ' + home : (w.classIds.length ? ' (a turma ainda não tem sala fixa)' : '')), w.homeRoom, v => { w.homeRoom = v; }),
        UI.check('Sala compartilhada (pode usar qualquer sala marcada como compartilhada)', w.sharedRoom, v => { w.sharedRoom = v; }),
        h('div', { class: 'row' }, h('button', { class: 'btn wide', onclick: async () => {
          const r = await UI.pickMany('Outras salas disponíveis', D.rooms.map(x => ({ id: x.id, label: x.name })), w.roomIds);
          if (r) { w.roomIds = r; draw(); }
        } }, 'Outras salas disponíveis'), h('span', { class: 'hint' }, names(w.roomIds, D.rooms) || '(nenhuma)'))]));
    };
    draw();
    return new Promise(resolve => {
      let result = null;
      UI.modal({
        title: 'Aula', width: 640, body: body, onClose: () => resolve(result),
        buttons: [{ label: 'Cancelar', left: true }, { label: 'OK', primary: true, onClick: m => {
          if (!w.subjectId) { UI.toast('Escolha a disciplina.', 'bad'); return; }
          if (!w.classIds.length && !w.teacherIds.length && !w.autoTeacher) { UI.toast('Escolha a turma ou o professor.', 'bad'); return; }
          if (w.duration > Core.periodList(D.school).length) { UI.toast('Duração maior que o número de aulas do dia.', 'bad'); return; }
          // várias turmas, não reunidas: uma aula por turma (ao editar, a aula original fica com a primeira)
          const parts = w.classIds.length > 1 && !joined
            ? w.classIds.map((c, i) => Object.assign(JSON.parse(JSON.stringify(w)), { id: i ? Core.uid('l') : w.id, classIds: [c], groups: {} })) : [w];
          if (lesson) { Object.keys(lesson).forEach(k => delete lesson[k]); Object.assign(lesson, parts[0]); result = lesson; }
          else { D.lessons.push(parts[0]); result = parts[0]; }
          const at = D.lessons.indexOf(result);
          D.lessons.splice.apply(D.lessons, [at + 1, 0].concat(parts.slice(1)));
          if (parts.length > 1) UI.toast(parts.length + ' aulas ' + (lesson ? 'gravadas' : 'criadas') + ', uma para cada turma.');
          m.close();
        } }]
      });
    });
  },

  /* Lançamento rápido: todas as disciplinas de uma turma numa só tela. */
  addMany(cls) {
    const D = Store.data;
    if (!D.subjects.length) { UI.toast('Cadastre as disciplinas primeiro.', 'bad'); return Promise.resolve(false); }
    const rows = D.subjects.map(s => ({ s: s, count: 0, teacher: D.teachers.some(t => (t.subjectIds || []).indexOf(s.id) >= 0) ? '__auto' : '' }));
    const body = h('div', { class: 'table-wrap', style: 'height:360px' }, h('table', { class: 'grid-table' },
      h('thead', null, h('tr', null, ['Disciplina', 'Já lançadas', 'Aulas/semana', 'Professor'].map(t => h('th', null, t)))),
      h('tbody', null, rows.map(r => h('tr', null,
        h('td', null, r.s.name),
        h('td', { class: 'num' }, String(D.lessons.filter(l => l.subjectId === r.s.id && l.classIds.indexOf(cls.id) >= 0).reduce((a, l) => a + l.count, 0))),
        h('td', null, h('input', { type: 'number', class: 'num', min: 0, max: 40, value: 0, oninput: e => { r.count = Math.max(0, +e.target.value || 0); } })),
        h('td', null, UI.select(Dialogs.teacherOptions(r.s.id), r.teacher, v => { r.teacher = v; })))))));
    return new Promise(resolve => {
      let ok = false;
      UI.modal({
        title: 'Adicionar aulas — ' + cls.name, width: 680, body: body, onClose: () => resolve(ok),
        buttons: [{ label: 'OK', primary: true, onClick: m => {
          rows.filter(r => r.count > 0).forEach(r => {
            const rooms = (r.s.roomIds || []).slice();
            D.lessons.push({
              id: Core.uid('l'), subjectId: r.s.id, teacherIds: r.teacher && r.teacher !== '__auto' ? [r.teacher] : [], autoTeacher: r.teacher === '__auto',
              classIds: [cls.id], groups: {}, count: r.count, duration: 1, homeRoom: !rooms.length, sharedRoom: false, roomIds: rooms
            });
          });
          ok = true; m.close();
        } }, { label: 'Cancelar' }]
      });
    });
  },

  /* ---------- Relações entre cartões ---------- */
  relations() {
    const D = Store.data;
    let sel = null;
    const box = h('div', { class: 'table-wrap', style: 'height:240px' });
    const draw = () => {
      box.textContent = '';
      box.appendChild(h('table', { class: 'grid-table' },
        h('thead', null, h('tr', null, ['Descrição', 'Aplicar para'].map(t => h('th', null, t)))),
        h('tbody', null, D.relations.map(r => h('tr', { class: r.id === sel ? 'sel' : '', onclick: () => { sel = r.id; draw(); }, ondblclick: () => form(r) },
          h('td', null, Solver.relationText(D, r)),
          h('td', null, r.classIds && r.classIds.length ? r.classIds.map(id => (Core.find(D.classes, id) || {}).name).join(', ') : 'Todas as turmas'))))));
      if (!D.relations.length) box.appendChild(h('div', { class: 'empty' }, 'Nenhuma relação definida.'));
    };
    const form = rel => {
      if (!D.subjects.length) { UI.toast('Cadastre as disciplinas primeiro.', 'bad'); return; }
      const w = rel ? JSON.parse(JSON.stringify(rel)) : { id: Core.uid('x'), type: 'max_per_day', subjectIds: [], classIds: [], max: 1 };
      const sTxt = h('span', { class: 'hint' }), cTxt = h('span', { class: 'hint' });
      const maxField = UI.field('Máximo por dia:', h('input', { type: 'number', class: 'num', min: 1, value: w.max || 1, oninput: e => { w.max = Math.max(1, +e.target.value || 1); } }));
      const upd = () => {
        sTxt.textContent = w.subjectIds.map(id => (Core.find(D.subjects, id) || {}).name).join(', ') || '(escolha)';
        cTxt.textContent = w.classIds.length ? w.classIds.map(id => (Core.find(D.classes, id) || {}).name).join(', ') : 'Todas as turmas';
        maxField.style.display = w.type === 'max_per_day' ? '' : 'none';
      };
      upd();
      UI.modal({
        title: 'Relação entre cartões', width: 520,
        body: h('div', { class: 'form' },
          UI.field('Tipo:', UI.select([{ value: 'max_per_day', label: 'Máximo de aulas por dia das disciplinas' }, { value: 'not_same_day', label: 'As disciplinas não podem ocorrer no mesmo dia' }], w.type, v => { w.type = v; upd(); })),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Disciplinas:'), h('div', { class: 'row' }, sTxt, h('button', { class: 'btn', onclick: async () => {
            const r = await UI.pickMany('Disciplinas', D.subjects.map(s => ({ id: s.id, label: s.name })), w.subjectIds); if (r) { w.subjectIds = r; upd(); }
          } }, 'Escolher'))),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Aplicar para:'), h('div', { class: 'row' }, cTxt, h('button', { class: 'btn', onclick: async () => {
            const r = await UI.pickMany('Turmas (vazio = todas)', D.classes.map(c => ({ id: c.id, label: c.name })), w.classIds); if (r) { w.classIds = r; upd(); }
          } }, 'Escolher'))),
          maxField),
        buttons: [{ label: 'OK', primary: true, onClick: m => {
          if (!w.subjectIds.length || (w.type === 'not_same_day' && w.subjectIds.length < 2)) { UI.toast(w.type === 'not_same_day' ? 'Escolha ao menos 2 disciplinas.' : 'Escolha as disciplinas.', 'bad'); return; }
          if (rel) Object.assign(rel, w); else D.relations.push(w);
          sel = w.id; Store.commit(); draw(); m.close();
        } }, { label: 'Cancelar' }]
      });
    };
    draw();
    UI.modal({
      title: 'Relações entre cartões', width: 680, body: box, noFocus: true,
      buttons: [
        { label: 'Adicionar', left: true, onClick: () => form(null) },
        { label: 'Editar', left: true, onClick: () => { const r = Core.find(D.relations, sel); if (r) form(r); } },
        { label: 'Remover', left: true, onClick: () => { D.relations = D.relations.filter(r => r.id !== sel); sel = null; Store.commit(); draw(); } },
        { label: 'OK', primary: true }]
    });
  }
};
