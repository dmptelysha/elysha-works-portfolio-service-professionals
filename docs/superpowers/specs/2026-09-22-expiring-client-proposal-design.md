# Expiring Client Proposal and Follow-Up Design

**Date:** September 22, 2026

**Status:** Approved architecture; written specification awaiting owner review

**Source of truth to update during implementation:** `docs/portfolio-blueprint.md`

## 1. Outcome

The portfolio quiz will become a lead-qualified assessment that turns a visitor's answers into a personalized, client-specific proposal. The proposal explains the client's current situation (Point A), intended outcome (Point B), recommended platform and package, and the advantages of Basic, Advanced, and Complete. It remains available through an access-key-protected page for 72 hours and consistently points toward an optional discovery call.

The experience should show that Elysha Works understands how to move the business from Point A to Point B. Basic must remain a viable solution. Advanced must make the value of a more connected system clear. Complete must demonstrate how a broader implementation can exceed the stated requirement through deeper automation, visibility, permissions, portals, dashboards, or operational workflows when appropriate.

## 2. Approved Business Flow

1. The visitor chooses one of the three audiences.
2. Before the audience-specific questions begin, the visitor provides:
   - first name;
   - business name; and
   - email address.
3. The form clearly states that these details are used to save and email the personalized proposal and discovery-call follow-ups. Submission is voluntary, but it is required to continue into this lead-qualified quiz flow.
4. Supabase Anonymous Auth silently provides the ownership identity. A restricted RPC creates or reuses the lead and links it to the owned portfolio and quiz sessions.
5. The visitor answers the quiz without a page reload. Progress autosaves to the owned Supabase quiz session and to the same browser as a temporary resilience copy.
6. At completion, trusted server-side logic verifies the answers, recalculates the Cortex recommendation, resolves the catalog-controlled prices, and stores a historical proposal snapshot.
7. The visitor immediately sees the personalized result in the same browser.
8. Supabase issues a proposal reference plus a separate auto-generated access key. The access key is emailed through Make and is never included in the proposal URL.
9. The client can open `/proposal/?ref=<proposal-reference>`, enter the access key, and view the protected proposal until its exact expiration timestamp.
10. If no discovery call has been requested or booked, follow-up emails are sent at 24, 48, and 72 hours after the initial proposal email.
11. The 72-hour email is the final automated follow-up and states the exact proposal expiration time.
12. At 96 hours, a lead with no booking activity is marked cold. No fourth follow-up is sent.

All durations are measured from the successful initial proposal-email timestamp in UTC. Displayed timestamps are formatted for the recipient-facing locale where possible, while the database remains authoritative in UTC.

## 3. Responsibilities

| System | Responsibility |
|---|---|
| Firebase Hosting | Host the static portfolio, `/quiz`, `/proposal`, custom domain, SSL, and production deployment |
| Supabase Auth | Anonymous browser identity and ownership through `auth.uid()` |
| Supabase PostgreSQL | Visitors, sessions, quiz progress, leads, bookings, proposal snapshots, expiration state, follow-up state, and audit events |
| Supabase RLS/RPC | Ownership enforcement, safe lead creation, safe progress writes, trusted state transitions, and admin access |
| Supabase Edge Functions | Server-side Cortex execution, access-key issuance/verification, Make webhook calls, due-follow-up claims, and delivery acknowledgements |
| Make | Immediate and scheduled email orchestration through an authorized Gmail connection |
| Gmail connection in Make | Send the proposal and follow-up messages; credentials remain in Make |

The portfolio browser must never contain a Supabase service-role key, Make webhook URL, Make shared secret, Gmail token, proposal hash pepper, or unrestricted database credential.

## 4. Client Experience

### 4.1 Contact step

The contact step appears after audience selection and before Question 1. It contains three required fields: first name, business name, and email address. It also contains a required consent checkbox with concise copy explaining that Elysha Works will email the result and up to three proposal-related follow-ups unless the client books a discovery call first.

Validation rules:

- First name: trimmed, 1–120 characters.
- Business name: trimmed, 1–160 characters.
- Email: trimmed, lowercased, and validated using the existing practical database rule.
- The Continue action stays disabled until the fields and consent are valid.
- The UI sends only these approved public fields. CRM-controlled fields remain server-assigned.
- A backend failure leaves the form values intact and provides a retry action. It does not silently bypass lead creation.

### 4.2 Quiz

The existing one-question-at-a-time experience remains. Audience selection, answers, progress, Back, and Continue work without navigation or page reload. The current eight-question model remains unless the blueprint later approves a separate question-set revision.

The temporary same-browser attempt expires 72 hours after the latest accepted activity. Supabase `resume_expires_at` uses the same 72-hour window. Expiration removes local recoverability and prevents further visitor editing; it does not delete a lead, booking, delivery record, or internally retained historical recommendation that is required for CRM attribution.

The interface must not claim that all business data is deleted after 72 hours. It must say that the saved quiz/proposal access expires after three days.

### 4.3 Result and proposal content order

Both the immediate result and protected proposal use this order:

1. Client name and business name.
2. **Point A — Where the business is now.** Derived from the selected current-setup and blocker answers, using their approved answer labels and a concise Cortex-generated summary.
3. **Point B — What the business wants to achieve.** Derived from the primary goal and required-capability answers.
4. **Recommended path from A to B.** The primary system, recommended platform, recommended tier, and answer-based rationale.
5. **Recommended package.** Exact stable offer key, approved price, included capabilities, relevant add-ons, scope-review items, and recurring-cost disclosures.
6. **Basic vs Advanced vs Complete.** Three side-by-side comparison cards. Each card shows the feasible selected platform, starting investment, included outcome, and the concrete advantage of moving up one level.
7. **Why Complete can exceed the requirement.** Show only relevant advantages. Do not invent capabilities or pressure the client with an intentionally broken Basic option.
8. **Relevant work.** Audience-matched project examples.
9. **Discovery call.** A clear, optional next step to discuss the recommendation and confirm scope.
10. Proposal expiration notice with the exact timestamp.

The recommendation and the client's feasible tier/platform selection are separate fields. Changing the selected variant updates the estimate and comparison without rewriting the original Cortex recommendation.

### 4.4 Proposal access

- Route: `/proposal/?ref=<uuid>` so Firebase can host one static proposal shell.
- The UUID reference identifies a record but is not sufficient to read it.
- The page asks for an auto-generated access key that is delivered by email.
- The key uses ten characters from a non-ambiguous uppercase alphanumeric alphabet.
- The raw key is displayed to Make only during issuance and is never stored in PostgreSQL, logs, analytics, browser storage, or the URL.
- Supabase stores an HMAC-SHA-256 digest produced with a server-only pepper.
- Verification uses a constant-time comparison inside an Edge Function.
- Five consecutive failures lock that proposal for 15 minutes. After the lock period, the failed-attempt counter resets for a new verification window.
- A successful verification resets the counter and returns only the approved proposal view model.
- The page reveals no name, email, business name, recommendation, price, or existence confirmation before successful verification.
- Expired, revoked, unknown, and incorrectly keyed references return the same generic unavailable response.
- Successful access in one browser tab may be cached in `sessionStorage` only for that tab's session and never beyond the proposal expiration timestamp.

This shared access key protects against someone discovering or receiving only the URL. Anyone who possesses the full email containing both the link and key can access the proposal during the 72-hour window; the design does not describe the key as multi-factor authentication.

## 5. Relational Data Changes

The implementation keeps exactly the existing 11 Phase 1 tables. It does not create the reserved CRM/portal tables and does not add a separate proposal table.

### 5.1 `quiz_sessions`

Add these mutable proposal/result columns:

| Column | Type | Required/default | Rule |
|---|---|---|---|
| `selected_tier_key` | `TEXT` | Nullable | When set, one of `basic`, `advanced`, `complete` |
| `selected_platform` | `TEXT` | Nullable | When set, one of `systeme_io`, `gohighlevel`, `custom_app` |
| `selected_offer_key` | `TEXT` | Nullable | FK to `package_catalog.offer_key`, `ON DELETE RESTRICT` |
| `selected_roadmap_snapshot` | `JSONB` | Nullable | Server-produced historical comparison and selection snapshot |
| `proposal_reference` | `UUID` | Nullable | Unique, server-issued public reference |
| `proposal_access_key_hash` | `TEXT` | Nullable | HMAC digest only; raw access key is never stored |
| `proposal_status` | `TEXT` | `not_issued` | `not_issued`, `active`, `expired`, or `revoked` |
| `proposal_issued_at` | `TIMESTAMPTZ` | Nullable | Set after successful proposal issuance |
| `proposal_expires_at` | `TIMESTAMPTZ` | Nullable | Exactly 72 hours after successful initial delivery |
| `proposal_last_viewed_at` | `TIMESTAMPTZ` | Nullable | Updated after successful verification |
| `proposal_failed_attempts` | `INTEGER` | `0` | Non-negative; changed only by trusted verification logic |
| `proposal_locked_until` | `TIMESTAMPTZ` | Nullable | Temporary verification lock |

Constraints require the three selection fields to be either all null or all present. An active proposal requires a completed quiz, lead relationship, result snapshot, selection snapshot, reference, key hash, issue timestamp, and expiry timestamp. Expiry must be later than issue time. Add unique and lookup indexes on `proposal_reference`, plus a partial index on active `proposal_expires_at`.

`result_snapshot` remains the immutable record of the recommendation shown at completion. `selected_roadmap_snapshot` records the visitor's final feasible selection and all three comparison variants. Catalog changes must not retroactively change either snapshot.

### 5.2 `leads`

Add these orchestration columns:

| Column | Type | Required/default | Rule |
|---|---|---|---|
| `proposal_delivery_status` | `TEXT` | `pending` | `pending`, `sent`, `failed`, `stopped`, or `cold` |
| `proposal_sent_at` | `TIMESTAMPTZ` | Nullable | Authoritative start of the follow-up clock |
| `proposal_follow_up_count` | `INTEGER` | `0` | Between 0 and 3 |
| `next_proposal_follow_up_at` | `TIMESTAMPTZ` | Nullable | Indexed due-work timestamp |
| `proposal_follow_up_claim_id` | `UUID` | Nullable | Idempotent claim identifier used by Edge/Make |
| `proposal_follow_up_claimed_at` | `TIMESTAMPTZ` | Nullable | Lease timestamp for recovery |
| `proposal_follow_up_stopped_at` | `TIMESTAMPTZ` | Nullable | Set when booking activity or manual control stops automation |
| `cold_at` | `TIMESTAMPTZ` | Nullable | Set at +96 hours when no booking exists |

Only trusted functions may change these fields. Add a partial index on `next_proposal_follow_up_at` for sent leads that are not stopped and have fewer than three follow-ups. The cold transition sets `crm_stage = 'cold'`, `lead_status = 'cold'`, `proposal_delivery_status = 'cold'`, and `cold_at = now()`.

### 5.3 `analytics_events`

Extend the restricted event allowlist with:

- `lead_contact_submitted`
- `proposal_created`
- `proposal_email_sent`
- `proposal_email_failed`
- `proposal_access_succeeded`
- `proposal_access_failed`
- `proposal_follow_up_sent`
- `proposal_follow_up_stopped`
- `lead_marked_cold`

Event properties stay small and must not contain the raw access key, full email, name, or Make/Gmail secrets.

## 6. Trusted Interfaces

### 6.1 Browser-accessible operations

The frontend uses the publishable Supabase credential and an Anonymous Auth session. Browser-accessible functions must validate `auth.uid()` against the referenced visitor, portfolio session, and quiz session.

- `begin_qualified_quiz(...)`: accepts only owned attribution IDs, audience, first name, business name, normalized email, and consent. It creates/reuses the lead, links it to the quiz session, and returns only `lead_id` and `quiz_session_id`.
- Direct owned inserts create `site_visitors`, `portfolio_sessions`, and `quiz_sessions` using the existing RLS rules.
- Direct quiz updates remain column-limited to `current_step`, `last_completed_step`, and `answers`; protected result, proposal, owner, lead, pricing, and orchestration columns are not granted.
- `update_quiz_lifecycle(...)` changes its resume window from 30 days to 72 hours.

The current broad `persist_quiz_result(...)` execution grant is removed from `authenticated`. Final scoring and proposal issuance move behind the Edge Function boundary.

### 6.2 Edge Functions

#### `finalize-proposal`

Requires the visitor's Anonymous Auth JWT. It:

1. Validates ownership and the linked lead.
2. Reads the server-approved quiz definition and catalog.
3. Re-runs the versioned Cortex calculation server-side from stored answers.
4. Rejects incomplete, unknown, or tampered answer keys.
5. Resolves the original recommendation plus the client's feasible selected tier/platform.
6. Stores immutable recommendation and comparison snapshots using a restricted database function.
7. Generates the reference and access key, stores only the HMAC digest, and marks the proposal pending delivery.
8. Calls the private Make immediate-delivery webhook with a signed, minimal payload.
9. After successful Make acknowledgement, sets `proposal_sent_at`, `proposal_issued_at`, `proposal_expires_at = proposal_sent_at + interval '72 hours'`, `next_proposal_follow_up_at = proposal_sent_at + interval '24 hours'`, and proposal status `active`.
10. Returns only the immediate result view model and expiration time to the owning browser.

If Make delivery fails, the quiz result still appears in the current browser, but the proposal is not represented as emailed or active. The UI shows a retry-email action. Retries reuse the same idempotency identifier and never create a duplicate lead or quiz session.

#### `verify-proposal`

Accepts only proposal reference and access key. It performs expiry, status, lock, HMAC, and attempt checks. On success it returns the client-facing view model. It never returns database identifiers, access-key hashes, owner IDs, internal CRM notes, or Make delivery fields.

#### `make-proposal-followups`

Accepts only requests authenticated by a server-held Make shared secret. It has two operations:

- `claim`: transactionally claims due follow-ups or cold transitions with a UUID lease and returns the minimum email payload.
- `acknowledge`: accepts the claim UUID and delivery outcome, then advances the count and next timestamp or records a safe failure for retry.

The service-role key remains inside Edge Function secrets and is never configured in Make. Make knows only the dedicated Edge endpoint and shared automation secret.

#### `stop-proposal-followups`

The initial delivery function creates a signed, opaque stop token containing only the lead identifier, issued time, and a +96-hour expiration. Each email includes the Edge Function stop URL. The function validates the server signature, sets `proposal_follow_up_stopped_at`, clears `next_proposal_follow_up_at`, and returns a generic confirmation page. It does not expose the lead or proposal. The token is not stored in PostgreSQL and cannot be used for proposal access.

## 7. Make Automation

Two inactive scenarios are built and tested before production activation.

### Scenario A — Immediate proposal delivery

Trigger: private custom webhook called by `finalize-proposal`.

1. Validate the shared signature/secret and required payload shape.
2. Check the Make Data Store for the delivery idempotency key.
3. Build the initial email using the approved Elysha Works template.
4. Include client first name, business name, a short Point A → Point B summary, proposal URL, separate access key, expiration timestamp, and discovery-call CTA.
5. Send through the authorized Gmail connection.
6. Store the idempotency key only after a confirmed Gmail send.
7. Return a minimal success/failure response to the Edge Function.

The scenario uses Make's confidential-data controls when available and the shortest practical execution-log retention. The access key is handled only long enough to place it in the initial email and is never copied to a Make Data Store.

### Scenario B — Scheduled proposal follow-up

Trigger: Make scheduler every 15 minutes. A message becomes eligible only after its exact UTC due timestamp, so delivery may occur up to 15 minutes after the documented offset.

1. Call the Edge Function `claim` operation.
2. If no work is due, stop successfully.
3. Before each email claim, Supabase checks for booking activity and suppresses the sequence when a booking exists.
4. Send the sequence-specific email through Gmail.
5. Call `acknowledge` with the claim UUID and send outcome.
6. Repeat within bounded batch limits.

Schedule behavior:

| Offset from successful initial email | Action |
|---|---|
| +24 hours | Follow-up 1: restate Point A → Point B and invite proposal review |
| +48 hours | Follow-up 2: explain the recommended tier/platform and the value of the next tier |
| +72 hours | Follow-up 3: final reminder and exact access-expiration notice |
| +96 hours | No email; mark lead cold if no booking activity exists |

Any booking row for the lead stops automated proposal follow-up. `scheduled` and `completed` are successful stops. `cancelled` and `no_show` also stop the automated sequence and leave future communication to manual follow-up. A booking click without a completed booking request does not stop the sequence.

The scenario must remain inactive until the verified remote schema, Edge Function secrets, Gmail connection, templates, webhook authentication, and rollback procedure are ready.

## 8. Email Content Boundaries

- Use an Elysha Works sender identity authorized through the existing Make Gmail connection.
- Do not attach a PDF.
- Do not include internal scores, decision traces, admin notes, or raw answer JSON.
- Do not call the result a binding quotation.
- State that final scope is confirmed during a discovery call and proposal process.
- Every automated email includes the signed stop link. A valid stop request sets `proposal_follow_up_stopped_at` and prevents the cold automation from sending more email; business/legal retention remains governed separately.
- A later booking or stop request never tries to retract an already delivered email, but it suppresses every future queued message.

## 9. Security and Abuse Controls

- Anonymous sign-up requires CAPTCHA or Cloudflare Turnstile before production launch.
- Contact submission, finalization, proposal verification, and Make endpoints are rate-limited.
- No raw IP address is stored in portfolio tables.
- Proposal references and access keys are generated with a cryptographically secure random source.
- Security-definer database functions use a fixed empty `search_path`, explicit schema qualification, minimal scalar arguments, default-deny execution grants, and ownership checks where applicable.
- Browser roles cannot list leads, bookings, proposal snapshots belonging to another owner, delivery state, or analytics events.
- Proposal access bypasses owner-device identity only after successful reference/key verification through the Edge Function; there is no public table policy for proposal reads.
- Make/Gmail and Supabase secrets are configured only in their provider secret stores.
- Error responses do not reveal whether a reference, email, lead, or booking exists.

## 10. Tests and Acceptance Criteria

### UI and state

- Contact form appears after audience selection and before Question 1.
- Required validation and consent work without reload.
- Valid contact submission advances to the correct audience quiz.
- Name and business name appear in immediate and protected proposal views.
- Point A precedes Point B, recommendation, comparison, and CTA.
- Basic/Advanced/Complete and feasible platform changes preserve approved prices and guardrails.
- Local recovery expires at 72 hours, not 30 days.
- Mobile and desktop layouts have no horizontal overflow.

### Database/RLS/RPC

- Existing 11 tables remain the complete Phase 1 table set.
- Owners can save only their own quiz progress.
- Direct writes to proposal, result, price, owner, lead, and follow-up columns fail.
- Contact RPC rejects another owner's IDs and unexpected fields.
- Finalization rejects incomplete/tampered answers and incompatible offer selections.
- The proposal snapshot remains historically stable after catalog changes.
- Anonymous users cannot list leads, bookings, proposal results, or analytics events.

### Proposal security

- Correct reference plus key works before expiration.
- Reference alone, wrong key, expired key, revoked key, or locked proposal returns the same generic failure.
- Five failures create a 15-minute lock.
- The raw key never appears in database rows, logs, analytics, URLs, or source control.
- Returned proposal data contains no internal IDs or CRM-controlled fields.

### Automation

- Initial email is idempotent.
- Follow-ups occur only at the approved offsets.
- A booking in any status stops automated follow-up.
- A stop/unsubscribe request stops automated follow-up.
- No booking at +96 hours marks the lead cold without sending a fourth email.
- Make retries cannot create a second lead, quiz session, or proposal.

### Deployment

- Local unit, static, type, lint, build, and browser tests pass.
- Migration static tests and available remote non-destructive checks pass.
- The exact linked Supabase project, migration history, pending migrations, conflicts, and destructive statements are reported before remote application.
- Remote migration waits for explicit target-specific approval.
- Make scenarios are verified while inactive before activation.
- Firebase deployment uses the tested `codex/service-professionals-portfolio` branch worktree and does not alter `firebase.json`, targets, domains, Firestore databases, or unrelated applications.
- Post-deployment checks verify the portfolio, quiz, proposal shell, Supabase RLS/RPC/Edge Functions, email delivery, expiration, booking suppression, and cold transition.

## 11. Delivery Sequence

1. Update `docs/portfolio-blueprint.md` to replace the ungated/PDF/30-day behavior with this approved flow.
2. Add failing UI, Cortex, persistence, schema, RLS, RPC, and automation-contract tests.
3. Implement the contact step, Point A/Point B view model, proposal comparison, and 72-hour browser persistence.
4. Create additive version-controlled migrations for the documented columns, constraints, indexes, grants, and functions.
5. Implement the Supabase browser client boundary and Anonymous Auth session setup.
6. Implement and locally test the Edge Functions and portable server-side Cortex calculation.
7. Verify the exact remote Supabase target and present the required migration safety report.
8. After explicit approval, apply the migrations and deploy the Edge Functions to that exact project.
9. Configure required Edge Function secrets without printing or committing them.
10. Build both Make scenarios in an inactive state, connect the approved Gmail account, and run controlled test deliveries to an owner-approved address.
11. Activate automation only after booking suppression, idempotency, expiry, stop handling, and cold transition are verified.
12. Run the complete application verification suite.
13. Deploy the tested branch output to the existing Firebase Hosting target.
14. Perform read-only production verification and document the result.

## 12. Explicit Non-Goals

- No PDF generation or attachment.
- No new Supabase project.
- No replacement of Firebase Hosting.
- No Firestore mutation or deletion.
- No implementation of the 19 reserved future CRM/portal tables.
- No fake production visitors, leads, bookings, quiz responses, or analytics events.
- No automatic admin assignment.
- No permanent public proposal URL.
- No storage of raw access keys or secrets in `.env.local`, frontend code, Make payload history beyond operational necessity, or version control.
