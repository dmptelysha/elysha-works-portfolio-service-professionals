# Elysha Works Supabase Database Operations

This repository implements the 11 Phase 1 tables and the expiring client-proposal flow defined in `docs/portfolio-blueprint.md`. Firebase Hosting remains responsible only for the existing static frontend, custom domain, SSL, and deployment. No instruction here authorizes a remote reset, destructive migration, Firestore change, or Firebase configuration change.

## Project structure

```text
supabase/
├── config.toml
├── migrations/
├── seed.sql
├── functions/
│   ├── finalize-proposal/
│   ├── verify-proposal/
│   ├── make-proposal-followups/
│   ├── stop-proposal-followups/
│   └── _shared/
└── tests/
```

Migrations remain ordered and additive: transactional tables, catalog/content tables, relationships/indexes/triggers, grants/RLS, restricted RPCs, retention helpers, and then the expiring-proposal extension. The quiz-to-lead circular relationship is completed only after both tables exist. The implementation keeps exactly 11 Phase 1 tables and does not create any of the 19 reserved CRM/portal tables.

## Environment-variable names

Use values only in the correct ignored local file or provider secret store. Do not print or commit values.

Browser-safe build variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is intentionally public and is restricted to the approved production hostnames in Cloudflare. Supabase validates its short-lived token with the corresponding secret. Never put the Turnstile secret in a `NEXT_PUBLIC_` variable.

Supabase Edge Function/server secrets:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PROPOSAL_KEY_PEPPER
PROPOSAL_STOP_SIGNING_SECRET
MAKE_PROPOSAL_WEBHOOK_URL
MAKE_PROPOSAL_WEBHOOK_SECRET
MAKE_AUTOMATION_SECRET
PUBLIC_PROPOSAL_BASE_URL
```

Some older tooling/docs call the public key `SUPABASE_PUBLISHABLE_KEY`; application code uses the explicit names above. `SUPABASE_SERVICE_ROLE_KEY`, Make credentials, Gmail tokens, proposal pepper, stop-signing secret, database passwords, JWT secrets, and CAPTCHA secrets must never appear in browser code, `.env.local`, generated types, logs, or documentation values.

## Local and remote-first verification

Docker is useful for complete pgTAP verification but does not block additive implementation or read-only remote preflight.

Static checks that do not require Docker:

```powershell
npm run test:supabase:static
npx supabase@latest functions serve --env-file supabase/.env.local
```

Full local database checks, when a Docker-compatible runtime is available:

```powershell
npx supabase@latest start
npx supabase@latest db reset
npx supabase@latest test db
npx supabase@latest db lint --level warning
npx supabase@latest db diff --local --schema public
```

`supabase db reset` above is local-only. Never use a linked/remote reset. A clean local reset applies every migration from zero and then runs `supabase/seed.sql`.

If the CLI is installed globally, the equivalent core commands are `supabase test db`, `supabase db lint`, and `supabase db diff`; this repository uses `npx supabase@latest` to pin the invoked tool explicitly.

## Anonymous Auth and abuse protection

`supabase/config.toml` enables Anonymous Auth for local development. Remote Anonymous Auth is a Supabase Dashboard setting and is not enabled by SQL migrations. Before production launch:

1. Enable **Authentication → Providers → Anonymous Sign-Ins** on the verified project.
2. Configure CAPTCHA or Cloudflare Turnstile for anonymous signup.
3. Configure rate limits for contact submission, proposal finalization, proposal verification, and Make endpoints.
4. Keep CAPTCHA/Turnstile secrets only in the dashboard or approved provider secret store.

Anonymous users operate through PostgreSQL role `authenticated`; ownership remains `auth.uid() = owner_user_id`. The `anon` role receives only explicitly granted public published/active reads.

## Custom verified email OTP and Make/Gmail delivery

The qualified quiz is verified-email-first. After an owned anonymous quiz context exists, `request-email-otp` validates Cloudflare Turnstile and normalizes the address. It first attempts a private owner-scoped reuse: only a lead with the same `auth_user_id`, the exact same owned visitor, the same normalized email, and a verification timestamp no more than 30 days old can receive a fresh short-lived single-use grant without another email. This lookup is service-only and never exposes global account state. If no safe match exists, the function enforces per-owner/email/IP-prefix rate limits, generates an unbiased six-digit code, and stores only an HMAC-SHA-256 digest in the private `email_otp_challenges` table. Supabase never stores the plaintext OTP. The plaintext code exists only inside the short-lived encrypted Make delivery envelope.

Make decrypts the authenticated AES-256-GCM envelope and sends the transactional code through the owner-approved Gmail OAuth connection. The code has a **10-minute OTP expiry** and a **60-second resend** interval. Make never verifies codes and receives no database authority. The full inactive scenario contract is documented in `docs/make-email-otp-scenario.md`.

`verify-email-otp` performs the atomic digest comparison, attempt counting, expiry check, and single-use grant issuance. The browser then calls `begin_custom_verified_qualified_quiz` with the challenge UUID; the RPC consumes the grant atomically and creates or reuses the lead. It receives no browser-supplied email argument. The exact verified address comes from the private challenge row.

The legacy Supabase Auth email-OTP templates and SMTP sender are not part of this quiz verification path. Anonymous Auth remains responsible only for browser ownership and RLS. Any cached client still using an earlier Auth-OTP build must be upgraded; do not run both verification authorities as interchangeable production paths.

## Authorization assumption

`public.is_portfolio_admin()` uses the secure default-deny assumption `app_metadata.role = 'admin'`. Only trusted server-side administration may set this claim. The helper never trusts `user_metadata` or email addresses, no user is automatically promoted, and no fake admin account is created. Changing the final claim convention requires changing this isolated helper and rerunning the security tests.

## Database and Edge Function boundaries

Visitor-callable security-definer functions validate `auth.uid()`, ownership of every referenced row, bounded scalar/JSON inputs, and fixed `search_path = ''`. They assign CRM state, ownership, prices, timestamps, proposal state, and orchestration values internally.

Existing restricted functions include lead/booking/analytics/linking operations. The connected flow uses `begin_custom_verified_qualified_quiz`; it requires the owning anonymous JWT and a valid custom verification grant, consumes that grant atomically, derives the canonical email from the private challenge, returns a minimal same/another-business decision, reuses the stable lead for the same business, and creates a separate lead for another business. Legacy quiz-start functions are not verification authorities for the new client. Trusted proposal state functions are service-role-only, and the former browser-wide result persistence grant is revoked.

Seven Edge Functions form the external boundary:

| Function | Contract |
|---|---|
| `currency-quote` | Public browser-safe country/currency quote lookup; returns validated USD or a current USD conversion snapshot and exposes no provider secret |
| `request-email-otp` | Owner-JWT plus Turnstile; privately reuses verification only for the same owner/visitor/email, otherwise rate-limits, creates the digest-only challenge, and sends an authenticated encrypted delivery envelope to Make |
| `verify-email-otp` | Owner-JWT; atomically compares the submitted six-digit code against the stored HMAC digest and returns only a short-lived grant expiry |
| `finalize-proposal` | Owner-JWT `preview` returns a server-calculated sanitized draft; `issue` reruns Cortex/catalog rules, validates selection, stores snapshots, issues reference/access, calls Make, and activates the exact 72-hour window only after successful email acknowledgement |
| `verify-proposal` | Accepts reference plus separate access key, enforces status/expiry/five-failure lock/HMAC checks, and returns only the sanitized client proposal view |
| `make-proposal-followups` | Authenticates Make with `MAKE_AUTOMATION_SECRET` and supports `claim`, `revalidate`, and `acknowledge` without exposing a service-role key to Make |
| `stop-proposal-followups` | Validates the signed opaque email stop token and stops future work without revealing lead or proposal data |

Deploy functions only after the migrations are approved and applied to the exact verified project:

```powershell
npx supabase@latest functions deploy currency-quote --project-ref <verified-project-ref>
npx supabase@latest functions deploy request-email-otp --project-ref <verified-project-ref>
npx supabase@latest functions deploy verify-email-otp --project-ref <verified-project-ref>
npx supabase@latest functions deploy finalize-proposal --project-ref <verified-project-ref>
npx supabase@latest functions deploy verify-proposal --project-ref <verified-project-ref>
npx supabase@latest functions deploy make-proposal-followups --project-ref <verified-project-ref>
npx supabase@latest functions deploy stop-proposal-followups --project-ref <verified-project-ref>
```

Do not put secret values on a command line that may be captured in shell history. Configure them through the approved Supabase secrets workflow without printing them.

## Proposal, retention, and Make boundaries

- Same-browser quiz recovery and remote `resume_expires_at` use 72 hours from latest accepted activity.
- Protected proposal access uses exactly 72 hours from successful initial email delivery.
- The access key is ten non-ambiguous uppercase alphanumeric characters; only its peppered HMAC digest is stored.
- `mark_expired_quiz_sessions` and proposal-expiry helpers mark eligible state only. They are not destructive schedules.
- Leads, consent, bookings, delivery events, and CRM attribution are not deleted merely because proposal access expires.
- Legal/business retention periods and destructive cleanup remain deferred; do not install a destructive cron job.

Make uses two scenarios. Scenario A receives one signed idempotent immediate-delivery request and sends the proposal link/key through an authorized Gmail connection. Its final Webhook Response must return JSON containing `accepted: true` and the exact incoming `delivery_id`; a generic HTTP 2xx response is rejected and cannot mark the proposal email `sent`. Scenario B runs every 15 minutes, asks `make-proposal-followups` for due work, revalidates immediately before sending, and acknowledges the result. Follow-ups occur at +24, +48, and +72 hours; +96 marks an eligible unbooked lead cold without sending a fourth email. Any booking row or valid stop request suppresses later automation. Do not treat either scenario as production-ready until the Gmail connection, idempotency branch, final acknowledgement, and controlled delivery test are verified.

Roadmap and protected-proposal views render the **complete approved inclusions** for the selected package/platform; they do not truncate the catalog for presentation. Make receives only the sanitized proposal summaries and access data required for delivery.

Assessment V2 also stores the selected business country plus the currency code, symbol, conversion rate, and rate timestamp used for the displayed local estimate. The package catalog remains authoritative in USD. Local currency is clearly labeled as an estimate; if a live quote cannot be validated, the assessment continues safely in USD instead of blocking the visitor or inventing a conversion.

Direct booking prefill is gated by the booking handoff external consumer defined in `docs/contracts/quiz-booking-handoff.md`. Until that backend is deployed and contract-tested, production uses the safe `/booking/` form fallback.

No PDF is generated. Make does not receive database authority, the Supabase service-role key, or permission to decide eligibility.

## Seed scope

`supabase/seed.sql` is idempotent and contains only approved configuration. It must never create visitors, sessions, leads, bookings, analytics activity, clients, fake projects, invented testimonials, or assumed business claims. The application and proposal Edge Function share the reviewed V2 question/Cortex source under `supabase/functions/_shared/quiz-engine`; database quiz-definition metadata records the active engine, question-set, catalog, and roadmap versions used for auditability.

## Safe remote deployment gate

Remote-first does not mean approval-free. Before any remote-changing command, report:

1. exact project name and reference;
2. current linked environment;
3. remote schema objects/data presence;
4. remote migration history;
5. exact pending migration files and seed scope;
6. destructive-statement scan;
7. naming conflicts or existing objects that could be altered/replaced; and
8. confirmation that Firebase resources remain untouched.

Read-only discovery/preflight commands:

```powershell
npx supabase@latest projects list
npx supabase@latest migration list --linked
npx supabase@latest db push --linked --include-seed --dry-run
```

The dry run is not approval to apply. Show its exact target and output summary, then wait for explicit target-specific approval. Never run a remote database reset, destructive repair, schema drop, table drop, or truncate.

Only after that approval:

```powershell
npx supabase@latest db push --linked --include-seed
```

Verify the remote schema read-only before deploying functions. Configure secrets without exposing them, deploy/test Edge Functions, build both Make scenarios inactive, and verify idempotency, booking suppression, stop handling, expiry, and cold transition. Only then activate Make and build/deploy the tested branch to the existing Firebase Hosting target. Do not modify `firebase.json`, hosting targets, domain settings, or Firestore.

## Type generation

After the verified remote schema is successfully applied:

```powershell
npx supabase@latest gen types typescript --linked --schema public > src/generated/database.types.ts
```

Mark the file as generated and do not overwrite manually maintained application types.
The globally installed CLI equivalent begins with `supabase gen types typescript`.

## Deferred production decisions

- Final production owner/process for assigning `app_metadata.role = 'admin'`.
- Booking provider webhook verification and synchronization details.
- Legal/business retention durations and any future destructive cleanup schedule.
- Approved real project/site-content records not already complete in the repository.
- Remote Anonymous Auth, rate limits, and Turnstile/CAPTCHA dashboard configuration.
- Owner-authorized Gmail OAuth connection in Make and an owner-controlled test-recipient address.
