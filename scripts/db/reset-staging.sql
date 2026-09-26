-- Wipes the staging database so a clone can be re-run from scratch.
-- Only ever applied to STAGING_DB_URL, and only after the guards in lib.sh pass.

-- The app's own schema: drop and recreate with Supabase's default grants.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
ALTER SCHEMA public OWNER TO pg_database_owner;
COMMENT ON SCHEMA public IS 'standard public schema';
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;

-- Platform-managed schemas: clear every row but leave the tables in place, since they
-- are owned by supabase_auth_admin / supabase_storage_admin and recreated by the
-- platform, not by us. Clearing only auth.users is not enough: tables such as
-- auth.flow_state have no foreign key to it, so their rows survive a cascade and then
-- collide with the incoming dump. The postgres role may not be allowed to truncate
-- some of these, so fall back to DELETE and carry on either way.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname IN ('auth', 'storage')
      -- Platform migration bookkeeping: not ours to touch, and excluded from the dump.
      AND c.relname NOT IN ('schema_migrations', 'migrations')
    ORDER BY n.nspname, c.relname
  LOOP
    BEGIN
      EXECUTE format('TRUNCATE %I.%I CASCADE', rec.schema_name, rec.table_name);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        EXECUTE format('DELETE FROM %I.%I', rec.schema_name, rec.table_name);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'could not clear %.%: %', rec.schema_name, rec.table_name, SQLERRM;
      END;
    END;
  END LOOP;
END $$;

-- Migration history is rebuilt by the post-restore step.
DROP TABLE IF EXISTS supabase_migrations.schema_migrations;
