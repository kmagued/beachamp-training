-- Emits the SQL that `supabase db dump` cannot carry across on its own.
-- Run against PRODUCTION with: psql -X -A -t -f gen-post-restore.sql
-- The output is a script to apply to STAGING after the schema + data restore.
--
-- Three gaps are covered:
--   1. storage policies  - the schema dump excludes the `storage` schema entirely,
--                          so RLS policies on storage.objects/buckets never travel.
--   2. realtime          - the schema dump comments out the supabase_realtime
--                          publication, so subscribed tables must be re-added.
--   3. migration history - the data dump excludes `supabase_migrations`, so without
--                          this staging would try to replay all migrations on push.

\pset footer off

-- 1. Storage RLS ------------------------------------------------------------
-- storage.objects and storage.buckets are owned by supabase_storage_admin, so the
-- postgres role cannot ALTER them even though it may create policies on them. Supabase
-- enables RLS on both by default, so only attempt it when it is actually off, and treat
-- a permission error as informational.
SELECT E'-- storage: row level security\n'
       || E'DO $rls$\n'
       || E'DECLARE t text;\n'
       || E'BEGIN\n'
       || E'  FOREACH t IN ARRAY ARRAY[''storage.objects'', ''storage.buckets''] LOOP\n'
       || E'    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass) THEN\n'
       || E'      BEGIN\n'
       || E'        EXECUTE format(''ALTER TABLE %s ENABLE ROW LEVEL SECURITY'', t);\n'
       || E'      EXCEPTION WHEN insufficient_privilege THEN\n'
       || E'        RAISE WARNING ''cannot enable RLS on % (not owner); Supabase enables it by default'', t;\n'
       || E'      END;\n'
       || E'    END IF;\n'
       || E'  END LOOP;\n'
       || E'END $rls$;\n';

SELECT COALESCE(
  E'-- storage: policies\n' || string_agg(
    format(
      E'DROP POLICY IF EXISTS %I ON %I.%I;\nCREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
      policyname, schemaname, tablename,
      policyname, schemaname, tablename,
      permissive,
      cmd,
      array_to_string(roles, ', '),
      CASE WHEN qual       IS NULL THEN '' ELSE E'\n  USING (' || qual || ')' END,
      CASE WHEN with_check IS NULL THEN '' ELSE E'\n  WITH CHECK (' || with_check || ')' END
    ),
    E'\n\n' ORDER BY tablename, policyname
  ) || E'\n',
  E'-- storage: no policies found on production\n'
)
FROM pg_policies
WHERE schemaname = 'storage';

-- 2. Realtime publication ---------------------------------------------------
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    THEN E'-- realtime: no supabase_realtime publication on production\n'
  ELSE
    E'-- realtime: publication membership\n'
    || E'DROP PUBLICATION IF EXISTS supabase_realtime;\n'
    || CASE
         WHEN (SELECT puballtables FROM pg_publication WHERE pubname = 'supabase_realtime')
           THEN E'CREATE PUBLICATION supabase_realtime FOR ALL TABLES;\n'
         ELSE E'CREATE PUBLICATION supabase_realtime;\n'
              || COALESCE(
                   (SELECT string_agg(
                      format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I;', schemaname, tablename),
                      E'\n' ORDER BY schemaname, tablename)
                    FROM pg_publication_tables WHERE pubname = 'supabase_realtime'),
                   '')
              || E'\n'
       END
END;

-- 3. Migration history ------------------------------------------------------
-- Production may have no history table at all, if migrations were applied through
-- the dashboard rather than the CLI. A query referencing a missing relation fails at
-- parse time even inside a CASE, so branch with psql's \if, which never sends the
-- untaken branch to the server.
SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_history \gset

\if :has_history
SELECT E'-- supabase_migrations: keep `supabase db push` in sync\n'
       || E'CREATE SCHEMA IF NOT EXISTS supabase_migrations;\n'
       || E'CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (\n'
       || E'  version text NOT NULL PRIMARY KEY,\n'
       || E'  statements text[],\n'
       || E'  name text\n'
       || E');\n';

SELECT COALESCE(
  string_agg(
    format(
      'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES (%L, %L, %L::text[]) ON CONFLICT (version) DO NOTHING;',
      version, name, statements::text
    ),
    E'\n' ORDER BY version
  ) || E'\n',
  E'-- supabase_migrations: production has no recorded migrations\n'
)
FROM supabase_migrations.schema_migrations;
\else
SELECT E'-- supabase_migrations: production has no history table (migrations were applied\n'
       || E'-- outside the CLI), so the clone script stamps it from supabase/migrations/ instead.\n'
       || E'CREATE SCHEMA IF NOT EXISTS supabase_migrations;\n'
       || E'CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (\n'
       || E'  version text NOT NULL PRIMARY KEY,\n'
       || E'  statements text[],\n'
       || E'  name text\n'
       || E');\n'
       || E'-- STAMP_FROM_LOCAL_MIGRATIONS\n';
\endif
