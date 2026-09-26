#!/usr/bin/env bash
# Sets the database password for one target in .env.db, without hand-editing the URL.
#
#   ./scripts/db/set-db-password.sh prod
#   ./scripts/db/set-db-password.sh staging
#
# Prompts for the password (not echoed, not stored in shell history), percent-encodes
# it, rebuilds the whole connection string, then tests it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/.env.db"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
DEFAULT_HOST="aws-1-eu-west-1.pooler.supabase.com:5432"

die() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

case "${1:-}" in
  prod)    VAR=PROD_DB_URL;    REF_VAR=PROD_PROJECT_REF ;;
  staging) VAR=STAGING_DB_URL; REF_VAR=STAGING_PROJECT_REF ;;
  *) echo "usage: $0 [prod|staging]" >&2; exit 1 ;;
esac

[ -f "$CONFIG_FILE" ] || die "missing $CONFIG_FILE"
# shellcheck disable=SC1090
set -a; source "$CONFIG_FILE"; set +a

REF="${!REF_VAR:-}"
[ -n "$REF" ] || die "$REF_VAR is not set in $CONFIG_FILE"

# Keep whatever host is already configured, as long as it looks sane.
HOST="$(printf '%s' "${!VAR:-}" | sed -n 's|.*@\([^/]*\)/.*|\1|p')"
case "$HOST" in
  *pooler.supabase.com:*|db.*.supabase.co:*) ;;
  *) HOST="$DEFAULT_HOST" ;;
esac

printf 'Database password for %s (%s).\n' "$1" "$REF"
printf 'Find or reset it at: Dashboard -> Settings -> Database -> Database password\n'
printf 'Password (not shown as you type): '
IFS= read -rs PASSWORD
printf '\n'
[ -n "$PASSWORD" ] || die "no password entered"

ENCODED="$(PW="$PASSWORD" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PW"],safe=""))')"
[ "$ENCODED" = "$PASSWORD" ] || echo "note: password contained characters that needed percent-encoding"

URL="postgresql://postgres.$REF:$ENCODED@$HOST/postgres"

printf 'Testing connection to %s ... ' "$HOST"
if docker run --rm -e U="$URL" -e PGCONNECT_TIMEOUT=15 "$PG_IMAGE" \
     sh -c 'psql "$U" -Atc "SELECT current_setting('\''server_version'\'')"' 2>/tmp/pwtest.err; then
  :
else
  printf '\033[31mfailed\033[0m\n'
  sed 's/^psql: error: //' /tmp/pwtest.err | head -2 >&2
  rm -f /tmp/pwtest.err
  die "$VAR not written — the password was not accepted"
fi
rm -f /tmp/pwtest.err

# Rewrite just that one line, leaving the rest of the file untouched.
python3 - "$CONFIG_FILE" "$VAR" "$URL" <<'PY'
import pathlib, sys
path, var, url = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(path)
lines = p.read_text().split("\n")
found = False
for i, line in enumerate(lines):
    if line.startswith(var + "="):
        lines[i] = f"{var}={url}"
        found = True
        break
if not found:
    lines.append(f"{var}={url}")
p.write_text("\n".join(lines))
PY

printf '\033[32m%s written and verified.\033[0m\n' "$VAR"
