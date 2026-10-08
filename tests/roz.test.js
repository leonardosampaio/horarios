// Importação do .roz do aSc TimeTables: tem de reproduzir o caso real 2 (as imagens são do mesmo horário).
const test = require('node:test'), assert = require('node:assert/strict');
const { fs, Core, Roz, ROZ, errors, warnings, slots, blocked } = require('./helpers.js');

const doc = Roz.parse(fs.readFileSync(ROZ));
const ref = Core.realDoc(2, true);

test('.roz: escola e dimensões', () => {
  assert.equal(doc.school.name, 'E.M HENRIQUE DE LA ROQUE');
  assert.deepEqual([doc.school.days, doc.school.periodsPerDay, doc.school.zeroPeriod], [5, 5, false]);
  assert.deepEqual(doc.importInfo, { subjects: 10, teachers: 17, classes: 7, lessons: 70, cards: 175, placed: 175 });
});

test('.roz: disciplinas, professores e turmas', () => {
  assert.deepEqual(doc.subjects.map(s => s.abbr), ['PRT', 'MAT', 'CIE', 'HIST', 'GEO', 'ING', 'E.FIS', 'ART', 'FIL', 'E.REL']);
  assert.deepEqual(doc.teachers.map(t => t.name).slice(0, 4), ['ALESSANDRA', 'AFONSO', 'MAYARA', 'MIRELLE']);
  assert.deepEqual(doc.classes.map(c => c.name), ['6 A', '6 B', '6 C', '7 A', '7 B', '7 C', '7 D']);
  assert.deepEqual(doc.classes[0].divisions.map(d => d.groups.map(g => g.name)), [['Grupo 1', 'Grupo 2'], ['Alunos', 'Alunas']]);
  assert.match(doc.teachers[1].color, /^#ffccff$/);
});

test('.roz: os cartões ficam exatamente onde estão nas imagens', () => {
  assert.deepEqual([...slots(doc)].sort(), [...slots(ref)].sort());
});

test('.roz: o tempo livre dos professores é o das imagens', () => {
  assert.equal(blocked(doc), blocked(ref));
});

test('.roz: o horário importado passa na verificação como o original', () => {
  assert.equal(errors(doc).length, 0);
  assert.equal(warnings(doc).length, warnings(ref).length);
});

test('.roz: arquivo que não é do aSc é recusado com mensagem clara', () => {
  assert.throws(() => Roz.parse(new Uint8Array(64)), /aSc TimeTables/);
});
