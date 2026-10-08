/* Teste, geração e verificação do horário (funciona no navegador e no Node). */
(function (root) {
  'use strict';
  const Core = root.Core || require('./core.js');

  // Pesos das condições. As "duras" (choques, tempo inadequado) nunca são violadas pelo gerador.
  const W = { cgap: 60, late: 35, lateAllowed: 3, zero: 12, tgap: 4, limit: 50, dist: 45, adj: 6, cond: 15, balance: 2 };

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildModel(data, opts) {
    opts = opts || {};
    const sch = data.school, P = sch.params || {};
    const D = sch.days, last = sch.periodsPerDay, first = sch.zeroPeriod ? 0 : 1, PW = last + 1, NS = D * PW;
    const genFirst = (opts.generating && first === 0 && P.allowZero === false) ? 1 : first;
    const strict = !!opts.strict;
    const toMap = arr => new Map(arr.map(x => [x.id, x]));
    const S = toMap(data.subjects), C = toMap(data.classes), T = toMap(data.teachers), R = toMap(data.rooms), L = toMap(data.lessons);
    const off = (e, d, p) => (e && e.timeOff && e.timeOff[d + '-' + p]) || 0;
    const mk = () => { const a = new Array(NS); for (let i = 0; i < NS; i++) a[i] = []; return a; };
    const occT = new Map(), occC = new Map(), occR = new Map();
    data.teachers.forEach(t => occT.set(t.id, mk()));
    data.classes.forEach(c => occC.set(c.id, mk()));
    data.rooms.forEach(r => occR.set(r.id, mk()));
    const lessonCards = new Map(), subjTotal = new Map();
    const cards = [];
    const label = (d, p) => Core.slotLabel(sch, d, p);

    data.cards.forEach(c => {
      const l = L.get(c.lessonId);
      if (!l) return;
      const m = {
        i: cards.length, ref: c, id: c.id, lesson: l, dur: c.duration, subject: S.get(l.subjectId) || null,
        teachers: l.teacherIds.map(id => T.get(id)).filter(Boolean),
        classes: l.classIds.map(id => {
          const cls = C.get(id);
          if (!cls) return null;
          const g = (l.groups || {})[id] || null;
          let div = null;
          if (g) (cls.divisions || []).forEach(dv => { if (dv.groups.some(x => x.id === g)) div = dv.id; });
          return { id: id, cls: cls, groupId: div ? g : null, divId: div };
        }).filter(Boolean),
        rooms: Core.candidateRoomIds(data, l).map(id => R.get(id)),
        day: -1, period: -1, room: null, locked: false, st: new Uint8Array(NS).fill(2), domain: 0
      };
      const ents = [m.subject].concat(m.teachers, m.classes.map(x => x.cls));
      for (let d = 0; d < D; d++) {
        for (let p = first; p + m.dur - 1 <= last; p++) {
          let s = 0;
          for (let k = 0; k < m.dur; k++) for (const e of ents) { const v = off(e, d, p + k); if (v > s) s = v; }
          m.st[d * PW + p] = s;
          if (s < 2 && p >= genFirst) m.domain++;
        }
      }
      cards.push(m);
      m.classes.forEach(x => { const k = x.id + '|' + l.subjectId + '|' + (x.groupId || ''); subjTotal.set(k, (subjTotal.get(k) || 0) + 1); });
      if (!lessonCards.has(l.id)) lessonCards.set(l.id, []);
      lessonCards.get(l.id).push(m);
    });

    function clash(c, other) {
      const oc = other.classes.find(x => x.id === c.id);
      if (!oc) return false;
      if (!c.groupId || !oc.groupId || c.divId !== oc.divId) return true;
      return c.groupId === oc.groupId;
    }

    /* Cartões que precisariam sair para `m` ocupar (d, p); null se a posição é proibida. */
    function conflictsFor(m, d, p, fixedRoomId, why) {
      if (d < 0 || d >= D || p < first || p + m.dur - 1 > last) { if (why) why.msg = 'A aula não cabe nessa posição.'; return null; }
      const s = m.st[d * PW + p];
      if (s === 2 || (strict && s === 1)) { if (why) why.msg = 'Posição marcada como inadequada no tempo livre.'; return null; }
      const out = [];
      const add = j => { if (j !== m.i && out.indexOf(j) < 0) out.push(j); };
      for (let k = 0; k < m.dur; k++) {
        const idx = d * PW + p + k;
        for (const t of m.teachers) for (const j of occT.get(t.id)[idx]) add(j);
        for (const c of m.classes) for (const j of occC.get(c.id)[idx]) if (j !== m.i && clash(c, cards[j])) add(j);
      }
      let room = null;
      if (m.rooms.length) {
        let best = null, bestN = Infinity;
        const cand = fixedRoomId ? m.rooms.filter(r => r.id === fixedRoomId) : m.rooms;
        for (const r of cand) {
          let bad = false;
          const rc = [];
          for (let k = 0; k < m.dur && !bad; k++) {
            const v = off(r, d, p + k);
            if (v === 2 || (strict && v === 1)) { bad = true; break; }
            if (r.shared) continue;
            for (const j of occR.get(r.id)[d * PW + p + k]) {
              if (j === m.i) continue;
              if (cards[j].locked) bad = true;
              else if (rc.indexOf(j) < 0) rc.push(j);
            }
          }
          if (bad) continue;
          const n = rc.filter(j => out.indexOf(j) < 0).length;
          if (n < bestN) { best = { r: r, rc: rc }; bestN = n; if (!n) break; }
        }
        if (!best) { if (why) why.msg = 'Nenhuma sala disponível nessa posição.'; return null; }
        room = best.r;
        best.rc.forEach(add);
      }
      for (const j of out) if (cards[j].locked) { if (why) why.msg = 'Conflito com um cartão travado.'; return null; }
      return { cards: out, room: room };
    }

    /* Explica o que uma escolha manual desobedece (não proíbe nada: quem decide é o usuário). */
    function inspect(m, d, p, fixedRoomId) {
      const r = { inRange: true, reasons: [], cards: [], room: null, inadequate: false, locked: false };
      if (d < 0 || d >= D || p < first || p + m.dur - 1 > last) { r.inRange = false; return r; }
      const hit = (j, text) => { if (j === m.i) return; if (r.cards.indexOf(j) < 0) { r.cards.push(j); r.reasons.push(text + ' (' + cardName(cards[j]) + ').'); if (cards[j].locked) r.locked = true; } };
      const offOf = e => { let v = 0; for (let k = 0; k < m.dur; k++) v = Math.max(v, off(e, d, p + k)); return v; };
      const ents = [];
      if (m.subject) ents.push(['a disciplina ' + m.subject.name, m.subject]);
      m.teachers.forEach(t => ents.push(['o professor ' + t.name, t]));
      m.classes.forEach(c => ents.push(['a turma ' + c.cls.name, c.cls]));
      ents.forEach(e => {
        const v = offOf(e[1]);
        if (v === 2) { r.inadequate = true; r.reasons.push('Tempo livre: posição inadequada para ' + e[0] + '.'); }
        else if (v === 1) r.reasons.push('Tempo livre: posição apenas condicional para ' + e[0] + '.');
      });
      for (let k = 0; k < m.dur; k++) {
        const idx = d * PW + p + k;
        for (const t of m.teachers) for (const j of occT.get(t.id)[idx]) hit(j, 'Professor ' + t.name + ' já tem aula nesse horário');
        for (const c of m.classes) for (const j of occC.get(c.id)[idx]) if (j !== m.i && clash(c, cards[j])) hit(j, 'Turma ' + c.cls.name + ' já tem aula nesse horário');
      }
      if (m.rooms.length) {
        let best = null;
        (fixedRoomId ? m.rooms.filter(x => x.id === fixedRoomId) : m.rooms).forEach(room => {
          const rc = [];
          if (!room.shared) for (let k = 0; k < m.dur; k++) for (const j of occR.get(room.id)[d * PW + p + k]) if (j !== m.i && rc.indexOf(j) < 0) rc.push(j);
          const score = (offOf(room) === 2 ? 1000 : 0) + rc.filter(j => r.cards.indexOf(j) < 0).length;
          if (!best || score < best.score) best = { room: room, rc: rc, score: score };
        });
        if (best) {
          r.room = best.room;
          if (offOf(best.room) === 2) { r.inadequate = true; r.reasons.push('Sala ' + best.room.name + ' indisponível nesse horário.'); }
          best.rc.forEach(j => hit(j, 'Sala ' + best.room.name + ' já está ocupada'));
        }
      }
      return r;
    }

    function place(m, d, p, room) {
      m.day = d; m.period = p; m.room = room || null;
      for (let k = 0; k < m.dur; k++) {
        const idx = d * PW + p + k;
        for (const t of m.teachers) occT.get(t.id)[idx].push(m.i);
        for (const c of m.classes) occC.get(c.id)[idx].push(m.i);
        if (m.room) occR.get(m.room.id)[idx].push(m.i);
      }
    }
    function unplace(m) {
      if (m.day < 0) return;
      const rm = arr => { const x = arr.indexOf(m.i); if (x >= 0) arr.splice(x, 1); };
      for (let k = 0; k < m.dur; k++) {
        const idx = m.day * PW + m.period + k;
        for (const t of m.teachers) rm(occT.get(t.id)[idx]);
        for (const c of m.classes) rm(occC.get(c.id)[idx]);
        if (m.room) rm(occR.get(m.room.id)[idx]);
      }
      m.day = -1; m.period = -1; m.room = null;
    }
    function loadAll() {
      cards.forEach(m => {
        const c = m.ref;
        if (c.day != null) { place(m, c.day, c.period, R.get(c.roomId) || null); m.locked = !!c.locked; }
      });
    }
    function writeBack() {
      cards.forEach(m => {
        const c = m.ref;
        if (m.day < 0) { c.day = null; c.period = null; c.roomId = null; c.locked = false; }
        else { c.day = m.day; c.period = m.period; c.roomId = m.room ? m.room.id : null; }
      });
    }

    /* ---- condições "moles": custo e, opcionalmente, mensagens ---- */
    // stat.broken acumula o tamanho das quebras (aulas além do limite, janelas…): quem chama zera antes.
    // Com stat.by (um Map), o tamanho também é separado por condição e dia.
    const stat = { broken: 0, by: null };
    const brk = (n, kind, a, b) => { stat.broken += n; if (stat.by) { const k = kind + '|' + a + '|' + b; stat.by.set(k, (stat.by.get(k) || 0) + n); } };
    function teacherCost(id, out) {
      const t = T.get(id), occ = occT.get(id);
      const maxGaps = t.maxGaps != null ? t.maxGaps : (P.teacherGaps ? P.maxGaps : null);
      const maxCons = t.maxConsecutive != null ? t.maxConsecutive : (P.exhaustion ? P.maxConsecutive : null);
      let cost = 0, gapsTotal = 0;
      for (let d = 0; d < D; d++) {
        let f = -1, l = -1, cnt = 0, run = 0, maxRun = 0;
        for (let p = first; p <= last; p++) {
          if (occ[d * PW + p].length) { cnt++; if (f < 0) f = p; l = p; run++; if (run > maxRun) maxRun = run; } else run = 0;
        }
        if (!cnt) continue;
        const gaps = l - f + 1 - cnt;
        gapsTotal += gaps; cost += gaps * W.tgap;
        if (t.maxPerDay != null && cnt > t.maxPerDay) {
          cost += (cnt - t.maxPerDay) * W.limit; brk(cnt - t.maxPerDay, 'dia', d);
          if (out) out.push('Professor ' + t.name + ': ' + cnt + ' aulas em ' + label(d, f).split(',')[0] + ' (máx. ' + t.maxPerDay + ').');
        }
        if (maxCons != null && maxRun > maxCons) {
          cost += (maxRun - maxCons) * W.limit; brk(maxRun - maxCons, 'seguidas', d);
          if (out) out.push('Professor ' + t.name + ': ' + maxRun + ' aulas consecutivas em ' + label(d, f).split(',')[0] + ' (máx. ' + maxCons + ').');
        }
      }
      if (maxGaps != null && gapsTotal > maxGaps) {
        cost += (gapsTotal - maxGaps) * W.limit; brk(gapsTotal - maxGaps, 'janelas');
        if (out) out.push('Professor ' + t.name + ': ' + gapsTotal + ' janelas na semana (máx. ' + maxGaps + ').');
      }
      return cost;
    }

    function classCost(id, out) {
      const cls = C.get(id), occ = occC.get(id);
      const counts = [];
      let cost = 0, total = 0;
      for (let d = 0; d < D; d++) {
        let f = -1, l = -1, cnt = 0;
        const seen = new Set();
        for (let p = first; p <= last; p++) {
          const a = occ[d * PW + p];
          if (a.length) { cnt++; if (f < 0) f = p; l = p; for (const j of a) seen.add(j); }
        }
        counts.push(cnt); total += cnt;
        if (!cnt) continue;
        const gaps = l - f + 1 - cnt;
        if (gaps) { cost += gaps * W.cgap; brk(gaps, 'janela', d); if (out) out.push('Turma ' + cls.name + ': ' + gaps + ' janela(s) em ' + label(d, f).split(',')[0] + '.'); }
        let ref = 1;
        while (ref < last && off(cls, d, ref) === 2) ref++;
        if (f > ref) {
          cost += (f - ref) * (cls.allowLateStart ? W.lateAllowed : W.late);
          if (!cls.allowLateStart) brk(f - ref, 'tardio', d);
          if (out && !cls.allowLateStart) out.push('Turma ' + cls.name + ': começa na ' + f + 'ª aula em ' + label(d, f).split(',')[0] + '.');
        }
        if (f === 0) cost += W.zero;
        // limites por disciplina no dia
        const perSubj = new Map(), perKey = new Map();
        seen.forEach(j => {
          const m = cards[j];
          if (!m.subject) return;
          perSubj.set(m.subject.id, (perSubj.get(m.subject.id) || 0) + m.dur);
          const k = id + '|' + m.subject.id + '|' + (m.classes.find(x => x.id === id).groupId || '');
          perKey.set(k, (perKey.get(k) || 0) + 1);
        });
        // distribuição: a mesma disciplina não deve se repetir no dia além do inevitável
        if (P.distribution !== false) perKey.forEach((n, k) => {
          const allow = Math.ceil(subjTotal.get(k) / D);
          if (n > allow) {
            cost += (n - allow) * W.dist; brk(n - allow, 'dist', k, d);
            if (out) out.push('Distribuição: ' + S.get(k.split('|')[1]).name + ' aparece ' + n + ' vezes em ' + label(d, f).split(',')[0] + ' na turma ' + cls.name + '.');
          }
        });
        perSubj.forEach((n, sid) => {
          const s = S.get(sid);
          if (s.maxPerDay != null && n > s.maxPerDay) {
            cost += (n - s.maxPerDay) * W.limit; brk(n - s.maxPerDay, 'limite', sid, d);
            if (out) out.push('Turma ' + cls.name + ': ' + n + ' aulas de ' + s.name + ' em ' + label(d, f).split(',')[0] + ' (máx. ' + s.maxPerDay + ').');
          }
        });
        for (const r of data.relations) {
          if (r.classIds && r.classIds.length && r.classIds.indexOf(id) < 0) continue;
          let n = 0, kinds = 0;
          r.subjectIds.forEach(sid => { const v = perSubj.get(sid) || 0; n += v; if (v) kinds++; });
          if (r.type === 'max_per_day' && n > r.max) {
            cost += (n - r.max) * W.limit; brk(n - r.max, 'rel', data.relations.indexOf(r), d);
            if (out) out.push('Relação "' + relationText(data, r) + '" quebrada na turma ' + cls.name + ' em ' + label(d, f).split(',')[0] + '.');
          } else if (r.type === 'not_same_day' && kinds > 1) {
            cost += (kinds - 1) * W.limit; brk(kinds - 1, 'rel', data.relations.indexOf(r), d);
            if (out) out.push('Relação "' + relationText(data, r) + '" quebrada na turma ' + cls.name + ' em ' + label(d, f).split(',')[0] + '.');
          }
        }
      }
      const mean = total / D;
      for (const c of counts) cost += (c - mean) * (c - mean) * W.balance;
      return cost;
    }

    function lessonCost(id, out) {
      if (P.distribution === false) return 0;
      const list = lessonCards.get(id) || [];
      if (list.length < 2) return 0;
      const perDay = new Array(D).fill(0);
      let placed = 0;
      list.forEach(m => { if (m.day >= 0) { perDay[m.day]++; placed++; } });
      let cost = 0, rep = 0;
      for (let d = 0; d < D; d++) if (perDay[d] > 1) rep += perDay[d] - 1;
      // só é quebra se havia dias suficientes para espalhar (com turma, a regra está em classCost)
      const need = Math.max(0, placed - D);
      if (rep > need && !L.get(id).classIds.length) {
        cost += (rep - need) * W.dist; brk(rep - need, 'dist');
        if (out) {
          const s = S.get(L.get(id).subjectId);
          out.push('Distribuição: ' + (s ? s.name : 'aula') + ' aparece mais de uma vez no mesmo dia.');
        }
      }
      if (placed === 2 && D >= 4) for (let d = 0; d + 1 < D; d++) if (perDay[d] && perDay[d + 1]) cost += W.adj;
      return cost;
    }

    function cardCost(m) {
      if (m.day < 0) return 0;
      let c = 0;
      if (m.st[m.day * PW + m.period] === 1) c += W.cond * m.dur;
      if (m.room) for (let k = 0; k < m.dur; k++) if (off(m.room, m.day, m.period + k) === 1) c += W.cond;
      if (m.period === 0 && !m.classes.length) c += W.zero;
      if (c >= W.cond) brk(1, 'cond');
      return c;
    }

    function violations() {
      const out = [];
      data.teachers.forEach(t => teacherCost(t.id, out));
      data.classes.forEach(c => classCost(c.id, out));
      data.lessons.forEach(l => lessonCost(l.id, out));
      cards.forEach(m => { if (cardCost(m) >= W.cond) out.push('Cartão de ' + cardName(m) + ' em posição condicional (' + label(m.day, m.period) + ').'); });
      return out;
    }

    function cardName(m) {
      return (m.subject ? m.subject.name : 'aula') + (m.classes.length ? ' / ' + m.classes.map(c => c.cls.name).join('+') : '') +
        (m.teachers.length ? ' / ' + m.teachers.map(t => t.name).join('+') : '');
    }

    return {
      data, D, first, last, PW, NS, genFirst, cards, lessonCards, occT, occC, occR, T, C, S, R, L, off,
      conflictsFor, inspect, place, unplace, loadAll, writeBack, stat, teacherCost, classCost, lessonCost, cardCost, violations, cardName, clash
    };
  }

  function relationText(data, r) {
    const names = r.subjectIds.map(id => (Core.find(data.subjects, id) || {}).name || '?').join(', ');
    return r.type === 'max_per_day' ? 'No máximo ' + r.max + ' aula(s) por dia de: ' + names : 'Não podem ocorrer no mesmo dia: ' + names;
  }

  /* Escolhe professor para as aulas marcadas como "automático", conforme a especialidade. */
  function autoAssignTeachers(data) {
    const sch = data.school, slots = sch.days * Core.periodList(sch).length;
    const load = new Map(data.teachers.map(t => [t.id, 0]));
    data.lessons.forEach(l => l.teacherIds.forEach(id => load.set(id, (load.get(id) || 0) + l.count)));
    const avail = t => Math.max(1, slots - Object.keys(t.timeOff || {}).filter(k => t.timeOff[k] === 2).length);
    const res = { assigned: 0, missing: [] };
    data.lessons.filter(l => l.autoTeacher && !l.teacherIds.length).sort((a, b) => b.count - a.count).forEach(l => {
      const ok = data.teachers.filter(t => (t.subjectIds || []).indexOf(l.subjectId) >= 0);
      if (!ok.length) { res.missing.push(l); return; }
      let best = null, bestScore = Infinity;
      ok.forEach(t => {
        let score = (load.get(t.id) + l.count) / avail(t);
        if (data.lessons.some(o => o !== l && o.teacherIds.indexOf(t.id) >= 0 && o.classIds.some(c => l.classIds.indexOf(c) >= 0))) score -= 0.05;
        if (score < bestScore) { bestScore = score; best = t; }
      });
      l.teacherIds = [best.id];
      load.set(best.id, load.get(best.id) + l.count);
      res.assigned++;
    });
    return res;
  }

  /* Aulas que podem passar a ter professor "automático": as que têm algum especialista na disciplina.
     skip = aulas com professor que ficam como estão (sem especialista ou, com keepLocked, com cartão travado). */
  function autoTeacherPlan(data, keepLocked) {
    const has = l => data.teachers.some(t => (t.subjectIds || []).indexOf(l.subjectId) >= 0);
    const locked = new Set(keepLocked ? data.cards.filter(c => c.locked && c.day != null).map(c => c.lessonId) : []);
    const todo = [], skip = [];
    data.lessons.forEach(l => {
      if (l.autoTeacher && !l.teacherIds.length) return;
      if (has(l) && !locked.has(l.id)) todo.push(l); else if (l.teacherIds.length) skip.push(l);
    });
    return { todo: todo, skip: skip };
  }
  function setAutoTeachers(data, keepLocked) {
    const plan = autoTeacherPlan(data, keepLocked);
    plan.todo.forEach(l => { l.teacherIds = []; l.autoTeacher = true; });
    return plan;
  }

  /* Verificações feitas antes da criação (botão "Teste"). */
  function test(data) {
    const sch = data.school;
    const M = buildModel(data, { generating: true });
    const slotsOf = e => { let n = 0; for (let d = 0; d < M.D; d++) for (let p = M.genFirst; p <= M.last; p++) if (M.off(e, d, p) !== 2) n++; return n; };
    // quantos cartões de `dur` tempos seguidos cabem nas posições livres da entidade
    const blockCap = (e, dur) => {
      let n = 0;
      for (let d = 0; d < M.D; d++) {
        let run = 0;
        for (let p = M.genFirst; p <= M.last + 1; p++) {
          if (p <= M.last && M.off(e, d, p) !== 2) run++; else { n += Math.floor(run / dur); run = 0; }
        }
      }
      return n;
    };
    const blocksFit = (e, mine) => {
      const byDur = new Map();
      M.cards.forEach(m => { if (m.dur > 1 && mine(m)) byDur.set(m.dur, (byDur.get(m.dur) || 0) + 1); });
      let bad = '';
      byDur.forEach((n, dur) => { const cap = blockCap(e, dur); if (n > cap) bad = n + ' aulas de ' + dur + ' tempos seguidos, mas só cabem ' + cap; });
      return bad;
    };
    const res = { geral: [], turmas: [], professores: [], disciplinas: [], salas: [] };
    const push = (k, ok, text) => res[k].push({ ok: ok, text: text });
    const sName = l => (Core.find(data.subjects, l.subjectId) || {}).name || '(sem disciplina)';
    const cName = l => l.classIds.map(id => (Core.find(data.classes, id) || {}).name).join('+') || '(sem turma)';

    if (!data.lessons.length) push('geral', false, 'Nenhuma aula foi cadastrada. Use o botão "Aulas" de uma turma, disciplina ou professor.');
    data.lessons.forEach(l => {
      const tag = sName(l) + ' — ' + cName(l);
      if (!l.classIds.length && !l.teacherIds.length && !l.autoTeacher) push('geral', false, 'Aula ' + tag + ': sem turma e sem professor.');
      if (l.duration > Core.periodList(sch).length) push('geral', false, 'Aula ' + tag + ': duração maior que o dia letivo.');
      if (l.autoTeacher && !l.teacherIds.length && !data.teachers.some(t => (t.subjectIds || []).indexOf(l.subjectId) >= 0))
        push('geral', false, 'Aula ' + tag + ': nenhum professor tem a especialidade "' + sName(l) + '".');
      else if (!l.teacherIds.length && !l.autoTeacher) push('geral', true, 'Aviso: aula ' + tag + ' está sem professor.');
      l.teacherIds.forEach(id => {
        const t = Core.find(data.teachers, id);
        if (t && (t.subjectIds || []).length && t.subjectIds.indexOf(l.subjectId) < 0)
          push('geral', true, 'Aviso: ' + t.name + ' leciona ' + sName(l) + ' (' + cName(l) + ') sem ter essa especialidade.');
      });
    });
    if (!res.geral.some(x => !x.ok)) res.geral.unshift({ ok: true, text: 'A verificação geral não encontrou falhas.' });

    data.classes.forEach(c => {
      let whole = 0;
      const byDiv = new Map();
      data.lessons.forEach(l => {
        if (l.classIds.indexOf(c.id) < 0) return;
        const g = (l.groups || {})[c.id];
        const dv = g && (c.divisions || []).find(x => x.groups.some(y => y.id === g));
        if (!dv) { whole += l.count; return; }
        if (!byDiv.has(dv.id)) byDiv.set(dv.id, new Map());
        const mm = byDiv.get(dv.id); mm.set(g, (mm.get(g) || 0) + l.count);
      });
      let need = whole;
      byDiv.forEach(mm => { need += Math.max.apply(null, Array.from(mm.values())); });
      const have = slotsOf(c);
      const blocks = blocksFit(c, m => m.classes.some(x => x.id === c.id && !x.groupId));
      if (need > have) push('turmas', false, 'Turma ' + c.name + ': ' + need + ' aulas para ' + have + ' posições livres.');
      else if (blocks) push('turmas', false, 'Turma ' + c.name + ': ' + blocks + '.');
      else if (!need) push('turmas', true, 'Aviso: turma ' + c.name + ' não tem aulas.');
      else push('turmas', true, 'Turma ' + c.name + ' pode ser criada sozinha (' + need + '/' + have + ').');
    });

    data.teachers.forEach(t => {
      const need = Core.periodsOf(data, 'teachers', t.id), have = slotsOf(t);
      const blocks = blocksFit(t, m => m.teachers.indexOf(t) >= 0);
      if (need > have) push('professores', false, 'Professor ' + t.name + ': ' + need + ' aulas para ' + have + ' posições livres.');
      else if (blocks) push('professores', false, 'Professor ' + t.name + ': ' + blocks + '.');
      else push('professores', true, 'Professor ' + t.name + ' pode ser criado sozinho (' + need + '/' + have + ').');
    });

    data.subjects.forEach(s => {
      const bad = M.cards.filter(m => m.subject === s && !m.domain);
      if (bad.length) push('disciplinas', false, 'Disciplina ' + s.name + ': ' + bad.length + ' cartão(ões) sem nenhuma posição possível (confira os tempos livres de ' + M.cardName(bad[0]) + ').');
      else push('disciplinas', true, 'Disciplina ' + s.name + ' pode ser criada sozinha.');
    });

    data.rooms.forEach(r => {
      if (r.shared) { push('salas', true, 'Sala ' + r.name + ' é compartilhada.'); return; }
      let need = 0;
      data.lessons.forEach(l => { const c = Core.candidateRoomIds(data, l); if (c.length === 1 && c[0] === r.id) need += l.count; });
      const have = slotsOf(r);
      if (need > have) push('salas', false, 'Sala ' + r.name + ': ' + need + ' aulas só podem ocorrer nela, mas há ' + have + ' posições.');
      else push('salas', true, 'Sala ' + r.name + ' comporta as aulas (' + need + '/' + have + ').');
    });
    res.ok = !Object.keys(res).some(k => Array.isArray(res[k]) && res[k].some(x => !x.ok));
    return res;
  }

  /* Gerador: 1) busca construtiva com ejeção de cartões; 2) recozimento simulado nas condições moles.
     No modo restrito (`restricted`) nenhuma condição pode ficar quebrada: 3) os cartões que ainda quebram alguma
     voltam para a bandeja e só retornam onde não quebram nada.
     É um generator para a interface poder mostrar progresso e cancelar. */
  function* generate(data, opts) {
    const o = Object.assign({ complexity: 1, strict: true }, opts || {});
    const P = data.school.params || {};
    const rand = rng(P.different === false ? 12345 : (o.seed || (Date.now() & 0x7fffffff)));
    const auto = autoAssignTeachers(data);
    Core.syncCards(data);
    const M = buildModel(data, { generating: true, strict: o.strict || o.restricted });
    const D = M.D, PW = M.PW, NS = M.NS, first = M.genFirst, last = M.last, cards = M.cards;

    cards.forEach(m => { const c = m.ref; if (c.locked && c.day != null) { M.place(m, c.day, c.period, M.R.get(c.roomId) || null); m.locked = true; } });
    const movable = cards.filter(m => !m.locked);
    // restrito: o que os cartões travados já quebram sozinhos não tem conserto e fica como tolerância de cada um
    const excess = fn => { const by = M.stat.by = new Map(); fn(); M.stat.by = null; return by; };
    const ents = o.restricted ? data.teachers.map(t => ({ cost: () => M.teacherCost(t.id), has: m => m.teachers.indexOf(t) >= 0 }))
      .concat(data.classes.map(c => ({ cost: () => M.classCost(c.id), has: m => m.classes.some(x => x.id === c.id) })))
      .concat(data.lessons.map(l => ({ cost: () => M.lessonCost(l.id), has: m => m.lesson === l }))) : [];
    ents.forEach(e => { e.base = excess(e.cost); e.cards = movable.filter(e.has); });
    // ponto de partida opcional (solução do modelo de programação inteira): só entra o que não gera choque
    if (o.start) {
      const byCard = new Map(cards.map(m => [m.id, m]));
      o.start.forEach(s => {
        const m = byCard.get(s.id);
        if (!m || m.locked || m.day >= 0) return;
        const res = M.conflictsFor(m, s.day, s.period);
        if (res && !res.cards.length) M.place(m, s.day, s.period, res.room);
      });
    }
    const unplaced = movable.filter(m => m.day < 0);
    const ej = new Int32Array(cards.length), visits = new Int32Array(cards.length * NS);
    const hardT = new Map(), hardC = new Map();
    const impossible = [];
    let iterations = 0;

    function softLocal(m, d, p) {
      let s = 0;
      if (m.st[d * PW + p] === 1) s += W.cond;
      if (p === 0) s += 20;
      const dist = P.distribution !== false;
      if (dist && !m.classes.length) for (const x of M.lessonCards.get(m.lesson.id)) if (x !== m && x.day === d) s += W.dist;
      const near = (occ, wGap, wLoad, wStart, cls) => {
        let f = -1, l = -1, cnt = 0, prev = -1;
        for (let q = first; q <= last; q++) {
          const a = occ[d * PW + q];
          if (!a.length) continue;
          cnt++; if (f < 0) f = q; l = q;
          if (cls && dist) for (const j of a) if (j !== prev && j !== m.i && cards[j].subject === m.subject) { s += W.dist; prev = j; }
        }
        if (!cnt) return Math.max(0, p - 1) * wStart;
        let v = cnt * wLoad;
        if (p > l + 1) v += (p - l - 1) * wGap; else if (p + m.dur < f) v += (f - p - m.dur) * wGap;
        return v;
      };
      for (const c of m.classes) s += near(M.occC.get(c.id), 30, 3, 8, true);
      for (const t of m.teachers) s += near(M.occT.get(t.id), 2, 0, 0, false);
      return s;
    }

    const snapshot = () => cards.map(m => [m.day, m.period, m.room]);
    const restore = snap => { movable.forEach(m => M.unplace(m)); movable.forEach(m => { const s = snap[m.i]; if (s[0] >= 0) M.place(m, s[0], s[1], s[2]); }); };

    // ---- fase 1: colocar todos os cartões sem choques ----
    // restrito partindo do modelo de programação inteira: o que ele deixou de fora não cabe sem quebrar condições,
    // então não se força a entrada com ejeções (a fase 3 ainda tenta encaixar)
    const max1 = o.restricted && unplaced.length < movable.length / 2 ? 0 : [1, 4, 12][o.complexity - 1] * Math.max(3000, 150 * cards.length);
    // Cartões ejetados vezes demais são deixados de lado (evita que um recurso impossível trave os demais)
    // e ganham novas tentativas depois que o resto estiver colocado.
    const GIVE_UP = 40;
    let best = null, bestLeft = Infinity, parked = [], rounds = 0;
    while (iterations < max1) {
      if (!unplaced.length) {
        if (!parked.length || rounds >= 3) break;
        rounds++;
        parked.forEach(m => { ej[m.i] = 0; unplaced.push(m); });
        parked = [];
      }
      iterations++;
      let pick = 0, pickKey = Infinity;
      for (let i = 0; i < unplaced.length; i++) {
        const m = unplaced[i], key = m.domain / m.dur - 3 * Math.min(ej[m.i], 4) + rand() * 3;
        if (key < pickKey) { pickKey = key; pick = i; }
      }
      const m = unplaced[pick];
      unplaced[pick] = unplaced[unplaced.length - 1]; unplaced.pop();
      let choice = null, choiceScore = Infinity;
      for (let d = 0; d < D; d++) {
        for (let p = first; p + m.dur - 1 <= last; p++) {
          const res = M.conflictsFor(m, d, p);
          if (!res) continue;
          let score = 25 * visits[m.i * NS + d * PW + p] + softLocal(m, d, p) + rand();
          for (const j of res.cards) score += 100 + 40 * ej[j];
          if (score < choiceScore) { choiceScore = score; choice = { d: d, p: p, res: res }; }
        }
      }
      if (!choice) { impossible.push(m); continue; }
      if (ej[m.i] > GIVE_UP && choice.res.cards.length) { parked.push(m); continue; }
      for (const j of choice.res.cards) {
        const x = cards[j];
        M.unplace(x); ej[j]++; unplaced.push(x);
        x.teachers.forEach(t => hardT.set(t.id, (hardT.get(t.id) || 0) + 1));
        x.classes.forEach(c => hardC.set(c.id, (hardC.get(c.id) || 0) + 1));
      }
      M.place(m, choice.d, choice.p, choice.res.room);
      visits[m.i * NS + choice.d * PW + choice.p]++;
      if (unplaced.length + parked.length < bestLeft) { bestLeft = unplaced.length + parked.length; best = snapshot(); }
      if (iterations % 100 === 0) yield { phase: 1, progress: 1 - (unplaced.length + parked.length + impossible.length) / Math.max(1, movable.length), iterations: iterations };
    }
    if (unplaced.length + parked.length > bestLeft && best) restore(best);

    // ---- fase 2: melhorar janelas, distribuição etc. sem criar choques ----
    // restrito: cada quebra pesa mais que qualquer ganho nas demais condições, então o polimento nunca troca uma pela outra
    const BROKEN = 1000;
    const costOf = group => {
      const ts = new Set(), cs = new Set(), ls = new Set();
      let s = 0;
      for (const m of group) { m.teachers.forEach(t => ts.add(t.id)); m.classes.forEach(c => cs.add(c.id)); ls.add(m.lesson.id); s += M.cardCost(m); }
      M.stat.broken = 0;
      ts.forEach(id => { s += M.teacherCost(id); }); cs.forEach(id => { s += M.classCost(id); }); ls.forEach(id => { s += M.lessonCost(id); });
      return o.restricted ? s + BROKEN * M.stat.broken : s;
    };
    // partindo de uma solução já otimizada, só um polimento "frio" (não desfaz o que o modelo encontrou)
    const max2 = Math.round((o.start ? 0.4 : 1) * [1, 3, 8][o.complexity - 1] * Math.max(20000, 600 * cards.length));
    const T0 = o.start ? 8 : 25, T1 = 0.05;
    const span = last - first + 1;
    if (movable.length > 1) {
      for (let it = 0; it < max2; it++) {
        iterations++;
        if (it % 1000 === 0) yield { phase: 2, progress: it / max2, iterations: iterations };
        const m = movable[(rand() * movable.length) | 0];
        if (m.day < 0 || span - m.dur + 1 <= 0) continue;
        const d = (rand() * D) | 0, p = first + ((rand() * (span - m.dur + 1)) | 0);
        if (d === m.day && p === m.period) continue;
        const res = M.conflictsFor(m, d, p);
        if (!res || res.cards.length > 2) continue;
        const group = [m].concat(res.cards.map(j => cards[j]));
        const before = costOf(group);
        const saved = group.map(x => [x.day, x.period, x.room]);
        group.forEach(x => M.unplace(x));
        M.place(m, d, p, res.room);
        let ok = true, q = saved[0][1];
        for (let i = 1; i < group.length; i++) {
          const x = group[i], r2 = M.conflictsFor(x, saved[0][0], q);
          if (r2 && !r2.cards.length) { M.place(x, saved[0][0], q, r2.room); q += x.dur; } else { ok = false; break; }
        }
        if (ok) {
          const delta = costOf(group) - before, T = T0 * Math.pow(T1 / T0, it / max2);
          if (delta <= 0 || rand() < Math.exp(-delta / T)) continue;
        }
        group.forEach(x => M.unplace(x));
        group.forEach((x, i) => M.place(x, saved[i][0], saved[i][1], saved[i][2]));
      }
    }

    // ---- fase 3 (restrito): nenhuma condição quebrada; o que não couber fica na bandeja ----
    if (o.restricted) {
      const brokenOf = m => { costOf([m]); return M.stat.broken; };
      // tira, um a um, o cartão cuja saída mais reduz as quebras de quem ainda passa da tolerância
      const repair = () => {
        for (;;) {
          const cand = new Set();
          ents.forEach(e => { let over = false; excess(e.cost).forEach((n, k) => { if (n > (e.base.get(k) || 0)) over = true; }); if (over) e.cards.forEach(m => { if (m.day >= 0) cand.add(m); }); });
          let pick = null, pickDelta = Infinity;
          cand.forEach(m => {
            const before = brokenOf(m), pos = [m.day, m.period, m.room];
            M.unplace(m);
            const delta = brokenOf(m) - before + rand() * 0.1;
            M.place(m, pos[0], pos[1], pos[2]);
            if (delta < pickDelta) { pickDelta = delta; pick = m; }
          });
          if (!pick) return;
          M.unplace(pick);
          iterations++;
        }
      };
      // devolve à grade o que couber sem choque e sem quebrar nada
      const fill = () => {
        let any = false;
        movable.filter(m => m.day < 0).sort((a, b) => a.domain / a.dur - b.domain / b.dur).forEach(m => {
          const before = brokenOf(m);
          let choice = null, choiceCost = Infinity;
          for (let d = 0; d < D; d++) {
            for (let p = first; p + m.dur - 1 <= last; p++) {
              const res = M.conflictsFor(m, d, p);
              if (!res || res.cards.length) continue;
              iterations++;
              M.place(m, d, p, res.room);
              const cost = costOf([m]);
              if (M.stat.broken <= before && cost < choiceCost) { choiceCost = cost; choice = { d: d, p: p, room: res.room }; }
              M.unplace(m);
            }
          }
          if (choice) { M.place(m, choice.d, choice.p, choice.room); any = true; }
        });
        return any;
      };
      yield { phase: 3, progress: 1, iterations: iterations };
      for (let round = 0; round < 4; round++) { repair(); if (!fill()) break; }
      repair();
    }

    M.writeBack();
    const top = map => { let b = null, n = 0; map.forEach((v, k) => { if (v > n) { n = v; b = k; } }); return b; };
    const ht = top(hardT), hc = top(hardC);
    const viol = M.violations();
    return {
      total: cards.length, unplaced: cards.filter(m => m.day < 0).length, broken: viol.length, violations: viol, iterations: iterations,
      hardestTeacher: ht ? M.T.get(ht).name : '', hardestClass: hc ? M.C.get(hc).name : '', autoAssigned: auto.assigned
    };
  }

  /* Confere o horário atual (inclusive após alterações manuais). */
  function verify(data) {
    const M = buildModel(data, {});
    M.loadAll();
    const sch = data.school, issues = [];
    const ids = a => a.map(j => M.cards[j].id);
    const err = (t, cards) => issues.push({ level: 'error', text: t, cards: cards || [] }), warn = (t, cards) => issues.push({ level: 'warn', text: t, cards: cards || [] });
    const un = M.cards.filter(m => m.day < 0).length;
    if (un) err(un + ' cartão(ões) ainda não colocado(s) no horário.');
    const each = (occ, fn) => { for (let d = 0; d < M.D; d++) for (let p = M.first; p <= M.last; p++) { const a = occ[d * M.PW + p]; if (a.length > 1) fn(a, d, p); } };
    data.teachers.forEach(t => each(M.occT.get(t.id), (a, d, p) => err('Professor ' + t.name + ' com ' + a.length + ' aulas ao mesmo tempo (' + Core.slotLabel(sch, d, p) + ').', ids(a))));
    data.classes.forEach(c => each(M.occC.get(c.id), (a, d, p) => {
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
        const x = M.cards[a[i]].classes.find(k => k.id === c.id);
        if (M.clash(x, M.cards[a[j]])) { err('Turma ' + c.name + ' com aulas sobrepostas (' + Core.slotLabel(sch, d, p) + ').', ids(a)); return; }
      }
    }));
    data.rooms.forEach(r => { if (!r.shared) each(M.occR.get(r.id), (a, d, p) => err('Sala ' + r.name + ' com ' + a.length + ' aulas ao mesmo tempo (' + Core.slotLabel(sch, d, p) + ').', ids(a))); });
    M.cards.forEach(m => {
      if (m.day < 0) return;
      if (m.st[m.day * M.PW + m.period] === 2) err('Cartão de ' + M.cardName(m) + ' em posição inadequada (' + Core.slotLabel(sch, m.day, m.period) + ').', [m.id]);
      if (m.rooms.length && !m.room) warn('Cartão de ' + M.cardName(m) + ' está sem sala (' + Core.slotLabel(sch, m.day, m.period) + ').', [m.id]);
    });
    M.violations().forEach(t => warn(t));
    return issues;
  }

  const Solver = { buildModel, relationText, autoAssignTeachers, autoTeacherPlan, setAutoTeachers, test, generate, verify };
  if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
  root.Solver = Solver;
})(typeof window !== 'undefined' ? window : globalThis);
