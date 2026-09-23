# Custom Make-Delivered Email OTP Design

**Date:** September 23, 2026

**Status:** Draft for owner review

**Source of truth to update during implementation:** `docs/portfolio-blueprint.md`

**Supersedes:** Section 4, the email-OTP portions of Sections 3, 5, 8, 9, 10, and the related delivery steps in Section 11 of `2026-09-23-verified-lead-roadmap-design.md`. The result, proposal, booking, catalog, Cortex, 72-hour access, and follow-up decisions in that document remain in force unless this document changes them explicitly.

## 1. Outcome

The portfolio will use a custom email-verification challenge whose six-digit OTP is generated only in a Supabase Edge Function. PostgreSQL stores only a keyed digest of the OTP. A dedicated Make scenario receives the plaintext OTP once over an authenticated HTTPS webhook and sends the verification email through the approved Gmail connection. A second Edge Function verifies the submitted code against Supabase state, and the qualified-lead RPC atomically consumes the verified challenge.

This OTP proves control of one email address for the current assessment and proposal workflow. It does not create a permanent email login, client-portal identity, password, or cross-device authenticated account.

The contact interface keeps verification inline: the email field has a **Verify Email** action, the OTP input expands below it, and a successful check replaces the OTP controls with a visible **Email verified** state. The user does not navigate to a separate verification page.

## 2. Goals and Non-Goals

### Goals

1. Reject obvious bot traffic and reduce fake, mistyped, or unowned email submissions before qualified-lead creation.
2. Generate OTPs only in trusted server-side code and never expose the generator, pepper, Make secret, or stored digest to browser code.
3. Store no plaintext OTP in PostgreSQL, browser storage, analytics, application logs, source control, or documentation.
4. Keep the existing anonymous Supabase Auth session for `auth.uid()` ownership and RLS rather than creating a permanent Auth user.
5. Bind every challenge to one anonymous owner, normalized email, purpose, expiry, and one-time qualified-lead consumption.
6. Preserve the existing no-reload quiz, repeat-business decision, Cortex, proposal, booking, and follow-up behavior.
7. Separate transactional verification and proposal consent from any future promotional-marketing consent.

### Non-goals

- No permanent client login or account recovery.
- No password, magic-link, or Supabase Auth email identity.
- No claim that a verified address guarantees inbox placement or prevents Gmail from using the Promotions or Spam tabs.
- No promotional subscription created by verifying an email address.
- No OTP generation or verification inside Make.
- No OTP generation in client JavaScript, Firebase Hosting, local storage, or a public database function.
- No raw IP-address retention.
- No PDF proposal and no changes to the approved 72-hour protected proposal model.

## 3. Approved User Journey

1. The visitor selects one of the three audience paths.
2. The page obtains a Turnstile token and creates or resumes an anonymous Supabase Auth session. The resulting `auth.uid()` remains the owner for the assessment.
3. The application creates the owned visitor, portfolio-session, and quiz-session context under that anonymous owner. It does not create a qualified lead.
4. Turnstile is reset and obtains a fresh, single-use token for email verification.
5. The contact form displays first name, last name, business name, email, proposal/follow-up consent, and a **Verify Email** button beside the email field.
6. Clicking **Verify Email** calls `request-email-otp`. The email is normalized, the fresh Turnstile token is verified server-side, issuance limits are enforced, and a new challenge invalidates any older active challenge for the same owner and purpose.
7. The interface expands an inline six-digit OTP field, **Verify code**, **Resend code**, a 60-second countdown, and **Change email**. The rest of the entered contact data remains on screen.
8. Make sends the Elysha Works verification email. The response never says whether the email already has a lead.
9. The visitor enters the code. `verify-email-otp` verifies the challenge under the same anonymous owner and marks a short-lived verification grant on that challenge.
10. The email field becomes read-only and displays **Email verified**. Changing the email clears the verified state and requires a new challenge.
11. **Continue to Assessment** becomes enabled only when the email is verified and every required name, business, and proposal/follow-up-consent field is valid.
12. Continuing calls the restricted qualified-lead RPC with the verified challenge identifier. In the same transaction, the RPC derives the canonical email from the challenge, consumes the grant once, creates or reuses the qualified lead, and links the owned quiz session.
13. If the verified email already has a business lead, the existing same-business/another-business decision appears only after OTP verification. No unverified visitor can probe business names by email.
14. The client completes the existing quiz and proposal journey without a reload.

## 4. Trust Boundaries and Responsibilities

### Portfolio browser

The browser may hold only:

- the anonymous Supabase session managed by the Supabase client;
- the normalized email and contact form values in component memory;
- the opaque challenge UUID;
- the user-entered OTP while the verification input is active;
- the final verified/unverified UI state.

It never receives the stored digest, OTP pepper, service-role key, Make webhook URL, Make signing secret, or verification internals. The browser cannot write challenge rows directly.

### Supabase Edge Functions

- `request-email-otp` authenticates the anonymous caller, verifies Turnstile, rate-limits issuance, generates the OTP, stores only its digest, and calls Make.
- `verify-email-otp` authenticates the same anonymous caller, validates the code shape, derives the candidate digest with the server-held pepper, and invokes the atomic verification database function.
- Both functions return generic, minimal responses and use the existing shared CORS, environment, HTTP, and cryptography utilities where applicable.

### PostgreSQL

PostgreSQL stores the challenge, fixed-length digest, normalized email, owner, purpose, timestamps, attempt count, delivery state, and consumption state. It performs atomic ownership, expiry, attempt, replay, and consumption decisions. Browser roles receive no table privileges.

### Make and Gmail

Make receives the plaintext OTP only in the signed request body needed to send the current verification email. Make does not persist the OTP in a Data Store, return it in a webhook response, include it in error text, or forward it to another service. Gmail transports the rendered message; Gmail neither generates nor verifies the code.

Make is a sensitive-data boundary because execution history may contain webhook inputs. The scenario must use confidential-data controls where available, the shortest practical execution-history retention, restricted team access, and no debug logging of the request body. If those controls cannot be enforced, the production sender must move from Make to a transactional email provider called directly by the Edge Function before launch.

## 5. Cryptography and Challenge Rules

### OTP generation

- Generate exactly six decimal digits with a cryptographically secure random source inside `request-email-otp`.
- Do not use `Math.random`, timestamps, UUID fragments, counters, user data, or Make expressions.
- Leading zeroes are valid and preserved as a six-character string.

### Stored digest

`OTP_PEPPER` is a random server secret stored only in Supabase Edge Function secrets. The digest is HMAC-SHA-256 over an unambiguous, versioned message containing:

```text
otp-v1\n<challenge-id>\n<owner-user-id>\n<normalized-email>\n<uppercase-purpose>\n<six-digit-otp>
```

The challenge UUID supplies a unique per-challenge salt-like value, while the server-only pepper prevents practical offline enumeration of the one-million-code space after a database-only compromise. Plain SHA-256 of the OTP is forbidden.

Candidate and stored 32-byte digests are compared in an atomic restricted database function that loops over all 32 bytes without early exit. The comparison function and its verification wrapper are service-role-only and are never executable by browser roles.

### Lifetime and attempts

- OTP validity: 10 minutes from successful challenge creation.
- Resend cooldown: 60 seconds.
- Maximum verification attempts: five per challenge.
- Verified-grant lifetime: 10 minutes after successful verification.
- One active challenge per owner and purpose; issuing a replacement invalidates the previous active challenge.
- A correct verification marks the challenge verified but does not create a lead by itself.
- Qualified-lead creation consumes the verified grant once in the same transaction as lead/session linking.
- Expired, failed, superseded, consumed, unknown, and wrong-code requests use generic responses.

## 6. Database Design

### `email_otp_challenges`

Add one private table:

| Column | Type | Rule |
|---|---|---|
| `id` | `UUID` | Primary key; cryptographically random |
| `owner_user_id` | `UUID` | Required FK to `auth.users(id)`; anonymous session owner |
| `email` | `TEXT` | Required canonical normalized delivery address |
| `email_digest` | `BYTEA` | Server-keyed digest used for rate-limit grouping without indexing plaintext email |
| `purpose` | `TEXT` | Initially only `qualified_quiz` |
| `otp_digest` | `BYTEA` nullable | Exactly 32 bytes while active; cleared after successful consumption or terminal cleanup |
| `status` | `TEXT` | `pending_delivery`, `active`, `delivery_failed`, `verified`, `consumed`, `superseded`, `failed`, or `expired` |
| `attempt_count` | `INTEGER` | Starts at zero; maximum five |
| `request_ip_digest` | `BYTEA` | Keyed digest of the request IP; raw IP is never stored |
| `make_delivery_id` | `UUID` | Idempotency identifier, not a Make execution identifier |
| `created_at` | `TIMESTAMPTZ` | Server-set |
| `delivered_at` | `TIMESTAMPTZ` nullable | Set after authenticated Make acknowledgement |
| `expires_at` | `TIMESTAMPTZ` | Exactly ten minutes after creation |
| `resend_available_at` | `TIMESTAMPTZ` | Exactly 60 seconds after creation |
| `verified_at` | `TIMESTAMPTZ` nullable | Server-set after successful digest verification |
| `grant_expires_at` | `TIMESTAMPTZ` nullable | Ten minutes after verification |
| `consumed_at` | `TIMESTAMPTZ` nullable | Set by the qualified-lead RPC |

Constraints enforce fixed digest lengths, non-negative bounded attempts, valid status/timestamp combinations, expiry ordering, and the supported purpose allowlist. Add indexes for owner/purpose recency, email-digest recency, IP-digest recency, expiry cleanup, and one active challenge per owner/purpose.

No `anon` or `authenticated` table grants are issued. RLS is enabled with no browser policies. Only restricted security-definer functions and trusted Edge Functions can mutate or inspect rows.

### Atomic database functions

1. `record_email_otp_challenge(...)`: service-only insertion after Edge verification and rate-limit checks; supersedes the prior active owner/purpose challenge.
2. `verify_email_otp_digest(challenge_id, owner_user_id, candidate_digest)`: service-role-only; receives the owner UUID only from `verify-email-otp` after that Edge Function validates the caller JWT, locks the row, validates ownership/status/expiry, increments attempts, performs the fixed-length comparison, and sets `verified_at` plus `grant_expires_at` on success.
3. `consume_verified_quiz_email(...)`: incorporated into the versioned qualified-lead RPC. It locks and validates the verified challenge, derives the canonical email and verification timestamp, creates/reuses the lead, links the quiz, and sets `consumed_at` atomically.
4. `expire_email_otp_challenges(batch_size)`: service-only bounded cleanup that marks stale active rows expired, clears terminal OTP digests, and deletes terminal records older than 24 hours.

Every security-definer function uses `SET search_path = ''`, schema-qualified objects, minimal scalar arguments, default-deny execute grants, and explicit role checks.

## 7. Rate Limits and Enumeration Resistance

Before generating a code, `request-email-otp` enforces all of the following rolling-window limits:

- one request per owner/purpose every 60 seconds;
- three requests per normalized-email digest per 15 minutes;
- five requests per anonymous owner per 15 minutes;
- ten requests per request-IP digest per 15 minutes.

Turnstile is verified server-side for every initial request and resend. A Turnstile token is single-use; after anonymous-session creation and after each OTP request, the widget is reset before another protected action.

The API never reveals whether an email already exists, has a lead, belongs to another business, or was previously verified. Rate-limit copy states only that the requester must wait before trying again. Delivery failures use a generic temporary-unavailable response.

The email and IP grouping digests use separate versioned HMAC domains under server-only secrets. Analytics contain only coarse result codes such as `otp_requested`, `otp_delivery_failed`, `otp_verified`, `otp_failed`, and `otp_rate_limited`; they contain no email, code, digest, IP, challenge UUID, Make payload, or contact data.

## 8. Edge Function Contracts

### `request-email-otp`

Requires the anonymous Supabase bearer token and accepts:

```json
{
  "email": "person@example.com",
  "purpose": "qualified_quiz",
  "turnstileToken": "opaque-token"
}
```

Processing order:

1. Validate method, origin, body size, email syntax, purpose, JWT, and anonymous `auth.uid()`.
2. Verify the Turnstile token with Cloudflare using the server secret and expected action/hostname.
3. Normalize the email and derive email/IP grouping digests.
4. Enforce issuance limits.
5. Generate the OTP and challenge identifiers.
6. Derive and store only the OTP digest in a `pending_delivery` challenge.
7. Call the signed Make webhook with the minimum delivery payload.
8. Require the matching delivery ID in Make's success acknowledgement.
9. Mark the challenge active/delivered, discard the plaintext OTP from local scope, and return the opaque challenge ID plus authoritative expiry/cooldown timestamps.
10. On delivery failure, mark the challenge failed, clear its OTP digest, and return a generic retryable error.

### `verify-email-otp`

Requires the same anonymous Supabase owner and accepts:

```json
{
  "challengeId": "uuid",
  "code": "012345"
}
```

It validates the caller JWT and extracts its anonymous owner UUID, validates the six-digit shape, derives the candidate HMAC, calls the service-role-only atomic database verification function with that validated owner UUID, clears the code from local scope, and returns only `{ "verified": true, "grantExpiresAt": "..." }` on success. Every failure returns the same public verification error except an explicit cooldown/rate-limit response where appropriate.

## 9. Make OTP Scenario

Create a dedicated scenario separate from proposal delivery and proposal follow-ups.

### Trigger and authentication

- Trigger: private Make custom webhook called only by `request-email-otp`.
- Transport: HTTPS only.
- Headers: timestamp, nonce/delivery ID, HMAC signature, and the dedicated OTP webhook secret.
- Make validates the timestamp window, delivery ID, signature, and required payload before the Gmail module.
- The Edge Function and Make Data Store use the delivery ID for idempotency. A replay never sends a second email.

### Minimum payload

```json
{
  "deliveryId": "uuid",
  "to": "person@example.com",
  "otp": "012345",
  "expiresInMinutes": 10,
  "templateVersion": "elysha_otp_v1"
}
```

The payload excludes names, business name, lead IDs, quiz answers, proposal data, IP data, Supabase owner IDs, hashes, and secrets.

### Email content

- Sender: the approved Elysha Works Gmail connection.
- Subject: **Your Elysha Works verification code**.
- Body: Elysha Works branding, the six-digit code, ten-minute expiry, and an ignore-this-message notice.
- No login link, confirmation URL, proposal content, promotional offer, tracking pixel, attachment, or discovery-call CTA.

### Acknowledgement

After Gmail accepts the message, Make returns only:

```json
{
  "accepted": true,
  "deliveryId": "same-uuid"
}
```

It never returns the OTP, recipient, Gmail message body, OAuth data, or execution details. The scenario remains inactive until signed requests, duplicate delivery IDs, Gmail failure, timeout, and redacted execution history are tested.

## 10. Inline Interface Design

The contact form remains one responsive composition and does not navigate to a separate OTP screen.

### Initial state

- Email input and **Verify Email** button share one row on desktop and stack on small screens.
- The button is disabled until the email is valid, an anonymous session exists, and a fresh Turnstile token is ready.
- First name, last name, business name, and proposal/follow-up consent may be entered before or during verification.
- **Continue to Assessment** remains disabled until all required fields, consent, and verification are complete.

### Sending and code-entry states

- The verify button changes to **Sending code...** and cannot be double-clicked.
- On success, a six-digit input and **Verify code** action expand directly below the email row.
- The UI shows the masked destination, a 60-second resend countdown, **Resend code**, and **Change email**.
- Resend requires a fresh Turnstile token and replaces the active challenge.
- The input accepts digits only, preserves leading zeroes, supports `autocomplete="one-time-code"`, and announces errors accessibly.

### Verified state

- The OTP controls collapse.
- The email input becomes read-only.
- A persistent gold/green **Email verified** status appears beside or below it.
- **Change email** remains available. Using it clears the challenge, verified state, and any eligibility to continue until the new address is verified.
- Verification alone never checks the proposal/follow-up consent box and never opts the address into future promotions.

## 11. Qualified Lead and Repeat-Business Rules

The versioned qualified-lead RPC no longer reads canonical email or `email_confirmed_at` from `auth.users`. Instead, it accepts the opaque challenge ID and consumes the verified challenge bound to `auth.uid()`.

The RPC:

- rejects an absent, expired, unverified, superseded, failed, or consumed challenge;
- rejects a challenge belonging to another anonymous owner or purpose;
- derives email and verification time only from the locked challenge row;
- validates every visitor, portfolio-session, and quiz-session identifier against the same `auth.uid()`;
- records consent only from the final form submission after verification;
- finds repeat-assessment candidates by verified normalized email and normalized business name, not by anonymous Auth UUID alone;
- reveals an existing business display name only after successful OTP verification for that same email;
- permits one verified email to assess multiple businesses without collapsing historical proposals;
- consumes the verification grant in the same transaction that creates/reuses the lead and links the quiz.

The existing `auth_user_id` field may retain the original anonymous owner for historical ownership. It is not presented as a permanent email identity. Proposal finalization continues to verify quiz ownership with the current anonymous `auth.uid()` and uses the trusted linked lead for delivery.

## 12. Deliverability and Consent Boundaries

OTP verification reduces mistyped addresses, fake submissions, and avoidable bounces. It does not guarantee inbox placement and cannot prevent Gmail from classifying later mail as Promotions or Spam.

- OTP email is transactional and contains no marketing content.
- Proposal plus the approved three follow-ups use the existing explicit proposal/follow-up consent and stop rules.
- Future newsletters, offers, or promotions require a separate, explicit marketing-consent field and a compliant unsubscribe mechanism. They are not authorized by OTP verification or the proposal/follow-up consent.
- Production marketing mail should use a dedicated marketing provider/domain rather than personal Gmail SMTP.
- Before promotional launch, configure and verify SPF, DKIM, DMARC, branded From/Reply-To alignment, bounce handling, complaint handling, and suppression lists.

## 13. Error and Recovery Rules

- Turnstile failure leaves every form value intact and offers **Retry security check**.
- Anonymous-session failure blocks OTP requests but does not clear contact fields.
- OTP delivery failure keeps the email editable and allows a controlled retry after the server cooldown.
- Wrong code keeps the inline OTP state and never reveals which validation failed.
- Five failed attempts require a new challenge.
- Refreshing the page does not persist the plaintext OTP. An unfinished verification starts over safely.
- Verification success followed by lead-RPC failure offers **Retry setup** while the short-lived verified grant remains valid.
- Expired verified grants require a new OTP.
- Make timeout/failure never displays **Email verified** and never creates a qualified lead.
- Existing proposal access remains available independently of a new OTP-service outage.

## 14. Retention and Cleanup

- Plaintext OTP exists only in Edge Function memory and the transient signed Make request/Gmail message.
- Successful challenge consumption clears `otp_digest` immediately.
- Failed, expired, superseded, and delivery-failed terminal rows have their digest cleared by bounded cleanup.
- Terminal challenge metadata is deleted after 24 hours.
- No challenge metadata is copied into analytics, proposal snapshots, browser persistence, or Make Data Stores.
- Existing proposal/lead retention remains governed by the approved portfolio data policy and is not changed by this design.

## 15. Testing and Acceptance Criteria

### Cryptography and service tests

- OTP generator produces exactly six digits, preserves leading zeroes, and uses the cryptographic random source.
- Stored rows and logs never contain the plaintext OTP.
- Changing challenge ID, owner, email, purpose, OTP, or pepper changes the digest.
- Correct candidate succeeds; wrong candidates fail; digest comparison examines all 32 bytes.
- Expired, superseded, consumed, cross-owner, wrong-purpose, and sixth-attempt requests fail generically.
- Concurrent correct submissions consume at most one verification grant.
- Concurrent lead submissions consume at most one grant and create/reuse at most one intended lead.

### Turnstile and rate-limit tests

- Missing, invalid, expired, reused, wrong-action, and wrong-hostname Turnstile tokens fail.
- Owner, email-digest, IP-digest, and resend limits are independently enforced.
- No raw IP or email appears in rate-limit analytics.
- A replacement challenge invalidates the prior challenge.

### Make contract tests

- Valid signatures send exactly one Gmail message and return the matching delivery ID.
- Invalid signature, stale timestamp, malformed payload, and duplicate delivery ID do not send.
- Gmail failure returns no success acknowledgement and leaves no active challenge.
- Scenario logs/Data Stores contain no retained OTP after the configured operational window.

### Database/RLS tests

- Browser roles cannot select, insert, update, or delete challenge rows.
- Anonymous users cannot verify or consume another owner's challenge.
- Qualified-lead creation rejects unverified challenges and browser-supplied email substitutions.
- Repeat-business lookup occurs only after verified email ownership.
- Existing quiz/proposal ownership and RLS tests remain green.

### UI and browser tests

- Verify Email is inline with the email field and requires a valid email, anonymous session, and Turnstile readiness.
- OTP controls expand in place without navigation or reload.
- Digits-only entry, leading zeroes, cooldown, resend, error, Change email, and verified states work.
- Email becomes read-only only after server verification.
- Continue remains disabled until verified email, valid contact fields, and consent are all present.
- Mobile and desktop layouts have no horizontal overflow.

### End-to-end production smoke test

Using one owner-approved test address and no fake lead data:

1. Complete Turnstile and request a code.
2. Confirm the Make scenario sends one branded code email.
3. Confirm the database contains a digest but no plaintext OTP.
4. Verify the code inline and observe **Email verified**.
5. Continue and confirm the verified challenge is consumed once.
6. Confirm retry/replay cannot create duplicate leads or emails.
7. Remove the controlled test artifacts through the approved retention/cleanup path.

## 16. Rollout, Rollback, and Deployment

### Additive rollout

1. Update `docs/portfolio-blueprint.md` with this approved flow and consent boundary.
2. Add failing unit, SQL, Edge Function, Make-contract, component, and browser tests.
3. Add the private challenge table and restricted database functions in an additive migration.
4. Deploy database changes and both Edge Functions while the current Supabase Auth OTP remains active.
5. Configure Edge secrets: OTP pepper, Turnstile secret, Make OTP webhook URL, Make OTP signing secret, and grouping-digest secret. No value is printed, committed, or placed in browser environment variables.
6. Build the Make OTP scenario inactive, enable confidential-data controls, connect Gmail, and test signed/idempotent delivery with an owner-approved address.
7. Deploy the inline frontend behind one configuration switch that selects `supabase_auth_otp` or `custom_make_otp`.
8. Run the controlled production smoke test against `custom_make_otp`.
9. Keep the Supabase Auth OTP path available only for the measured rollback window; do not run both paths for one attempt.
10. After the custom path is verified, make it the only browser path, remove the old Auth OTP UI/service code, disable unused Supabase custom SMTP, and revoke its Gmail App Password if no other system uses it.
11. Build the exact tested branch and deploy only Firebase Hosting to the existing target.
12. Verify live asset/build identity, inline behavior, database writes, Make delivery, proposal flow, and rollback switch.

### Rollback

- Before old-code removal, switch the frontend back to `supabase_auth_otp` without dropping the additive table or functions.
- Stop the Make OTP scenario and rotate/revoke its dedicated signing secret if compromise is suspected.
- Do not delete challenge rows during rollback; allow the 24-hour cleanup to remove terminal metadata.
- Database rollback never drops lead, quiz, proposal, booking, or analytics data.

### Deployment guardrails

- Verify the exact Supabase project reference and migration history before remote application.
- Report pending migrations, destructive statements, target mismatch, and generated-type drift before deployment.
- Apply no destructive migration.
- Keep the Make scenario inactive until signed delivery, duplicate suppression, and log-retention checks pass.
- Firebase deployment uses `--only hosting` for project `elyshaworks-fd2dc` and does not alter domains, targets, Firestore, or unrelated applications.

## 17. Required Documentation Updates

Implementation updates must keep these files aligned:

- `docs/portfolio-blueprint.md`: approved user journey, consent, Make OTP delivery, verified-email behavior, and deliverability boundaries.
- `docs/supabase-database.md`: challenge schema, functions, RLS, secrets, retention, deployment, and rollback.
- Make scenario documentation: module order, signed headers, idempotency, Gmail template, confidential-data setting, retention, and manual recovery.
- Operational runbook: rate-limit investigation, Make/Gmail delivery failure, secret rotation, Turnstile failure, cleanup, and rollback.

## 18. Final Security Invariants

1. No plaintext OTP is stored in PostgreSQL, browser persistence, analytics, Git, or a Make Data Store.
2. The OTP generator and every secret remain outside the browser bundle.
3. A challenge can verify and qualify only the anonymous owner to which it was issued.
4. A verified challenge is short-lived and consumed exactly once.
5. Canonical lead email comes only from the consumed challenge, never from a browser field.
6. Make can deliver an OTP but cannot generate, verify, or consume one.
7. OTP verification does not grant promotional consent or permanent login status.
8. Failure messages reveal no email, account, lead, business, or challenge existence.
9. Existing proposal access and quiz ownership remain protected by their current RLS and server checks.
10. Production launch is blocked if Make cannot prevent practical retention or exposure of plaintext OTP execution data.
