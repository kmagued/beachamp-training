#!/usr/bin/env bash
# Points the app at one environment by swapping which file .env.local is.
#
#   ./scripts/db/use-env.sh staging
#   ./scripts/db/use-env.sh prod
#   ./scripts/db/use-env.sh            # show which one is active

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACTIVE="$REPO_ROOT/.env.local"
MARKER="# managed by scripts/db/use-env.sh — active environment:"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

current() {
  [ -f "$ACTIVE" ] || { echo "none"; return; }
  sed -n "s|^$MARKER \(.*\)$|\1|p" "$ACTIVE" | head -1 | grep . || echo "unknown"
}

case "${1:-}" in
  "")
    name="$(current)"
    if [ "$name" = "prod" ]; then
      red "active: prod — you are pointed at the live database"
    else
      green "active: $name"
    fi
    grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' "$ACTIVE" 2>/dev/null || true
    exit 0
    ;;
  staging|prod) ;;
  *) echo "usage: $0 [staging|prod]" >&2; exit 1 ;;
esac

TARGET="$REPO_ROOT/.env.$1"
[ -f "$TARGET" ] || { echo "error: $TARGET does not exist" >&2; exit 1; }

# Rewrite the marker so `use-env.sh` with no argument can report the truth later.
{
  echo "$MARKER $1"
  grep -v "^$MARKER" "$TARGET"
} > "$ACTIVE"

if [ "$1" = "prod" ]; then
  red "active: prod — .env.local now points at the LIVE database"
else
  green "active: $1"
fi
grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' "$ACTIVE" || true
echo "Restart \`npm run dev\` for this to take effect."
