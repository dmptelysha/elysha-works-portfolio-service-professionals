# Elysha Works Supabase Database Operations

This directory implements the 11 Phase 1 tables from `docs/portfolio-blueprint.md`. Firebase Hosting remains unchanged. No command in this guide deletes or resets a remote database.

## Project structure

```text
supabase/
├── config.toml
├── migrations/
├── seed.sql
└── tests/
```

The migrations are ordered by responsibility: transactional tables, catalog/content tables, relationships/indexes/triggers, grants/RLS, restricted RPCs, and a manual retention helper. The quiz-to-lead circular relationship is completed in the third migration after both tables exist.

## Required local tools

- Supabase CLI
- Docker Desktop or another Docker-compatible runtime
- Node.js for static checks

Run from the repository root:

```powershell
npm run test:supabase:static
supabase start
supabase db reset
supabase test db
supabase db lint --level warning
supabase db diff --local --schema public
```

`supabase db reset` above is local-only. Never run a remote reset. A clean local reset applies every migration from zero and then runs `supabase/seed.sql`.

## Local Anonymous Auth

`supabase/config.toml` enables Anonymous Auth for local development. CAPTCHA is intentionally disabled locally because no secret may be committed. Before production use, enable Anonymous Auth in the verified remote Supabase dashboard and configure CAPTCHA or Cloudflare Turnstile there. Store the CAPTCHA secret only in the dashboard/approved secret manager; never print or commit it.

The frontend will eventually require these public environment-variable names:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Some tooling refers to the same public endpoint as `SUPABASE_URL` and public key as `SUPABASE_PUBLISHABLE_KEY`. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, database passwords, JWT secrets, access tokens, or CAPTCHA secrets. This task does not connect the UI.

## Authorization assumption

`public.is_portfolio_admin()` uses the secure default-deny assumption `app_metadata.role = 'admin'`. Only a trusted server-side administrator may set this claim. The helper never trusts `user_metadata` or email addresses, and no user receives the role automatically. Confirm the final claim convention before enabling the Admin Portal; changing the helper later updates the policy decision in one place.

## RPC boundary

Visitor-callable security-definer functions use scalar parameters, validate `auth.uid()` and parent ownership, set controlled defaults internally, use `search_path = ''`, and expose minimal return values:

- `submit_lead`
- `submit_booking`
- `record_analytics_event`
- `link_quiz_session_to_lead`
- `persist_quiz_result`

Booking provider webhook processing is deferred until the provider is selected. Implement it through a trusted server or Edge Function with secrets outside the browser; do not reuse browser privileges for webhook status updates.

## Seed scope

`supabase/seed.sql` inserts the seven approved package records and the approved add-on catalog using conflict-safe inserts. It inserts no visitor, session, lead, booking, analytics, client, testimonial, project claim, or other transactional/fake data.

Quiz definitions are not seeded yet. The blueprint now contains the approved disconnected-frontend rules for `cortex-local-v0.1`, but that local version has not been promoted to an approved production `quiz_definitions` version or converted into reviewed seed data. Projects and site-content documents are also omitted because complete approved records are not present. These are deployment blockers for the corresponding frontend reads and must be supplied through a reviewed seed migration or authorized admin workflow.

## Retention

`mark_expired_quiz_sessions` only marks eligible unconverted sessions as expired. It is not scheduled and deletes nothing. Legal/business retention periods for anonymous identities, completed quiz snapshots, leads, bookings, analytics, consent records, and backups remain deferred. Do not install cron cleanup or delete auth users until those periods and dependency rules are approved.

## Safe remote deployment gate

Do not link or push until the owner explicitly confirms the intended project after reviewing:

1. Supabase project name and project reference.
2. Current linked environment and migration history.
3. Whether the remote database is empty or contains existing objects/data.
4. Exact pending migrations.
5. A scan for destructive statements and any existing object that could be altered or replaced.

Read-only preparation commands, after authentication and project selection are confirmed:

```powershell
supabase projects list
supabase migration list --linked
supabase db diff --linked --schema public
```

Do not run `supabase link`, `supabase db pull`, `supabase db push`, or any other remote-changing/migration-history command until the target report is shown and explicit approval is received. Never run `supabase db reset --linked`.

After approval, preview pending changes before the final push:

```powershell
supabase db push --linked --include-seed --dry-run
```

The deployment inventory must list both migrations and approved seed records. Only the separately approved final command may omit `--dry-run` and apply them.

## Type generation

Generate TypeScript database types only after the verified remote schema has been applied successfully:

```powershell
supabase gen types typescript --linked --schema public > src/generated/database.types.ts
```

Create the generated directory first if needed and mark the file as generated. Do not overwrite manually maintained types.

## Deferred production decisions

- Exact production admin-claim lifecycle and who may assign `app_metadata.role`.
- Review and promote `cortex-local-v0.1` into an approved production quiz-definition version and seed payload.
- Booking provider, webhook verification, meeting URL, cancellation, and reschedule synchronization.
- Legal/business retention durations and any future cleanup schedule.
- Approved real project and published site-content seed records.
- Remote Anonymous Auth, rate limits, and Turnstile/CAPTCHA dashboard configuration.
