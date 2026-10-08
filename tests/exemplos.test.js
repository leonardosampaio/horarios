// As transcrições dos horários reais (asc/exemplos/*.png) têm de ser coerentes: são a base dos demais testes.
const test = require('node:test'), assert = require('node:assert/strict');
const { Core, Solver, errors, warnings, placed } = require('./helpers.js');

const CASES = [{ n: 1, teachers: 16, classes: 9, cards: 225, refWarnings: 21 }, { n: 2, teachers: 17, classes: 7, cards: 175, refWarnings: 33 }];

for (const c of CASES) {
  test(`caso ${c.n}: dimensões e grade cheia (25 aulas por turma)`, () => {
    const d = Core.realDoc(c.n, false);
    assert.equal(d.teachers.length, c.teachers);
    assert.equal(d.classes.length, c.classes);
    assert.equal(d.cards.length, c.cards);
    assert.equal(placed(d), 0);
    for (const cls of d.classes) assert.equal(Core.periodsOf(d, 'classes', cls.id), 25, 'turma ' + cls.name);
  });

  test(`caso ${c.n}: o horário da imagem não tem choques nem aulas em horário indisponível`, () => {
    const d = Core.realDoc(c.n, true);
    assert.equal(placed(d), c.cards);
    assert.deepEqual(errors(d).map(e => e.text), []);
    assert.equal(warnings(d).length, c.refWarnings);
  });

  test(`caso ${c.n}: o teste prévio aprova os dados`, () => {
    assert.equal(Solver.test(Core.realDoc(c.n, false)).ok, true);
  });
}

test('caso 2: todas as turmas têm a mesma matriz curricular', () => {
  const d = Core.realDoc(2, false);
  const matriz = cls => JSON.stringify(d.subjects.map(s => [s.abbr, d.lessons.filter(l => l.subjectId === s.id && l.classIds[0] === cls.id).reduce((a, l) => a + l.count, 0)]));
  const esperado = JSON.stringify([['PRT', 5], ['MAT', 4], ['CIE', 3], ['HIST', 3], ['GEO', 2], ['E.FIS', 2], ['ART', 2], ['ING', 2], ['E.REL', 1], ['FIL', 1]].sort());
  for (const cls of d.classes) assert.equal(JSON.stringify(JSON.parse(matriz(cls)).sort()), esperado, 'turma ' + cls.name);
});

test('caso 2: cada professor leciona as disciplinas esperadas', () => {
  const d = Core.realDoc(2, false);
  const by = Object.fromEntries(d.teachers.map(t => [t.abbr, t.subjectIds.slice().sort().join(',')]));
  assert.equal(by.ALE, 'PRT'); assert.equal(by.AFON, 'MAT'); assert.equal(by.ALAN, 'E.REL,FIL'); assert.equal(by.ANA, 'ING'); assert.equal(by.JAQUE, 'ART');
});
