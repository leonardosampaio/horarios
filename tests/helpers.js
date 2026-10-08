// Utilitários comuns da suíte (node --test). Os exemplos vêm de asc/exemplos, transcritos em js/exemplo.js.
const fs = require('fs'), path = require('path');
const Core = require('../js/core.js'); require('../js/exemplo.js');
const Solver = require('../js/solver.js'), Milp = require('../js/milp.js'), Roz = require('../js/roz.js');

const ROZ = path.join(__dirname, '../asc/exemplos/HORARIO NOVO 6 e 7 ANO.roz');
const run = (doc, opts) => { const g = Solver.generate(doc, Object.assign({ complexity: 1, strict: true, seed: 7 }, opts)); let r; while (!(r = g.next()).done); return r.value; };
const errors = doc => Solver.verify(doc).filter(i => i.level === 'error');
const warnings = doc => Solver.verify(doc).filter(i => i.level === 'warn');
const placed = doc => doc.cards.filter(c => c.day != null).length;
// "professor|turma|dia|tempo" de cada cartão colocado: identifica um horário independentemente de ids
const slots = doc => new Set(doc.cards.filter(c => c.day != null).map(c => {
  const l = Core.find(doc.lessons, c.lessonId);
  return doc.teachers.indexOf(Core.find(doc.teachers, l.teacherIds[0])) + '|' + Core.find(doc.classes, l.classIds[0]).name.replace(/\s/g, '') + '|' + c.day + '|' + c.period;
}));
const blocked = doc => doc.teachers.map(t => Object.keys(t.timeOff).filter(k => t.timeOff[k] === 2).sort().join(',')).join(';');

module.exports = { fs, Core, Solver, Milp, Roz, ROZ, run, errors, warnings, placed, slots, blocked };
