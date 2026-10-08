// Gera public/: a versão pública minificada. O código-fonte continua rodando sem build (abra index.html).
//   npm install && npm run build      (o npm roda a suíte de testes antes: script "prebuild")
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const OUT = 'public';
// mesma ordem das tags <script> do index.html
const APP = ['core', 'exemplo', 'solver', 'milp', 'roz', 'ui', 'store', 'dialogs', 'grid', 'pdf', 'app'];
const WORKER = ['core', 'solver', 'milp']; // o que o Web Worker do resolvedor precisa
const VENDOR = ['highs.js', 'highs-wasm.js', 'jspdf.umd.min.js', 'LICENSE-highs', 'LICENSE-jspdf'];

const read = f => readFile(f, 'utf8');
const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 8);
// sem bundle/format, o esbuild trata o arquivo como script clássico e preserva os nomes globais (Store, App, …)
const minify = async (code, loader) => (await transform(code, { loader, minify: true, target: 'es2019', legalComments: 'none' })).code;
const concat = async names => (await Promise.all(names.map(n => read(`js/${n}.js`)))).join('\n;\n');

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/js`, { recursive: true });
await mkdir(`${OUT}/css`, { recursive: true });
await mkdir(`${OUT}/vendor`, { recursive: true });

const app = await minify(await concat(APP), 'js');
const css = await minify(await read('css/style.css'), 'css');
const workerSrc = (await read('js/milp-worker.js')).replace(/importScripts\([^)]*\);/, "importScripts('../vendor/highs.js', '../vendor/highs-wasm.js');");
if (!workerSrc.includes("'../vendor/highs.js', '../vendor/highs-wasm.js'")) throw new Error('milp-worker.js: importScripts não encontrado');
const worker = await minify(workerSrc.replace("'use strict';", '') + '\n;\n' + await concat(WORKER), 'js');

await writeFile(`${OUT}/js/app.min.js`, app);
await writeFile(`${OUT}/js/milp-worker.js`, worker); // mesmo caminho que app.js usa em new Worker(...)
await writeFile(`${OUT}/css/style.css`, css);
await Promise.all(VENDOR.map(f => cp(`vendor/${f}`, `${OUT}/vendor/${f}`)));

// index.html: troca os scripts da aplicação pelo pacote único e acrescenta hash para invalidar cache
let html = await read('index.html');
const scripts = html.match(/[ \t]*<script src="js\/[^"]+"><\/script>\n/g) || [];
if (scripts.length !== APP.length) throw new Error(`index.html tem ${scripts.length} scripts em js/, mas APP lista ${APP.length}; atualize build.mjs`);
scripts.forEach((tag, i) => { html = html.replace(tag, i === scripts.length - 1 ? `  <script src="js/app.min.js?v=${hash(app)}"></script>\n` : ''); });
html = html.replace('href="css/style.css"', `href="css/style.css?v=${hash(css)}"`).replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim() + '\n';
await writeFile(`${OUT}/index.html`, html);

const kb = s => (Buffer.byteLength(s) / 1024).toFixed(0) + ' kB';
console.log(`${OUT}/ pronto: app.min.js ${kb(app)}, milp-worker.js ${kb(worker)}, style.css ${kb(css)}, index.html ${kb(html)} (+ vendor)`);
