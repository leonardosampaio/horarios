#!/usr/bin/env bash
# Publica public/ na pasta servida pelo nginx (https://leonardosampaio.dev/horarios/).
# Roda no próprio servidor: faz o build (bash/build.sh) e sincroniza public/ com o destino.
#
#   bash/publicar.sh                       # testes + build + publicação
#   SKIP_TESTS=1 bash/publicar.sh          # build sem a suíte + publicação
#   SKIP_BUILD=1 bash/publicar.sh          # publica o public/ que já existe
#   DEST=/outra/pasta bash/publicar.sh     # outro destino (ajuste também o alias em nginx/horarios.conf)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${DEST:-/var/www/html/leonardosampaio.dev/horarios}"

command -v rsync >/dev/null || { echo "erro: rsync não encontrado no PATH." >&2; exit 1; }

if [ -z "${SKIP_BUILD:-}" ]; then bash "$ROOT/bash/build.sh"; fi

[ -s "$ROOT/public/index.html" ] || { echo "erro: public/index.html não existe; rode o build antes." >&2; exit 1; }

mkdir -p "$DEST"
# --delete remove do destino o que saiu do build; o destino é só desta aplicação, não guarde mais nada nele.
rsync -a --delete --exclude=.gitkeep --chmod=D755,F644 "$ROOT/public/" "$DEST/"

echo "publicado em $DEST"
