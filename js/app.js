/* Aplicativo: barra de ferramentas, assistente, teste, criação, verificação, impressão e arquivos. */
'use strict';

const App = {
  init() {
    const hasData = Store.load();
    // no celular a barra vira um menu recolhido (☰): abre com o botão e fecha ao escolher um item ou tocar fora
    const toolbar = document.getElementById('toolbar'), toggle = document.getElementById('menu-toggle');
    const menu = open => { toolbar.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => menu(!toolbar.classList.contains('open')));
    document.addEventListener('click', e => { if (!e.target.closest('#menu-toggle')) menu(false); });
    document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => App.actions[b.dataset.action]()));
    document.getElementById('zoom').addEventListener('input', e => { Store.ui.zoom = +e.target.value; Store.saveUi(); });
    document.getElementById('file-input').addEventListener('change', App.openFile);
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); App.save(); }
      if (e.key === 'Delete' && !UI.stack.length && Store.ui.selected) {
        const c = Core.find(Store.data.cards, Store.ui.selected);
        if (c && c.day != null && !c.locked) Grid.unplace(c);
      }
    });
    Store.listeners.push(App.render);
    App.render();
    if (!hasData) App.wizard();
  },

  actions: {
    new: () => App.newDoc(), open: () => document.getElementById('file-input').click(), save: () => App.save(), print: () => App.print(),
    subjects: () => Dialogs.entities('subjects'), classes: () => Dialogs.entities('classes'), rooms: () => Dialogs.entities('rooms'), teachers: () => Dialogs.entities('teachers'),
    lessons: () => Dialogs.lessons(null), relations: () => Dialogs.relations(), test: () => App.test(), generate: () => App.generate(), verify: () => App.verify(),
    versions: () => App.versions(), pdf: () => App.print(),
    school: () => Dialogs.school(), wizard: () => App.wizard(), sample: () => App.sample(),
    lockAll: () => { Store.data.cards.forEach(c => { if (c.day != null) c.locked = true; }); Store.commit(); },
    unlockAll: () => { Store.data.cards.forEach(c => { c.locked = false; }); Store.commit(); },
    clearAll: async () => {
      if (!Store.data.cards.some(c => c.day != null && !c.locked)) return;
      if (!await UI.confirm('Remover do horário todos os cartões não travados?', 'Remover')) return;
      Store.data.cards.forEach(c => { if (!c.locked) { c.day = null; c.period = null; c.roomId = null; } });
      Store.commit();
    }
  },

  render() {
    const D = Store.data, ui = Store.ui;
    if (ui.entity !== 'all' && !Core.find(D[ui.view], ui.entity)) ui.entity = 'all';
    const bar = document.getElementById('view-controls');
    bar.textContent = '';
    bar.appendChild(h('div', { class: 'seg' }, ['classes', 'teachers', 'rooms'].map(v => h('button', {
      class: 'seg-btn' + (ui.view === v ? ' active' : ''), onclick: () => { ui.view = v; ui.entity = 'all'; Store.saveUi(); }
    }, TYPES[v].icon + ' ' + TYPES[v].title))));
    bar.appendChild(UI.select([{ value: 'all', label: 'Total' }].concat(D[ui.view].map(e => ({ value: e.id, label: e.name }))), ui.entity, v => { ui.entity = v; Store.saveUi(); }));
    bar.appendChild(h('label', { class: 'inline' }, 'Cores: ', UI.select([{ value: 'teacher', label: 'por professor' }, { value: 'subject', label: 'por disciplina' }], ui.colorBy, v => { ui.colorBy = v; Store.saveUi(); })));
    if (D.versions.length) bar.appendChild(h('label', { class: 'inline' }, 'Versão: ', UI.select([{ value: '', label: '(horário atual)' }].concat(D.versions.map(v => ({ value: v.id, label: v.name }))),
      App.versionMatches(Core.find(D.versions, D.currentVersion)) ? D.currentVersion : '', id => { const v = Core.find(D.versions, id); if (v) App.loadVersion(v); })));
    // validação contínua: toda alteração (inclusive manual) é conferida contra as restrições
    App.issues = Solver.verify(D);
    Grid.badCards = new Set();
    App.issues.forEach(i => { if (i.level === 'error') (i.cards || []).forEach(id => Grid.badCards.add(id)); });
    document.getElementById('zoom').value = ui.zoom;
    const root = document.documentElement.style;
    const single = ui.entity !== 'all';
    root.setProperty('--cw', (single ? ui.zoom * 3.4 : ui.zoom) + 'px');
    root.setProperty('--ch', (single ? Math.max(48, ui.zoom * 1.9) : Math.max(26, ui.zoom * 1.15)) + 'px');
    Grid.render(document.getElementById('grid'), { view: ui.view, entity: ui.entity, interactive: true });
    Grid.renderTray(document.getElementById('tray'));
    Grid.renderInfo(document.getElementById('info'));
    const placed = D.cards.filter(c => c.day != null).length;
    document.getElementById('doc-title').textContent = (D.school.name || 'Escola sem nome') + ' — ' + D.school.year;
    const errors = App.issues.filter(i => i.level === 'error').length, warns = App.issues.length - errors;
    const st = document.getElementById('status');
    st.textContent = '';
    st.appendChild(h('span', null, D.classes.length + ' turmas, ' + D.teachers.length + ' professores, ' + D.subjects.length +
      ' disciplinas, ' + D.rooms.length + ' salas, ' + D.lessons.length + ' aulas  •  cartões no horário: ' + placed + '/' + D.cards.length + '  •  '));
    st.appendChild(h('a', { class: 'st-link ' + (errors ? 'bad' : warns ? 'warn' : 'good'), href: '#', title: 'Abrir a verificação', onclick: e => { e.preventDefault(); App.verify(); } },
      !D.cards.length ? 'sem aulas' : !App.issues.length ? '✔ nenhuma restrição desobedecida' : '✖ ' + errors + ' erro(s)  ⚠ ' + warns + ' aviso(s)'));
    st.appendChild(h('span', { class: 'saved' }, '  •  dados salvos neste navegador'));
    document.title = (D.school.name ? D.school.name + ' — ' : '') + 'Horários';
  },

  /* ---------- Arquivo ---------- */
  hasContent() { const D = Store.data; return !!(D.subjects.length || D.classes.length || D.teachers.length || D.rooms.length); },

  async newDoc() {
    if (App.hasContent() && !await UI.confirm('Criar um novo horário? Os dados atuais serão descartados (use "Salvar" antes, se quiser guardá-los).', 'Novo')) return;
    Store.replace(Core.newDoc());
    App.wizard();
  },

  sample() {
    const load = async (doc, msg) => {
      if (App.hasContent() && !await UI.confirm('Substituir os dados atuais pelo exemplo?', 'Carregar exemplo')) return;
      UI.stack.slice().forEach(m => m.close());
      Store.replace(doc);
      UI.toast(msg);
    };
    const opt = (title, text, fn) => h('button', { class: 'btn choice', onclick: fn }, h('b', null, title), h('span', null, text));
    UI.modal({
      title: 'Exemplos', width: 560, noFocus: true,
      body: h('div', { class: 'choices' },
        opt('Caso real 2 — para gerar', '17 professores, turmas 6A–6C e 7A–7D, 10 disciplinas com nome.',
          () => load(Core.realDoc(2, false), 'Caso real 2 carregado. Clique em "Criar novo" para gerar o horário.')),
        opt('Caso real 2 — com o horário das imagens', 'Os mesmos dados, com os cartões colocados como nas imagens, para comparar com as versões geradas.',
          () => load(Core.realDoc(2, true), 'Caso real 2 carregado com o horário das imagens.')),
        opt('Caso real 1 — para gerar', '16 professores, turmas 6A–6F e 7A–7C, grade cheia de 225 aulas.',
          () => load(Core.realDoc(1, false), 'Caso real 1 carregado. Clique em "Criar novo" para gerar o horário.')),
        opt('Caso real 1 — com o horário da imagem', 'Os mesmos dados, com os cartões colocados como na imagem.',
          () => load(Core.realDoc(1, true), 'Caso real 1 carregado com o horário da imagem.')),
        opt('Escola modelo', '6 turmas, 10 professores, salas fixas, laboratório, quadra, aulas duplas e escolha automática de professor por especialidade.',
          () => load(Core.sampleDoc(), 'Escola modelo carregada. Clique em "Criar novo" para gerar o horário.'))),
      buttons: [{ label: 'Cancelar' }]
    });
  },

  download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  /* JSON com tudo: cadastros, restrições, horário atual e versões (reabre com "Abrir"). */
  save() {
    const D = Store.data;
    App.download(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' }), (D.school.registry || 'horario').replace(/[^\w\-]+/g, '_') + '.horario.json');
  },

  /* Abre um .json salvo por este sistema ou importa um .roz do aSc TimeTables. */
  openFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      const isRoz = /\.roz$/i.test(file.name) || String.fromCharCode.apply(null, bytes.subarray(5, 10)) === 'ASCTT';
      try {
        if (isRoz) {
          const doc = Roz.parse(bytes), info = doc.importInfo;
          delete doc.importInfo;
          Store.replace(doc);
          UI.alert('Importação do aSc TimeTables', 'Arquivo "' + file.name + '" importado:\n' + info.subjects + ' disciplinas, ' + info.teachers + ' professores, ' + info.classes + ' turmas, ' +
            info.lessons + ' aulas e ' + info.placed + ' de ' + info.cards + ' cartões já posicionados.\n\nForam importados cadastros, tempo livre dos professores, aulas e o horário. ' +
            'Salas e as demais restrições do aSc não são importadas — confira em "Verificação".');
          return;
        }
        const doc = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        if (!doc || typeof doc !== 'object' || !doc.school) throw new Error('formato');
        Store.replace(doc);
        UI.toast('Arquivo "' + file.name + '" aberto.');
      } catch (err) {
        UI.alert('Abrir', isRoz ? 'Não foi possível importar este arquivo .roz: ' + err.message : 'Não foi possível ler o arquivo: ele não é um horário salvo por este sistema (.json) nem um arquivo do aSc (.roz).');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  /* ---------- Assistente ---------- */
  wizard(start) {
    const types = ['subjects', 'classes', 'rooms', 'teachers'];
    let step = start || 1;
    const content = h('div', { class: 'wiz-content' }), back = h('button', { class: 'btn' }, '< Voltar'), next = h('button', { class: 'btn primary' }, 'Avançar >');
    const draw = () => {
      modal.setTitle('Assistente: Passo ' + step + ' de 7');
      back.disabled = step === 1; next.disabled = step === 7;
      content.textContent = '';
      if (step === 1) content.appendChild(h('div', { class: 'wiz-text' }, h('div', { class: 'wiz-ico' }, '🎩'), h('div', null,
        h('p', null, 'Bem-vindo! Este é o assistente que o ajudará a criar o horário da escola.'),
        h('p', null, 'Você vai inserir as informações necessárias nas páginas a seguir: dados da escola, disciplinas, turmas, salas e professores — e as aulas que ligam professor, disciplina, turma e sala.'),
        h('p', null, 'Ao terminar de preencher cada página, pressione "Avançar". Para corrigir dados anteriores, pressione "Voltar".'),
        h('p', null, 'Tudo pode ser alterado depois pela barra de ferramentas.'),
        h('p', null, h('button', { class: 'btn', onclick: () => App.sample() }, 'Prefiro começar pela escola de exemplo')))));
      else if (step === 2) content.appendChild(Dialogs.schoolForm());
      else if (step <= 6) content.appendChild(Dialogs.entityPanel(types[step - 3], { onType: k => { step = types.indexOf(k) + 3; modal.setTitle('Assistente: Passo ' + step + ' de 7'); back.disabled = false; next.disabled = false; } }).el);
      else content.appendChild(h('div', { class: 'wiz-text' }, h('div', { class: 'wiz-ico' }, '👑'), h('div', null,
        h('p', null, 'Para criar o horário, pressione o botão "Criar horário".'),
        h('p', null, h('button', { class: 'btn big primary', onclick: () => { modal.close(); App.generate(); } }, 'Criar horário')),
        h('p', null, 'As funções de teste, criação e verificação também estão na barra de ferramentas, assim como as listas de disciplinas, turmas, salas e professores.'),
        h('p', null, 'Depois de criado, o horário pode ser ajustado arrastando os cartões na grade.'))));
    };
    back.onclick = () => { if (step > 1) { step--; draw(); } };
    next.onclick = () => { if (step < 7) { step++; draw(); } };
    const modal = UI.modal({
      title: '', width: 900, className: 'tall', noFocus: true,
      body: h('div', { class: 'wizard' }, content, h('div', { class: 'wiz-foot' },
        h('button', { class: 'btn', onclick: () => App.save() }, '💾 Salvar'), h('div', { class: 'grow' }), back, next, h('button', { class: 'btn', onclick: () => modal.close() }, 'Fechar')))
    });
    draw();
  },

  /* ---------- Teste ---------- */
  test() {
    const D = Store.data;
    const res = Solver.test(D);
    const cats = [['geral', 'Geral'], ['turmas', 'Turmas'], ['professores', 'Professores'], ['disciplinas', 'Disciplinas'], ['salas', 'Salas']];
    const all = [];
    cats.forEach(c => res[c[0]].forEach(x => all.push(x)));
    all.sort((a, b) => a.ok - b.ok);
    UI.modal({
      title: 'Teste do horário', width: 620, noFocus: true,
      body: h('div', { class: 'test' },
        h('div', { class: 'bar ' + (res.ok ? 'good' : 'bad') }, res.ok ? 'O teste não encontrou falhas.' : 'O teste encontrou problemas que impedem a criação completa.'),
        h('div', { class: 'test-cats' }, cats.map(c => h('div', null, h('div', { class: 'big-mark ' + (res[c[0]].some(x => !x.ok) ? 'bad' : 'good') }, res[c[0]].some(x => !x.ok) ? '✖' : '✔'), c[1]))),
        h('div', { class: 'msg-list' }, all.map(x => h('div', { class: x.ok ? 'ok' : 'bad' }, (x.ok ? '✔ ' : '✖ ') + x.text)))),
      buttons: [{ label: 'Ok', primary: true }]
    });
    return res;
  },

  /* ---------- Criação ---------- */
  generate() {
    const D = Store.data;
    if (!D.lessons.length) { UI.alert('Criação de horário', 'Ainda não há aulas cadastradas. Abra Turmas (ou Disciplinas/Professores), selecione um registro e use o botão "Aulas".'); return; }
    const o = { method: 'milp', versions: 1, complexity: 1, strict: true, restricted: false, autoTeachers: true };
    const slider = h('input', { type: 'range', min: 1, max: 3, step: 1, value: 1, oninput: e => { o.complexity = +e.target.value; } });
    const radio = (name, label, hint, checked, set) => h('label', { class: 'check' }, h('input', { type: 'radio', name: name, checked: checked, onchange: set }), h('span', null, label, h('small', null, hint)));
    const modal = UI.modal({
      title: 'Criação de horário', width: 600, noFocus: true,
      body: h('div', { class: 'gen' },
        h('div', { class: 'row' }, h('p', { class: 'grow' }, h('b', null, 'É bom testar o horário antes da sua criação, principalmente depois de alterações maiores nos cadastros.')),
          h('button', { class: 'btn', onclick: () => App.test() }, 'Testar o horário')),
        h('button', { class: 'btn big primary start', onclick: () => { modal.close(); App.runGeneration(o); } }, 'Iniciar criação de horário'),
        h('fieldset', null, h('legend', null, 'Método de resolução'),
          radio('method', '📐 Programação linear inteira (pesquisa operacional)', 'As restrições viram um modelo matemático resolvido pelo HiGHS (branch-and-cut); a busca local só dá o polimento final.', true, () => { o.method = 'milp'; }),
          radio('method', '🎲 Somente heurística (busca local)', 'Mais rápida em escolas muito grandes; não usa o modelo matemático.', false, () => { o.method = 'heur'; }),
          h('label', { class: 'inline' }, 'Versões a gerar: ', UI.select([1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) })), 1, v => { o.versions = +v; }),
            h('span', { class: 'hint' }, ' cada versão é um horário diferente que obedece às mesmas restrições; todas ficam guardadas em "Versões".'))),
        h('fieldset', null, h('legend', null, 'Professores'),
          UI.check(['★ Usar professores automáticos em todas as aulas', h('small', null, 'Como o botão de "Aulas": os professores atuais são descartados e cada aula recebe um professor com a ' +
            'especialidade da disciplina. Ficam como estão as aulas sem especialista e as que têm cartão travado. Desmarque para manter os professores já definidos.')],
            o.autoTeachers, v => { o.autoTeachers = v; })),
        h('div', { class: 'row top' },
          h('fieldset', { class: 'grow' }, h('legend', null, 'Complexidade da criação'),
            h('div', { class: 'cx' }, h('span', null, '🙂', h('br'), 'Normal'), h('span', null, '🧑‍💼', h('br'), 'Grande'), h('span', null, '👥', h('br'), 'Enorme')), slider,
            h('p', { class: 'hint' }, 'Quanto maior, mais tempo o resolvedor tem para procurar um horário melhor.')),
          h('fieldset', null, h('legend', null, 'Restrições'),
            radio('strict', '😊 Permitir relaxamento de condições', 'Pode usar posições condicionais (?) do tempo livre.', false, () => { o.strict = false; o.restricted = false; }),
            radio('strict', '⛔ Rigoroso', 'Só usa posições adequadas (✔).', true, () => { o.strict = true; o.restricted = false; }),
            radio('strict', '🔒 Restrito', 'Só posições adequadas (✔) e nenhuma condição quebrada: a aula que não couber fica na bandeja.', false, () => { o.strict = true; o.restricted = true; }))),
        h('p', { class: 'hint' }, 'Os cartões travados (🔒) permanecem onde estão; os demais são redistribuídos.')),
      buttons: [{ label: 'Cancelar' }]
    });
  },

  /* Modelo de PLI: em http(s) roda num Web Worker; aberto direto do disco (file://) roda na própria página. */
  milpSolve(D, opts, ctl) {
    if (/^https?:$/.test(location.protocol) && window.Worker) {
      return new Promise((resolve, reject) => {
        const w = new Worker('js/milp-worker.js');
        ctl.abort = () => { w.terminate(); reject(new Error('cancel')); };
        w.onmessage = e => { w.terminate(); ctl.abort = null; if (e.data.ok) resolve(e.data.result); else reject(new Error(e.data.error)); };
        w.onerror = e => { w.terminate(); ctl.abort = null; reject(new Error(e.message || 'worker')); };
        w.postMessage({ data: D, opts: opts });
      });
    }
    return new Promise(r => setTimeout(r, 80)).then(() => Milp.solve(D, Object.assign({ timeLimit: (opts.restricted ? [25, 45, 90] : [10, 25, 60])[opts.complexity - 1] }, opts)));
  },

  runHeuristic(D, opts, ctl, onProgress) {
    return new Promise((resolve, reject) => {
      const gen = Solver.generate(D, opts);
      const tick = () => {
        if (ctl.cancelled) { reject(new Error('cancel')); return; }
        const until = Date.now() + 40;
        let r;
        do { r = gen.next(); } while (!r.done && Date.now() < until);
        if (r.done) { resolve(r.value); return; }
        onProgress(r.value);
        setTimeout(tick, 0);
      };
      setTimeout(tick, 0);
    });
  },

  async runGeneration(o) {
    const D = Store.data, t0 = Date.now();
    const fill = h('div', { class: 'progress-fill' }), text = h('div', { class: 'hint' }, 'Preparando…');
    const ctl = { cancelled: false, abort: null };
    let finished = false;
    const modal = UI.modal({
      title: 'Criando o horário…', width: 480, noFocus: true, body: h('div', null, h('div', { class: 'progress' }, fill), text),
      onClose: () => { if (!finished) { ctl.cancelled = true; if (ctl.abort) ctl.abort(); } }, buttons: [{ label: 'Cancelar' }]
    });
    const backup = JSON.stringify(D.cards), teachersBackup = D.lessons.map(l => [l, l.teacherIds.slice(), !!l.autoTeacher]);
    const made = [];
    let autoCount = 0;
    const base = Date.now() & 0xffffff;
    try {
      if (o.autoTeachers) Solver.setAutoTeachers(D, true); // aulas com cartão travado mantêm o professor
      autoCount = Solver.autoAssignTeachers(D).assigned;
      Core.syncCards(D);
      for (let i = 0; i < o.versions; i++) {
        const label = o.versions > 1 ? 'Versão ' + (i + 1) + ' de ' + o.versions + ' — ' : '';
        const opts = Object.assign({}, o, { seed: base + i * 7919 });
        let milp = null;
        if (o.method === 'milp') {
          fill.style.width = Math.round((i / o.versions) * 100) + '%';
          text.textContent = label + 'resolvendo o modelo de programação linear inteira (HiGHS)…' + (/^https?:$/.test(location.protocol) ? '' : ' a página pode ficar sem responder por alguns segundos.');
          try { milp = await App.milpSolve(D, opts, ctl); }
          catch (err) { if (err.message === 'cancel' || ctl.cancelled) throw new Error('cancel'); UI.toast('O resolvedor de programação inteira falhou (' + err.message + '); usando a heurística.', 'bad'); }
          if (ctl.cancelled) throw new Error('cancel');
          if (milp) opts.start = milp.placements;
        }
        const stats = await App.runHeuristic(D, opts, ctl, v => {
          const part = v.phase === 1 ? v.progress * 0.3 : 0.3 + v.progress * 0.7;
          fill.style.width = Math.round(((i + (milp ? 0.5 + part / 2 : part)) / o.versions) * 100) + '%';
          text.textContent = label + (v.phase === 1 ? 'colocando os cartões restantes sem choques… ' : v.phase === 2 ? 'polindo janelas e distribuição… ' : 'retirando o que quebra condições… ') + v.iterations.toLocaleString('pt-BR') + ' horários verificados';
        });
        if (autoCount) stats.autoAssigned = autoCount;
        const version = App.saveVersion(null, milp ? 'Programação inteira' : 'Heurística');
        made.push({ version: version, stats: stats, milp: milp && milp.info });
      }
    } catch (err) {
      finished = true; modal.close();
      D.cards = JSON.parse(backup);
      teachersBackup.forEach(x => { x[0].teacherIds = x[1]; x[0].autoTeacher = x[2]; });
      Store.commit();
      if (err.message === 'cancel') UI.toast('Criação cancelada; o horário anterior foi mantido.');
      else UI.alert('Criação de horário', 'Ocorreu um erro: ' + err.message);
      return;
    }
    finished = true; modal.close();
    const best = made.slice().sort((a, b) => a.stats.unplaced - b.stats.unplaced || a.stats.broken - b.stats.broken)[0];
    App.loadVersion(best.version);
    App.result(best, made, Date.now() - t0);
  },

  result(best, made, ms) {
    const s = best.stats;
    const sec = Math.round(ms / 1000), time = [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(n => String(n).padStart(2, '0')).join(':');
    const ok = !s.unplaced;
    const line = (k, v) => h('div', { class: 'res-line' }, h('span', null, k), h('b', null, String(v)));
    UI.modal({
      title: ok ? 'Sucesso — Criação completa' : 'Criação incompleta', width: 540, noFocus: true,
      body: h('div', { class: 'result' },
        h('div', { class: 'res-ico' }, ok && !s.broken ? '😀' : ok ? '🙂' : '😕'),
        h('div', { class: 'grow' },
          line('Período:', time), line('Horários verificados:', s.iterations.toLocaleString('pt-BR')),
          best.milp ? [line('Modelo de programação inteira:', best.milp.vars.toLocaleString('pt-BR') + ' variáveis (' + best.milp.binaries.toLocaleString('pt-BR') + ' binárias), ' + best.milp.rows.toLocaleString('pt-BR') + ' restrições'),
            line('Resultado do HiGHS:', Milp.statusText(best.milp.status))] : line('Método:', 'Heurística (busca local)'),
          line('Professor mais complicado:', s.hardestTeacher || '—'), line('Turma mais complicada:', s.hardestClass || '—'),
          line('Condições quebradas:', s.broken), line('Cartões ainda não colocados:', s.unplaced + ' de ' + s.total),
          s.autoAssigned ? h('p', { class: 'hint' }, s.autoAssigned + ' aula(s) receberam professor automaticamente, conforme a especialidade.') : null,
          made.length > 1 ? h('p', { class: 'hint' }, made.length + ' versões geradas: ' + made.map(m => m.version.name + ' (' + m.stats.unplaced + ' não colocados, ' + m.stats.broken + ' condições)').join('; ') +
            '. A melhor (' + best.version.name + ') está aberta; troque em "Versões".') : null,
          !ok ? h('p', { class: 'hint' }, 'Os cartões restantes ficaram na bandeja. Rode o "Teste", aumente a complexidade, escolha restrições menos exigentes (Rigoroso ou relaxamento) ou reveja os tempos livres.') : null,
          s.broken ? h('div', { class: 'msg-list small' }, s.violations.slice(0, 50).map(t => h('div', { class: 'warn' }, '⚠ ' + t))) : null)),
      buttons: [{ label: 'OK', primary: true }]
    });
  },

  /* ---------- Versões do horário ---------- */
  saveVersion(name, method) {
    const D = Store.data, issues = Solver.verify(D);
    const n = D.versions.reduce((m, v) => Math.max(m, +(/^Versão (\d+)/.exec(v.name) || [0, 0])[1]), 0) + 1;
    const v = {
      id: Core.uid('v'), name: name || 'Versão ' + n, created: new Date().toISOString(), method: method || 'Manual',
      unplaced: D.cards.filter(c => c.day == null).length, errors: issues.filter(i => i.level === 'error' && !/não colocado/.test(i.text)).length,
      warnings: issues.filter(i => i.level === 'warn').length,
      placements: D.cards.filter(c => c.day != null).map(c => ({ id: c.id, day: c.day, period: c.period, roomId: c.roomId, locked: !!c.locked })),
      // o professor de cada aula faz parte da versão: a criação pode redistribuí-los
      teachers: Object.fromEntries(D.lessons.map(l => [l.id, l.teacherIds.slice()]))
    };
    D.versions.push(v);
    D.currentVersion = v.id;
    Store.commit();
    return v;
  },

  loadVersion(v) {
    const D = Store.data, pos = new Map(v.placements.map(p => [p.id, p]));
    if (v.teachers) D.lessons.forEach(l => { const t = v.teachers[l.id]; if (t) l.teacherIds = t.filter(id => Core.find(D.teachers, id)); });
    D.cards.forEach(c => {
      const p = pos.get(c.id);
      c.day = p ? p.day : null; c.period = p ? p.period : null; c.roomId = p ? p.roomId : null; c.locked = !!(p && p.locked);
    });
    D.currentVersion = v.id;
    Store.ui.selected = null;
    Store.commit();
  },

  /* O horário na tela ainda é exatamente o desta versão? (falso depois de alterações manuais) */
  versionMatches(v) {
    if (!v) return false;
    const placed = Store.data.cards.filter(c => c.day != null);
    if (placed.length !== v.placements.length) return false;
    const pos = new Map(v.placements.map(p => [p.id, p]));
    return placed.every(c => { const p = pos.get(c.id); return p && p.day === c.day && p.period === c.period && (p.roomId || null) === (c.roomId || null); });
  },

  versions() {
    const D = Store.data;
    let sel = D.currentVersion;
    const box = h('div', { class: 'table-wrap', style: 'height:280px' });
    const draw = () => {
      box.textContent = '';
      box.appendChild(h('table', { class: 'grid-table' },
        h('thead', null, h('tr', null, ['Versão', 'Criada em', 'Método', 'Não colocados', 'Erros', 'Avisos', ''].map(t => h('th', null, t)))),
        h('tbody', null, D.versions.map(v => h('tr', { class: v.id === sel ? 'sel' : '', onclick: () => { sel = v.id; draw(); }, ondblclick: () => { App.loadVersion(v); draw(); } },
          h('td', null, v.name), h('td', null, new Date(v.created).toLocaleString('pt-BR')), h('td', null, v.method),
          h('td', { class: 'num' }, String(v.unplaced)), h('td', { class: 'num' }, String(v.errors)), h('td', { class: 'num' }, String(v.warnings)),
          h('td', null, App.versionMatches(v) ? '● aberta' : ''))))));
      if (!D.versions.length) box.appendChild(h('div', { class: 'empty' }, 'Nenhuma versão guardada. Cada criação de horário gera uma versão; você também pode guardar o horário atual.'));
    };
    draw();
    const cur = () => Core.find(D.versions, sel);
    UI.modal({
      title: 'Versões do horário', width: 760, noFocus: true,
      body: h('div', null, h('p', { class: 'hint' }, 'Cada versão é um horário completo para as mesmas restrições. Abra uma para vê-la na grade; alterações manuais podem ser guardadas como nova versão.'), box),
      buttons: [
        { label: 'Abrir', left: true, primary: true, onClick: () => { if (cur()) { App.loadVersion(cur()); draw(); } } },
        { label: 'Guardar horário atual', left: true, onClick: async () => { const n = await UI.askText('Nova versão', 'Nome da versão:', ''); if (n !== null) { sel = App.saveVersion(n || null, 'Manual').id; draw(); } } },
        { label: 'Renomear', left: true, onClick: async () => { const v = cur(); if (!v) return; const n = await UI.askText('Renomear versão', 'Nome:', v.name); if (n) { v.name = n; Store.commit(); draw(); } } },
        { label: 'Excluir', left: true, onClick: () => { if (!cur()) return; D.versions = D.versions.filter(v => v.id !== sel); sel = null; Store.commit(); draw(); } },
        { label: 'Fechar' }]
    });
  },

  /* ---------- Verificação ---------- */
  verify() {
    const issues = Solver.verify(Store.data);
    const errors = issues.filter(i => i.level === 'error').length;
    UI.modal({
      title: 'Verificação do horário', width: 620, noFocus: true,
      body: h('div', { class: 'test' },
        h('div', { class: 'bar ' + (errors ? 'bad' : issues.length ? 'warn' : 'good') },
          !issues.length ? 'O horário está completo e sem condições quebradas.' : errors + ' erro(s) e ' + (issues.length - errors) + ' aviso(s).'),
        h('div', { class: 'msg-list' }, issues.map(i => h('div', { class: i.level === 'error' ? 'bad' : 'warn' }, (i.level === 'error' ? '✖ ' : '⚠ ') + i.text)))),
      buttons: [{ label: 'OK', primary: true }]
    });
  },

  /* ---------- Impressão ---------- */
  print() {
    const D = Store.data, ui = Store.ui;
    const o = { sum: { classes: true, teachers: false, rooms: false }, ind: { classes: ui.view === 'classes', teachers: ui.view === 'teachers', rooms: ui.view === 'rooms' } };
    const SUM = { classes: 'Horário resumido das turmas', teachers: 'Horário resumido dos professores', rooms: 'Horário resumido das salas' };
    const paper = h('div', { class: 'paper' });
    const page = (title, view, entity) => {
      const host = h('div');
      Grid.render(host, { view: view, entity: entity, interactive: false });
      return h('section', { class: 'page' }, h('h2', null, title), h('div', { class: 'page-sub' }, (D.school.name || '') + (D.school.name ? ' — ' : '') + D.school.year), host);
    };
    const draw = () => {
      paper.textContent = '';
      Object.keys(SUM).forEach(v => { if (o.sum[v] && D[v].length) paper.appendChild(page(SUM[v], v, 'all')); });
      Object.keys(SUM).forEach(v => { if (o.ind[v]) D[v].forEach(e => paper.appendChild(page(TYPES[v].one + ': ' + e.name, v, e.id))); });
      if (!paper.children.length) paper.appendChild(h('div', { class: 'empty' }, 'Nada selecionado para imprimir.'));
    };
    const checks = kind => Object.keys(SUM).map(v => UI.check(TYPES[v].title, o[kind][v], x => { o[kind][v] = x; draw(); }));
    draw();
    UI.modal({
      title: 'Imprimir / salvar em PDF', className: 'full', noFocus: true,
      body: h('div', { class: 'print-view' },
        h('div', { class: 'print-opts' }, h('b', null, 'Resumidos:'), checks('sum'), h('b', null, 'Individuais:'), checks('ind')),
        h('div', { class: 'print-scroll' }, paper)),
      buttons: [{ label: '📄 Salvar em PDF', primary: true, onClick: () => {
        const sections = [];
        Object.keys(SUM).forEach(v => { if (o.sum[v] && D[v].length) sections.push({ title: SUM[v], view: v, entity: 'all' }); });
        Object.keys(SUM).forEach(v => { if (o.ind[v]) D[v].forEach(e => sections.push({ title: TYPES[v].one + ': ' + e.name, view: v, entity: e.id })); });
        if (!sections.length) { UI.toast('Nada selecionado.', 'bad'); return; }
        Pdf.export(sections, (D.school.registry || 'horario').replace(/[^\w\-]+/g, '_') + '.pdf');
      } }, { label: '🖨️ Imprimir', onClick: () => {
        const root = h('div', { id: 'print-root' }, paper.cloneNode(true));
        document.body.appendChild(root);
        document.body.classList.add('printing');
        const done = () => { document.body.classList.remove('printing'); root.remove(); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        window.print();
      } }, { label: 'Fechar' }]
    });
  }
};

document.addEventListener('DOMContentLoaded', App.init);
