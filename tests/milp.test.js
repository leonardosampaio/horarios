// Modelo de programação linear inteira (HiGHS) contra os casos reais.
const test = require('node:test'), assert = require('node:assert/strict');
const { Core, Milp, run, errors, warnings, placed } = require('./helpers.js');

// limite de avisos: o horário feito à mão/aSc tem 21 (caso 1) e 33 (caso 2); só a heurística dá ~43
const CASES = [{ n: 1, max: 30 }, { n: 2, max: 33 }];

for (const c of CASES) {
  test(`PLI, caso ${c.n}: horário completo, sem choques e com no máximo ${c.max} condições quebradas`, async () => {
    const d = Core.realDoc(c.n, false);
    const r = await Milp.solve(d, { complexity: 1, strict: true, seed: 22, timeLimit: 12 });
    assert.ok(['Optimal', 'Time limit reached'].includes(r.info.status), r.info.status);
    assert.equal(r.placements.length, d.cards.length, 'o modelo sozinho já coloca todas as aulas');
    const s = run(d, { seed: 22, start: r.placements });
    assert.equal(s.unplaced, 0);
    assert.equal(placed(d), d.cards.length);
    assert.deepEqual(errors(d).map(e => e.text), []);
    assert.ok(warnings(d).length <= c.max, warnings(d).length + ' avisos');
  });
}

test('PLI respeita cartões travados e tempo livre', async () => {
  const d = Core.realDoc(2, true);
  const fixos = d.cards.slice(0, 10);
  fixos.forEach(k => { k.locked = true; });
  const r = await Milp.solve(d, { complexity: 1, strict: true, seed: 3, timeLimit: 10 });
  const fixed = new Set(fixos.map(k => k.id));
  assert.ok(r.placements.every(p => !fixed.has(p.id)), 'travados não entram como variável');
  for (const p of r.placements) {
    const l = Core.find(d.lessons, Core.find(d.cards, p.id).lessonId), t = Core.find(d.teachers, l.teacherIds[0]);
    assert.notEqual(t.timeOff[p.day + '-' + p.period], 2, 'aula em horário indisponível de ' + t.name);
  }
});

test('PLI com dados inviáveis coloca o máximo possível em vez de falhar', async () => {
  const d = Core.realDoc(2, false);
  d.lessons[0].count += 3; // a turma passa a ter 28 aulas para 25 posições
  Core.syncCards(d);
  const r = await Milp.solve(d, { complexity: 1, strict: true, seed: 1, timeLimit: 8 });
  assert.ok(r.placements.length >= d.cards.length - 6 && r.placements.length < d.cards.length);
});
