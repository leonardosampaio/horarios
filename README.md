# Horários

Sistema web de criação de horários escolares (inspirado no aSc Horários): aloca professor + disciplina por turma e sala.
Roda 100% no navegador, sem backend — basta abrir `index.html`.

## Uso

1. **Assistente** (ou os botões da barra): escola, disciplinas, turmas, salas e professores (com especialidades e tempo livre).
2. **Aulas**: para cada turma/professor/disciplina, quantas aulas por semana, duração (simples, dupla…) e salas.
3. **Teste** → **Criar novo**: gera uma ou várias versões do horário obedecendo às restrições.
4. Ajuste arrastando os cartões. Toda escolha manual é validada: a grade mostra onde o cartão cabe, o que cada
   posição desobedece, e os conflitos ficam marcados (ver também **Verificação**).
5. **Versões** guarda e compara os horários gerados; **Salvar JSON** e **PDF / Imprimir** exportam.

**Abrir** lê os `.json` salvos aqui e também importa arquivos `.roz` do aSc TimeTables (cadastros, tempo livre
dos professores, aulas e o horário; salas e demais restrições não são importadas).

Tudo o que é digitado fica salvo no `localStorage` do navegador. **Exemplo** carrega os casos reais de `asc/exemplos`.

## Como o horário é resolvido

`js/milp.js` formula o problema como Programação Linear Inteira e resolve com o HiGHS (WebAssembly, em `vendor/`):

- variável binária `y[g,d,p]`: um cartão da aula `g` começa no dia `d`, tempo `p`;
- restrições rígidas: toda aula é dada; professor, turma (ou grupo) e sala em uma aula por vez; tempo livre
  "inadequado" e cartões travados;
- objetivo (minimizar): janelas de turmas e professores, início tardio, disciplina repetida no dia, limites por dia,
  relações entre cartões, posições condicionais.

`js/solver.js` contém o teste prévio, a verificação e uma busca local que dá o polimento final (e serve de
método alternativo).

## Testes e versão pública

    bash/build.sh     # testes + build dentro de um container Docker temporário (não precisa de Node)

ou, com Node instalado:

    npm install
    npm test          # suíte baseada nos exemplos reais de asc/exemplos
    npm run build     # roda os testes e gera public/ (HTML, CSS e JS minificados)

`public/` é autocontida: publique a pasta em qualquer hospedagem de arquivos estáticos (ou abra `public/index.html`).
`npm run comparar` mostra o gerador contra os horários originais em várias sementes.
