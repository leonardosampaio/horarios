/* Casos reais (horários de uma escola) transcritos à mão, usados para validar o gerador.
   Cada linha é um professor; 'x' = indisponível, '.' = livre, demais = turma que ele atende naquele tempo.
   Caso 1: só a visão dos professores (cada cor é uma disciplina).
   Caso 2: visão dos professores + visão das turmas, que dá a disciplina de cada aula. */
(function (root) {
  'use strict';
  const Core = root.Core || require('./core.js');

  const CASES = {
    1: {
      name: 'Caso real 1',
      // [abreviatura, cor, Segunda | Terça | Quarta | Quinta | Sexta, disciplina]
      teachers: [
        ['A1', '#ff0000', '6C 6A 6C 6D 6B | x x x x x | 6D 6B 6A 6C 6B | 6D 6A 6D 6B 6C | 6D 6C 6B 6A 6A', 'D01'],
        ['M1', '#00ff00', 'x x x x x | x x x x x | 7A 7B . 7B 7A | x . 7B 7A x | 7A 7B 7B 7A x', 'D02'],
        ['A2', '#0000ff', '6D 6E 6A 6B 6C | 6D 6A 6B 6C 6E | x x x x x | 6C 6B 6E 6D 6A | 6B 6E 6A 6D 6C', 'D03'],
        ['M2', '#ffccff', '6E 6C 6B 6A 6D | 6A 6C 6D 6B 6F | x x x x x | 6F 6D 6C . 6E | 6A 6B 6E . 6F', 'D04'],
        ['M3', '#ffff66', 'x x x x x | 7B 7A 7B 7A 7C | x x x x x | 7B 7A . 7C 7C | x x x x x', 'D05'],
        ['M4', '#ff6666', 'x x x x x | 6C 6B 6A . 6B | 6B 6C 6C 6A 6A | x x x x x | x x x x x', 'D06'],
        ['G', '#ffcc66', 'x x x x x | 7A . 7A 6E 7B | 7B . 7B 7A 6F | x x x x x | x x x x x', 'D07'],
        ['R', '#00ff00', '6A 6B 6E 7B 7A | 6F 7C 7C 7B 6C | 6A 7A 6B 6D 6E | x x x x x | 7B 6D 6C 6F 7C', 'D02'],
        ['D', '#66ffff', '6B 7B 7C 7A 6A | x x x x x | 6C 6A 6E 6F 6D | 6B 7B 7C 6A 6B | 6C 7A 6F 6E 6D', 'D08'],
        ['J1', '#009933', 'x x x x x | x x x x x | x x x x x | 6A 6E 6B 6C 6D | 6E 6A 6D 6C 6B', 'D09'],
        ['J2', '#ddff99', 'x 7A 6D 6C 7B | x 6F 6E 6D 6A | x 7C 6D 6B 6C | x 6C 6A 6E 6F | x 7C 7A 6B 7B', 'D10'],
        ['A3', '#669900', 'x x x x x | 6B 6E 6C 6A 6D | x x x x x | 7A 7C 7A 6F 7B | x x x x x', 'D11'],
        ['PP', '#66ff66', '6F . 6F 7C 6E | x x x x x | 6F 6E 7C 6E 7C | 6E 6F x x x | 7C 6F . 7C 6E', 'D12'],
        ['PM', '#ffffcc', '7B 7C 7A 6F . | 7C 7B . 6F 7A | x x x x x | 7C . 6F 7B 7A | 6F . 7C 7B 7A', 'D13'],
        ['PH', '#6666ff', '7C 6D . 6E 6F | 6E 6D 6F 7C x | 6E 6D 6F 7C . | x x x x x | x x x x x', 'D14'],
        ['PE', '#993333', '7A 6F 7B . 7C | x x x x x | 7C 6F 7A . 7B | x x x x x | x x x x x', 'D15']
      ],
      subjects: {}
    },
    2: {
      name: 'Caso real 2 (HORÁRIO GERAL / PROFESSORES)',
      teachers: [
        ['ALE', '#00ff00', '7C 7C 7D 7A 7B | x x x x x | 7D 7C 7B 7B 7A | 7D 7C 7B 7C 7A | 7A 7A 7D 7B 7D'],
        ['AFON', '#ffccff', '6A 7D 7C 7B 7A | 7D 7C 7D 7B 7A | x x x x x | 7A 7B 7C 7D 6A | 7B 7C 6A 7A 6A'],
        ['MAY', '#ff6666', 'x x 6A 6A 6A | x x x x x | x x x x x | x x x x x | x x x x x'],
        ['MIR', '#ffcc66', '6B 6C 7A 7D 7C | 7B 7A 7A . 7B | x x x x x | 7B 7D 6C 6B 7C | 7C . 6C 7D 6B'],
        ['MAIL', '#339933', 'x x x x x | 6A 6B 6A 6A 6C | 6C 6B . 6B 6C | x x x x x | x x x x x'],
        ['RUT', '#009933', '7D 6B 7B 6C 6C | . 7B 7C 7A 6A | 6A 7A 6B 7D 7C | x x x x x | x x x x x'],
        ['JON1', '#66ff66', 'x x x x x | x x x x x | x x x x x | 7C 7A 7D 7A 7B | 6A 7D 7C 6A 7B'],
        ['KEI', '#ffffcc', 'x x x x x | 6B 6C 6C 6B . | x x x x x | x x x x x | x x x x x'],
        ['JAQUE', '#6666ff', '6C 7B 6B 6B 7D | x x x x x | 7C 6A 7A . 7D | x x x x x | 6C 6A 7B 7C 7A'],
        ['ALAN', '#993333', 'x x x x x | 7A 6A 7B 7C 7D | x x x x x | 6C 6B 6B 6A 6C | x x x x x'],
        ['CAR', '#ccffff', 'x x x x x | x x x x x | x x x x x | x x x x x | 7D 7B 7A . 7C'],
        ['TER', '#ff0000', 'x x x x x | x x x x x | x x 6A 6A 6A | x 6A 6A x x | x x x x x'],
        ['GEN', '#0000ff', 'x x x x x | 7C 7D . 7D 7C | x . 7D 7C x | x x x x x | x x x x x'],
        ['JON2', '#ffff66', 'x x x x x | x x x x x | 6B 6C 6C x x | 6B 6C . 6C 6B | . 6C 6B 6B x'],
        ['RON', '#ff9900', 'x x x x x | 6C . 6B 6C 6B | x x x x x | x x x x x | 6B 6B . 6C 6C'],
        ['ANA', '#66ffff', '7A 6A 6C 7C 6B | x x x x x | 7B 7D 7C 6C 6B | 6A . 7A 7B 7D | x x x x x'],
        ['DEN', '#993333', '7B 7A . . . | x x x x x | 7A 7B . 7A 7B | x x x x x | x x x x x']
      ],
      // visão das turmas: disciplina de cada tempo
      classes: {
        '6A': 'MAT ING CIE CIE CIE | HIST E.REL HIST HIST GEO | GEO ART PRT PRT PRT | ING PRT PRT FIL MAT | E.FIS ART MAT E.FIS MAT',
        '6B': 'CIE GEO ART ART ING | E.FIS HIST MAT E.FIS MAT | PRT HIST GEO HIST ING | PRT FIL E.REL CIE PRT | MAT MAT PRT PRT CIE',
        '6C': 'ART CIE ING GEO GEO | MAT E.FIS E.FIS MAT HIST | HIST PRT PRT ING HIST | E.REL PRT CIE PRT FIL | ART PRT CIE MAT MAT',
        '7A': 'ING HIST CIE PRT MAT | FIL CIE CIE GEO MAT | HIST GEO ART HIST PRT | MAT E.FIS ING E.FIS PRT | PRT PRT E.REL MAT ART',
        '7B': 'HIST ART GEO MAT PRT | CIE GEO FIL MAT CIE | ING HIST PRT PRT HIST | CIE MAT PRT ING E.FIS | MAT E.REL ART PRT E.FIS',
        '7C': 'PRT PRT MAT ING CIE | HIST MAT GEO FIL HIST | ART PRT ING HIST GEO | E.FIS PRT MAT PRT CIE | CIE MAT E.FIS ART E.REL',
        '7D': 'GEO MAT PRT CIE ART | MAT HIST MAT HIST FIL | PRT ING HIST GEO ART | PRT CIE E.FIS MAT ING | E.REL E.FIS PRT CIE PRT'
      },
      subjects: {
        'PRT': ['Português', '#2e9e44'], 'MAT': ['Matemática', '#e8872b'], 'CIE': ['Ciências', '#e3b23c'], 'HIST': ['História', '#8c3b3b'], 'GEO': ['Geografia', '#1f7a4d'],
        'ING': ['Inglês', '#35b8c9'], 'ART': ['Artes', '#6a6ee0'], 'E.FIS': ['Educação Física', '#7ccf5a'], 'E.REL': ['Ensino Religioso', '#9bd0d8'], 'FIL': ['Filosofia', '#a04a6a']
      }
    }
  };

  const split = txt => txt.split('|').map(d => d.trim().split(/\s+/));

  /* placed=true reproduz o horário da imagem; false deixa os cartões na bandeja para o gerador. */
  function realDoc(n, placed) {
    const cs = CASES[n], d = Core.newDoc();
    Object.assign(d.school, { name: cs.name, periodsPerDay: 5, zeroPeriod: false, days: 5 });
    const subjOf = cs.classes ? (c, day, i) => split(cs.classes[c])[day][i] : null;
    const addSubject = (id, color) => {
      if (Core.find(d.subjects, id)) return;
      const def = cs.subjects[id];
      d.subjects.push({ id: id, name: def ? def[0] : 'Disciplina ' + id.slice(1), abbr: id, color: def ? def[1] : color, timeOff: {}, roomIds: [] });
    };
    const classNames = new Set(), ref = [];
    cs.teachers.forEach((row, ti) => {
      const t = { id: 't' + ti, name: 'Prof. ' + row[0], abbr: row[0], gender: 'F', color: row[1], subjectIds: [], classTeacherOf: null, timeOff: {} };
      d.teachers.push(t);
      split(row[2]).forEach((cells, day) => cells.forEach((cell, i) => {
        if (cell === 'x') { t.timeOff[day + '-' + (i + 1)] = 2; return; }
        if (cell === '.') return;
        const s = subjOf ? subjOf(cell, day, i) : row[3];
        addSubject(s, row[1]);
        if (t.subjectIds.indexOf(s) < 0) t.subjectIds.push(s);
        classNames.add(cell);
        ref.push({ t: t.id, c: 'c' + cell, s: s, day: day, period: i + 1 });
      }));
    });
    Array.from(classNames).sort().forEach(c => d.classes.push({ id: 'c' + c, name: c, abbr: c, timeOff: {}, divisions: [], homeRoomId: null }));
    const lessons = new Map();
    ref.forEach(r => {
      const key = r.t + '|' + r.c + '|' + r.s;
      if (!lessons.has(key)) {
        const l = { id: 'l' + lessons.size, subjectId: r.s, teacherIds: [r.t], autoTeacher: false, classIds: [r.c], groups: {}, count: 0, duration: 1, homeRoom: false, sharedRoom: false, roomIds: [] };
        lessons.set(key, l); d.lessons.push(l);
      }
      lessons.get(key).count++;
    });
    Core.syncCards(d);
    if (placed) ref.forEach(r => {
      const l = lessons.get(r.t + '|' + r.c + '|' + r.s);
      const card = d.cards.find(k => k.lessonId === l.id && k.day == null);
      card.day = r.day; card.period = r.period;
    });
    return d;
  }

  Core.realDoc = realDoc;
  Core.REAL_CASES = CASES;
  if (typeof module !== 'undefined' && module.exports) module.exports = realDoc;
})(typeof window !== 'undefined' ? window : globalThis);
