/* Importação de arquivos .roz do aSc TimeTables (testado com arquivos da versão 2023).
   O formato é binário e não documentado; o que está aqui foi obtido por engenharia reversa:

   - Todo registro (disciplina, professor, grupo, turma, aula…) tem o cabeçalho
       [R G B] 02 00 00 00 02 00 00 00 | 02 00 01 00 | id (8 bytes) | 00×7 | 02 | nome | abreviatura
     com textos precedidos por 1 byte de tamanho (Latin-1).
   - Professor: grade de tempo livre 10 dias × 32 tempos (uint32): 0 = inadequado, 4 = adequado, 6 = fora do dia.
   - Turma: registro "CLASSTT" + nome + abreviatura + lista dos índices dos seus grupos.
   - Grupo: [turma completa?] [nº da divisão].
   - Aula: aulas/semana, disciplina (índice), grupos (índices), professores (índices).
   - Cartão (75 bytes): índice da aula, número do tempo e máscara de bits do dia.
   Salas e demais restrições do aSc não são importadas. */
(function (root) {
  'use strict';
  const Core = root.Core || require('./core.js');

  function parse(input) {
    const d = input instanceof Uint8Array ? input : new Uint8Array(input);
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const u32 = o => (o >= 0 && o + 4 <= d.length ? dv.getUint32(o, true) : 0xffffffff);
    const text = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[o + i]); return s; };
    if (text(5, 5) !== 'ASCTT') throw new Error('Este não é um arquivo do aSc TimeTables (.roz).');
    const lp = o => ({ s: text(o + 1, d[o]), end: o + 1 + d[o] });
    const hex = n => (n < 16 ? '0' : '') + n.toString(16);

    // ---- cabeçalhos de registro ----
    const heads = [];
    for (let i = 12; i + 21 < d.length; i++) {
      if (d[i] !== 2 || d[i + 1] !== 0 || d[i + 2] !== 1 || d[i + 3] !== 0 || d[i + 19] !== 2) continue;
      let zeros = true;
      for (let k = 12; k < 19; k++) if (d[i + k] !== 0) { zeros = false; break; }
      if (zeros) heads.push(i);
    }
    const recs = heads.map((h, i) => {
      const name = lp(h + 20), abbr = lp(name.end);
      return { h: h, next: i + 1 < heads.length ? heads[i + 1] : d.length, name: name.s, abbr: abbr.s, end: abbr.end, color: '#' + hex(d[h - 11]) + hex(d[h - 10]) + hex(d[h - 9]) };
    });

    // grade de tempo livre: 320 uint32 pequenos, com a última coluna toda "fora do dia" (6)
    const findGrid = (from, to, need4) => {
      for (let o = from; o < to && o + 1280 <= d.length; o++) {
        if (u32(o + 124) !== 6) continue;
        let ok = true, has4 = false;
        for (let k = 0; k < 320 && ok; k++) { const v = u32(o + 4 * k); if (v > 7 || (k % 32 === 31 && v !== 6)) ok = false; if (v === 4) has4 = true; }
        if (ok && (has4 || !need4)) return o;
      }
      return -1;
    };

    // ---- turmas e grupos ----
    const classRecs = recs.filter(r => r.name === 'CLASSTT');
    if (!classRecs.length) throw new Error('Nenhuma turma encontrada no arquivo.');
    // ---- professores: registros grandes com a grade logo depois da abreviatura ----
    const teacherRecs = recs.filter(r => r.h < classRecs[0].h && r.next - r.h > 1300 && r.name && findGrid(r.end, r.end + 80, false) >= 0);
    if (!teacherRecs.length) throw new Error('Nenhum professor encontrado no arquivo.');
    const firstT = recs.indexOf(teacherRecs[0]), lastT = recs.indexOf(teacherRecs[teacherRecs.length - 1]);
    const groupRecs = recs.slice(lastT + 1, recs.indexOf(classRecs[0]));

    // ---- aulas: registros sem nome depois da última turma ----
    const lessons = [];
    let p = 0;
    const arr = max => { const n = u32(p); if (n > 64) throw 0; const out = []; for (let i = 0; i < n; i++) out.push(u32(p + 4 + 4 * i)); p += 4 + 4 * n; if (max != null && out.some(v => v >= max)) throw 0; return out; };
    for (let i = recs.indexOf(classRecs[classRecs.length - 1]) + 1; i < recs.length; i++) {
      const r = recs[i];
      if (d[r.h + 20] !== 0) break;
      try {
        const count = u32(r.h + 37);
        if (count < 1 || count > 100) break;
        p = r.h + 46;
        arr();
        const subject = u32(p); p += 4;
        const groups = arr(groupRecs.length), teachers = arr(teacherRecs.length);
        lessons.push({ count: count, subject: subject, groups: groups, teachers: teachers, cards: [] });
      } catch (e) { break; }
    }
    if (!lessons.length) throw new Error('Nenhuma aula encontrada no arquivo.');

    // ---- disciplinas: registros imediatamente antes dos professores, todos com o mesmo "molde" ----
    const maxSubj = Math.max.apply(null, lessons.map(l => l.subject));
    const shape = r => r.next - r.h - r.name.length - r.abbr.length;
    const subjRecs = [];
    for (let i = firstT - 1; i >= 0; i--) {
      if (subjRecs.length > maxSubj && shape(recs[i]) !== shape(recs[firstT - 1])) break;
      subjRecs.unshift(recs[i]);
      if (subjRecs.length > maxSubj && i > 0 && shape(recs[i - 1]) !== shape(recs[firstT - 1])) break;
    }

    // ---- cartões: contador seguido de registros de 75 bytes ----
    const lastLesson = recs[recs.indexOf(classRecs[classRecs.length - 1]) + lessons.length];
    let cardsAt = -1, cardsN = 0;
    for (let q = lastLesson.h + 60; q < lastLesson.h + 600; q++) {
      const n = u32(q);
      if (n <= cardsN || n > 20000 || q + 4 + n * 75 > d.length) continue;
      let ok = true;
      for (let i = 0; i < n && ok; i++) { const o = q + 4 + 75 * i, m = u32(o + 66); if (u32(o + 42) >= lessons.length || u32(o + 54) > 31 || m > 1023 || (m & (m - 1))) ok = false; }
      if (ok) { cardsAt = q; cardsN = n; } // fica com o maior contador coerente (evita falsos positivos pequenos)
    }
    for (let i = 0; i < cardsN; i++) { const o = cardsAt + 4 + 75 * i; lessons[u32(o + 42)].cards.push({ period: u32(o + 54), mask: u32(o + 66) }); }

    // ---- monta o documento ----
    const doc = Core.newDoc();
    const grid0 = findGrid(teacherRecs[0].end, teacherRecs[0].end + 80, false);
    let last = 0;
    for (let c = 0; c < 31; c++) if (u32(grid0 + 4 * c) !== 6) last = c;
    let days = 5;
    lessons.forEach(l => l.cards.forEach(c => { for (let b = 0; b < 10; b++) if (c.mask === (1 << b)) days = Math.max(days, b + 1); }));
    Object.assign(doc.school, { periodsPerDay: Math.max(1, last), zeroPeriod: u32(grid0) !== 6, days: Math.min(7, days) });
    const first = doc.school.zeroPeriod ? 0 : 1;
    const marker = findText('report_header');
    if (marker > 0) for (let o = marker - 2; o > marker - 200; o--) { const s = lp(o); if (d[o] >= 3 && s.end <= marker && /^[\x20-\x7e\xa0-\xff]+$/.test(s.s) && /[A-Za-z]{3}/.test(s.s)) { doc.school.name = s.s; break; } }
    function findText(t) { outer: for (let i = 0; i + t.length < d.length; i++) { for (let k = 0; k < t.length; k++) if (d[i + k] !== t.charCodeAt(k)) continue outer; return i; } return -1; }

    const timeOff = o => {
      const off = {};
      if (o < 0) return off;
      for (let day = 0; day < doc.school.days; day++) for (let per = first; per <= doc.school.periodsPerDay; per++) {
        const v = u32(o + 4 * (day * 32 + per));
        if (v === 0) off[day + '-' + per] = 2; else if (v !== 4 && v !== 6) off[day + '-' + per] = 1;
      }
      return off;
    };
    subjRecs.forEach((r, i) => doc.subjects.push({ id: 's' + i, name: r.name, abbr: r.abbr || r.name, color: r.color, timeOff: {}, roomIds: [] }));
    teacherRecs.forEach((r, i) => doc.teachers.push({
      id: 't' + i, name: r.name, abbr: r.abbr || r.name, gender: 'F', color: r.color, subjectIds: [], classTeacherOf: null,
      timeOff: timeOff(findGrid(r.end, r.end + 80, false))
    }));
    const groupOf = new Map(); // índice global do grupo -> {classId, groupId|null}
    classRecs.forEach((r, i) => {
      const nm = { s: r.abbr }, ab = lp(r.end); // no registro CLASSTT o nome vem logo depois do marcador
      const cls = { id: 'c' + i, name: nm.s.replace(/\s+/g, ' ').trim(), abbr: ab.s.replace(/\s+/g, ''), timeOff: timeOff(findGrid(ab.end, r.next - 1280, true)), divisions: [], homeRoomId: null };
      const n = u32(ab.end + 5), divs = new Map();
      for (let k = 0; k < n && n <= 64; k++) {
        const gi = u32(ab.end + 9 + 4 * k), g = groupRecs[gi];
        if (!g) continue;
        const whole = u32(g.end - g.abbr.length - 1) === 1, divNo = u32(g.end - g.abbr.length - 1 + 4);
        if (whole) { groupOf.set(gi, { classId: cls.id, groupId: null }); continue; }
        if (!divs.has(divNo)) divs.set(divNo, { id: cls.id + 'd' + divNo, groups: [] });
        const gid = cls.id + 'g' + gi;
        divs.get(divNo).groups.push({ id: gid, name: g.name });
        groupOf.set(gi, { classId: cls.id, groupId: gid });
      }
      cls.divisions = Array.from(divs.values());
      doc.classes.push(cls);
    });

    const pending = [];
    lessons.forEach((l, i) => {
      if (!doc.subjects[l.subject]) return;
      const les = { id: 'l' + i, subjectId: 's' + l.subject, teacherIds: l.teachers.map(t => 't' + t), autoTeacher: false, classIds: [], groups: {},
        count: l.count, duration: 1, homeRoom: false, sharedRoom: false, roomIds: [] };
      l.groups.forEach(gi => { const g = groupOf.get(gi); if (!g || les.classIds.indexOf(g.classId) >= 0) return; les.classIds.push(g.classId); if (g.groupId) les.groups[g.classId] = g.groupId; });
      // menos cartões que aulas/semana = aulas duplas, triplas…
      if (l.cards.length && l.count % l.cards.length === 0) les.duration = l.count / l.cards.length;
      l.teachers.forEach(t => { const tt = doc.teachers[t]; if (tt && tt.subjectIds.indexOf(les.subjectId) < 0) tt.subjectIds.push(les.subjectId); });
      doc.lessons.push(les);
      pending.push([les, l.cards]);
    });
    Core.syncCards(doc);
    let placed = 0;
    pending.forEach(pair => {
      const mine = doc.cards.filter(c => c.lessonId === pair[0].id);
      pair[1].forEach((c, k) => {
        const day = [1, 2, 4, 8, 16, 32, 64].indexOf(c.mask), card = mine[k];
        if (!card || day < 0 || day >= doc.school.days || c.period < first || c.period + card.duration - 1 > doc.school.periodsPerDay) return;
        card.day = day; card.period = c.period; placed++;
      });
    });
    doc.importInfo = { subjects: doc.subjects.length, teachers: doc.teachers.length, classes: doc.classes.length, lessons: doc.lessons.length, cards: doc.cards.length, placed: placed };
    return doc;
  }

  const Roz = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = Roz;
  root.Roz = Roz;
})(typeof window !== 'undefined' ? window : globalThis);
