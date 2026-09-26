# Dev environment (staging database)

Development runs against a **separate Supabase project** that holds a copy of production
data, so nothing you click in `npm run dev` touches live players, payments or bookings.

| | production | staging |
|---|---|---|
| project ref | `lvlsdfceyzizjibpwoiu` | `sxmupuyfkeczlgnykcbl` |
| env file | `.env.prod` | `.env.staging` |
| region / version | eu-west-1, Postgres 17.6 | eu-west-1, Postgres 17.6 |
| data | live | refreshed from production on demand |
| email | Brevo SMTP | disabled (`SMTP_USER` blank) |
| Clash court API | live key | disabled (`CLASH_API_KEY` blank) |
| notification webhook | live, posts to the app | inert stub, does nothing |

## One-time setup

**1. Create the staging project.** In the Supabase dashboard, create a second project
(suggested name `beachamp-staging`) in the **same region and on the same Postgres major
version** as production. Wait for it to finish provisioning.

**2. Collect the connection strings.** For each project, go to **Connect → Session pooler**
and copy the URI. Use the *session pooler* string, not the direct `db.<ref>.supabase.co`
one: these scripts run `pg_dump`/`psql` inside Docker, which cannot reach Supabase's
IPv6-only direct host. Percent-encode the password (`@` → `%40`, `#` → `%23`).

**3. Fill in the clone config.**

```bash
cp scripts/db/.env.db.example scripts/db/.env.db
$EDITOR scripts/db/.env.db
```

Both connection strings go here, plus the service-role keys for the storage copy. The file
is gitignored.

**4. Fill in the staging app env.** Edit `.env.staging` and replace the four `STAGINGREF` /
`PASTE_...` placeholders with the staging project's URL, anon key, service-role key and ref
(**Settings → API**). Leave `SMTP_USER`, `SMTP_PASS` and `CLASH_API_KEY` blank.

**5. Run the first clone.**

```bash
npm run db:clone          # schema + data + auth users, ~ a few minutes
npm run db:copy-storage   # the files behind the storage buckets
npm run env:staging       # point the app at staging
npm run dev
```

## Daily use

```bash
npm run env               # which environment is .env.local currently pointing at?
npm run env:staging       # switch to staging
npm run env:prod          # switch back to production (prints a red warning)
```

`.env.local` is what Next.js reads. The switcher overwrites it from `.env.staging` or
`.env.prod` and stamps a marker line at the top so `npm run env` can report the truth.
Restart `npm run dev` after switching.

## Refreshing staging from production

```bash
npm run db:clone            # asks for confirmation first
npm run db:clone -- --yes   # skip the prompt
npm run db:copy-storage
```

`db:clone` wipes staging and rebuilds it, so it is safe to re-run whenever staging has
drifted or you need current data. Useful flags:

| flag | effect |
|---|---|
| `--yes` | skip the confirmation prompt |
| `--keep-dump` | leave the dump in `scripts/db/dumps/<timestamp>/` instead of deleting it |
| `--no-reset` | restore without dropping the existing staging schema first |

### What the clone copies

- every table, view, function, trigger and RLS policy in `public`
- all table data, via `COPY`
- `auth.users` and the rest of the `auth` schema, so **production logins work on staging
  with the same passwords**
- `storage.buckets` and `storage.objects` rows
- storage RLS policies — the Supabase schema dump excludes the `storage` schema, so these
  are regenerated from production's catalog by `gen-post-restore.sql`
- the `supabase_realtime` publication membership — also excluded from the schema dump
- the migration history, so `supabase db push` against staging does not try to replay every
  migration. Production has no history table, so it is stamped from `supabase/migrations/`
  instead (see below)

> **Note on realtime:** production's `supabase_realtime` publication currently contains **no
> tables**, so the clone faithfully reproduces an empty publication. That means
> `postgres_changes` delivers no events — on production *or* staging. The notification bell
> in `src/components/layout/notification-bell.tsx` subscribes to `public.notifications`, so
> its badge only updates on mount and on the manual `notifications-updated` window event. If
> that subscription is meant to work, add the table under **Database → Publications** in the
> dashboard, or run
> `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;`. Once production has
> it, the clone will carry it across automatically.

### What it does not copy

- **Files inside storage buckets.** The object rows arrive but point at nothing, so every
  screenshot and schedule photo 404s until you run `npm run db:copy-storage`.
- **Dashboard configuration**: auth providers, redirect URLs, secrets, edge functions. Set
  these up once in the staging dashboard by hand.
- **Extensions you enabled by hand** in the dashboard rather than in a migration. Production
  has `pg_net` enabled; staging does not, and does not need it.
- **A working notification webhook** — deliberately. See below.

### The notification webhook is deliberately inert on staging

Production has a database webhook: an `AFTER INSERT` trigger named `notification-email` on
`public.notifications` that calls `supabase_functions.http_request()`. The destination URL
**and the webhook secret are baked into the trigger's arguments**, so a faithful copy would
make every notification inserted on staging POST to the *production* endpoint and email real
players.

Instead, [`pre-restore.sql`](../scripts/db/pre-restore.sql) installs a no-op
`supabase_functions.http_request()` stub on staging before the schema loads. The trigger is
created, so the schema matches production, but it does nothing when it fires.

To exercise webhooks on staging, enable **Database Webhooks** in the staging dashboard —
Supabase replaces the stub with the real implementation — and point the new webhook at your
local app rather than production.

### Tables excluded from the data copy

`DATA_EXCLUDES` in the clone script skips a handful of platform-managed tables that either
the `postgres` role cannot write to, or that exist only because a feature is enabled on
production. None hold application data. If a future Supabase upgrade adds another, the clone
fails with `permission denied for table ...`; find it with:

```sql
SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND NOT has_table_privilege('postgres', c.oid, 'INSERT');
```

Note that excluding a table does not exclude its sequence, so an excluded table with an `id`
sequence needs the sequence listed too.

Two warnings during the reset are expected and harmless:

```
WARNING:  could not clear storage.buckets_vectors: permission denied
WARNING:  could not clear storage.vector_indexes: permission denied
```

## Migrations with two projects

⚠️ **Production has no CLI migration history.** It has no
`supabase_migrations.schema_migrations` table, because its migrations were applied outside
the CLI — most likely through the dashboard SQL editor. That means:

**Do not run `npm run db:migrate` (`supabase db push`) against production.** With no
history, the CLI considers every migration unapplied and will try to replay them all against
a database that already has every object, failing partway through.

Staging is different: the clone stamps
`supabase_migrations.schema_migrations` from the filenames in `supabase/migrations/`, so
the CLI sees all existing migrations as applied and `db push` correctly sends only new ones.

⚠️ **The stamp reflects whichever branch is checked out when you run the clone.** Migration
files that live only on a feature branch are invisible to a clone run from `main`, so staging
ends up with those tables (they came from production's schema) but no stamp for them — and a
later `db push` would then try to create tables that already exist. Either clone from the
branch whose migrations match production, or stamp the stragglers by hand:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260922000000', 'income') ON CONFLICT (version) DO NOTHING;
```

This bit us on the first clone: `20260922000000_income.sql` exists only on
`feature/add_income`, so a clone run from `main` stamped 51 of 52 migrations.

```bash
supabase link --project-ref sxmupuyfkeczlgnykcbl   # needs `supabase login` once
npm run db:migrate                                 # applies only NEW migrations
```

To make production a safe `db push` target too, its history table needs stamping the same
way — a one-time write to production, worth doing deliberately rather than as a side effect
of a clone.

`npm run db:types` reads `SUPABASE_PROJECT_ID` from the active env file, so it generates
types from whichever project you are currently pointed at.

## Safety

`scripts/db/lib.sh` refuses to run the clone if:

- `PROD_DB_URL` and `STAGING_DB_URL` resolve to the same project ref, or are identical
- `STAGING_DB_URL` does not match the ref pinned in `STAGING_PROJECT_REF`
- `STAGING_DB_URL` points at the ref pinned in `PROD_PROJECT_REF`

Only `STAGING_DB_URL` is ever written to. Production is opened read-only, for `pg_dump` and
catalog queries.

Staging holds a full copy of real player data — names, phone numbers, payment screenshots.
Treat the staging project, and anything in `scripts/db/dumps/`, as production data: the
dumps are gitignored and deleted after each run unless you pass `--keep-dump`.

## Troubleshooting

**`the Docker daemon is not running`** — start Docker Desktop. `pg_dump` and `psql` run in
containers, since the CLI is installed standalone rather than via Homebrew.

**Connection hangs, or `network is unreachable`** — you are using a direct
`db.<ref>.supabase.co` connection string. Switch to the session pooler string.

**`password authentication failed`** — the password in `.env.db` is not percent-encoded, or
was reset in the dashboard.

**`supabase: command not found`** — the CLI lives at `~/.local/bin/supabase`; make sure that
is on your `PATH`.

**Row counts differ at the end of a clone** — usually a table that failed to restore because
of an extension missing on staging. Re-run with `--keep-dump` and check
`scripts/db/dumps/<timestamp>/` against the error output.
