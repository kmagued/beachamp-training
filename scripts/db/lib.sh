#!/usr/bin/env bash
# Shared helpers for the prod -> staging database tooling.
# Sourced by the scripts in this directory; not meant to be run directly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/.env.db"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die()   { red "error: $*" >&2; exit 1; }

# Pulls the project ref out of any Supabase connection string.
#   direct:  postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres
#   pooler:  postgresql://postgres.<ref>:pw@aws-0-<region>.pooler.supabase.com:5432/postgres
project_ref_of() {
  local url="$1" ref=""
  ref="$(printf '%s' "$url" | sed -n 's|.*@db\.\([a-z0-9]\{20\}\)\.supabase\.co.*|\1|p')"
  [ -n "$ref" ] || ref="$(printf '%s' "$url" | sed -n 's|.*://postgres\.\([a-z0-9]\{20\}\):.*|\1|p')"
  printf '%s' "$ref"
}

host_of() { printf '%s' "$1" | sed -n 's|.*@\([^:/]*\).*|\1|p'; }

load_config() {
  [ -f "$CONFIG_FILE" ] || die "missing $CONFIG_FILE — copy .env.db.example to .env.db and fill it in"
  # shellcheck disable=SC1090
  set -a; source "$CONFIG_FILE"; set +a

  [ -n "${PROD_DB_URL:-}" ]    || die "PROD_DB_URL is not set in $CONFIG_FILE"
  [ -n "${STAGING_DB_URL:-}" ] || die "STAGING_DB_URL is not set in $CONFIG_FILE"

  PROD_REF="$(project_ref_of "$PROD_DB_URL")"
  STAGING_REF="$(project_ref_of "$STAGING_DB_URL")"

  [ -n "$PROD_REF" ]    || die "could not read a project ref from PROD_DB_URL — is it a Supabase connection string?"
  [ -n "$STAGING_REF" ] || die "could not read a project ref from STAGING_DB_URL — is it a Supabase connection string?"
}

# Everything that stands between a clone and an overwritten production database.
assert_staging_is_not_prod() {
  [ "$PROD_REF" != "$STAGING_REF" ] \
    || die "STAGING_DB_URL points at the same project as PROD_DB_URL ($PROD_REF). Refusing to continue."
  [ "$PROD_DB_URL" != "$STAGING_DB_URL" ] \
    || die "PROD_DB_URL and STAGING_DB_URL are identical. Refusing to continue."

  # A ref pinned in the config is a second lock: the destination must still be the
  # project you wrote down, even if someone pastes a different URL later.
  if [ -n "${STAGING_PROJECT_REF:-}" ] && [ "$STAGING_PROJECT_REF" != "$STAGING_REF" ]; then
    die "STAGING_DB_URL points at '$STAGING_REF' but STAGING_PROJECT_REF pins '$STAGING_PROJECT_REF'. Refusing to continue."
  fi
  if [ -n "${PROD_PROJECT_REF:-}" ] && [ "$PROD_PROJECT_REF" = "$STAGING_REF" ]; then
    die "STAGING_DB_URL points at the production ref '$PROD_PROJECT_REF'. Refusing to continue."
  fi
}

warn_if_direct_connection() {
  local label="$1" url="$2" host
  host="$(host_of "$url")"
  case "$host" in
    db.*.supabase.co)
      warn "note: $label uses the direct connection ($host)."
      warn "      These scripts run pg_dump/psql inside Docker, which usually cannot reach"
      warn "      Supabase's IPv6-only direct host. If it hangs or says 'network unreachable',"
      warn "      switch to the Session pooler string from Dashboard -> Connect."
      ;;
  esac
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed"
  docker info >/dev/null 2>&1 || die "the Docker daemon is not running — start Docker Desktop and retry"
}

require_supabase_cli() {
  command -v supabase >/dev/null 2>&1 || die "the Supabase CLI is not on PATH (expected ~/.local/bin/supabase)"
}

ensure_pg_image() {
  docker image inspect "$PG_IMAGE" >/dev/null 2>&1 || {
    blue "Pulling $PG_IMAGE ..."
    docker pull "$PG_IMAGE" >/dev/null
  }
}

# psql against a target, with the connection string passed through the environment
# rather than argv so it does not show up in process listings. DUMP_DIR is the one
# directory the container can see, so every file psql reads has to live there.
psql_run() {
  local url="$1"; shift
  [ -n "${DUMP_DIR:-}" ] || die "internal: DUMP_DIR is not set"
  docker run --rm -i \
    -e TARGET_DB_URL="$url" \
    -v "$DUMP_DIR:/dump" \
    "$PG_IMAGE" \
    sh -c 'exec psql "$TARGET_DB_URL" "$@"' sh "$@"
}

# Runs one SQL statement and returns the bare result (no headers, no padding).
psql_value() {
  local url="$1" sql="$2"
  psql_run "$url" --no-psqlrc --quiet --tuples-only --no-align --command "$sql"
}

confirm() {
  local prompt="$1"
  if [ "${ASSUME_YES:-0}" = "1" ]; then
    blue "$prompt -> yes (--yes)"
    return 0
  fi
  [ -t 0 ] || die "$prompt — refusing to assume yes on a non-interactive run. Pass --yes if you mean it."
  printf '%s [y/N] ' "$prompt"
  local reply; read -r reply
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) die "aborted" ;; esac
}
