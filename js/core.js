/* Modelo de dados do documento de horários (funciona no navegador e no Node). */
(function (root) {
  'use strict';

  const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const PALETTE = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#fdd835', '#d81b60',
    '#6d4c41', '#3949ab', '#7cb342', '#ff7043', '#00897b', '#c0ca33', '#5e35b1', '#78909c'];
  const DURATION_NAMES = { 1: 'Simples', 2: 'Dupla', 3: 'Tripla' };

  function uid(prefix) {
    return prefix + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
  }

  function defaultParams() {
    return { different: true, distribution: true, exhaustion: false, maxConsecutive: 6, teacherGaps: true, maxGaps: 20, allowZero: true };
  }

  function newDoc() {
    const y = new Date().getFullYear();
    return {
      app: 'horarios', version: 1,
      school: {
        name: '', year: y + '/' + (y + 1), registry: 'escola',
        periodsPerDay: 8, days: 5, zeroPeriod: true, dayNumbers: false, weekend: 'sab-dom',
        customFields: [{ name: 'Nome da escola', value: '' }, { name: 'Endereço: logradouro', value: '' }, { name: 'Endereço: cidade', value: '' }],
        bells: {}, params: defaultParams()
      },
      subjects: [], classes: [], rooms: [], teachers: [], lessons: [], relations: [], cards: [], versions: []
    };
  }

  /* Preenche campos ausentes de um documento carregado de arquivo. */
  function normalize(data) {
    const base = newDoc();
    data.school = Object.assign(base.school, data.school || {});
    data.school.params = Object.assign(defaultParams(), data.school.params || {});
    ['subjects', 'classes', 'rooms', 'teachers', 'lessons', 'relations', 'cards'].forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
    if (!Array.isArray(data.versions)) data.versions = [];
    data.classes.forEach(c => { if (!c.divisions) c.divisions = []; });
    data.teachers.forEach(t => { if (!t.subjectIds) t.subjectIds = []; });
    data.lessons.forEach(l => {
      l.teacherIds = l.teacherIds || []; l.classIds = l.classIds || []; l.roomIds = l.roomIds || [];
      l.groups = l.groups || {}; l.count = l.count || 1; l.duration = l.duration || 1;
    });
    syncCards(data);
    return data;
  }

  function defaultDivisions() {
    return [
      { id: uid('d'), groups: [{ id: uid('g'), name: 'Grupo 1' }, { id: uid('g'), name: 'Grupo 2' }] },
      { id: uid('d'), groups: [{ id: uid('g'), name: 'Alunos' }, { id: uid('g'), name: 'Alunas' }] }
    ];
  }

  function periodList(school) {
    const out = [];
    for (let p = school.zeroPeriod ? 0 : 1; p <= school.periodsPerDay; p++) out.push(p);
    return out;
  }

  function dayList(school) {
    const start = school.weekend === 'sex-sab' ? 6 : 0;
    const out = [];
    for (let i = 0; i < school.days; i++) {
      const name = school.dayNumbers ? 'Dia ' + (i + 1) : DAY_NAMES[(start + i) % 7];
      out.push({ index: i, name: name, short: school.dayNumbers ? 'D' + (i + 1) : name.slice(0, 3) });
    }
    return out;
  }

  function slotLabel(school, d, p) {
    const day = dayList(school)[d];
    return (day ? day.name : '?') + ', ' + p + 'ª aula';
  }

  function find(arr, id) { return arr.find(x => x.id === id) || null; }

  /* Aulas/semana = total de tempos; a duração define como são agrupados em cartões. */
  function durationsOf(lesson) {
    const out = [];
    let left = Math.max(0, lesson.count | 0);
    const dur = Math.max(1, lesson.duration | 0);
    while (left >= dur) { out.push(dur); left -= dur; }
    while (left > 0) { out.push(1); left--; }
    return out;
  }

  function candidateRoomIds(data, lesson) {
    const ids = [];
    const add = id => { if (id && ids.indexOf(id) < 0 && find(data.rooms, id)) ids.push(id); };
    if (lesson.homeRoom) lesson.classIds.forEach(cid => { const c = find(data.classes, cid); if (c) add(c.homeRoomId); });
    (lesson.roomIds || []).forEach(add);
    if (lesson.sharedRoom) data.rooms.forEach(r => { if (r.shared) add(r.id); });
    return ids;
  }

  /* Mantém data.cards coerente com as aulas e com a grade (dias/tempos). */
  function syncCards(data) {
    const sch = data.school, first = sch.zeroPeriod ? 0 : 1;
    const wanted = new Map();
    data.lessons.forEach(l => durationsOf(l).forEach((dur, idx) => wanted.set(l.id + '#' + idx, { l: l, dur: dur, idx: idx })));
    const kept = [];
    data.cards.forEach(c => {
      const key = c.lessonId + '#' + c.idx, w = wanted.get(key);
      if (w && w.dur === c.duration) { kept.push(c); wanted.delete(key); }
    });
    wanted.forEach(w => kept.push({ id: uid('k'), lessonId: w.l.id, idx: w.idx, duration: w.dur, day: null, period: null, roomId: null, locked: false }));
    const lessons = new Map(data.lessons.map(l => [l.id, l]));
    kept.forEach(c => {
      if (c.day == null) { c.period = null; c.roomId = null; c.locked = false; return; }
      if (c.day >= sch.days || c.period < first || c.period + c.duration - 1 > sch.periodsPerDay) {
        c.day = null; c.period = null; c.roomId = null; c.locked = false; return;
      }
      const cand = candidateRoomIds(data, lessons.get(c.lessonId));
      if (c.roomId && cand.indexOf(c.roomId) < 0) c.roomId = null;
    });
    data.cards = kept;
    return data;
  }

  function lessonInvolves(data, lesson, type, id) {
    if (type === 'subjects') return lesson.subjectId === id;
    if (type === 'classes') return lesson.classIds.indexOf(id) >= 0;
    if (type === 'teachers') return lesson.teacherIds.indexOf(id) >= 0;
    if (type === 'rooms') return candidateRoomIds(data, lesson).indexOf(id) >= 0;
    return true;
  }

  function periodsOf(data, type, id) {
    return data.lessons.reduce((s, l) => s + (lessonInvolves(data, l, type, id) ? l.count : 0), 0);
  }

  function removeEntity(data, type, id) {
    data[type] = data[type].filter(x => x.id !== id);
    if (type === 'subjects') {
      data.lessons = data.lessons.filter(l => l.subjectId !== id);
      data.teachers.forEach(t => { t.subjectIds = (t.subjectIds || []).filter(x => x !== id); });
      data.relations.forEach(r => { r.subjectIds = r.subjectIds.filter(x => x !== id); });
      data.relations = data.relations.filter(r => r.subjectIds.length);
    } else if (type === 'classes') {
      data.lessons = data.lessons.filter(l => {
        if (l.classIds.indexOf(id) < 0) return true;
        l.classIds = l.classIds.filter(x => x !== id);
        delete l.groups[id];
        return l.classIds.length > 0;
      });
      data.teachers.forEach(t => { if (t.classTeacherOf === id) t.classTeacherOf = null; });
      data.relations.forEach(r => { if (r.classIds) r.classIds = r.classIds.filter(x => x !== id); });
    } else if (type === 'teachers') {
      data.lessons.forEach(l => { l.teacherIds = l.teacherIds.filter(x => x !== id); });
    } else if (type === 'rooms') {
      data.lessons.forEach(l => { l.roomIds = (l.roomIds || []).filter(x => x !== id); });
      data.classes.forEach(c => { if (c.homeRoomId === id) c.homeRoomId = null; });
      data.subjects.forEach(s => { if (s.roomIds) s.roomIds = s.roomIds.filter(x => x !== id); });
    }
    syncCards(data);
  }

  function suggestAbbr(name) {
    const words = String(name || '').trim().split(/\s+/).filter(w => w.length > 2 || /\d/.test(w));
    if (!words.length) return String(name || '').trim().slice(0, 3);
    if (words.length === 1) return words[0].slice(0, 3);
    return words.map(w => w[0].toUpperCase()).join('').slice(0, 4);
  }

  /* Escola de exemplo: 6 turmas do fundamental II, 6 aulas/dia. */
  function sampleDoc() {
    const d = newDoc();
    Object.assign(d.school, { name: 'Escola Modelo', periodsPerDay: 6, zeroPeriod: false, days: 5 });
    d.school.bells = { 1: '07:00-07:50', 2: '07:50-08:40', 3: '08:40-09:30', 4: '09:50-10:40', 5: '10:40-11:30', 6: '11:30-12:20' };
    d.school.customFields[0].value = 'Escola Modelo';
    let color = 0;
    const subj = (name, abbr, c) => { const s = { id: uid('s'), name, abbr, color: c, timeOff: {}, roomIds: [] }; d.subjects.push(s); return s; };
    const room = (name, abbr, extra) => { const r = Object.assign({ id: uid('r'), name, abbr, type: 'Sala de aula', building: 'Principal', shared: false, timeOff: {} }, extra || {}); d.rooms.push(r); return r; };
    const teacher = (name, abbr, subjects, off) => {
      const t = { id: uid('t'), name, abbr, gender: 'F', color: PALETTE[color++ % PALETTE.length], subjectIds: subjects.map(s => s.id), classTeacherOf: null, timeOff: off || {} };
      d.teachers.push(t); return t;
    };
    const dayOff = (...days) => { const o = {}; days.forEach(dd => { for (let p = 1; p <= 6; p++) o[dd + '-' + p] = 2; }); return o; };

    const por = subj('Português', 'Por', '#1e88e5'), mat = subj('Matemática', 'Mat', '#e53935'), cie = subj('Ciências', 'Ciê', '#43a047'),
      his = subj('História', 'His', '#8e24aa'), geo = subj('Geografia', 'Geo', '#fb8c00'), ing = subj('Inglês', 'Ing', '#00acc1'),
      art = subj('Artes', 'Art', '#d81b60'), edf = subj('Educação Física', 'EdF', '#7cb342'), rel = subj('Ensino Religioso', 'Rel', '#6d4c41');

    const quadra = room('Quadra', 'Qd', { type: 'Quadra' });
    const lab = room('Laboratório de Ciências', 'Lab', { type: 'Laboratório' });
    edf.roomIds = [quadra.id];

    const tPor1 = teacher('Ana Souza', 'Ana', [por]), tPor2 = teacher('Bruno Lima', 'Bru', [por, rel]),
      tMat1 = teacher('Carla Dias', 'Car', [mat]), tMat2 = teacher('Diego Alves', 'Die', [mat]),
      tCie = teacher('Elisa Rocha', 'Eli', [cie]), tHis = teacher('Fábio Nunes', 'Fáb', [his]),
      tGeo = teacher('Gabriela Pires', 'Gab', [geo]), tIng = teacher('Hugo Martins', 'Hug', [ing], dayOff(0)),
      tArt = teacher('Íris Castro', 'Íri', [art, rel], dayOff(4)), tEdf = teacher('João Prado', 'Joã', [edf]);
    [tPor2, tMat2, tHis, tIng, tEdf].forEach(t => { t.gender = 'M'; });

    ['6º A', '6º B', '7º A', '7º B', '8º A', '9º A'].forEach((name, i) => {
      const r = room('Sala ' + (i + 1), 'S' + (i + 1));
      const c = { id: uid('c'), name: name, abbr: name.replace(/\s/g, ''), timeOff: {}, divisions: defaultDivisions(), homeRoomId: r.id, allowLateStart: false };
      d.classes.push(c);
      const add = (s, t, count, extra) => d.lessons.push(Object.assign({
        id: uid('l'), subjectId: s.id, teacherIds: t ? [t.id] : [], autoTeacher: !t, classIds: [c.id], groups: {},
        count: count, duration: 1, homeRoom: true, sharedRoom: false, roomIds: []
      }, extra || {}));
      add(por, i % 2 ? tPor2 : tPor1, 5);
      add(mat, i % 2 ? tMat2 : tMat1, 5);
      add(cie, tCie, 2);
      add(cie, tCie, 1, { homeRoom: false, roomIds: [lab.id] });
      add(his, tHis, 3);
      add(geo, tGeo, 3);
      add(ing, tIng, 2);
      add(art, tArt, 2);
      add(edf, tEdf, 2, { duration: 2, homeRoom: false, roomIds: [quadra.id] });
      add(rel, null, 1); // professor escolhido automaticamente pela especialidade
    });
    d.teachers[0].classTeacherOf = d.classes[0].id;
    return syncCards(d);
  }

  const Core = {
    DAY_NAMES, PALETTE, DURATION_NAMES, uid, newDoc, normalize, defaultDivisions, periodList, dayList, slotLabel, find,
    durationsOf, candidateRoomIds, syncCards, lessonInvolves, periodsOf, removeEntity, suggestAbbr, sampleDoc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
