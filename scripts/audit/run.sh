#!/usr/bin/env bash
# Lance un script d'audit avec le shim `server-only` et les alias `@/`.
# Les scripts réutilisent le code de production ; ce sont ces deux options qui
# le rendent exécutable hors de Next, sans rien changer au code lui-même.
set -euo pipefail
cd "$(dirname "$0")/../.."
# `tsconfig.json` déclare `paths` SANS `baseUrl` — Next.js l'accepte et résout
# relativement au tsconfig, mais `tsconfig-paths` exige la clé et se désactive
# sinon : « Missing baseUrl in compilerOptions », puis chaque `@/…` échoue. Le
# `-O` ci-dessous ne suffit pas, il ne nourrit que le compilateur, pas le
# résolveur. Cette variable est la seule chose que `tsconfig-paths` lit.
export TS_NODE_BASEURL="${TS_NODE_BASEURL:-.}"
exec npx ts-node \
  -r ./scripts/_shim-server-only.js \
  -r tsconfig-paths/register \
  -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
  "$@"
