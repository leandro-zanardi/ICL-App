#!/bin/bash
set -e

# Instala dependências (rápido quando o lockfile não mudou)
pnpm install --frozen-lockfile

# Aplica o schema ao banco de DESENVOLVIMENTO.
# Usar push-force: stdin é fechado no pós-merge, "push" interativo travaria.
pnpm --filter @workspace/db run push-force
