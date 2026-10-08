/* Geração por Pesquisa Operacional: o horário é formulado como um modelo de Programação Linear
   Inteira (PLI) e resolvido pelo HiGHS (branch-and-cut, compilado para WebAssembly).

   Variáveis de decisão
     y[g,d,p] ∈ {0,1}  um cartão do grupo g (aula + duração) começa no dia d, tempo p
     u[g]     ∈ Z+     cartões do grupo g que ficaram sem posição (folga, fortemente penalizada)
   Restrições rígidas
     Σ y[g,·,·] + u[g] = nº de cartões de g              (toda aula é dada)
     Σ y que ocupam (professor, d, p) ≤ 1                 (professor em um lugar só)
     Σ y que ocupam (turma/grupo, d, p) ≤ 1               (turma em uma aula só; grupos da mesma divisão podem coincidir)
     Σ y que precisam das salas de S em (d, p) ≤ |S|      (capacidade de salas)
     posições "inadequadas" do tempo livre e choques com cartões travados não geram variável
   Função objetivo (minimizar): janelas de turmas e professores, início tardio da turma, disciplina
     repetida no dia, limites por dia, relações entre cartões, posições condicionais e aula zero. */
(function (root) {
  'use strict';
  const Core = root.Core || require('./core.js');
  const Solver = root.Solver || require('./solver.js');
  const W = { unplaced: 3000, cgap: 60, late: 35, lateAllowed: 3, zero: 12, tgap: 4, limit: 50, dist: 45, cond: 15 };

  let highsPromise = null;
  function getHighs() {
    if (highsPromise) return highsPromise;
    let loader, binary;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function' && !root.HIGHS_WASM_B64) {
      loader = require('../vendor/highs.js');
      binary = Buffer.from(require('../vendor/highs-wasm.js'), 'base64');
    } else {
      loader = root.Module;
      const bin = atob(root.HIGHS_WASM_B64);
      binary = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) binary[i] = bin.charCodeAt(i);
    }
    // o binário vai embutido para funcionar também abrindo o index.html direto do disco (file://)
    highsPromise = loader({
      print: () => {}, printErr: () => {},
      instantiateWasm: (imports, receive) => { WebAssembly.instantiate(binary, imports).then(r => receive(r.instance)); return {}; }
    });
    return highsPromise;
  }

  function buildModel(data, opts) {
    const P = data.school.params || {};
    const M = Solver.buildModel(data, { generating: true, strict: !!opts.strict });
    const D = M.D, PW = M.PW, first = M.genFirst, last = M.last;
    M.cards.forEach(m => { const c = m.ref; if (c.locked && c.day != null) { M.place(m, c.day, c.period, M.R.get(c.roomId) || null); m.locked = true; } });

    const obj = [], rows = [], binaries = [], generals = [];
    let nv = 0;
    const newVar = (prefix, cost, kind) => {
      const name = prefix + (nv++);
      if (cost) obj.push([cost, name]);
      if (kind === 'bin') binaries.push(name); else if (kind === 'int') generals.push(name);
      return name;
    };
    // linha: Σ coef·var (op) rhs
    const row = (terms, op, rhs) => { if (terms.length) rows.push({ terms: terms, op: op, rhs: rhs }); };
    const sum = (vars, coef) => vars.map(v => [coef || 1, v]);

    // ---- grupos de cartões idênticos e variáveis y ----
    const groups = new Map();
    M.cards.forEach(m => {
      if (m.locked) return;
      const key = m.lesson.id + '|' + m.dur;
      if (!groups.has(key)) groups.set(key, { rep: m, cards: [], vars: [] });
      groups.get(key).cards.push(m);
    });
    const slot = () => new Map();                       // id -> Map(idx -> [..])
    const tCover = slot(), cCover = slot(), setCover = slot();
    const push = (map, id, idx, v) => { if (!map.has(id)) map.set(id, new Map()); const mm = map.get(id); if (!mm.has(idx)) mm.set(idx, []); mm.get(idx).push(v); };
    const starts = [];                                  // {name, g, d, p}
    const distKey = new Map(), subjDay = new Map();     // chave|dia -> [vars]
    const roomSets = new Map();

    groups.forEach(g => {
      const m = g.rep;
      const exclusive = m.rooms.length && !m.rooms.some(r => r.shared);
      const setKey = exclusive ? m.rooms.map(r => r.id).sort().join(',') : null;
      if (setKey && !roomSets.has(setKey)) roomSets.set(setKey, m.rooms.map(r => r.id));
      for (let d = 0; d < D; d++) {
        for (let p = first; p + m.dur - 1 <= last; p++) {
          if (!M.conflictsFor(m, d, p)) continue;        // inadequado, sem sala ou choque com travado
          let cost = 0;
          if (m.st[d * PW + p] === 1) cost += W.cond * m.dur;
          if (p === 0) cost += W.zero;
          const name = newVar('y', cost, 'bin');
          g.vars.push(name);
          starts.push({ name: name, g: g, d: d, p: p });
          for (let k = 0; k < m.dur; k++) {
            const idx = d * PW + p + k;
            m.teachers.forEach(t => push(tCover, t.id, idx, name));
            m.classes.forEach(c => push(cCover, c.id, idx, { v: name, div: c.divId, grp: c.groupId }));
            if (setKey) push(setCover, setKey, idx, name);
          }
          if (m.subject) {
            m.classes.forEach(c => {
              const dk = c.id + '|' + m.subject.id + '|' + (c.groupId || '') + '#' + d;
              if (!distKey.has(dk)) distKey.set(dk, []);
              distKey.get(dk).push(name);
              const sk = c.id + '|' + m.subject.id + '#' + d;
              if (!subjDay.has(sk)) subjDay.set(sk, []);
              subjDay.get(sk).push([m.dur, name]);
            });
            if (!m.classes.length) { const dk = 'L' + m.lesson.id + '#' + d; if (!distKey.has(dk)) distKey.set(dk, []); distKey.get(dk).push(name); }
          }
        }
      }
      g.slack = newVar('u', W.unplaced * m.dur, 'int');
      row(sum(g.vars).concat([[1, g.slack]]), '=', g.cards.length);
    });

    // ---- professor: no máximo uma aula por tempo ----
    // "tight": quem tem a grade cheia (carga = posições disponíveis) ocupa exatamente todas elas; a igualdade
    // fortalece a relaxação linear e o HiGHS acha soluções completas muito mais rápido.
    const isFull = (type, id, cover) => !!opts.tight && !!cover && Core.periodsOf(data, type, id) === cover.size;
    tCover.forEach((mm, tid) => { const eq = isFull('teachers', tid, mm) && !M.occT.get(tid).some(a => a.length); mm.forEach(vars => { if (eq) row(sum(vars), '=', 1); else if (vars.length > 1) row(sum(vars), '<=', 1); }); });

    // ---- turma: no máximo uma aula por tempo (cliques de grupos que se chocam) ----
    const cliquesOf = new Map();
    data.classes.forEach(c => {
      const used = new Map();
      M.cards.forEach(m => m.classes.forEach(x => { if (x.id === c.id && x.groupId) { if (!used.has(x.divId)) used.set(x.divId, new Set()); used.get(x.divId).add(x.groupId); } }));
      let cliques = [{}];
      used.forEach((grps, div) => { const next = []; cliques.forEach(q => grps.forEach(gid => next.push(Object.assign({}, q, { [div]: gid })))); cliques = next.slice(0, 64); });
      cliquesOf.set(c.id, cliques);
    });
    const cliqueTerms = (cid, entries) => cliquesOf.get(cid).map(q => entries.filter(e => !e.div || q[e.div] === e.grp).map(e => e.v));
    cCover.forEach((mm, cid) => mm.forEach(entries => {
      if (cliquesOf.get(cid).length === 1 && isFull('classes', cid, mm) && !M.occC.get(cid).some(a => a.length)) { row(sum(entries.map(e => e.v)), '=', 1); return; }
      const seen = new Set();
      cliqueTerms(cid, entries).forEach(vars => { const k = vars.join(','); if (vars.length > 1 && !seen.has(k)) { seen.add(k); row(sum(vars), '<=', 1); } });
    }));

    // ---- salas: para cada conjunto de salas candidatas S, quem só cabe em S não pode exceder |S| ----
    roomSets.forEach((ids, key) => {
      const subsets = Array.from(roomSets.keys()).filter(k => roomSets.get(k).every(id => ids.indexOf(id) >= 0));
      for (let d = 0; d < D; d++) for (let p = first; p <= last; p++) {
        const idx = d * PW + p;
        let vars = [];
        subsets.forEach(k => { const v = setCover.get(k) && setCover.get(k).get(idx); if (v) vars = vars.concat(v); });
        const cap = ids.filter(id => M.off(M.R.get(id), d, p) !== 2 && !M.occR.get(id)[idx].length).length;
        if (vars.length > cap) row(sum(vars), '<=', cap);
      }
    });

    // ---- distribuição: mesma disciplina repetida no dia além do inevitável (mole) ----
    if (P.distribution !== false) {
      const total = new Map(), lockedDay = new Map();
      M.cards.forEach(m => {
        const keys = m.classes.length ? m.classes.map(c => c.id + '|' + (m.subject ? m.subject.id : '') + '|' + (c.groupId || '')) : ['L' + m.lesson.id];
        keys.forEach(k => { total.set(k, (total.get(k) || 0) + 1); if (m.locked) lockedDay.set(k + '#' + m.day, (lockedDay.get(k + '#' + m.day) || 0) + 1); });
      });
      distKey.forEach((vars, dk) => {
        const k = dk.slice(0, dk.lastIndexOf('#'));
        const allow = Math.max(0, Math.ceil(total.get(k) / D) - (lockedDay.get(dk) || 0));
        if (vars.length > allow) row(sum(vars).concat([[-1, newVar('o', W.dist)]]), '<=', allow);
      });
    }

    // ---- limites por dia: disciplina e relações entre cartões (moles) ----
    data.classes.forEach(c => {
      for (let d = 0; d < D; d++) {
        const of = sid => subjDay.get(c.id + '|' + sid + '#' + d) || [];
        data.subjects.forEach(s => { const t = of(s.id); if (s.maxPerDay != null && t.length) row(t.concat([[-1, newVar('o', W.limit)]]), '<=', s.maxPerDay); });
        data.relations.forEach(r => {
          if (r.classIds && r.classIds.length && r.classIds.indexOf(c.id) < 0) return;
          if (r.type === 'max_per_day') {
            let t = []; r.subjectIds.forEach(sid => { t = t.concat(of(sid)); });
            if (t.length) row(t.concat([[-1, newVar('o', W.limit)]]), '<=', r.max);
          } else {
            const zs = [];
            r.subjectIds.forEach(sid => { const t = of(sid); if (!t.length) return; const z = newVar('z', 0); zs.push(z); t.forEach(x => row([[1, z], [-1, x[1]]], '>=', 0)); });
            if (zs.length > 1) row(sum(zs).concat([[-1, newVar('o', W.limit)]]), '<=', 1);
          }
        });
      }
    });

    // ---- janelas: s[p] = "já começou", e[p] = "ainda não terminou"; janela[p] ≥ s[p] + e[p] − 1 − ocupado[p] ----
    function gaps(cover, lockedOcc, wGap, lateOf, sumsOf, maxPerDay, load) {
      if (!cover) return;
      // grade cheia: se a carga ocupa todas as posições disponíveis, não existe janela possível
      // (dispensa centenas de variáveis auxiliares e deixa o modelo bem mais fácil)
      let avail = 0;
      for (let i = 0; i < lockedOcc.length; i++) if (cover.has(i) || lockedOcc[i].length) avail++;
      const full = load != null && load >= avail;
      for (let d = 0; d < D; d++) {
        const busy = [];
        let any = false;
        for (let p = first; p <= last; p++) {
          const e = cover.get(d * PW + p) || [], lock = lockedOcc[d * PW + p].length ? 1 : 0;
          busy.push({ p: p, entries: e, lock: lock });
          if (e.length || lock) any = true;
        }
        if (!any) continue;
        if (maxPerDay != null) {
          let t = [], fixed = 0;
          busy.forEach(b => { t = t.concat(sum(b.entries)); fixed += b.lock; });
          if (t.length + fixed > maxPerDay) row(t.concat([[-1, newVar('o', W.limit)]]), '<=', maxPerDay - fixed);
        }
        if (full) continue;
        const s = busy.map(() => newVar('s', 0)), e = busy.map(() => newVar('e', 0));
        busy.forEach((b, i) => {
          if (b.lock) { row([[1, s[i]]], '>=', 1); row([[1, e[i]]], '>=', 1); }
          sumsOf(b.entries).forEach(vars => { if (vars.length) { row([[1, s[i]]].concat(sum(vars, -1)), '>=', 0); row([[1, e[i]]].concat(sum(vars, -1)), '>=', 0); } });
          if (i > 0) row([[1, s[i]], [-1, s[i - 1]]], '>=', 0);
          if (i + 1 < busy.length) row([[1, e[i]], [-1, e[i + 1]]], '>=', 0);
          const all = sumsOf(b.entries, true)[0] || [];
          if (i > 0 && i + 1 < busy.length && !b.lock) row([[1, newVar('w', wGap)], [-1, s[i]], [-1, e[i]]].concat(sum(all)), '>=', -1);
          const wLate = lateOf ? lateOf(d, b.p) : 0;
          if (wLate && i + 1 < busy.length) row([[1, newVar('h', wLate)], [-1, e[i]], [1, s[i]]], '>=', 0);
        });
      }
    }
    data.teachers.forEach(t => gaps(tCover.get(t.id), M.occT.get(t.id), W.tgap, null, (e, all) => [e], t.maxPerDay, Core.periodsOf(data, 'teachers', t.id)));
    data.classes.forEach(c => gaps(cCover.get(c.id), M.occC.get(c.id), W.cgap,
      (d, p) => { let ref = 1; while (ref < last && M.off(c, d, ref) === 2) ref++; return p >= ref ? (c.allowLateStart ? W.lateAllowed : W.late) : 0; },
      (entries, all) => all ? [entries.map(x => x.v)] : cliqueTerms(c.id, entries), null,
      cliquesOf.get(c.id).length === 1 ? Core.periodsOf(data, 'classes', c.id) : null));

    // ---- texto no formato LP ----
    const fmt = terms => {
      let out = '', line = '';
      terms.forEach((t, i) => {
        const c = t[0], piece = (c < 0 ? ' - ' : (i ? ' + ' : ' ')) + (Math.abs(c) === 1 ? '' : Math.abs(c) + ' ') + t[1];
        if (line.length + piece.length > 200) { out += line + '\n'; line = ''; }
        line += piece;
      });
      return out + line;
    };
    const wrap = names => { let out = '', line = ''; names.forEach(n => { if (line.length > 200) { out += line + '\n'; line = ''; } line += ' ' + n; }); return out + line; };
    let lp = 'Minimize\n obj:' + (obj.length ? fmt(obj) : ' 0 ' + (binaries[0] || 'dummy')) + '\nSubject To\n';
    rows.forEach((r, i) => { lp += ' c' + i + ':' + fmt(r.terms) + ' ' + r.op + ' ' + r.rhs + '\n'; });
    if (binaries.length) lp += 'Binary\n' + wrap(binaries) + '\n';
    if (generals.length) lp += 'General\n' + wrap(generals) + '\n';
    lp += 'End\n';
    return { lp: lp, starts: starts, groups: groups, vars: nv, rows: rows.length, binaries: binaries.length };
  }

  /* Resolve o modelo e devolve as posições encontradas: {placements:[{id, day, period}], info}. */
  async function solve(data, opts) {
    opts = Object.assign({ complexity: 1, strict: true }, opts || {});
    Solver.autoAssignTeachers(data);
    Core.syncCards(data);
    const t0 = Date.now();
    let model = buildModel(data, Object.assign({ tight: true }, opts));
    const info = { vars: model.vars, binaries: model.binaries, rows: model.rows, status: 'Sem variáveis', objective: null, seconds: 0 };
    const placements = [];
    if (!model.binaries) return { placements: placements, info: info };
    const highs = await getHighs();
    const P = data.school.params || {};
    const options = {
      time_limit: opts.timeLimit || [12, 30, 120][opts.complexity - 1], mip_rel_gap: 0.005,
      random_seed: P.different === false ? 1 : (opts.seed || (Date.now() % 100000))
    };
    let res = highs.solve(model.lp, options);
    if (res.Status !== 'Optimal' && res.Status !== 'Time limit reached') {
      // dados sem solução completa: volta à formulação com folgas, que coloca o máximo possível
      model = buildModel(data, Object.assign({}, opts, { tight: false }));
      res = highs.solve(model.lp, options);
    }
    info.status = res.Status; info.objective = res.ObjectiveValue; info.seconds = (Date.now() - t0) / 1000;
    const next = new Map();
    model.starts.forEach(s => {
      const col = res.Columns && res.Columns[s.name];
      if (!col || !(col.Primal > 0.5)) return;
      const i = next.get(s.g) || 0, card = s.g.cards[i];
      if (!card) return;
      next.set(s.g, i + 1);
      placements.push({ id: card.id, day: s.d, period: s.p });
    });
    info.placed = placements.length;
    return { placements: placements, info: info };
  }

  const STATUS = { 'Optimal': 'Ótimo comprovado', 'Time limit reached': 'Melhor solução no tempo limite', 'Infeasible': 'Inviável', 'Sem variáveis': 'Nada a resolver' };
  const Milp = { buildModel, solve, getHighs, statusText: s => STATUS[s] || s };
  if (typeof module !== 'undefined' && module.exports) module.exports = Milp;
  root.Milp = Milp;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
