# Elysha Works client proposal deployment preflight

Prepared: 2026-09-22 (Asia/Manila)  
Status: **approval required — no pending remote migration, Edge Function, Make, or Firebase deployment has been executed**

## Verified targets

| System | Verified target | Evidence |
|---|---|---|
| Supabase | Project **Portfolio**, reference `gftjoanbwcvpqiecsdda`, linked `main` production environment, region `ap-northeast-2`, status `ACTIVE_HEALTHY` | Authenticated `supabase projects list`, linked migration history, remote config diff, CLI inspection, and Dashboard read-only inventory |
| Firebase | Project `elyshaworks-fd2dc`; Hosting site `elysha-works-portfolio`; live channel exists | `.firebaserc`, `firebase.json`, authenticated Firebase project/site/channel inventory |
| Git | Branch `codex/service-professionals-portfolio`, commit `7c06a5b`; pushed to the same remote branch | Local and remote commit hashes matched after push |
| Make | Contract documentation complete; no scenarios created or activated | `docs/make-proposal-automation.md`; creation intentionally waits for the verified backend |

The public Supabase URL host in local ignored configuration matches `gftjoanbwcvpqiecsdda`. No database password, URL with credentials, token, JWT secret, service-role value, CAPTCHA secret, Make secret, or Gmail credential was printed or written to tracked files.

## Current remote Supabase state

The project was **not empty** before this proposal migration. Six repository migrations are already recorded remotely:

1. `202609210001_create_core_tables.sql`
2. `202609210002_create_catalog_content_tables.sql`
3. `202609210003_add_constraints_indexes_triggers.sql`
4. `202609210004_add_rls_grants_policies.sql`
5. `202609210005_create_portfolio_rpc_functions.sql`
6. `202609210006_add_retention_helpers.sql`

The Dashboard and CLI show exactly these 11 public Phase 1 tables:

1. `site_visitors`
2. `portfolio_sessions`
3. `quiz_sessions`
4. `leads`
5. `bookings`
6. `analytics_events`
7. `projects`
8. `package_catalog`
9. `addon_catalog`
10. `quiz_definitions`
11. `site_content`

Remote estimated rows at preflight:

| Table group | Observed state |
|---|---|
| Transactional: visitors, sessions, quizzes, leads, bookings, analytics | 0 estimated rows in every table |
| `package_catalog` | 7 rows |
| `addon_catalog` | 21 rows |
| `quiz_definitions` | 0 rows |
| `projects` and `site_content` | 0 rows |

No unrelated public table was present. Standard Supabase-managed schemas remain outside this migration’s scope.

### Existing functions and policies

The Dashboard showed 11 existing public database functions, all represented by the six applied migrations: `is_portfolio_admin`, `link_quiz_session_to_lead`, `maintain_quiz_rollups`, `mark_expired_quiz_sessions`, `persist_quiz_result`, `record_analytics_event`, `set_updated_at`, `submit_booking`, `submit_lead`, `touch_quiz_activity`, and `update_quiz_lifecycle`.

RLS is enabled on all 11 tables. The Dashboard showed 35 baseline policies:

- Owner insert/select/update plus admin-all policies on `site_visitors`, `portfolio_sessions`, and `quiz_sessions`.
- Admin-only policies on `leads`, `bookings`, and `analytics_events`.
- Active/published read plus admin insert/update/delete policies on `projects`, `package_catalog`, `addon_catalog`, `quiz_definitions`, and `site_content`.

The remote Edge Function list is empty. No proposal Edge Function exists yet.

Remote `db lint --linked --level warning` returned no public or extensions schema errors.

## Remote Auth status

`supabase config diff` confirmed:

- Remote Anonymous Auth is **disabled** (`enable_anonymous_sign_ins = false`). SQL migration cannot enable it.
- Local development declares Anonymous Auth enabled.
- CAPTCHA/Turnstile production status could not be proven: the remote API masks the CAPTCHA secret and does not compare the provider setting.

Required manual Dashboard step before production testing: open **Authentication → Sign In / Providers → Anonymous Sign-Ins**, enable anonymous sign-ins, then configure CAPTCHA protection with Cloudflare Turnstile under the project’s Auth security settings. Do not paste or disclose the Turnstile secret in source control or chat. Production is not ready until both settings are visibly verified.

## Pending deployment

The read-only command below succeeded:

```powershell
npx supabase@latest db push --linked --include-seed --dry-run
```

It reported exactly:

- Migration: `202609220001_add_expiring_proposal_flow.sql`
- Seed hash update: `supabase/seed.sql`
- No other migration, role file, or project target

The seed is configuration-only and idempotent. It preserves the existing seven package and 21 add-on records, inserts/updates the three approved version-one quiz definitions, and creates no visitor, session, quiz attempt, lead, booking, client, project claim, or analytics activity. Project and site-content seed sets remain intentionally empty.

### Tables and columns altered

The migration does not create another Phase 1 table. It alters only:

- `quiz_sessions`: changes the new-session resume default to 72 hours and adds protected selection/proposal columns, checks, a package foreign key, and proposal indexes.
- `leads`: adds consent, delivery, follow-up claim/count, stop, next-send, and cold-state columns plus checks and a due-work index.

Existing rows are not deleted. New status/counter columns use safe defaults.

### Objects created or replaced

New trusted functions: `begin_qualified_quiz`, `finalize_quiz_proposal`, `mark_proposal_delivered`, `verify_proposal_access_state`, `record_proposal_access_attempt`, `claim_due_proposal_work`, `revalidate_proposal_work`, `acknowledge_proposal_work`, `stop_proposal_followups`, `record_trusted_proposal_event`, and the booking-stop trigger function `stop_proposal_followups_on_booking`.

New trigger: `bookings_stop_proposal_followups`.

Two existing functions are intentionally replaced without dropping data:

- `touch_quiz_activity()` changes resume expiry maintenance from 30 days to 72 hours.
- `update_quiz_lifecycle(uuid,text)` changes resume expiry maintenance from 30 days to 72 hours.

### Privilege changes

This deployment is **not accurately described as entirely additive**, because it deliberately tightens permissions and replaces two function bodies:

- Revokes direct authenticated execution of `submit_lead` and `persist_quiz_result`; the qualified contact and trusted server-finalization paths replace those public mutation paths.
- Revokes broad authenticated `SELECT` on `quiz_sessions`, then grants back the documented safe columns. Protected hash, lock, and delivery fields are excluded.
- Revokes default execution on every new trusted function from `public`, `anon`, and `authenticated`.
- Grants `begin_qualified_quiz` only to `authenticated`; grants proposal/follow-up state functions only to `service_role`.
- Keeps RLS enabled and does not broaden public access to leads, bookings, analytics, or another visitor’s data.

### Destructive and conflict scan

The pending SQL contains:

- No `DROP TABLE`, `DROP SCHEMA`, `DROP FUNCTION`, or `DROP POLICY`.
- No `TRUNCATE`, `DELETE FROM`, table/column rename, or data reset.
- No replacement of an unrelated table, policy, trigger, or function.
- No cascade deletion of leads, bookings, or historical conversion records.

The only `ALTER TABLE` targets and the two `CREATE OR REPLACE FUNCTION` targets are listed above. The dry run accepted the migration order, the remote history matches all earlier local migrations, the Dashboard object inventory matches that baseline, and no naming conflict was detected.

## Edge Functions after database approval

Four reviewed functions are ready locally but are not deployed:

1. `finalize-proposal` — gateway JWT required plus owner validation.
2. `verify-proposal` — custom proposal reference/key verification; gateway JWT disabled intentionally.
3. `make-proposal-followups` — Make shared-secret claim/revalidate/acknowledge; gateway JWT disabled intentionally.
4. `stop-proposal-followups` — signed stop-token verification; gateway JWT disabled intentionally.

Their server secrets are not in source control. The Make-specific webhook/secret values cannot be configured until the inactive Scenario A webhook exists.

## Firebase and Google-key gate

Firebase Hosting, its live channel, domains, SSL, `firebase.json`, hosting targets, Firestore databases, and other Firebase sites have not been changed by this work. The intended command later is scoped to Hosting only.

The historically exposed Google/Firebase browser key still requires owner-visible evidence of rotation, approved HTTP-referrer restrictions, required-API restrictions, and revocation of the old key. `.env.local` is ignored, but moving a key there does not remove Git history exposure. Firebase production deployment remains blocked until that evidence is available.

## Exact intended commands after approval

Database mutation, only after explicit approval of this report and target:

```powershell
npx supabase@latest db push --linked --include-seed --dry-run
npx supabase@latest db push --linked --include-seed
```

The second command is the remote mutation command and has **not** been run.

After database verification and safe secret configuration, deploy to the same confirmed project:

```powershell
npx supabase@latest functions deploy finalize-proposal
npx supabase@latest functions deploy verify-proposal --no-verify-jwt
npx supabase@latest functions deploy make-proposal-followups --no-verify-jwt
npx supabase@latest functions deploy stop-proposal-followups --no-verify-jwt
```

Make scenario creation and activation occur only after those endpoints exist and controlled tests pass. Firebase Hosting is last:

```powershell
npx firebase-tools deploy --only hosting --project elyshaworks-fd2dc
```

That Firebase command will not run until Supabase and Make are verified and the historic browser-key rotation gate is satisfied.

## Approval gate

Approval must name Supabase project **Portfolio** with reference `gftjoanbwcvpqiecsdda` and accept the pending migration/seed effects above. Approval of the database migration does not waive the separate Anonymous Auth, CAPTCHA/Turnstile, Make, Google-key rotation, or Firebase deployment gates.
