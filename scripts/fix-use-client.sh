#!/usr/bin/env bash
set -euo pipefail

# Options
DRY_RUN=false
CHANGED_ONLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --changed-only) CHANGED_ONLY=true; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# Config
GLOBS=( "**/*.tsx" "**/*.ts" "**/*.jsx" "**/*.js" )
EXCLUDES=( "!node_modules/**" "!.next/**" "!dist/**" "!build/**" "!out/**" )

HOOKS_REGEX='(useState|useEffect|useLayoutEffect|useReducer|useRef|useMemo|useCallback|useContext|useTransition|useDeferredValue|useRouter|usePathname|useSearchParams|useSelectedLayoutSegments|useParams)\s*\('
BROWSER_REGEX='(window\.|document\.|localStorage|sessionStorage|navigator\.|location\.|matchMedia\(|addEventListener\()'
EVENTS_REGEX='on[A-Z][a-zA-Z]+\s*='

has_use_server() {
  head -n 5 "$1" | rg -q '^\s*["'"'"']use server["'"'"'];'
}

has_use_client_top() {
  head -n 5 "$1" | rg -q '^\s*["'"'"']use client["'"'"'];'
}

has_client_signals() {
  rg -q -e "$HOOKS_REGEX" -e "$BROWSER_REGEX" -e "$EVENTS_REGEX" "$1"
}

insert_use_client_top() {
  local file="$1"
  if $DRY_RUN; then
    echo "[DRY] Would add 'use client': $file"
    return
  fi
  local tmp
  tmp="$(mktemp)"
  printf '"use client";\n\n' > "$tmp"
  cat "$file" >> "$tmp"
  mv "$tmp" "$file"
}

remove_use_client_top_if_present() {
  local file="$1"
  if $DRY_RUN; then
    echo "[DRY] Would remove 'use client': $file"
    return
  fi
  local tmp
  tmp="$(mktemp)"
  # Supprime "use client" s'il apparaît dans les 5 premières lignes
  awk 'NR<=5 && $0 ~ /^[[:space:]]*("use client"|\x27use client\x27);[[:space:]]*$/ {next} {print}' "$file" > "$tmp"
  mv "$tmp" "$file"
}

should_process_file() { [[ -s "$1" ]]; }

# Si --changed-only, prépare une liste dans un fichier temp
CHANGED_TMP=""
CHANGED_COUNT=0
if $CHANGED_ONLY && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CHANGED_TMP="$(mktemp)"
  (git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null || true) > "$CHANGED_TMP"
  CHANGED_COUNT=$(wc -l < "$CHANGED_TMP" | tr -d ' ')
  if [[ "$CHANGED_COUNT" -eq 0 ]]; then
    git ls-files > "$CHANGED_TMP" || true
    CHANGED_COUNT=$(wc -l < "$CHANGED_TMP" | tr -d ' ')
  fi
fi

# Construit les args rg
RG_ARGS=(-l --null '.')
for g in "${GLOBS[@]}";    do RG_ARGS+=(-g "$g"); done
for e in "${EXCLUDES[@]}"; do RG_ARGS+=(-g "$e"); done

rg "${RG_ARGS[@]}" | while IFS= read -r -d '' file; do
  should_process_file "$file" || continue

  if $CHANGED_ONLY && [[ -n "$CHANGED_TMP" ]] && [[ "$CHANGED_COUNT" -gt 0 ]]; then
    if ! grep -Fxq -- "$file" "$CHANGED_TMP"; then
      continue
    fi
  fi

  if has_use_server "$file"; then
    echo "Skip (use server): $file"
    continue
  fi

  if has_client_signals "$file"; then
    if has_use_client_top "$file"; then
      echo "Keep (already client): $file"
    else
      insert_use_client_top "$file"
      $DRY_RUN || echo "Added 'use client': $file"
    fi
  else
    if has_use_client_top "$file"; then
      remove_use_client_top_if_present "$file"
      $DRY_RUN || echo "Removed 'use client': $file"
    else
      echo "Keep (server-ok): $file"
    fi
  fi
done

echo "Done."
