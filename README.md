# Horários

Sistema web de criação de horários escolares (inspirado no aSc Horários; veja [Relação com o aSc](#relação-com-o-asc)):
aloca professor + disciplina por turma e sala.
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

Tudo o que é digitado fica salvo no `localStorage` do navegador. **Exemplo** carrega os casos reais transcritos em `js/exemplo.js`.

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
    npm test          # suíte baseada nos exemplos reais (js/exemplo.js e asc/exemplos/*.roz)
    npm run build     # roda os testes e gera public/ (HTML, CSS e JS minificados)

`public/` é autocontida: publique a pasta em qualquer hospedagem de arquivos estáticos (ou abra `public/index.html`).
`npm run comparar` mostra o gerador contra os horários originais em várias sementes.

## Publicação (https://leonardosampaio.dev/horarios/)

O repositório fica clonado no próprio servidor do site (nginx). Para publicar uma versão nova:

    git pull
    bash/publicar.sh              # testes + build (Docker) + cópia de public/ para a pasta servida

O script chama `bash/build.sh` e sincroniza `public/` com `/var/www/html/leonardosampaio.dev/horarios`
(`rsync --delete`: a pasta de destino é só desta aplicação). Variáveis:

| Variável | Efeito |
|---|---|
| `SKIP_TESTS=1` | faz o build sem rodar a suíte |
| `SKIP_BUILD=1` | publica o `public/` que já existe |
| `DEST=/pasta` | outro destino (ajuste também o `alias` de `nginx/horarios.conf`) |

No servidor (2 vCPUs) a suíte leva perto de dois minutos, quase tudo nos testes do PLI. O `timeLimit` deles é um
teto: se o HiGHS não chegar a uma solução dentro do prazo, o teste falha com 0 aulas colocadas — nesse caso o
problema é o prazo em `tests/milp.test.js`, não o modelo.

### nginx

Como o destino fica dentro da raiz do site, a aplicação já responde em `/horarios/` pelo `location /` existente.
`nginx/horarios.conf` é o trecho próprio da aplicação: redireciona `/horarios` para `/horarios/`, manda
`Cache-Control: no-cache` (os arquivos de `vendor/` e o `milp-worker.js` não têm hash no nome, então o navegador e
o Cloudflare precisam revalidar para uma publicação valer na hora) e comprime JS e CSS. Instalação, uma única vez:

    sudo cp nginx/horarios.conf /etc/nginx/snippets/horarios.conf

Depois acrescente `include snippets/horarios.conf;` dentro de cada bloco `server` de
`/etc/nginx/sites-available/leonardosampaio.dev` que escuta na porta 443 (ao lado dos outros `include snippets/...`) e
recarregue:

    sudo nginx -t && sudo systemctl reload nginx

Ao alterar `nginx/horarios.conf` no repositório, repita a cópia e o reload. Para conferir sem passar pelo Cloudflare:

    curl -skI --resolve leonardosampaio.dev:443:127.0.0.1 https://leonardosampaio.dev/horarios/

## Relação com o aSc

Este projeto é uma implementação independente (*clean-room*), apenas **inspirada** no aSc Horários / aSc TimeTables.
Não é cópia nem derivação do programa:

- nenhum código-fonte, binário, ícone, imagem, texto de ajuda ou outro recurso do aSc foi usado ou está neste
  repositório; nada foi descompilado nem extraído do programa;
- o que se aproveitou foi a ideia geral do fluxo de trabalho e o vocabulário corrente da área (turma, cartão, tempo
  livre, janela…), observados no uso normal do programa. A interface, o modelo de dados e o resolvedor (programação
  linear inteira com o HiGHS) foram escritos do zero;
- a importação de `.roz` (`js/roz.js`) existe só para interoperabilidade: foi escrita a partir da análise de arquivos
  de horário do próprio autor, sem documentação nem código do fabricante, e lê apenas os dados que o usuário
  cadastrou;
- os exemplos são horários de uma escola real, transcritos à mão em `js/exemplo.js`. As capturas de tela usadas
  como referência durante o desenvolvimento não fazem parte do repositório.

"aSc", "aSc Horários" e "aSc TimeTables" são marcas de seus respectivos titulares. Este projeto não tem vínculo,
patrocínio ou endosso do fabricante.

## Licença

[MIT](LICENSE) © 2026 Leonardo Sampaio.

Componentes de terceiros distribuídos em `vendor/`, cada um com a sua licença (também MIT):

| Componente | Licença |
|---|---|
| [HiGHS](https://highs.dev) e [highs-js](https://github.com/lovasoa/highs-js) (WebAssembly) | `vendor/LICENSE-highs` |
| [jsPDF](https://github.com/parallax/jsPDF) | `vendor/LICENSE-jspdf` |
