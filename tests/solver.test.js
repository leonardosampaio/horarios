// Gerador heurístico, verificação e validação de escolhas manuais.
const test = require('node:test'), assert = require('node:assert/strict');
const { Core, Solver, run, errors, warnings, placed } = require('./helpers.js');

for (const n of [1, 2]) {
  test(`heurística, caso ${n}: coloca todas as aulas sem choques`, () => {
    const d = Core.realDoc(n, false), s = run(d);
    assert.equal(s.unplaced, 0);
    assert.equal(placed(d), d.cards.length);
    assert.deepEqual(errors(d).map(e => e.text), []);
  });
}

test('modo restrito: a heurística não deixa condição quebrada, nem mexe nos travados', () => {
  const d = Core.realDoc(2, true);
  const fixos = d.cards.slice(0, 12);
  fixos.forEach(c => { c.locked = true; });
  const antes = fixos.map(c => [c.id, c.day, c.period]);
  // o que os travados quebram sozinhos não tem conserto: é o único aviso admitido
  const so = JSON.parse(JSON.stringify(d));
  so.cards.forEach(c => { if (!c.locked) c.day = null; });
  const inevitaveis = warnings(so).length;
  const s = run(d, { restricted: true });
  assert.ok(s.broken <= inevitaveis, s.violations.join(' '));
  assert.deepEqual(fixos.map(c => [c.id, c.day, c.period]), antes);
  assert.deepEqual(errors(d).filter(e => !/não colocado/.test(e.text)).map(e => e.text), []);
  assert.ok(placed(d) >= 100, placed(d) + ' aulas colocadas');

  const livre = Core.realDoc(1, false), t = run(livre, { restricted: true });
  assert.equal(t.broken, 0);
  assert.deepEqual(warnings(livre).map(w => w.text), []);
});

test('escola modelo: salas, aulas duplas e professor automático por especialidade', () => {
  const d = Core.sampleDoc(), s = run(d);
  assert.equal(s.unplaced, 0);
  assert.equal(s.autoAssigned, 6);
  assert.deepEqual(errors(d).map(e => e.text), []);
  // Ensino Religioso só pode ir para quem tem a especialidade
  const rel = d.subjects.find(x => x.abbr === 'Rel');
  for (const l of d.lessons.filter(x => x.subjectId === rel.id)) assert.ok(Core.find(d.teachers, l.teacherIds[0]).subjectIds.includes(rel.id));
  // Educação Física: cartões duplos, sempre na quadra
  const quadra = d.rooms.find(r => r.name === 'Quadra');
  for (const c of d.cards.filter(c => c.duration === 2)) assert.equal(c.roomId, quadra.id);
});

test('cartões travados não saem do lugar ao gerar de novo', () => {
  const d = Core.realDoc(2, true);
  const fixos = d.cards.slice(0, 12);
  fixos.forEach(c => { c.locked = true; });
  const antes = fixos.map(c => [c.id, c.day, c.period]);
  const s = run(d, { seed: 99 });
  assert.equal(s.unplaced, 0);
  assert.deepEqual(fixos.map(c => [c.id, c.day, c.period]), antes);
  assert.equal(errors(d).length, 0);
});

test('verificação acusa choque criado manualmente e aponta os cartões', () => {
  const d = Core.realDoc(2, true);
  const a = d.cards[0], la = Core.find(d.lessons, a.lessonId);
  // outro cartão do mesmo professor, movido para o mesmo tempo
  const b = d.cards.find(c => c !== a && Core.find(d.lessons, c.lessonId).teacherIds[0] === la.teacherIds[0] && (c.day !== a.day || c.period !== a.period));
  b.day = a.day; b.period = a.period;
  const errs = errors(d);
  assert.ok(errs.some(e => /Professor .* com 2 aulas ao mesmo tempo/.test(e.text) && e.cards.includes(a.id) && e.cards.includes(b.id)));
});

test('inspect explica o que uma escolha manual desobedece', () => {
  const d = Core.realDoc(2, true);
  const M = Solver.buildModel(d, {}); M.loadAll();
  // MAYARA (índice 2) só está disponível na segunda, 3ª a 5ª aulas
  const m = M.cards.find(x => x.teachers[0] === d.teachers[2]);
  const ruim = M.inspect(m, 1, 1);
  assert.equal(ruim.inadequate, true);
  assert.ok(ruim.reasons.some(r => /inadequada para o professor/.test(r)));
  assert.ok(ruim.reasons.some(r => /já tem aula nesse horário/.test(r)), 'a turma já está ocupada nesse tempo');
  const mesma = M.inspect(m, m.day, m.period);
  assert.deepEqual(mesma.reasons, [], 'a posição atual do cartão não tem conflito');
  assert.equal(M.inspect(m, 0, 9).inRange, false);
});

test('teste prévio detecta carga impossível', () => {
  const d = Core.realDoc(2, false);
  d.lessons[0].count = 40; // 40 aulas para um professor com 20 posições
  Core.syncCards(d);
  const t = Solver.test(d);
  assert.equal(t.ok, false);
  assert.ok(t.professores.some(x => !x.ok));
});

test('documento sobrevive a salvar/abrir em JSON', () => {
  const d = Core.realDoc(2, true);
  const copia = Core.normalize(JSON.parse(JSON.stringify(d)));
  assert.equal(placed(copia), 175);
  assert.equal(errors(copia).length, 0);
});
