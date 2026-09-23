# Custom Make-Delivered Email OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser's Supabase Auth email OTP with a server-generated, hash-only Supabase challenge delivered by a dedicated Make/Gmail scenario, while retaining Turnstile, anonymous-session RLS ownership, inline email verification, and the existing quiz/proposal journey.

**Architecture:** The browser keeps one anonymous Supabase Auth session solely for `auth.uid()` ownership. `request-email-otp` verifies that session and a fresh Turnstile token, generates a cryptographic six-digit code, stores only an HMAC digest in a private PostgreSQL table, encrypts the recipient/code in an authenticated AES-256-GCM envelope, and sends only ciphertext to Make. Make decrypts inside a confidential execution and sends through Gmail. `verify-email-otp` derives the candidate digest and calls a service-only atomic verifier; the versioned lead RPC consumes the verified challenge exactly once and derives the canonical email from it.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, Vitest/Testing Library, Playwright, Supabase Anonymous Auth/PostgreSQL/RLS/Edge Functions, pgTAP/static migration tests, Cloudflare Turnstile, Make custom webhook/Gmail, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-09-23-custom-make-email-otp-design.md`

## Global Constraints

- The custom OTP is mailbox proof for one assessment/proposal only; it is not a permanent login or client-portal identity.
- Firebase Hosting is static. OTP generation, hashing, verification, rate limits, and secrets belong only in Supabase Edge Functions/PostgreSQL.
- PostgreSQL, browser persistence, analytics, Git, and Make Data Stores never store plaintext OTPs.
- The migration creates one non-API `private` schema table, bringing the approved Phase 1 runtime-table count from 11 to exactly 12; it does not add CRM, campaign, or durable-login tables.
- Make webhook requests/logs receive ciphertext only. Plaintext email/OTP exists in Make only after AES-GCM decryption inside a confidential execution and must never enter a Data Store, response, error, or incomplete-execution record.
- Keep Anonymous Auth and `auth.uid()` ownership for visitors, portfolio sessions, quiz sessions, RLS, and proposal finalization.
- Canonical lead email comes only from a consumed verified challenge, never from a browser-supplied RPC email.
- Turnstile uses a fresh single-use token for anonymous-session creation and every OTP request/resend.
- OTP validity is 10 minutes, resend cooldown is 60 seconds, maximum attempts are five, and verified-grant validity is 10 minutes.
- Verification does not grant promotional consent. Future promotions require separate marketing consent and unsubscribe handling.
- Do not modify Firebase domains, targets, SSL, Firestore, or unrelated applications.
- Do not invent leads, quiz answers, businesses, bookings, prices, packages, or production analytics data.
- No remote migration, Edge Function deployment, Make activation, or Firebase release occurs before the target-specific preflight passes.

## Review Focus

1. Turnstile tokens are single-use: anonymous sign-in must reset the widget before Verify Email, and every resend must obtain another token.
2. Concurrent wrong/correct OTP requests must never exceed five attempts, verify another owner's challenge, or consume the same grant twice.
3. A Make HTTP success without the matching authenticated delivery ID must clear/fail the challenge rather than display the OTP input as deliverable.
4. Refresh/change-email/resend paths must never preserve the plaintext OTP or allow the previous challenge to qualify a lead.
5. Returning verified emails may belong to multiple businesses and multiple anonymous sessions; business disclosure occurs only after challenge verification and remains scoped to that verified email.

---

### Task 0: Prove the Make security and delivery primitives before backend implementation

**Files:**
- Create: `docs/make-email-otp-feasibility.md`
- Test: `tests/live-copy.test.mjs`
- Remote: a disposable inactive Make scenario with no Gmail send module.

**Interfaces:**
- Produces: an evidence-backed go/no-go decision for AES-256-GCM advanced decryption, canonical HMAC verification, ciphertext-only webhook logging, confidential execution handling, sequential processing, and replay reservation.
- Consumes: the authenticated Make workspace only; no production webhook URL, real OTP, recipient address, or Gmail send.

- [ ] **Step 1: Add a failing documentation assertion**

Require the feasibility note to record the Make team/scenario identity, available request headers/fields, HMAC-SHA256 capability, scenario-history confidentiality/retention controls, sequential-processing control, Data Store reservation semantics, and the explicit stop condition.

- [ ] **Step 2: Inspect and test an inactive no-email scenario**

Build only enough of a disposable inactive scenario to confirm that Make can:

1. read the required encrypted-envelope fields;
2. decrypt AES-256-GCM using a hidden advanced keychain and reconstruct/HMAC-SHA256 a documented canonical envelope string;
3. reject stale timestamps, invalid signatures, and reused delivery IDs;
4. process webhook executions sequentially; and
5. reserve an unseen delivery ID as `pending` before any future send step.

Use synthetic non-PII values and a disposable secret entered privately. Never attach Gmail or send email during this spike.

- [ ] **Step 3: Record the decision and stop if any invariant is unavailable**

The canonical signing string is versioned, field-delimited, and contains ciphertext only rather than depending on raw JSON bytes:

```text
elysha-otp-envelope-v1\n<timestamp>\n<nonce>\n<deliveryId>\n<keyVersion>\n<iv>\n<ciphertext>\n<tag>
```

All fields have strict formats that exclude newlines before signing. If Make cannot decrypt AES-256-GCM with a hidden advanced keychain, compute/compare this HMAC securely, hide decrypted execution data, run sequentially, or reserve a delivery ID before send, stop the project before Tasks 1-4 and revise the delivery boundary.

- [ ] **Step 4: Run the documentation test and commit**

Run: `npm run test:static`

```powershell
git add docs/make-email-otp-feasibility.md tests/live-copy.test.mjs
git commit -m "Document Make OTP feasibility gate"
```

---

### Task 1: Add the private OTP challenge schema and atomic database contracts

**Files:**
- Create: `supabase/migrations/202609230002_add_custom_email_otp.sql`
- Create: `supabase/tests/05_custom_email_otp.test.sql`
- Modify: `supabase/tests/01_schema_and_security.test.sql`
- Modify: `supabase/tests/03_rpc_and_integrity.test.sql`
- Modify: `tests/supabase-migrations-static.test.mjs`

**Interfaces:**
- Produces: `private.email_otp_challenges`, `private.constant_time_equal_32(...)`, `private.cleanup_email_otp_challenges(integer)`, `public.record_email_otp_challenge(...)`, `public.get_email_otp_challenge_context(...)`, `public.mark_email_otp_delivery(...)`, `public.verify_email_otp_digest(...)`, and `public.begin_custom_verified_qualified_quiz(...)`.
- Consumes: existing `auth.users`, `site_visitors`, `portfolio_sessions`, `quiz_sessions`, `leads`, anonymous `auth.uid()` ownership, and consent version `proposal_followup_v1`.

- [ ] **Step 1: Write failing static and pgTAP assertions**

Add static assertions for the new table, RLS-without-browser-policies, fixed empty search paths, fixed digest lengths, service-role-only functions, authenticated-only lead RPC, status constraints, bounded cleanup, deterministic advisory-lock order, the exact 12-table count, and no destructive statements outside the explicitly approved ephemeral OTP table cleanup. Add pgTAP cases for cross-owner denial, expiry, supersession, five attempts, constant-length digest comparison, one-time consumption, same-business reuse, another-business creation, immediate digest clearing, terminal-row deletion after 24 hours, parallel issuance against the same owner/email/IP group, and delivery transition replay.

Representative test:

```sql
select throws_ok(
  $$select * from public.begin_custom_verified_qualified_quiz(
    '31000000-0000-0000-0000-000000000003',
    '41000000-0000-0000-0000-000000000004',
    '51000000-0000-0000-0000-000000000004',
    '61000000-0000-0000-0000-000000000099',
    'rpc_audience','Elysha','Corpuz','Elysha Works',true,
    'proposal_followup_v1',null
  )$$,
  '42501', null,
  'another owner cannot consume a verified challenge'
);
```

- [ ] **Step 2: Run the tests and observe RED**

Run: `npm run test:supabase:static`

Run when Docker is available: `npx supabase@latest test db`

Expected: FAIL because the migration and functions do not exist.

- [ ] **Step 3: Create the additive challenge table and indexes**

The migration starts with the explicit private table shape:

```sql
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.email_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  email_digest bytea not null check (octet_length(email_digest) = 32),
  purpose text not null check (purpose = 'qualified_quiz'),
  otp_digest bytea check (otp_digest is null or octet_length(otp_digest) = 32),
  status text not null check (status in (
    'pending_delivery','active','delivery_failed','verified',
    'consumed','superseded','failed','expired'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  request_ip_digest bytea not null check (octet_length(request_ip_digest) = 32),
  make_delivery_id uuid not null unique,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  verified_at timestamptz,
  grant_expires_at timestamptz,
  consumed_at timestamptz,
  check (expires_at > created_at),
  check (resend_available_at > created_at)
);

alter table private.email_otp_challenges enable row level security;
revoke all on private.email_otp_challenges from public, anon, authenticated;

create unique index email_otp_one_active_owner_purpose_idx
  on private.email_otp_challenges (owner_user_id, purpose)
  where status in ('pending_delivery','active','verified');
```

Add owner/purpose, email-digest, IP-digest, and expiry indexes required by the spec.

- [ ] **Step 4: Add fixed-length digest comparison and service-only issuance/verification**

Create an internal comparison helper that checks exactly 32 bytes without early exit:

```sql
create function private.constant_time_equal_32(p_left bytea, p_right bytea)
returns boolean language plpgsql immutable strict
set search_path = '' as $$
declare v_difference integer := 0; v_index integer;
begin
  if octet_length(p_left) <> 32 or octet_length(p_right) <> 32 then return false; end if;
  for v_index in 0..31 loop
    v_difference := v_difference | (get_byte(p_left, v_index) # get_byte(p_right, v_index));
  end loop;
  return v_difference = 0;
end;
$$;
```

`record_email_otp_challenge` accepts the validated owner UUID, normalized email, grouping digests, OTP digest, Make delivery ID, and authoritative timestamps. Before scanning rate windows it obtains transaction-scoped advisory locks for owner, email digest, and IP digest in a deterministic namespace/order, then locks/supersedes the active owner/purpose row and enforces all rolling-window limits atomically. This prevents concurrent first requests from bypassing per-owner, per-email, or per-IP limits.

`get_email_otp_challenge_context` is service-role-only and returns only the normalized email and purpose required to derive a candidate digest after it validates challenge ID, owner, and an allowed verification state. `mark_email_otp_delivery` is service-role-only and transitions only the exact challenge/owner/delivery-ID tuple from `pending_delivery` to `active` or `delivery_failed`; failure clears the digest. `verify_email_otp_digest` is service-role-only, locks the row, validates owner/status/expiry, increments attempts exactly once, compares the digest, and returns only `verified`, `grant_expires_at`, and a generic result code.

`private.cleanup_email_otp_challenges(p_batch_size)` clears digests immediately for terminal or expired rows, deletes only terminal OTP metadata older than 24 hours in bounded batches, and cannot touch leads, quiz sessions, proposals, bookings, or analytics. Issuance and verification invoke bounded cleanup opportunistically. The migration must idempotently create the named hourly Supabase Cron/`pg_cron` job and document its exact unschedule statement; preflight first confirms extension availability, and production cutover stops if the version-controlled schedule cannot be installed.

- [ ] **Step 5: Add the versioned lead RPC with atomic challenge consumption**

Create `begin_custom_verified_qualified_quiz` with exact arguments:

```sql
(p_visitor_id uuid, p_portfolio_session_id uuid, p_quiz_session_id uuid,
 p_challenge_id uuid, p_audience_key text, p_first_name text,
 p_last_name text, p_business_name text, p_consent boolean,
 p_consent_version text, p_business_scope text default null)
```

It derives `v_uid := auth.uid()`, locks the challenge, requires verified/unconsumed/unexpired status and matching owner/purpose, uses `challenge.email` and `challenge.verified_at` as the canonical identity, runs the existing ownership/consent/repeat-business logic, and sets `consumed_at` in the same transaction as lead/session linking. Grant only to `authenticated`; revoke `public` and `anon`.

- [ ] **Step 6: Run focused checks GREEN and commit**

Run: `npm run test:supabase:static`

Run when available: `npx supabase@latest test db`

```powershell
git add supabase/migrations/202609230002_add_custom_email_otp.sql supabase/tests/05_custom_email_otp.test.sql supabase/tests/01_schema_and_security.test.sql supabase/tests/03_rpc_and_integrity.test.sql tests/supabase-migrations-static.test.mjs
git commit -m "Add private custom email OTP schema"
```

---

### Task 2: Add reusable OTP cryptography, configuration, and Make signing

**Files:**
- Create: `supabase/functions/_shared/email-otp.ts`
- Modify: `supabase/functions/_shared/env.ts`
- Modify: `supabase/functions/_shared/crypto.ts`
- Create: `supabase/functions/tests/email-otp-shared.test.ts`

**Interfaces:**
- Produces: `generateSixDigitOtp(randomFill?)`, `normalizeOtpEmail(email)`, `deriveOtpDigest(input, pepper)`, `deriveOtpGroupingDigest(domain, value, secret)`, `encryptMakeOtpEnvelope(payload, key, iv?)`, `signOtpEnvelope(envelope, secret)`, `getEmailOtpEnv()`.
- Consumes: Web Crypto, existing `hmacSha256Hex`, and Edge Function secrets.

- [ ] **Step 1: Write failing shared-unit tests**

Tests cover leading zeroes, non-digit rejection, normalization, domain separation, every digest input field, minimum secret lengths, HTTPS webhook validation, deterministic signatures, AES-256-GCM round-trip against a hand-checked fixture, unique IVs, authentication-tag failure, and proof that serialized outer envelopes contain neither email nor OTP:

```ts
const otp = generateSixDigitOtp((buffer) => buffer.set([0, 1, 2, 3, 4, 5]));
assertEquals(otp, "012345");

const first = await deriveOtpDigest({
  challengeId: CHALLENGE_ID, ownerUserId: OWNER_ID,
  email: "person@example.com", purpose: "qualified_quiz", otp: "012345",
}, PEPPER);
const changed = await deriveOtpDigest({
  challengeId: CHALLENGE_ID, ownerUserId: OWNER_ID,
  email: "person@example.com", purpose: "qualified_quiz", otp: "012346",
}, PEPPER);
assertNotEquals(first, changed);
```

- [ ] **Step 2: Run and observe RED**

Run: `deno test --allow-env supabase/functions/tests/email-otp-shared.test.ts`

Expected: FAIL because the shared module and environment reader are absent.

- [ ] **Step 3: Implement unbiased cryptographic OTP generation and digests**

Use rejection sampling so byte values 250-255 are discarded rather than modulo-biased:

```ts
export function generateSixDigitOtp(fill = crypto.getRandomValues.bind(crypto)): string {
  const digits: number[] = [];
  while (digits.length < 6) {
    const bytes = new Uint8Array(12);
    fill(bytes);
    for (const value of bytes) {
      if (value < 250) digits.push(value % 10);
      if (digits.length === 6) break;
    }
  }
  return digits.join("");
}
```

`deriveOtpDigest` HMACs the exact versioned newline-delimited message from the spec and returns 32 digest bytes/64 lowercase hex characters. Grouping digests use separate `email-rate-v1` and `ip-rate-v1` domains. `encryptMakeOtpEnvelope` uses AES-256-GCM with a fresh 96-bit IV, separates the 128-bit tag from ciphertext for Make's advanced decrypt module, and emits base64url fields. Make signatures bind the exact ciphertext-only fields in the Task 0 canonical signing string, including UTC timestamp and nonce/delivery ID; they never assume Make can access byte-identical raw JSON.

- [ ] **Step 4: Add validated environment names**

`getEmailOtpEnv()` requires:

```text
OTP_PEPPER
OTP_GROUPING_SECRET
TURNSTILE_SECRET_KEY
TURNSTILE_EXPECTED_HOSTNAME
MAKE_OTP_WEBHOOK_URL
MAKE_OTP_WEBHOOK_SECRET
MAKE_OTP_ENCRYPTION_KEY
```

The signing/grouping/pepper secrets require at least 32 characters; the encryption key must decode to exactly 32 random bytes; webhook URL requires HTTPS; hostname is lowercased; values are never logged.

- [ ] **Step 5: Run shared and complete Edge tests GREEN, then commit**

Run: `deno test --allow-env supabase/functions/tests/email-otp-shared.test.ts`

Run: `npm run test:edge`

```powershell
git add supabase/functions/_shared/email-otp.ts supabase/functions/_shared/env.ts supabase/functions/_shared/crypto.ts supabase/functions/tests/email-otp-shared.test.ts
git commit -m "Add secure email OTP primitives"
```

---

### Task 3: Implement the request-email-otp Edge Function

**Files:**
- Create: `supabase/functions/request-email-otp/index.ts`
- Modify: `supabase/config.toml`
- Create: `supabase/functions/tests/request-email-otp.test.ts`
- Modify: `supabase/functions/_shared/cors.ts`

**Interfaces:**
- Consumes: Task 1 issuance RPC, Task 2 crypto/env, `createRequestClient`, `createServiceClient`, Cloudflare Siteverify, and the signed Make webhook.
- Produces: `POST /functions/v1/request-email-otp` returning `{ challengeId, expiresAt, resendAvailableAt }` or generic public errors.

- [ ] **Step 1: Write failing handler tests with injected dependencies**

Export `createRequestEmailOtpHandler(dependencies)` and test: invalid origin/method/body, absent JWT, non-anonymous user, malformed email, Turnstile missing/invalid/reused/wrong action/wrong hostname, every issuance limit, Make timeout/error/mismatched delivery ID, duplicate delivery ID, and successful no-store response. Capture fetch bodies and assert no secret header appears in response/error text.

```ts
const response = await handler(request({
  email: " Person@Example.com ", purpose: "qualified_quiz",
  turnstileToken: "fresh-turnstile-token",
}));
assertEquals(response.status, 200);
assertEquals(capturedMakeEnvelope.keyVersion, "otp-transport-v1");
assertMatch(capturedMakeEnvelope.ciphertext, /^[A-Za-z0-9_-]+$/);
assert(!JSON.stringify(capturedMakeEnvelope).includes("person@example.com"));
assert(!JSON.stringify(capturedMakeEnvelope).includes(capturedGeneratedOtp));
assert(!JSON.stringify(capturedDatabaseArgs).includes(capturedGeneratedOtp));
```

- [ ] **Step 2: Run and observe RED**

Run: `deno test --allow-env supabase/functions/tests/request-email-otp.test.ts`

Expected: FAIL because the handler is absent.

- [ ] **Step 3: Implement strict request and Turnstile validation**

Use `validateBrowserRequest`, `readJsonObject`, and `assertExactKeys`. Verify the bearer token with the request client, require `user.is_anonymous === true`, and POST the Turnstile token to Cloudflare Siteverify. Require `success`, action `email_otp_request`, and the configured Elysha Works hostname. Obtain the client IP only from the documented header that the Supabase Edge gateway strips and rewrites; never trust a browser-supplied forwarding header. Confirm that header behavior in target preflight, and block production cutover if no server-derived network address is available for the approved IP limiter.

- [ ] **Step 4: Implement challenge issuance and Make delivery**

Generate challenge/delivery UUIDs and the six-digit OTP; derive OTP/email/IP digests; call the issuance RPC; encrypt the exact inner delivery JSON, and send only this ciphertext envelope to Make:

```ts
const encrypted = await encryptMakeOtpEnvelope({
  deliveryId, to: normalizedEmail, otp,
  expiresInMinutes: 10, templateVersion: "elysha_otp_v1",
}, encryptionKey);
const deliveryBody = JSON.stringify({
  deliveryId, timestamp, nonce, keyVersion: "otp-transport-v1",
  iv: encrypted.iv, ciphertext: encrypted.ciphertext, tag: encrypted.tag,
  signature: await signOtpEnvelope(/* exact outer fields */, signingSecret),
});
```

Require `{ accepted: true, deliveryId }` with the exact same UUID, then call the delivery-transition RPC for that challenge/owner/delivery tuple. On failure or mismatched acknowledgement, transition only that tuple to `delivery_failed` so the digest is cleared. Invoke bounded cleanup before issuance without allowing cleanup failure to expose private state. Never log the decrypted inner body, email, OTP, digest, IP, keys, or secrets; webhook-visible JSON must remain ciphertext-only.

- [ ] **Step 5: Configure JWT gateway and CORS, run GREEN, commit**

Add explicit config:

```toml
[functions.request-email-otp]
verify_jwt = true
```

Add only necessary request headers to CORS. Run:

```powershell
deno test --allow-env supabase/functions/tests/request-email-otp.test.ts
npm run test:edge
```

```powershell
git add supabase/functions/request-email-otp/index.ts supabase/functions/tests/request-email-otp.test.ts supabase/functions/_shared/cors.ts supabase/config.toml
git commit -m "Add protected custom OTP issuance endpoint"
```

---

### Task 4: Implement the verify-email-otp Edge Function

**Files:**
- Create: `supabase/functions/verify-email-otp/index.ts`
- Modify: `supabase/config.toml`
- Create: `supabase/functions/tests/verify-email-otp.test.ts`

**Interfaces:**
- Consumes: Task 1 service-only verification RPC, Task 2 OTP digest derivation, and validated anonymous JWT.
- Produces: `POST /functions/v1/verify-email-otp` returning `{ verified: true, grantExpiresAt }` only after atomic success.

- [ ] **Step 1: Write failing verification tests**

Test exact-key validation, UUID/code shape, leading zeroes, anonymous owner extraction, wrong owner, wrong code, expired/superseded/consumed challenge, fifth wrong attempt, sixth attempt denial, concurrent correct calls, sanitized errors, and success.

```ts
const response = await handler(request({ challengeId: CHALLENGE_ID, code: "012345" }));
assertEquals(response.status, 200);
assertEquals(await response.json(), { verified: true, grantExpiresAt: GRANT_EXPIRY });
assertEquals(capturedRpc.owner_user_id, OWNER_ID);
assertEquals(capturedRpc.candidate_digest.length, 64);
```

- [ ] **Step 2: Run and observe RED**

Run: `deno test --allow-env supabase/functions/tests/verify-email-otp.test.ts`

Expected: FAIL because the handler is absent.

- [ ] **Step 3: Implement verification and secret clearing**

Validate the user JWT before parsing sensitive work and require an anonymous user. Call `get_email_otp_challenge_context` through the service client with challenge ID plus the validated owner UUID; derive the HMAC only from that returned normalized email/purpose and the submitted code; then invoke `verify_email_otp_digest` with the same owner UUID. Do not return attempt counts, email, digest, challenge status, or account existence. Drop the local code and context variables as soon as the RPC result is obtained.

- [ ] **Step 4: Configure and run GREEN, then commit**

```toml
[functions.verify-email-otp]
verify_jwt = true
```

Run:

```powershell
deno test --allow-env supabase/functions/tests/verify-email-otp.test.ts
npm run test:edge
```

```powershell
git add supabase/functions/verify-email-otp/index.ts supabase/functions/tests/verify-email-otp.test.ts supabase/config.toml
git commit -m "Add atomic custom OTP verification endpoint"
```

---

### Task 5: Add the custom OTP client contract and state transitions

**Files:**
- Modify: `src/features/quiz/types.ts`
- Modify: `src/features/quiz/quiz-service.ts`
- Modify: `src/features/quiz/reducer.ts`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/features/quiz/persistence.ts`
- Test: `tests/unit/quiz-service.test.ts`
- Test: `tests/unit/quiz-reducer.test.ts`
- Test: `tests/unit/quiz-persistence.test.ts`

**Interfaces:**
- Produces: `CustomEmailOtpChallenge`, `requestCustomEmailOtp`, `verifyCustomEmailOtp`, `submitCustomVerifiedLeadContact`, reducer actions `OTP_REQUESTED`, `OTP_VERIFIED`, `OTP_RESET`, and configuration mode `custom_make_otp`.
- Consumes: Tasks 3-4 Edge Functions, Task 1 lead RPC, existing anonymous `createOwnedQuizContext`, and Turnstile state.

- [ ] **Step 1: Write failing service and reducer tests**

Replace Auth `signInWithOtp/verifyOtp` expectations for custom mode with Edge invocations:

```ts
await requestCustomEmailOtp(" Person@Example.com ", "turnstile-token", fake.client);
expect(fake.functions.invoke).toHaveBeenCalledWith("request-email-otp", {
  body: {
    email: "person@example.com",
    purpose: "qualified_quiz",
    turnstileToken: "turnstile-token",
  },
});

await verifyCustomEmailOtp(CHALLENGE_ID, "012345", fake.client);
expect(fake.functions.invoke).toHaveBeenCalledWith("verify-email-otp", {
  body: { challengeId: CHALLENGE_ID, code: "012345" },
});
```

Reducer tests assert request → inline pending, verified → locked email, change email → reset, resend → replacement challenge, and start over → no challenge/contact leakage.

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run tests/unit/quiz-service.test.ts tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts`

Expected: FAIL because the custom methods/state do not exist.

- [ ] **Step 3: Implement client methods and versioned lead submission**

Define:

```ts
export interface CustomEmailOtpChallenge {
  id: string;
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
  verified: boolean;
  grantExpiresAt: string | null;
}
```

`submitLeadContact` adds `p_challenge_id` and calls `begin_custom_verified_qualified_quiz`; it removes browser email from the RPC arguments. Validate UUIDs/timestamps and return only generic client errors.

- [ ] **Step 4: Reorder anonymous context and Turnstile lifecycle**

On audience selection: use the current Turnstile token to create the anonymous owned context, then increment the Turnstile instance key so Verify Email waits for a fresh token. After each successful OTP request/resend, reset Turnstile again. Continue uses the already-owned context plus the verified challenge; no Supabase permanent email session is created or expected.

- [ ] **Step 5: Keep OTP and contact PII out of persistence**

Assert `SavedQuizAttempt` remains limited to audience, question progress, answers, result, selection, and expiry metadata. Do not add challenge ID, email, code, contact names, business, consent, owner UUID, or Make state to local/session storage.

- [ ] **Step 6: Run GREEN and commit**

Run: `npx vitest run tests/unit/quiz-service.test.ts tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts`

```powershell
git add src/features/quiz/types.ts src/features/quiz/quiz-service.ts src/features/quiz/reducer.ts src/features/quiz/QuizExperience.tsx src/features/quiz/persistence.ts tests/unit/quiz-service.test.ts tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts
git commit -m "Switch quiz state to custom email verification"
```

---

### Task 6: Build the inline Verify Email interface

**Files:**
- Create: `src/features/quiz/InlineEmailVerification.tsx`
- Modify: `src/features/quiz/LeadContactStep.tsx`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/styles/quiz.css`
- Delete after rollback window only: `src/features/quiz/EmailOtpStep.tsx`
- Test: `tests/unit/quiz-components.test.tsx`
- Test: `tests/e2e/portfolio-quiz.spec.ts`

**Interfaces:**
- Consumes: Task 5 challenge/state/service callbacks and `securityReady/securityError`.
- Produces: inline email input + Verify Email, code entry, resend countdown, Change email, Email verified status, and verified-only Continue.

- [ ] **Step 1: Write failing component tests**

Test invalid email, Turnstile not ready, sending state, inline code expansion, masked address, digits-only code with leading zero, 60-second resend, resend token reset, delivery error retention, wrong-code retention, verified read-only email, Change email reset, consent independence, Continue gating, and the compact contact heading. At desktop widths from 1024 px upward, **Where should we send your proposal?** must remain one line; at mobile widths it may wrap naturally without overflow.

```tsx
await user.type(screen.getByLabelText(/^email$/i), "person@example.com");
await user.click(screen.getByRole("button", { name: /^verify email$/i }));
expect(await screen.findByLabelText(/verification code/i)).toBeVisible();
await user.type(screen.getByLabelText(/verification code/i), "01a23-45");
expect(screen.getByLabelText(/verification code/i)).toHaveValue("012345");
await user.click(screen.getByRole("button", { name: /verify code/i }));
expect(await screen.findByText(/email verified/i)).toBeVisible();
expect(screen.getByLabelText(/^email$/i)).toHaveAttribute("readonly");
```

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run tests/unit/quiz-components.test.tsx`

Expected: FAIL because verification is still a separate screen.

- [ ] **Step 3: Implement the inline state machine and responsive layout**

`InlineEmailVerification` accepts controlled email/challenge state and callbacks. On desktop, email and Verify Email share one row; below 640 px they stack. The OTP panel expands below without navigation. Use `aria-live` for sending/verified states, `autocomplete="one-time-code"`, `inputMode="numeric"`, and a visible keyboard-operable Change email action.

Keep first/last/business/consent values mounted while verification runs. Continue remains disabled until contact validity, consent, verified challenge, owned context, and security state are all satisfied. Reduce the heading with a tuned `clamp()` and desktop no-wrap rule so the contact form fits common laptop viewports without unnecessary scrolling; remove the no-wrap constraint below the tablet/mobile breakpoint.

- [ ] **Step 4: Update E2E network mocks and browser assertions**

Replace `/auth/v1/otp` and `/auth/v1/verify` expectations with `/functions/v1/request-email-otp` and `/functions/v1/verify-email-otp`. Assert the lead RPC receives a challenge UUID and no email argument. Cover 320, 390, 768, 1366, 1920, and 2560 widths with no horizontal overflow.

- [ ] **Step 5: Run component and E2E GREEN, then commit**

Run: `npx vitest run tests/unit/quiz-components.test.tsx`

Run: `npx playwright test tests/e2e/portfolio-quiz.spec.ts`

```powershell
git add src/features/quiz/InlineEmailVerification.tsx src/features/quiz/LeadContactStep.tsx src/features/quiz/QuizExperience.tsx src/styles/quiz.css tests/unit/quiz-components.test.tsx tests/e2e/portfolio-quiz.spec.ts
git commit -m "Add inline verified email experience"
```

---

### Task 7: Document and build the inactive Make OTP delivery scenario

**Files:**
- Create: `docs/make-email-otp-scenario.md`
- Modify: `docs/portfolio-blueprint.md`
- Modify: `docs/supabase-database.md`
- Test: `tests/live-copy.test.mjs`

**Interfaces:**
- Consumes: the passed Task 0 feasibility gate, Task 3 signed request headers/payload, and the owner's approved Make Gmail connection.
- Produces: one inactive scenario with webhook authentication, duplicate suppression, Gmail delivery, and matching webhook acknowledgement.

- [ ] **Step 1: Write failing documentation assertions**

Assert the runbook names the exact encrypted-envelope fields, AES advanced keychain, HMAC input, 10-minute code email, duplicate-delivery behavior, confidential-data setting, disabled incomplete executions, no recipient/OTP Data Store field, failure response, and dual-secret rotation procedure.

- [ ] **Step 2: Run and observe RED**

Run: `npm run test:static`

Expected: FAIL because the OTP scenario runbook does not exist.

- [ ] **Step 3: Write the exact runbook and blueprint/database updates**

Document modules in order:

```text
1. Webhooks / Custom webhook
2. Validate ciphertext envelope (timestamp + nonce + HMAC)
3. Data Store / Reject an already reserved delivery ID
4. Data Store / Reserve the unseen delivery ID as pending
5. Encryptor / AES decrypt (advanced hidden keychain)
6. Validate exact decrypted shape and matching delivery ID
7. Gmail / Send an email
8. Data Store / Update the reserved delivery ID to delivered
9. Webhooks / Response {accepted:true,deliveryId:<same UUID>}
```

Enable sequential processing and confidential data, and disable incomplete-execution storage before connecting Gmail so reservation/send cannot race or retain decrypted inputs. The Data Store schema contains only `delivery_id`, `created_at`, and `status`; it never contains recipient, OTP, body, ciphertext, IV, tag, or secrets. A `pending` reservation is never resent automatically after an ambiguous failure, favoring one missed code over duplicate email. Document the Elysha Works subject/body and the separate error route returning a generic failure without request data. Reuse the exact Task 0 canonical HMAC/envelope implementation and compare the complete expected signature before decrypting. If any passed Task 0 capability is no longer available, stop before live email and revise the protocol rather than weakening or omitting encryption, authentication, or idempotency.

- [ ] **Step 4: Build the scenario in Make but keep it inactive**

Using the existing authenticated Make browser session, create the dedicated scenario, enter the webhook signing secret only in protected configuration, create the AES-256-GCM advanced encrypted keychain, enable sequential/confidential handling with incomplete executions disabled, connect the approved Gmail OAuth connection, and validate malformed/stale/tampered/duplicate encrypted requests without sending real email. Do not activate scheduling or production traffic.

- [ ] **Step 5: Verify documentation GREEN and commit**

Run: `npm run test:static`

```powershell
git add docs/make-email-otp-scenario.md docs/portfolio-blueprint.md docs/supabase-database.md tests/live-copy.test.mjs
git commit -m "Document custom OTP delivery operations"
```

---

### Task 8: Run full local verification and production safety preflight

**Files:**
- Modify only when a failing test drives a correction.
- Regenerate: `src/generated/database.types.ts` only after the migration exists locally or remotely.

**Interfaces:**
- Consumes: Tasks 0-7.
- Produces: a verified release candidate plus exact Supabase, Make, and Firebase deployment report.

- [ ] **Step 1: Run the complete local matrix**

```powershell
npm run test
npm run test:supabase:static
npm run test:edge
npm run typecheck
npm run lint
npm run build
npx playwright test
```

When Docker is available:

```powershell
npx supabase@latest db reset
npx supabase@latest test db
npx supabase@latest db lint --level warning
npx supabase@latest db diff --local --schema public,private
```

Expected: every available command exits 0; unavailable Docker/browser dependencies are reported as blockers, not passes.

- [ ] **Step 2: Run secret and plaintext-OTP hygiene checks**

```powershell
git status --short
git diff --check
git ls-files .env .env.local test-results .firebase
git grep -n -I -E "OTP_PEPPER=|OTP_GROUPING_SECRET=|MAKE_OTP_WEBHOOK_SECRET=|TURNSTILE_SECRET_KEY=|service_role|smtp.*pass" -- . ":(exclude)package-lock.json"
git grep -n -I -E 'otp[^\n]{0,20}(console|log|analytics|localStorage|sessionStorage)' -- src supabase
```

Expected: no secret values, plaintext OTP persistence, or local deployment artifacts are tracked.

- [ ] **Step 3: Inspect the exact linked Supabase target read-only**

```powershell
npx supabase@latest projects list
npx supabase@latest migration list --linked
npx supabase@latest db push --linked --dry-run
```

Report project reference, migration history, pending migration, conflicts, table-count change, every grant/function replacement, the version-controlled cleanup cron/unschedule statements, and destructive-statement scan. Confirm the migration is additive and does not drop existing business data. Confirm the documented Supabase gateway IP header is stripped/rebuilt by the platform; otherwise stop because a caller-controlled IP header cannot enforce the approved limiter.

- [ ] **Step 4: Inspect Make and Firebase targets read-only**

Confirm the OTP scenario is inactive, the webhook belongs to the intended Make team/scenario, Gmail connection owner is approved, scenario history settings are compatible with the spec, and `firebase use`/project listing identifies only `elyshaworks-fd2dc`. Do not send email or deploy during preflight.

- [ ] **Step 5: Record the remote execution gate**

Present the exact migration, function names, secret names without values, Make activation action, feature-mode change, Firebase command, controlled test address policy, and rollback commands before production mutation. The user's approved execution method is native, but target mismatch or destructive drift stops deployment.

- [ ] **Step 6: Push and record the verified release candidate before remote mutation**

Require a clean worktree containing only the planned commits, then push the branch and record its immutable commit SHA:

```powershell
git status --short
git push origin codex/service-professionals-portfolio
git rev-parse HEAD
```

Do not mutate Supabase, Make production delivery, or Firebase unless that exact source revision is recoverable from the remote repository.

---

### Task 9: Deploy Supabase, validate Make, cut over Firebase, and smoke-test

**Files:**
- Modify: `.env.local` only for the non-secret client mode/site key if required; never commit it.
- Modify and commit: `src/generated/database.types.ts` after type generation.
- Remote: linked Supabase project, dedicated inactive Make OTP scenario, Firebase Hosting project `elyshaworks-fd2dc`.

**Interfaces:**
- Consumes: verified Task 8 candidate and the owner-entered Supabase/Make secrets.
- Produces: live custom OTP verification with rollback available during the measured compatibility window.

- [ ] **Step 1: Configure secrets without displaying them**

Create/rotate and store only in Supabase Edge Function secrets:

```text
OTP_PEPPER
OTP_GROUPING_SECRET
TURNSTILE_SECRET_KEY
TURNSTILE_EXPECTED_HOSTNAME
MAKE_OTP_WEBHOOK_URL
MAKE_OTP_WEBHOOK_SECRET
MAKE_OTP_ENCRYPTION_KEY
```

The same Make OTP signing secret is entered privately in the Make validation module, and the transport key is created as an AES advanced encrypted keychain. No secret is echoed, copied into chat, written to `.env.local`, or committed.

- [ ] **Step 2: Apply the additive migration, verify cleanup scheduling, publish generated types, and deploy both functions**

After rechecking the linked project and dry run:

```powershell
npx supabase@latest db push --linked
```

Verify remote grants/table/function definitions and the exact named hourly cleanup job read-only. Confirm the job calls only the bounded private OTP cleanup and that the documented unschedule operation is reversible. Generate types:

```powershell
npx supabase@latest gen types typescript --linked --schema public | Set-Content -Encoding utf8 src/generated/database.types.ts
```

Run `npm run typecheck`, commit only the generated type update, and push it before deploying Edge code:

```powershell
git add -- src/generated/database.types.ts
git commit -m "Update database types for custom OTP"
git push origin codex/service-professionals-portfolio
npx supabase@latest functions deploy request-email-otp --project-ref gftjoanbwcvpqiecsdda
npx supabase@latest functions deploy verify-email-otp --project-ref gftjoanbwcvpqiecsdda
```

- [ ] **Step 3: Test the inactive Make scenario with one owner-approved address**

Send one encrypted/signed controlled request from the deployed Edge Function. Verify that webhook logs expose only ciphertext, one Gmail message renders the correct six-digit code with no link and the exact subject, the acknowledgement matches the delivery ID, duplicate/tamper attempts do not send, and no decrypted recipient/OTP is retained in Data Store or execution logs. If encryption, retention, or confidentiality cannot meet the spec, stop and do not activate or cut over.

- [ ] **Step 4: Activate Make and build the custom-mode frontend**

Set the public non-secret build mode to `custom_make_otp`, keep the old Auth OTP path available only for rollback, then run:

```powershell
npm run test
npm run test:supabase:static
npm run test:edge
npm run typecheck
npm run lint
npm run build
npx playwright test
```

All available checks must pass after the final production-mode build.

- [ ] **Step 5: Deploy Firebase Hosting only**

```powershell
npx firebase-tools deploy --only hosting --project elyshaworks-fd2dc
```

Do not deploy Firestore, Functions, Storage, domains, or unrelated resources. Verify the live `/quiz/` output hash matches `out/quiz/index.html`.

- [ ] **Step 6: Run the controlled live smoke test**

With manual Turnstile completion, always test through inline OTP verification and confirm the hash-only challenge row. Continue through lead creation, questions, proposal calculation, and delivery only when the owner explicitly approves a real business record that is valid production data and will remain under the normal retention policy. Otherwise stop before the lead RPC and rely on the completed pgTAP/Edge/E2E tests for consumption and downstream behavior. The 24-hour OTP cleanup removes only challenge metadata; it must never be described as deleting leads or proposals.

- [ ] **Step 7: Observe rollback window, retire old Auth OTP, and revoke unused Gmail App Password**

During the compatibility window, rollback means rebuilding with `supabase_auth_otp`, stopping the Make OTP scenario, and leaving additive data intact. Rotate/revoke both Make OTP transport secrets if compromise is suspected. After verified stability, remove `EmailOtpStep.tsx` and old `signInWithOtp/verifyOtp` code under RED→GREEN tests, disable unused Supabase custom SMTP, revoke its Gmail App Password if no other system uses it, rerun the full suite, and deploy Hosting only again.

- [ ] **Step 8: Commit any rollback-window retirement changes explicitly, push, and report exact production evidence**

If Step 7 removes the old Auth OTP path, stage only the exact files changed by that RED-to-GREEN retirement, commit them, and push. Never use directory-wide staging. Report commit IDs, Supabase project/function/migration versions, cleanup-cron identity, Make scenario status without secrets or payload values, Firebase Hosting release, live smoke scope/results, cleanup timing, rollback state, and any unavailable checks.
