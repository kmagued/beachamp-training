#!/usr/bin/env bash
# Clones the production Supabase database into the staging project.
#
#   ./scripts/db/clone-prod-to-staging.sh [--yes] [--keep-dump] [--no-reset]
#
# Copies schema, all table data, auth users, storage bucket rows, storage RLS
# policies, the realtime publication and the migration history. It does NOT copy
# the files inside storage buckets — run copy-storage.ts for those.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ASSUME_YES=0
KEEP_DUMP=0
DO_RESET=1

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y)     ASSUME_YES=1 ;;
    --keep-dump)  KEEP_DUMP=1 ;;
    --no-reset)   DO_RESET=0 ;;
    -h|--help)    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)            die "unknown argument: $1" ;;
  esac
  shift
done

require_docker
require_supabase_cli
ensure_pg_image
load_config
assert_staging_is_not_prod
warn_if_direct_connection "PROD_DB_URL" "$PROD_DB_URL"
warn_if_direct_connection "STAGING_DB_URL" "$STAGING_DB_URL"

DUMP_DIR="$SCRIPT_DIR/dumps/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DUMP_DIR"
# Everything psql touches has to live under the single mounted directory.
cp "$SCRIPT_DIR/gen-post-restore.sql" "$SCRIPT_DIR/reset-staging.sql" \
   "$SCRIPT_DIR/pre-restore.sql" "$DUMP_DIR/"
cleanup() { [ "$KEEP_DUMP" = "1" ] || rm -rf "$DUMP_DIR"; }
trap cleanup EXIT

blue "==> source      production  $PROD_REF"
blue "==> destination staging     $STAGING_REF"

# A dump from a newer server will not restore into an older one, and the failure
# would otherwise surface halfway through the restore.
prod_pg="$(psql_value "$PROD_DB_URL" 'SHOW server_version_num' | tr -d '[:space:]')" \
  || die "cannot connect to production — check PROD_DB_URL"
stag_pg="$(psql_value "$STAGING_DB_URL" 'SHOW server_version_num' | tr -d '[:space:]')" \
  || die "cannot connect to staging — check STAGING_DB_URL"
printf '    postgres       prod=%s staging=%s\n' "$((prod_pg / 10000))" "$((stag_pg / 10000))"
[ "$stag_pg" -ge "$prod_pg" ] \
  || die "staging runs an older Postgres ($((stag_pg / 10000))) than production ($((prod_pg / 10000))). Recreate staging on $((prod_pg / 10000)) or newer."
echo

# --- dump from production --------------------------------------------------
blue "==> Dumping roles"
supabase db dump --db-url "$PROD_DB_URL" --role-only -f "$DUMP_DIR/roles.sql" >/dev/null

blue "==> Dumping schema"
supabase db dump --db-url "$PROD_DB_URL" -f "$DUMP_DIR/schema.sql" >/dev/null

# Platform-managed tables the `postgres` role cannot write to, so restoring their data
# fails with "permission denied". They belong to supabase_storage_admin and hold no app
# data. The CLI already excludes auth.schema_migrations and storage.migrations; these are
# newer additions. To find any others:
#   SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
#   WHERE c.relkind='r' AND NOT has_table_privilege('postgres', c.oid, 'INSERT');
DATA_EXCLUDES=(
  # Permission denied for the postgres role (owned by supabase_storage_admin).
  storage.buckets_vectors
  storage.vector_indexes
  # Exist on production only because Database Webhooks and pg_net are enabled there.
  # Staging deliberately runs an inert webhook stub instead, so these have no target
  # table and hold nothing but production's delivery log and queue.
  supabase_functions.hooks
  net.http_request_queue
  net._http_response
  # Excluding a table leaves its sequence's setval() behind, which fails the same way.
  supabase_functions.hooks_id_seq
  net.http_request_queue_id_seq
)
exclude_args=()
for t in "${DATA_EXCLUDES[@]}"; do exclude_args+=(-x "$t"); done

blue "==> Dumping data"
supabase db dump --db-url "$PROD_DB_URL" --data-only --use-copy \
  "${exclude_args[@]}" -f "$DUMP_DIR/data.sql" >/dev/null

blue "==> Generating post-restore script (storage policies, realtime, migration history)"
if ! psql_run "$PROD_DB_URL" --no-psqlrc --quiet --tuples-only --no-align \
     --variable ON_ERROR_STOP=1 -f /dump/gen-post-restore.sql \
     > "$DUMP_DIR/post-restore.sql" 2> "$DUMP_DIR/post-restore.err"; then
  cat "$DUMP_DIR/post-restore.err" >&2
  die "failed to read the production catalog — check PROD_DB_URL"
fi

# Production applied its migrations outside the CLI, so there is no history to copy.
# Stamp staging from the migration files in the repo instead: staging's schema now
# matches production, which is what those files add up to, and this keeps
# `supabase db push` usable against staging for future migrations.
if grep -q 'STAMP_FROM_LOCAL_MIGRATIONS' "$DUMP_DIR/post-restore.sql"; then
  blue "    production has no CLI migration history — stamping staging from supabase/migrations/"
  python3 - "$REPO_ROOT/supabase/migrations" >> "$DUMP_DIR/post-restore.sql" <<'STAMP_PY'
import pathlib, re, sys
rows = []
for f in sorted(pathlib.Path(sys.argv[1]).glob("*.sql")):
    m = re.match(r"^(\d{14})_(.+)\.sql$", f.name)
    if m:
        version, name = m.group(1), m.group(2).replace("'", "''")
        rows.append(f"INSERT INTO supabase_migrations.schema_migrations (version, name) "
                    f"VALUES ('{version}', '{name}') ON CONFLICT (version) DO NOTHING;")
print("\n".join(rows))
print(f"-- stamped {len(rows)} migration(s) from the repo")
STAMP_PY
fi

for f in roles schema data post-restore; do
  printf '    %-14s %s\n' "$f.sql" "$(du -h "$DUMP_DIR/$f.sql" | cut -f1)"
done
echo

# --- restore into staging --------------------------------------------------
if [ "$DO_RESET" = "1" ]; then
  red "This will DROP the public schema and clear auth users in project $STAGING_REF."
  confirm "Overwrite staging ($STAGING_REF) with a copy of production ($PROD_REF)?"

  blue "==> Resetting staging"
  psql_run "$STAGING_DB_URL" --no-psqlrc --quiet --variable ON_ERROR_STOP=1 \
    -f /dump/reset-staging.sql
else
  confirm "Restore into staging ($STAGING_REF) without resetting it first?"
fi

blue "==> Installing pre-restore stubs (inert webhook function)"
psql_run "$STAGING_DB_URL" --no-psqlrc --quiet --variable ON_ERROR_STOP=1 \
  -f /dump/pre-restore.sql

blue "==> Restoring roles"
# Roles that already exist on the destination make this noisy but harmless.
psql_run "$STAGING_DB_URL" --no-psqlrc --quiet -f /dump/roles.sql >/dev/null 2>&1 \
  || warn "some role statements were skipped (usually fine — Supabase manages its own roles)"

blue "==> Restoring schema and data"
psql_run "$STAGING_DB_URL" \
  --no-psqlrc \
  --quiet \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  -f /dump/schema.sql \
  --command 'SET session_replication_role = replica' \
  -f /dump/data.sql

blue "==> Applying storage policies, realtime publication and migration history"
psql_run "$STAGING_DB_URL" --no-psqlrc --quiet --variable ON_ERROR_STOP=1 \
  -f /dump/post-restore.sql

# --- verify ----------------------------------------------------------------
echo
blue "==> Verifying"
COUNT_SQL="SELECT relname || '=' || n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' AND n_live_tup > 0 ORDER BY relname"
psql_value "$STAGING_DB_URL" "ANALYZE" >/dev/null 2>&1 || true

prod_users="$(psql_value "$PROD_DB_URL"    'SELECT count(*) FROM auth.users' | tr -d '[:space:]')"
stag_users="$(psql_value "$STAGING_DB_URL" 'SELECT count(*) FROM auth.users' | tr -d '[:space:]')"
prod_tables="$(psql_value "$PROD_DB_URL"    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]')"
stag_tables="$(psql_value "$STAGING_DB_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]')"

printf '    %-22s prod=%-8s staging=%s\n' 'public tables' "$prod_tables" "$stag_tables"
printf '    %-22s prod=%-8s staging=%s\n' 'auth users'    "$prod_users"  "$stag_users"

if [ "$prod_tables" != "$stag_tables" ] || [ "$prod_users" != "$stag_users" ]; then
  warn "counts differ between production and staging — review the output above"
else
  echo
  green "Staging ($STAGING_REF) now mirrors production ($PROD_REF)."
  echo   "Storage bucket files are not included — run: npm run db:copy-storage"
fi
