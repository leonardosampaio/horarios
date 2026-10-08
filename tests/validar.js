// Validação: gera horários para os casos reais (PLI + polimento) e compara com os horários das imagens.
const Core = require('../js/core.js'); require('../js/exemplo.js');
const Solver = require('../js/solver.js'); const Milp = require('../js/milp.js');
const kinds = list => { const k = {}; list.forEach(v => { const x = v.split(/[ :]/)[0]; k[x] = (k[x] || 0) + 1; }); return JSON.stringify(k); };
(async () => {
  for (const n of [1, 2]) {
    const ref = Solver.verify(Core.realDoc(n, true));
    console.log('CASO', n, '| referência (imagem): erros', ref.filter(i => i.level === 'error').length, 'avisos', ref.filter(i => i.level === 'warn').length, kinds(ref.map(i => i.text)));
    for (const seed of [11, 22, 33]) {
      const d = Core.realDoc(n, false);
      const r = await Milp.solve(d, { complexity: 1, strict: true, seed: seed, timeLimit: 10 });
      const g = Solver.generate(d, { complexity: 1, strict: true, seed: seed, start: r.placements }); let x; while (!(x = g.next()).done);
      const v = Solver.verify(d);
      console.log('  PLI seed', seed, '|', r.info.status, 'obj', Math.round(r.info.objective), '| colocados', d.cards.filter(c => c.day != null).length + '/' + d.cards.length, '| erros', v.filter(i => i.level === 'error').length, '| avisos', v.filter(i => i.level === 'warn').length, kinds(v.map(i => i.text)));
    }
    const d = Core.realDoc(n, false); const g = Solver.generate(d, { complexity: 1, strict: true, seed: 5 }); let x; while (!(x = g.next()).done);
    console.log('  só heurística | não colocados', x.value.unplaced, '| avisos', x.value.broken);
  }
})();
