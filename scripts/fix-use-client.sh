#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# Fix "use client" directives automatically.
# - Ajoute "use client" en tête si un fichier contient des signaux
#   de composant client (hooks React/Next, APIs navigateur, events JSX).
# - Le retire si présent alors qu'aucun signal client n'est détecté.
# - Ignore les fichiers "use server".
#
# Flags:
#   --changed-only   n'affiche que les fichiers modifiés (Added/Removed)
#   --dry-run        n'écrit rien, affiche seulement ce qui serait fait
#
# Pré-requis: ripgrep (rg)
# À lancer depuis la racine du projet.
# ------------------------------------------------------------

# --- Flags
ONLY_CHANGED=false
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --changed-only) ONLY_CHANGED=true ;;
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

# --- Check deps
if ! command -v rg >/dev/null 2>&1; then
  echo "Erreur: ripgrep (rg) n'est pas installé ou introuvable dans le PATH." >&2
  echo "macOS: brew install ripgrep" >&2
  exit 1
fi

# --- Config
GLOBS=( "**/*.tsx" "**/*.ts" "**/*.jsx" "**/*.js" )
EXCLUDES=( "!node_modules" "!.next" "!dist" "!build" "!out" )

# Signaux d'un composant client :
HOOKS_REGEX='(useState|useEffect|useLayoutEffect|useReducer|useRef|useMemo|useCallback|useContext|useTransition|useDeferredValue|useRouter|usePathname|useSearchParams|useSelectedLayoutSegments|useParams)\s*\('
BROWSER_REGEX='(window\.|document\.|localStorage|sessionStorage|navigator\.|location\.|matchMedia\(|addEventListener\()'
EVENTS_REGEX='on[A-Z][a-zA-Z]+\s*='

# --- Helpers
has_use_server() {
  head -n 5 "$1" | rg -q '^\s*["'\'']use server["'\''];?\s*$'
}

has_use_client_top() {
  head -n 5 "$1" | rg -q '^\s*["'\'']use client["'\''];?\s*$'
}

has_client_signals() {
  rg -q -e "$HOOKS_REGEX" -e "$BROWSER_REGEX" -e "$EVENTS_REGEX" "$1"
}

insert_use_client_top() {
  local file="$1"
  if $DRY_RUN; then
    return 0
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
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  # supprime "use client" si elle apparaît dans les 5 premières lignes
  awk 'NR<=5 && $0 ~ /^[[:space:]]*("use client"|\x27use client\x27);?[[:space:]]*$/ {next} {print}' "$file" > "$tmp"
  mv "$tmp" "$file"
}

should_process_file() {
  [[ -s "$1" ]]
}

# --- Counters
added=0
removed=0
keep_client=0
keep_server=0
skipped=0

# --- Main
rg -l --null '.' \
  "${EXCLUDES[@]/#/--glob }" \
  "${GLOBS[@]/#/-g }" \
  | while IFS= read -r -d '' file; do
      should_process_file "$file" || continue

      if has_use_server "$file"; then
        if ! $ONLY_CHANGED; then echo "Skip (use server): $file"; fi
        ((skipped++))
        continue
      fi

      if has_client_signals "$file"; then
        # Doit être client
        if has_use_client_top "$file"; then
          if ! $ONLY_CHANGED; then echo "Keep (already client): $file"; fi
          ((keep_client++))
        else
          insert_use_client_top "$file"
          echo "Added 'use client': $file"
          ((added++))
        fi
      else
        # Ne contient pas de signaux client => retire la directive si présente
        if has_use_client_top "$file"; then
          remove_use_client_top_if_present "$file"
          echo "Removed 'use client': $file"
          ((removed++))
        else
          if ! $ONLY_CHANGED; then echo "Keep (server-ok): $file"; fi
          ((keep_server++))
        fi
      fi
    done

echo
echo "Summary:"
echo "  Added   : $added"
echo "  Removed : $removed"
echo "  Keep(cl): $keep_client"
echo "  Keep(sv): $keep_server"
echo "  Skipped : $skipped"

if $DRY_RUN; then
  echo "(dry-run: aucun fichier modifié)"
fi

echo "Done."
