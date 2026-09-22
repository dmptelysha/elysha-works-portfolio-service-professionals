# Verified Lead, Roadmap, and Booking Handoff Design

**Date:** September 23, 2026

**Status:** Draft for owner review

**Source of truth to update during implementation:** `docs/portfolio-blueprint.md`

**Supersedes:** The contact-verification, result-layout, package-detail, proposal-delivery UI, and quiz-to-booking portions of `2026-09-22-expiring-client-proposal-design.md`. The existing 72-hour access, follow-up, security, Cortex, catalog, and Make-delivery decisions remain in force unless this document changes them explicitly.

## 1. Outcome

The assessment will verify that the visitor controls the submitted email address before Elysha Works creates a qualified lead or starts a proposal email sequence. After verification, the visitor completes the no-reload quiz, immediately sees a personalized Point A-to-Point B roadmap, receives the protected proposal by email, and can move to discovery-call date selection without retyping contact information.

The result and protected proposal will also be easier to scan:

- Point A and Point B appear side by side on desktop and stack on small screens.
- The client/business heading is smaller and stays on one desktop line when the available width permits.
- Each package shows the complete approved scope, including approved page, step, screen, module, workflow, integration, and automation inclusions.
- Related work uses the real project preview image already stored in the repository.
- Proposal delivery opens an immediate progress dialog and changes to success only after the delivery service confirms the email.

## 2. Goals and Non-Goals

### Goals

1. Reduce automated and mistyped-email abuse with CAPTCHA, email OTP verification, cooldowns, and generic responses.
2. Require first name, last name, business name, email, consent, and successful OTP verification before creating or reusing a lead.
3. Keep quiz interactions client-side between questions, with no page reload.
4. Preserve database ownership through `auth.uid()` and use only verified, non-anonymous identities for qualified-lead creation.
5. Preserve the approved seven-offer catalog and Cortex recommendation logic. The UI may group offers as Basic, Advanced, and Complete but may not invent prices or inclusions.
6. Make the result/proposal composition responsive and visually consistent with the existing Elysha Works brand.
7. Reuse verified contact data when the client books from the result/proposal flow, without placing PII in the URL.

### Non-goals

- No new CRM/portal tables.
- No changes to Firebase Hosting ownership, custom domain, SSL, or Firestore.
- No invented package prices, page counts, claims, testimonials, projects, or scoring rules.
- No raw OTP codes, SMTP passwords, service-role keys, or Make secrets in public tables, browser environment variables, logs, documentation, or Git.
- No attempt to guarantee that screenshots, browser developer tools, or source viewing can be prevented.

## 3. Approved User Journey

1. The quiz page immediately shows the three audience choices.
2. The visitor selects an audience. The choice is held locally; no qualified lead is created yet.
3. The contact step asks for first name, last name, business name, email, and proposal/follow-up consent.
4. Submitting valid details starts Supabase email OTP verification behind Turnstile protection.
5. The interface changes in place to a six-digit verification-code step. It shows a masked email, a resend countdown, Change email, and Verify actions.
6. A correct code signs the visitor into a verified, non-anonymous Supabase Auth identity. Only then does the application create or reuse the owned visitor/session/quiz context and call the restricted lead RPC.
7. If the verified identity already has a lead for a business, the interface asks whether the assessment is for that business or another business. It never reveals data belonging to a different authenticated identity.
8. The visitor answers the audience-specific questions without page navigation or reload. Progress is stored under the verified owner's `auth.uid()` and has the approved 72-hour resume window.
9. The trusted Cortex endpoint recalculates the result from stored answers and approved catalog data.
10. The result appears with Point A, Point B, recommendation, full package comparison, related-work imagery, and the discovery-call action.
11. Proposal issuance begins automatically after the trusted result is finalized. A dialog opens immediately in a **Sending your proposal** state so the page never appears frozen.
12. The dialog becomes **Success! Your proposal is ready.** only after Make confirms the initial email was sent. It includes View My Roadmap and Book a Discovery Call actions.
13. If delivery fails, the dialog keeps the result available in the current browser and offers Retry email. It must not claim that an email was sent.
14. Booking from the verified quiz/proposal flow uses a short-lived, single-use server handoff. The booking page skips the contact form and opens date/time selection. A visitor entering the booking page directly still sees the normal contact form.

## 4. Email OTP and Identity Design

### 4.1 Provider and sender

Use Supabase Auth email OTP, not a custom OTP stored in PostgreSQL. Configure the email template to show the six-digit `Token`. Production OTP delivery uses Supabase custom SMTP authenticated with the owner's approved Gmail account. Proposal and follow-up delivery uses the same approved sender identity through the authorized Make Gmail connection.

The exact Gmail address, SMTP username, App Password or OAuth credential, and other credentials are dashboard/connection secrets. They are never committed or copied into `.env.local`. The default Supabase email sender is suitable only for limited development testing and must not be treated as the production sender. Gmail sending limits still apply, so delivery and rate-limit monitoring are required before increasing traffic.

### 4.2 Session transition

The contact flow calls `signInWithOtp` for the normalized email, with account creation allowed. This gives the same outward response for a new or returning address and avoids an email-existence oracle. `verifyOtp` completes the sign-in.

Qualified quiz initialization is deliberately deferred until after OTP verification. This avoids transferring a quiz or lead from a temporary anonymous user to a different permanent user. If a portfolio-level anonymous session already exists, it remains an anonymous attribution record; the verified quiz receives a new owned context and copies only approved attribution fields such as source, campaign, referrer host, and landing path. It does not copy protected identifiers or arbitrary browser data.

After verification, every qualified-lead RPC verifies all of the following:

- `auth.uid()` is present;
- the JWT `is_anonymous` claim is false;
- `auth.users.email_confirmed_at` is present;
- the normalized requested email equals the authenticated user's normalized email;
- every supplied visitor, portfolio-session, and quiz-session identifier belongs to the same `auth.uid()`.

### 4.3 Abuse controls

- Turnstile remains required for starting OTP and Anonymous Auth operations in production.
- The Send code button locks while pending.
- Resend is unavailable for at least 60 seconds after a successful request.
- The verification view accepts exactly six digits and limits UI retries. Supabase Auth remains authoritative for server-side expiry and verification throttling.
- Errors use generic copy such as: **We could not verify that code. Check it or request a new one.**
- The UI must not say whether an email already has an account or lead.
- No proposal, initial proposal email, or follow-up is created until OTP verification and consent both succeed.
- The consent timestamp is recorded after verification, not when the unverified form is first submitted.

### 4.4 Repeat assessments

A returning verified user may reuse an existing business lead or choose **Another business**. Same-business reuse updates consent and last-contact timestamps but does not overwrite historical proposal snapshots. Another-business creates a separate lead tied to the same authenticated user and verified email.

Business matching is based on the authenticated user plus a normalized business name, not on a global email lookup. This prevents cross-user disclosure and permits one person to assess multiple businesses.

## 5. Data and Database Changes

The implementation keeps exactly the existing 11 Phase 1 tables.

### 5.1 `leads`

Add these columns in an additive migration:

| Column | Type | Rule |
|---|---|---|
| `auth_user_id` | `UUID` nullable FK to `auth.users(id)` | `ON DELETE SET NULL`; set internally from `auth.uid()` for verified quiz leads |
| `email_verified_at` | `TIMESTAMPTZ` nullable | Set from trusted verification state, never accepted from the browser |

The existing `last_name` column will be required by the new verified quiz RPC but remains nullable at table level for compatibility with legitimate existing rows. Add an index on `(auth_user_id, updated_at desc)` and a lookup index on `(auth_user_id, email, business_name)` only if the query plan confirms it supports the repeat-assessment path.

Do not add a unique constraint on email: one verified person may own multiple business leads, and historical leads must not be collapsed.

### 5.2 Restricted lead RPC

Create a versioned `begin_verified_qualified_quiz` function rather than silently changing the existing function signature. It accepts the minimum contact and owned-context fields:

- visitor/session/quiz identifiers;
- audience key;
- first name;
- last name;
- business name;
- normalized email;
- consent boolean and approved consent version;
- optional same-business/another-business choice.

It derives `auth_user_id`, verification time, CRM defaults, source, timestamps, and ownership internally. It returns only submission status, lead ID, quiz-session ID, and—only for the same authenticated user's repeat-assessment decision—the existing business display name.

The function is `SECURITY DEFINER`, uses `SET search_path = ''`, schema-qualifies every object, validates all ownership relationships, and is executable only by `authenticated`. A permanent authenticated user and an anonymous authenticated user share the PostgreSQL role, so the function must additionally reject `is_anonymous = true`.

### 5.3 Rollout compatibility

Database rollout is additive first:

1. Add columns, indexes, constraints, and the new RPC.
2. Deploy and verify the OTP-capable frontend and generated types.
3. Confirm the live quiz uses only the new RPC.
4. In a separate migration, revoke browser execution of `begin_qualified_quiz_v2`.

This order avoids a live outage while ensuring the legacy unverified path is removed promptly after the new client is active. No table, data, schema, or existing proposal record is dropped or reset.

## 6. Result and Proposal Presentation

### 6.1 Hero/header

Use a compact client-specific heading such as:

> Elysha Works roadmap for Acme Studio

On desktop, the heading uses a responsive single-line treatment with a controlled `clamp()` font size and wider content container. It may wrap naturally on tablet and mobile; clipping or horizontal scrolling is never allowed.

### 6.2 Point A and Point B

Point A and Point B share one equal-height two-column row from tablet/desktop widths upward. Each card contains its label, short heading, summary, and evidence list. On mobile they stack in reading order: Point A, then Point B.

### 6.3 Package comparison and inclusions

Basic, Advanced, and Complete remain the public comparison tiers. For each feasible platform/tier card, show:

- offer name and exact approved starting price;
- primary outcome;
- **Included pages, screens & systems** list containing every approved `includedFeatures` entry;
- relevant approved add-ons and scope-review items;
- platform feasibility or an explicit unavailable reason;
- the concrete advantage of moving to the next tier.

Remove the current five/six-item slicing of `includedFeatures`. The UI may use a disclosure control on small screens, but all approved inclusions must remain accessible. It must not turn generic capabilities into invented page counts. Literal counts appear only where the catalog already approves them, such as **up to 5 primary pages/steps**.

### 6.4 Related work

Each audience-matched related-work card uses the project's real `coverImage`, title, category, and short relevance statement. Images use the existing protected repository assets, responsive `sizes`, descriptive alt text, fixed aspect ratio, and lazy loading below the fold. If a project lacks a real image, show a branded non-claiming placeholder; do not fabricate client screenshots.

### 6.5 Delivery dialog

The result page no longer requires a bottom **Create My 3-Day Proposal** action. Trusted finalization starts issuance automatically once per completed quiz using the existing idempotency controls.

Dialog states:

| State | Required message/action |
|---|---|
| `sending` | **Preparing and sending your proposal...**; progress indicator; result remains behind the modal |
| `success` | **Success! Your proposal is ready.**; confirms delivery to the masked email; View My Roadmap; Book a Discovery Call |
| `error` | Explains that the roadmap is still visible in this browser; Retry email; never claims delivery |

The success state is driven by the Make delivery acknowledgement already used to start the exact 72-hour proposal window. Closing and reopening the result must not send a duplicate email.

## 7. Direct Booking Handoff

Because the booking application is a separate surface, contact information must not be passed through query parameters, `localStorage`, or a readable JWT.

The proposal/quiz booking action requests a short-lived, single-use opaque handoff token from trusted server logic. The server stores or signs only the minimum claims required to resolve:

- verified Supabase user ID;
- lead ID;
- first name and last name;
- normalized verified email;
- business name;
- quiz/proposal attribution;
- issued-at, expiry, nonce, and intended booking audience.

The browser receives only the opaque token and navigates to the booking application. The booking backend validates the token server-to-server, marks it consumed, prepopulates the intake record, and opens date/time selection. Recommended lifetime: ten minutes. Reuse, expiry, audience mismatch, or invalid signature falls back to the normal booking form without revealing which check failed.

This capability depends on a corresponding trusted endpoint in the booking backend at `crm.elyshaworks.com`. The portfolio must not fake direct booking with client-stored PII if that endpoint is unavailable.

## 8. Component and Service Boundaries

Expected frontend responsibilities:

- `LeadContactStep`: collect first/last name, business, email, and consent; start verification.
- `EmailOtpStep`: masked-address display, six-digit code, countdown, resend, change-email, and verification states.
- `QuizExperience`: keep audience/contact local until verification, initialize verified context, preserve no-reload question flow, and coordinate sending/success/error modal states.
- `RoadmapComparison`: render complete approved inclusions without hard slicing.
- `QuizResult` and `ProposalAccess`: share Point A/B row, compact header, package detail, related-work image cards, and booking handoff action.
- `quiz-service`: wrap Auth OTP calls, verified-context initialization, versioned lead RPC, proposal issuance, and booking-handoff request.

The shared proposal view model adds last name only where the experience needs it. Public proposal responses must not expose email, internal auth IDs, lead IDs, access hashes, delivery secrets, CRM notes, or Make identifiers.

## 9. Error and Recovery Rules

- OTP request failure keeps all contact entries and consent state.
- OTP verification failure keeps the code view and permits a controlled retry or resend.
- Context initialization failure after successful OTP offers Retry setup without resending an OTP.
- Repeat-business choice failure keeps the verified identity and entered business data.
- Cortex/finalization failure preserves the verified contact and quiz answers for the 72-hour resume window.
- Proposal delivery failure does not invalidate the on-screen roadmap.
- Booking-handoff failure falls back to the normal booking form and never blocks proposal access.
- All client messages distinguish **verification**, **calculation**, and **email delivery** failures instead of using one generic connection error.

## 10. Testing Requirements

### Unit and component tests

- Contact form requires first name, last name, business name, valid email, consent, and security readiness.
- OTP view masks email, requires six digits, enforces countdown, and preserves Change email.
- Audience/contact state does not create a lead before verification.
- Successful verification initializes the owned context and proceeds without reload.
- Existing-business choice is shown only for the same verified identity.
- Point A/B render in one desktop row and stack on mobile.
- Client heading has no clipping at 320, 390, 768, 1366, 1920, and 2560 widths.
- All catalog inclusions render; no `slice(0, 5)` or `slice(0, 6)` remains on proposal/package details.
- Related-work cards render the real project image.
- Sending dialog appears before network completion; success appears only after acknowledgement; retry is idempotent.
- Direct booking requests a handoff and does not place PII in the URL.

### Database and security tests

- New columns, FK, indexes, function, grants, and fixed search path exist.
- Anonymous authenticated users cannot call the verified lead RPC.
- Verified user can create/reuse only their own lead and owned context.
- Authenticated email mismatch, unconfirmed email, cross-owner IDs, protected-field input, and invalid consent are rejected.
- Same email can create separate leads for different businesses under the same auth user.
- A different auth user receives no existence signal for another user's email or business.
- Legacy v2 execution is revoked after the client cutover.

### End-to-end checks

- New email: OTP -> quiz -> result -> confirmed email -> proposal access.
- Returning email: OTP -> same business and another business paths.
- Invalid/expired code, resend cooldown, Turnstile failure, SMTP failure, Make failure, and retry.
- Result/proposal visual checks across phone, tablet, laptop, 1920x1080, and 2560x1440.
- Booking CTA with valid, reused, expired, and invalid handoff token.
- No fake transactional records remain after tests; remote test writes run inside guaranteed rollbacks or use designated disposable test identities with explicit cleanup approval.

## 11. Deployment and Configuration

1. Add tests and implementation locally; run typecheck, unit/component tests, static database tests, build, and lint.
2. Configure a non-production Supabase Auth email template and the approved Gmail SMTP sender before production smoke testing.
3. Inspect the exact linked Supabase project, remote migrations, functions, policies, and pending SQL.
4. Present the required remote migration safety report and wait for explicit approval before any database push.
5. Apply the additive migration and deploy required Edge Functions.
6. Configure the production Gmail sender in Supabase Auth and verify the Google account's security, App Password/OAuth setup, sender identity, and delivery limits without exposing credentials.
7. Deploy the OTP frontend to Firebase Hosting, smoke-test, then apply the legacy-RPC revocation migration.
8. Add the trusted booking-backend handoff endpoint before enabling the direct-to-date-selection behavior.
9. Generate updated TypeScript database types only after the verified remote schema is live.

Required non-secret environment/configuration names will be documented in the blueprint. Secret values remain only in Supabase Auth/Edge Function secrets, Make connections/secrets, and the booking backend's secret store.

## 12. Acceptance Criteria

- A lead cannot be created through the qualified quiz flow until the submitted email is OTP-verified.
- The verified lead stores first name, last name, business name, normalized email, auth user relationship, verification timestamp, and consent without accepting protected CRM defaults from the client.
- OTP and account responses do not reveal whether an email already exists.
- The quiz continues without page reload and resumes for at most 72 hours.
- Point A and Point B are side by side except on mobile/small layouts.
- The personalized heading is visually smaller, single-line where space permits, and never clipped.
- All approved package inclusions are visible, including approved pages/steps/screens/modules and systems.
- Related work includes real repository project imagery.
- The delivery dialog appears immediately, and success is shown only after confirmed email delivery.
- Proposal issuance is idempotent; reopening does not duplicate email.
- Verified quiz clients can proceed to date selection through a secure one-time handoff; direct visitors still receive the normal booking form.
- No PII or secret appears in the booking URL, frontend environment, analytics, logs, or Git.
- Firebase Hosting and Firestore responsibilities remain unchanged.
