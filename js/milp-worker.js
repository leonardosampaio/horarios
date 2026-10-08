/* Resolve o modelo de programação inteira fora da thread da interface (usado quando a página é servida por http). */
'use strict';
importScripts('core.js', 'solver.js', '../vendor/highs.js', '../vendor/highs-wasm.js', 'milp.js');
self.onmessage = async e => {
  try { self.postMessage({ ok: true, result: await Milp.solve(e.data.data, e.data.opts) }); }
  catch (err) { self.postMessage({ ok: false, error: String(err && err.message || err) }); }
};
