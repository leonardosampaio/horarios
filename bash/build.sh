#!/usr/bin/env bash
# Gera public/ (versão pública minificada) dentro de um container Docker temporário.
# Não exige Node na máquina: o container instala as dependências, roda a suíte de testes e o build,
# e é removido ao terminar (--rm). Só a pasta public/ é escrita no host.
#
#   bash/build.sh                 # testes + build
#   SKIP_TESTS=1 bash/build.sh    # só o build
#   NODE_IMAGE=node:22-alpine bash/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${NODE_IMAGE:-node:22-slim}"

command -v docker >/dev/null || { echo "erro: docker não encontrado no PATH." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "erro: o daemon do Docker não está acessível (está rodando?)." >&2; exit 1; }

mkdir -p "$ROOT/public"

# O projeto entra somente-leitura em /src e é copiado para /tmp/build dentro do container, de modo que
# node_modules e arquivos temporários nunca tocam o host. Roda com o uid/gid do usuário para que
# public/ não fique pertencendo ao root.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e npm_config_cache=/tmp/.npm -e npm_config_update_notifier=false \
  -e SKIP_TESTS="${SKIP_TESTS:-}" \
  -v "$ROOT":/src:ro \
  -v "$ROOT/public":/out \
  "$IMAGE" sh -euc '
    mkdir -p /tmp/build   # criado aqui (e não com -w) para pertencer ao usuário do container
    cd /src
    tar -cf - --exclude=./node_modules --exclude=./public --exclude=./.git --exclude="*.mp4" . | tar -xf - -C /tmp/build
    cd /tmp/build
    npm ci --no-audit --no-fund
    if [ -n "$SKIP_TESTS" ]; then node build.mjs; else npm run build; fi
    find /out -mindepth 1 ! -name .gitkeep -delete
    cp -R public/. /out/
  '

echo "public/ gerado em $ROOT/public"
