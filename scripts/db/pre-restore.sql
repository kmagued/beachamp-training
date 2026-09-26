-- Applied to STAGING immediately before the schema restore.
-- Creates the minimum needed for production's schema to load, without inheriting
-- production's outbound side effects.

-- Production has this schema because Database Webhooks were enabled there; a fresh
-- project does not, and the schema dump references it without creating it.
CREATE SCHEMA IF NOT EXISTS supabase_functions;

-- Production's webhook is an AFTER INSERT trigger on public.notifications calling
-- supabase_functions.http_request(), with the production URL and the webhook secret
-- baked into the trigger arguments. Installing the real pg_net-backed function here
-- would make every notification inserted on staging POST to the production endpoint
-- and email real players. A no-op stub with the same signature lets the trigger be
-- created for schema parity while doing nothing at all.
--
-- To exercise webhooks on staging, enable Database Webhooks in the staging dashboard:
-- Supabase replaces this stub with the real implementation.
CREATE OR REPLACE FUNCTION supabase_functions.http_request() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;
