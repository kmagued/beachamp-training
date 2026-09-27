#!/usr/bin/env bash
# Applies one migration file to STAGING in a single transaction and records it in
# supabase_migrations.schema_migrations, the history `supabase db push` keeps
# (clone-prod-to-staging.sh stamps staging the same way). Production migrations are
# applied by hand, never by this script.
#
#   ./scripts/db/apply-migration.sh staging supabase/migrations/20260927000000_merch_inventory.sql

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ "${1:-}" = "staging" ] || die "usage: $0 staging <migration.sql>   (only staging is supported)"
file="${2:-}"
[ -f "$file" ] || die "migration file not found: ${file:-<none given>}"
base="$(basename "$file")"
[[ "$base" =~ ^([0-9]{14})_(.+)\.sql$ ]] || die "expected a file named <14-digit version>_<name>.sql, got $base"
version="${BASH_REMATCH[1]}"
name="${BASH_REMATCH[2]}"

load_config
assert_staging_is_not_prod
warn_if_direct_connection STAGING_DB_URL "$STAGING_DB_URL"
require_docker
ensure_pg_image

DUMP_DIR="$(mktemp -d)"
trap 'rm -rf "$DUMP_DIR"' EXIT
cp "$file" "$DUMP_DIR/$base"

applied="$(psql_value "$STAGING_DB_URL" \
  "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '$version'" | tr -d '[:space:]')"
[ "$applied" = "0" ] || die "$version is already recorded as applied on staging ($STAGING_REF)"

blue "==> Applying $base to staging ($STAGING_REF)"
psql_run "$STAGING_DB_URL" --no-psqlrc --quiet --single-transaction --variable ON_ERROR_STOP=1 \
  -f "/dump/$base" \
  --command "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$version', '${name//\'/\'\'}') ON CONFLICT (version) DO NOTHING"
green "Applied and recorded $version on staging"
