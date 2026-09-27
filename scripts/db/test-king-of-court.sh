#!/usr/bin/env bash
# Runs the King of Court score tests (test-king-of-court.sql) against STAGING. The SQL
# runs in one transaction that always rolls back, so staging is left exactly as it was.
#
#   ./scripts/db/test-king-of-court.sh staging

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ "${1:-}" = "staging" ] || die "usage: $0 staging   (these tests only ever run against staging)"

load_config
assert_staging_is_not_prod
warn_if_direct_connection STAGING_DB_URL "$STAGING_DB_URL"
require_docker
ensure_pg_image

DUMP_DIR="$(mktemp -d)"
trap 'rm -rf "$DUMP_DIR"' EXIT
cp "$SCRIPT_DIR/test-king-of-court.sql" "$DUMP_DIR/"

blue "==> Running King of Court score tests against staging ($STAGING_REF)"
psql_run "$STAGING_DB_URL" --no-psqlrc --quiet --variable ON_ERROR_STOP=1 -f /dump/test-king-of-court.sql
green "All King of Court score tests passed"
