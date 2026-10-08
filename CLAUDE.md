# Horários

Aplicação web de criação de horários escolares (implementação independente, inspirada no aSc Horários/TimeTables;
licença MIT): aloca professor +
disciplina por turma e sala, gera versões do horário obedecendo às restrições e valida escolhas manuais.

## Regras do projeto

- **100% no navegador, sem backend.** JavaScript puro em `<script>` clássicos (sem módulos ES, sem dependências de
  runtime instaladas por npm). O código-fonte tem de funcionar abrindo `index.html` direto do disco (`file://`), sem
  build; por isso nada de `fetch` de arquivos locais, e o WASM do HiGHS vai embutido em base64
  (`vendor/highs-wasm.js`). O npm só existe para testes e para o build da versão pública.
- Interface e mensagens em **português do Brasil**, com o vocabulário do aSc (turma, disciplina, cartão, tempo livre,
  aula zero, janela, sala fixa, divisão/grupo).
- Dados digitados são salvos automaticamente em `localStorage` (`Store.commit()` após qualquer alteração do
  documento). Exportações: JSON (documento inteiro) e PDF (jsPDF, vetorial).
- A geração usa **pesquisa operacional**: modelo de programação linear inteira resolvido pelo HiGHS. A heurística
  só faz polimento ou serve de alternativa. Não trocar o modelo por heurística pura.

## Arquitetura (`js/`, carregados nesta ordem)

| Arquivo | Papel |
|---|---|
| `core.js` | Modelo do documento: `newDoc`, `normalize`, `syncCards` (cartões ↔ aulas), salas candidatas, exemplos. Roda também no Node. |
| `exemplo.js` | Casos reais (horários de uma escola) transcritos à mão (`Core.realDoc(n, placed)`). |
| `solver.js` | `buildModel` (ocupação, `conflictsFor`, `inspect`, custos), `test`, `verify`, `generate` (busca construtiva + recozimento), `autoAssignTeachers`. Roda no Node. |
| `milp.js` | Formulação PLI em formato LP + chamada ao HiGHS (`Milp.solve`). Roda no Node. |
| `milp-worker.js` | Web Worker do PLI (usado só em http/https; em `file://` roda na thread principal). |
| `roz.js` | Importação de arquivos `.roz` do aSc TimeTables (formato binário, engenharia reversa). |
| `ui.js` | `h()` (criação de DOM), `UI.modal`, `pickMany`, toasts, menu de contexto. |
| `store.js` | `Store.data` (documento), `Store.ui` (visão), persistência. |
| `dialogs.js` | Cadastros: escola, disciplinas, turmas, salas, professores, aulas (contrato), relações, tempo livre. |
| `grid.js` | Grade, bandeja, arrastar-e-soltar e validação das escolhas manuais. |
| `pdf.js` | Exportação em PDF. |
| `app.js` | Barra de ferramentas, assistente, teste/criação/verificação, versões, impressão, arquivos. |

`vendor/`: HiGHS (WASM) e jsPDF, com as licenças (MIT). `asc/`: material de referência do usuário — não alterar. Só
`asc/exemplos/*.roz` (dados do próprio usuário, usados nos testes) vai para o git; as capturas de tela e o vídeo do aSc
ficam apenas no disco (`.gitignore`) e não podem ser distribuídos, nem nada extraído do programa (ver "Relação com o
aSc" no `README.md`).

## Modelo de dados (resumo)

- `school` {periodsPerDay, days, zeroPeriod, params…}; `subjects`, `classes` (com `divisions[].groups[]` e
  `homeRoomId`), `rooms`, `teachers` (com `subjectIds` = especialidades), `relations`, `versions`.
- `lessons`: {subjectId, teacherIds[], autoTeacher, classIds[], groups{classId→groupId}, count (tempos/semana),
  duration, homeRoom, sharedRoom, roomIds[]}.
- `cards`: derivados das aulas por `Core.syncCards`; posição = {day, period, roomId, locked}; `day == null` = na bandeja.
  `period` é o **número** da aula (0 = aula zero), não um índice.
- `timeOff`: mapa `"dia-período"` → 1 (condicional) ou 2 (inadequado); ausente = adequado.

## Restrições

Rígidas (nunca violadas pelo gerador): choque de professor, turma/grupo ou sala; tempo livre inadequado; cartões
travados. Moles (ponderadas, pesos em `W` de `solver.js` e `milp.js` — manter os dois em sincronia): janelas,
início tardio da turma, disciplina repetida no dia, limites por dia, relações, posições condicionais.
Movimentos manuais nunca são bloqueados: `inspect()` explica o que é desobedecido e o usuário decide.

Modos da criação (campo "Restrições"): relaxamento (aceita posições condicionais), **Rigoroso** (`strict`, padrão
da interface: só posições adequadas) e **Restrito** (`restricted`: Rigoroso + nenhuma condição mole quebrada).
No Restrito as moles viram linhas rígidas no PLI e a fase 3 de `Solver.generate` devolve à bandeja o cartão que
ainda quebrar alguma; o resultado pode ficar incompleto (casos reais: ~20 a 30 cartões fora), nunca com avisos,
salvo os que os cartões travados já causam sozinhos.

## Testes e build

    npm test          # suíte (node --test tests/*.test.js), baseada nos exemplos de asc/exemplos
    bash/build.sh     # FORMA PADRÃO do build: testes + build num container Docker temporário (node:22-slim)
    bash/publicar.sh  # build + publicação em leonardosampaio.dev/horarios (roda no servidor)
    npm run build     # roda a suíte (prebuild) e gera public/ minificado com esbuild (build.mjs)
    npm run comparar  # relatório: gerador x horários originais, várias sementes

- `tests/exemplos.test.js`: coerência das transcrições dos casos reais. `roz.test.js`: importação do `.roz` reproduz
  o caso 2. `solver.test.js`: heurística, travados, verificação, `inspect`. `milp.test.js`: PLI nos casos reais
  (0 erros, tudo colocado, avisos ≤ 30 no caso 1 e ≤ 33 no caso 2; referências: 21 e 33) e modo Restrito (0 avisos).
- `bash/build.sh` monta o projeto somente-leitura, copia para dentro do container, roda `npm ci` + `npm run build`
  e devolve só `public/` (com o uid do usuário; `public/.gitkeep` é preservado). `SKIP_TESTS=1` pula a suíte.
- `public/` é saída de build: nunca editar à mão. O build concatena os `js/` na ordem das tags `<script>` do
  `index.html` em `public/js/app.min.js`; **ao criar um arquivo novo em `js/`, acrescente-o ao `index.html` e à lista
  `APP` de `build.mjs`** (o build falha se as duas divergirem). O worker vira um pacote próprio (`WORKER`).
- **Publicação:** `bash/publicar.sh` (build + `rsync --delete` de `public/` para
  `/var/www/html/leonardosampaio.dev/horarios`, servido em https://leonardosampaio.dev/horarios/). O repositório fica
  no próprio servidor (nginx atrás do Cloudflare). `nginx/horarios.conf` é o snippet da aplicação (redirect, cache,
  gzip); instalá-lo em `/etc/nginx/snippets/` e recarregar o nginx exige `sudo` com senha, então isso fica com o
  usuário. Passo a passo no `README.md`.
- O servidor tem 2 vCPUs: o caso 1 do PLI leva ~22 s lá. O `timeLimit` em `tests/milp.test.js` é teto (60 s nos
  testes que precisam fechar o ótimo); prazo curto demais aparece como "0 aulas colocadas", não como erro do modelo.
- A interface é testada com Playwright/Chromium headless fora do repositório (abrir `index.html` ou
  `public/index.html`, carregar um exemplo, "Criar novo", arrastar cartões, exportar).

## Cuidados

- Depois de mudar aulas/cadastros, chamar `Store.commit()` (ele chama `syncCards` e redesenha).
- `solver.js`, `core.js` e `milp.js` não podem depender de DOM (rodam no Node e no Worker).
- A formulação "tight" do PLI (igualdades para quem tem grade cheia) é o que torna o caso real 1 resolvível em
  segundos; há fallback automático para a versão com folgas quando o modelo é inviável.
