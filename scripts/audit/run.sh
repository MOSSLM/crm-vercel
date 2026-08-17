#!/usr/bin/env bash
# Lance un script d'audit avec le shim `server-only` et les alias `@/`.
# Les scripts réutilisent le code de production ; ce sont ces deux options qui
# le rendent exécutable hors de Next, sans rien changer au code lui-même.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec npx ts-node \
  -r ./scripts/_shim-server-only.js \
  -r tsconfig-paths/register \
  -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
  "$@"
