# Verified Lead and Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the OTP-verified quiz lead flow, improved roadmap/proposal presentation, and confirmed-delivery dialog to the existing Supabase and Firebase production targets without exposing secrets or creating unverified leads.

**Architecture:** The browser uses Supabase passwordless email OTP to replace the temporary anonymous session with a verified permanent identity before creating any qualified quiz context or lead. A versioned restricted PostgreSQL RPC derives canonical identity fields from `auth.users`; the React quiz keeps unverified contact data only in component memory. Existing Cortex, catalog, proposal, Make, and 72-hour access infrastructure remain authoritative, while result/proposal components render the complete approved catalog and real project imagery.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, Vitest/Testing Library, Supabase Auth/PostgreSQL/RLS/Edge Functions, pgTAP/static migration tests, Make Gmail delivery, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-09-23-verified-lead-roadmap-design.md`

## Global Constraints

- Keep exactly the existing 11 Phase 1 tables; do not add reserved CRM/portal tables.
- Do not modify Firebase Hosting targets, `firebase.json`, domains, SSL, Firestore, or unrelated applications.
- Do not invent prices, package inclusions, page counts, scoring rules, projects, testimonials, leads, bookings, visitors, or analytics data.
- Unverified contact PII is memory-only and never enters the saved quiz snapshot, URL, analytics, logs, or Git.
- Qualified-lead creation requires `is_anonymous = false`, confirmed Auth email, matching owned context IDs, and approved consent.
- Gmail/SMTP credentials live only in Supabase Auth configuration and Make; no credential value belongs in `.env.local` or source.
- Proposal success is displayed only after Make returns its durable idempotent delivery receipt.
- Remote Supabase changes require the existing target-specific safety report and explicit approval before `db push`.
- Direct-to-calendar booking remains disabled until the separate booking backend implements and verifies the one-time handoff consumer.

## Review Focus

1. A returning email replaces the anonymous session with a different `auth.uid()`; the application must create the qualified context only after verification and never reuse pre-verification owned IDs.
2. A slow or repeated OTP/proposal click must not create duplicate leads, proposals, or emails.
3. A cached old frontend may call `begin_qualified_quiz_v2`; it must receive an upgrade response during the compatibility window rather than create an unverified lead.
4. A proposal delivery HTTP 200 without the matching durable delivery ID must remain an error/retry state.
5. Long inclusions, long client/business names, unavailable platforms, and missing project images must not clip or cause horizontal scrolling at 320–2560 px.

---

### Task 1: Add the passwordless OTP client contract and branded local template

**Files:**
- Create: `src/features/quiz/EmailOtpStep.tsx`
- Create: `supabase/templates/magic-link.html`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/_shared/quiz-engine/types.ts`
- Modify: `src/features/quiz/quiz-service.ts`
- Test: `tests/unit/quiz-service.test.ts`
- Test: `tests/unit/quiz-components.test.tsx`
- Test: `tests/supabase-migrations-static.test.mjs`

**Interfaces:**
- Produces: `LeadContactInput.lastName`, `EmailOtpChallenge`, `requestEmailOtp(email, captchaToken)`, `verifyEmailOtp(email, token)`, and `<EmailOtpStep />`.
- Consumes: Supabase browser client, `signInWithOtp`, `verifyOtp`, and current Turnstile token.

- [ ] **Step 1: Write failing type/service tests**

Add assertions proving the contact contract requires `lastName`, OTP request normalizes the email and permits account creation, and OTP verification uses the six-digit email token:

```ts
await requestEmailOtp(" Person@Example.com ", "turnstile-token", fake.client);
expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({
  email: "person@example.com",
  options: { shouldCreateUser: true, captchaToken: "turnstile-token" },
});

await verifyEmailOtp(" Person@Example.com ", "123456", fake.client);
expect(fake.auth.verifyOtp).toHaveBeenCalledWith({
  email: "person@example.com",
  token: "123456",
  type: "email",
});
```

- [ ] **Step 2: Run the focused tests and observe RED**

Run: `npx vitest run tests/unit/quiz-service.test.ts tests/unit/quiz-components.test.tsx`

Expected: FAIL because the OTP methods, last-name field, and OTP component do not exist.

- [ ] **Step 3: Implement the minimal OTP service and component**

Add:

```ts
export interface EmailOtpChallenge {
  email: string;
  requestedAt: string;
  resendAvailableAt: string;
}

export async function requestEmailOtp(email: string, captchaToken: string, client?: SupabaseClient) { /* Supabase signInWithOtp */ }
export async function verifyEmailOtp(email: string, token: string, client?: SupabaseClient) { /* Supabase verifyOtp + verified user guard */ }
```

`EmailOtpStep` must render a masked address, six-digit numeric input, Verify, Change email, and a 60-second resend countdown. It must return generic errors and never display account-existence information.

- [ ] **Step 4: Add the local OTP template and config**

Create an Elysha Works HTML email using `{{ .Token }}` and no confirmation-link dependency. Add:

```toml
[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = true
otp_expiry = 600

[auth.email.template.magic_link]
subject = "Your Elysha Works verification code"
content_path = "./supabase/templates/magic-link.html"
```

Do not add SMTP credentials to `config.toml`; hosted template and Gmail SMTP configuration remain dashboard actions.

- [ ] **Step 5: Run focused tests and static checks GREEN**

Run: `npx vitest run tests/unit/quiz-service.test.ts tests/unit/quiz-components.test.tsx`

Run: `npm run test:supabase:static`

Expected: all selected tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/features/quiz/EmailOtpStep.tsx src/features/quiz/quiz-service.ts supabase/functions/_shared/quiz-engine/types.ts supabase/templates/magic-link.html supabase/config.toml tests/unit/quiz-service.test.ts tests/unit/quiz-components.test.tsx tests/supabase-migrations-static.test.mjs
git commit -m "Add verified email OTP client flow"
```

---

### Task 2: Add verified lead identity columns and restricted RPC

**Files:**
- Create: `supabase/migrations/202609230001_add_verified_lead_identity.sql`
- Modify: `supabase/tests/01_schema_and_security.test.sql`
- Modify: `supabase/tests/03_rpc_and_integrity.test.sql`
- Modify: `tests/supabase-migrations-static.test.mjs`

**Interfaces:**
- Produces: `leads.auth_user_id`, `leads.email_verified_at`, and `begin_verified_qualified_quiz(...)`.
- Consumes: the existing 11-table schema, `auth.uid()`, `auth.jwt()`, `auth.users`, owned visitor/session/quiz rows, and consent version `proposal_followup_v1`.

- [ ] **Step 1: Write failing schema/security assertions**

Assert both columns, FK/indexes, fixed search path, grants, anonymous rejection, canonical Auth email, last-name validation, same-business idempotency, different-business creation, and cross-owner denial. Assert that the additive migration does not revoke `begin_qualified_quiz_v2`.

Representative pgTAP call:

```sql
select results_eq(
  $$select submission_status, lead_id is not null
    from public.begin_verified_qualified_quiz(
      '31000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      'rpc_audience','Elysha','Corpuz','Elysha Works',true,'proposal_followup_v1',null
    )$$,
  $$values ('accepted'::text, true)$$,
  'verified owner creates a qualified lead'
);
```

- [ ] **Step 2: Run static tests and observe RED**

Run: `npm run test:supabase:static`

Expected: FAIL because the migration/function is absent.

- [ ] **Step 3: Implement the additive migration**

The migration must:

```sql
alter table public.leads
  add column auth_user_id uuid,
  add column email_verified_at timestamptz,
  add constraint leads_auth_user_id_fkey foreign key (auth_user_id)
    references auth.users(id) on delete set null,
  add constraint leads_last_name_check check (
    last_name is null or length(btrim(last_name)) between 1 and 120
  );

create index leads_auth_user_updated_idx
  on public.leads (auth_user_id, updated_at desc)
  where auth_user_id is not null;
```

`begin_verified_qualified_quiz` must have the exact arguments declared in the spec, use `SECURITY DEFINER SET search_path = ''`, reject anonymous JWTs, read canonical email/confirmation time from `auth.users`, validate ownership, assign protected defaults internally, and return only the minimal status tuple. Grant execution only to `authenticated` after revoking `public`, `anon`, and `authenticated` defaults.

- [ ] **Step 4: Run static tests GREEN and pgTAP when available**

Run: `npm run test:supabase:static`

Run when Docker is available: `npx supabase@latest test db`

Expected: static tests pass; pgTAP result is reported honestly as pass or Docker-blocked.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/202609230001_add_verified_lead_identity.sql supabase/tests/01_schema_and_security.test.sql supabase/tests/03_rpc_and_integrity.test.sql tests/supabase-migrations-static.test.mjs
git commit -m "Add verified qualified lead RPC"
```

---

### Task 3: Gate quiz initialization and persistence behind verified email

**Files:**
- Modify: `src/features/quiz/reducer.ts`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/features/quiz/LeadContactStep.tsx`
- Modify: `src/features/quiz/quiz-service.ts`
- Modify: `src/features/quiz/persistence.ts`
- Modify: `supabase/functions/_shared/quiz-engine/types.ts`
- Test: `tests/unit/quiz-reducer.test.ts`
- Test: `tests/unit/quiz-persistence.test.ts`
- Test: `tests/unit/quiz-components.test.tsx`
- Test: `tests/unit/quiz-service.test.ts`

**Interfaces:**
- Consumes: Task 1 OTP functions/component and Task 2 `begin_verified_qualified_quiz`.
- Produces: reducer screen `verify_email`, actions `OTP_REQUESTED`, `OTP_VERIFIED`, `CHANGE_EMAIL`, and a verified-only `createOwnedQuizContext` call path.

- [ ] **Step 1: Write failing reducer/persistence/component tests**

Pin these behaviors:

```ts
state = quizReducer(state, { type: "SELECT_AUDIENCE", audienceKey: "service_businesses" });
expect(state.screen).toBe("contact");

state = quizReducer(state, { type: "OTP_REQUESTED", contact, challenge });
expect(state.screen).toBe("verify_email");
render(<QuizExperience service={service} />);
await user.click(screen.getByRole("button", { name: /service-based businesses/i }));
await user.type(screen.getByLabelText(/first name/i), contact.firstName);
await user.type(screen.getByLabelText(/last name/i), contact.lastName);
await user.type(screen.getByLabelText(/business name/i), contact.businessName);
await user.type(screen.getByLabelText(/^email$/i), contact.email);
await user.click(screen.getByRole("checkbox"));
await user.click(screen.getByRole("button", { name: /send verification code/i }));
const saved = window.localStorage.getItem(QUIZ_STORAGE_KEY) ?? "";
expect(saved).not.toContain(contact.email);
expect(saved).not.toContain(contact.firstName);
expect(saved).not.toContain(contact.businessName);
```

Component tests must assert `createOwnedQuizContext` and `begin_verified_qualified_quiz` are not called before `verifyEmailOtp` succeeds, and that a replaced `auth.uid()` owns all subsequently created context rows.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `npx vitest run tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts tests/unit/quiz-components.test.tsx tests/unit/quiz-service.test.ts`

Expected: FAIL on absent verification screen/actions and premature context initialization.

- [ ] **Step 3: Implement verified-only orchestration**

Remove the audience-level eager `ensureOwnedContext` effect. Contact submission requests OTP and transitions to `verify_email`. Successful verification performs, in order:

```ts
await service.verifyEmailOtp(challenge.email, token);
const context = await service.createOwnedQuizContext(audienceKey, approvedAttribution);
const result = await service.submitVerifiedLeadContact(context, verifiedContact);
```

Only an accepted/reused lead advances to `intro`. Same/another-business selection remains after verification. Clear contact/challenge data from state when changing email, starting over, or completing setup.

- [ ] **Step 4: Preserve safe recovery without PII**

Keep `SavedQuizAttempt` limited to audience, answers, progress, result, selection, versions, and timestamps. Do not add name, business, email, OTP token, Auth IDs, or lead IDs. A resumed attempt without an active verified session returns to contact verification instead of trying protected writes.

- [ ] **Step 5: Run focused and full unit suites GREEN**

Run: `npx vitest run tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts tests/unit/quiz-components.test.tsx tests/unit/quiz-service.test.ts`

Run: `npm run test:unit`

Expected: all unit tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/features/quiz/reducer.ts src/features/quiz/QuizExperience.tsx src/features/quiz/LeadContactStep.tsx src/features/quiz/EmailOtpStep.tsx src/features/quiz/quiz-service.ts src/features/quiz/persistence.ts supabase/functions/_shared/quiz-engine/types.ts tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts tests/unit/quiz-components.test.tsx tests/unit/quiz-service.test.ts
git commit -m "Require verified email before quiz lead creation"
```

---

### Task 4: Redesign the roadmap and protected proposal presentation

**Files:**
- Create: `src/features/quiz/RelatedWorkCards.tsx`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `src/features/quiz/RoadmapComparison.tsx`
- Modify: `src/features/proposal/ProposalAccess.tsx`
- Modify: `src/styles/quiz.css`
- Modify: `src/styles/proposal.css`
- Test: `tests/unit/quiz-components.test.tsx`
- Test: `tests/unit/proposal-components.test.tsx`
- Test: `tests/e2e/portfolio-quiz.spec.ts`

**Interfaces:**
- Consumes: existing `PROJECTS[].coverImage`, approved catalog `includedFeatures`, and current proposal view model.
- Produces: shared related-work image cards, two-column Point A/B layout, compact client heading, and complete inclusions.

- [ ] **Step 1: Write failing visual-structure tests**

Assert:

```ts
expect(screen.getByTestId("point-a-b-row")).toContainElement(screen.getByRole("heading", { name: proposal.pointA.heading }));
expect(screen.getAllByRole("img", { name: /project preview/i }).length).toBeGreaterThan(0);
for (const feature of selectedOffer.includedFeatures) expect(screen.getByText(feature)).toBeVisible();
```

Add E2E viewport checks at 320, 390, 768, 1366, 1920, and 2560 widths that assert `document.documentElement.scrollWidth <= window.innerWidth` and that the heading/Point A/B cards are not clipped.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `npx vitest run tests/unit/quiz-components.test.tsx tests/unit/proposal-components.test.tsx`

Expected: FAIL because current components slice inclusions and related work has no images.

- [ ] **Step 3: Implement the shared presentation**

Replace all `includedFeatures.slice(0, 4|5|6)` calls with the complete approved list under **Included pages, screens & systems**. Use a native `<details>` disclosure only on narrow screens; all content remains in the DOM and keyboard-accessible.

Render related work from `PROJECTS` using each real `coverImage`, a fixed aspect-ratio wrapper, descriptive alt text, and lazy loading. Keep the project kind/title/summary; do not add performance claims.

Wrap Point A and Point B in a shared `point-a-b-row`. Use CSS grid with two equal columns above the mobile breakpoint and one column below it. Set the client heading with `font-size: clamp(...)`, `white-space: nowrap` only where the measured container can support it, and mobile wrapping/overflow guards.

- [ ] **Step 4: Run focused tests and browser E2E GREEN**

Run: `npx vitest run tests/unit/quiz-components.test.tsx tests/unit/proposal-components.test.tsx`

Run: `npx playwright test tests/e2e/portfolio-quiz.spec.ts`

Expected: unit tests and configured browser checks pass. If Playwright browser binaries are unavailable, report the blocker and do not claim viewport verification passed.

- [ ] **Step 5: Commit**

```powershell
git add src/features/quiz/RelatedWorkCards.tsx src/features/quiz/QuizResult.tsx src/features/quiz/RoadmapComparison.tsx src/features/proposal/ProposalAccess.tsx src/styles/quiz.css src/styles/proposal.css tests/unit/quiz-components.test.tsx tests/unit/proposal-components.test.tsx tests/e2e/portfolio-quiz.spec.ts
git commit -m "Improve roadmap and proposal presentation"
```

---

### Task 5: Make proposal delivery immediate, explicit, and idempotent

**Files:**
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `src/styles/quiz.css`
- Modify: `supabase/functions/finalize-proposal/index.ts`
- Modify: `supabase/functions/_shared/proposal-email.ts`
- Test: `tests/unit/quiz-components.test.tsx`
- Test: `supabase/functions/tests/proposal-functions.test.ts`

**Interfaces:**
- Consumes: existing auto-issue effect, proposal idempotency key, Make webhook acknowledgement, and `delivery_id`.
- Produces: modal states `sending | success | error`, automatic one-time issuance, and durable receipt validation.

- [ ] **Step 1: Write failing modal and Edge Function tests**

Assert that the modal is visible with **Preparing and sending your proposal...** before the unresolved `issueProposal` promise settles; that success requires a matching `delivery_id`; and that retry reuses the same idempotency key without duplicate finalization.

```ts
const deferred = createDeferred<IssuedProposal>();
service.issueProposal.mockReturnValueOnce(deferred.promise);
await completeQuiz();
expect(screen.getByRole("dialog")).toHaveTextContent(/preparing and sending/i);
deferred.resolve(issuedProposal);
expect(await screen.findByText(/success! your proposal is ready/i)).toBeVisible();
```

- [ ] **Step 2: Run focused tests and observe RED**

Run: `npx vitest run tests/unit/quiz-components.test.tsx`

Run: `deno test --allow-env supabase/functions/tests/proposal-functions.test.ts`

Expected: FAIL because `sending` is not a dialog state and the durable receipt requirement is incomplete.

- [ ] **Step 3: Implement the delivery state machine**

Set `proposalDialog = "sending"` before awaiting issue. Sending cannot be dismissed into a second issue request. Success uses masked email copy plus View My Roadmap and Book a Discovery Call. Error states that the on-screen roadmap remains available and provides one idempotent Retry email action. Remove the redundant bottom Create My 3-Day Proposal control from `QuizResult`.

The Edge Function accepts Make success only when `accepted === true` and the returned `delivery_id` exactly equals the requested delivery ID. Record that ID using existing trusted proposal state and return a sanitized success response to the owner.

- [ ] **Step 4: Run focused tests GREEN**

Run: `npx vitest run tests/unit/quiz-components.test.tsx`

Run: `deno test --allow-env supabase/functions/tests/proposal-functions.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/quiz/QuizExperience.tsx src/features/quiz/QuizResult.tsx src/styles/quiz.css supabase/functions/finalize-proposal/index.ts supabase/functions/_shared/proposal-email.ts tests/unit/quiz-components.test.tsx supabase/functions/tests/proposal-functions.test.ts
git commit -m "Confirm proposal delivery in quiz flow"
```

---

### Task 6: Prepare—but do not falsely enable—the direct booking handoff

**Files:**
- Create: `docs/contracts/quiz-booking-handoff.md`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `src/features/proposal/ProposalAccess.tsx`
- Modify: `docs/portfolio-blueprint.md`
- Test: `tests/unit/quiz-components.test.tsx`
- Test: `tests/unit/proposal-components.test.tsx`
- Test: `tests/live-copy.test.mjs`

**Interfaces:**
- Produces: an exact issuer/consumer contract and safe current-form fallback.
- Consumes: the external booking backend at `https://crm.elyshaworks.com`, which is not implemented in this repository.

- [ ] **Step 1: Write a failing contract/static test**

Assert `docs/contracts/quiz-booking-handoff.md` exists and contains the opaque-token, hash, ten-minute TTL, atomic single-use, replay rejection, no-PII URL, and safe-form fallback requirements. Keep the existing component assertions that the CTA remains `/booking/` and contains no name/email/business query parameters.

- [ ] **Step 2: Run focused tests and observe RED only for the new contract marker**

Run: `npm run test:static`

Expected: FAIL because the booking handoff contract file does not exist.

- [ ] **Step 3: Document the exact external contract**

Define `POST /v1/handoffs/consume` behavior: opaque 256-bit token, server-stored SHA-256 hash, ten-minute TTL, intended audience, atomic `consumed_at`, replay rejection, no PII in the URL/logs, App Check/server authentication, and generic fallback. Document that the portfolio issuer cannot be enabled until this endpoint passes contract tests in the booking backend repository.

- [ ] **Step 4: Keep production fallback safe**

Leave the CTA pointed at `/booking/` and the existing form. Add no fake client-side prefill. Update the blueprint to mark direct-to-date selection as blocked on the external consumer rather than complete.

- [ ] **Step 5: Run tests GREEN and commit**

Run: `npm run test:static`

Run: `npx vitest run tests/unit/quiz-components.test.tsx tests/unit/proposal-components.test.tsx`

```powershell
git add docs/contracts/quiz-booking-handoff.md docs/portfolio-blueprint.md src/features/quiz/QuizResult.tsx src/features/proposal/ProposalAccess.tsx tests/live-copy.test.mjs tests/unit/quiz-components.test.tsx tests/unit/proposal-components.test.tsx
git commit -m "Define secure quiz booking handoff"
```

---

### Task 7: Update authoritative documentation

**Files:**
- Modify: `docs/portfolio-blueprint.md`
- Modify: `docs/supabase-database.md`
- Modify: `.env.example` only if it already exists; never create or commit a secret value
- Test: `tests/live-copy.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–6 behavior and the remotely applied schema.
- Produces: authoritative setup/deployment instructions. Generated database types are produced after remote application in Task 9.

- [ ] **Step 1: Write failing documentation/static assertions**

Assert documentation contains verified-email-first flow, Gmail dashboard configuration without values, OTP template, 60-second resend, 10-minute OTP expiry, v2 compatibility/revocation procedure, complete inclusions, proposal acknowledgement rule, and booking-handoff dependency.

- [ ] **Step 2: Run static tests RED**

Run: `npm run test:static`

Expected: FAIL on the newly required documentation statements.

- [ ] **Step 3: Update blueprint and operations guide**

Replace the old anonymous-contact-first description. Clearly separate local Auth template configuration from hosted Dashboard Gmail SMTP settings. List only non-secret configuration names. Preserve Firebase/Firestore boundaries and the existing remote approval gate.

- [ ] **Step 4: Run static tests GREEN and commit**

Run: `npm run test:static`

```powershell
git add docs/portfolio-blueprint.md docs/supabase-database.md tests/live-copy.test.mjs
git commit -m "Document verified proposal workflow"
```

---

### Task 8: Full local verification and remote safety preflight

**Files:**
- No production-file changes unless a failing test drives a fix.
- Update execution ledger with exact results.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified candidate commit and target-specific deployment report.

- [ ] **Step 1: Run the complete local verification matrix**

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
npx supabase@latest db diff --local --schema public
```

Expected: every available command exits 0. Unavailable Docker/browser dependencies are reported as blockers, never as passes.

- [ ] **Step 2: Verify Git and secret hygiene**

Run:

```powershell
git status --short
git diff --check HEAD~1..HEAD
git ls-files .env .env.local public/booking/booking-config.mjs .firebase test-results
git grep -n -I -E "service_role|smtp.*pass|MAKE_AUTOMATION_SECRET=.*|sb_secret_" -- . ":(exclude)package-lock.json"
```

Expected: secret/local-artifact files are untracked/ignored and no secret values are committed.

- [ ] **Step 3: Inspect the linked Supabase target read-only**

```powershell
npx supabase@latest projects list
npx supabase@latest migration list --linked
npx supabase@latest db push --linked --dry-run
```

Record project name/reference, current objects/data presence, migration history, pending migration list, conflicts, every `ALTER`/`CREATE OR REPLACE`/`REVOKE`, and destructive-statement scan. The initial batch contains only `202609230001_add_verified_lead_identity.sql`; the v2 retirement migration does not exist yet and therefore cannot be applied accidentally.

- [ ] **Step 4: Present the remote approval gate**

Show the exact target, additive migration, function deployments, Firebase target, Make changes, manual Gmail Dashboard steps, and intended commands. Wait for explicit approval before any remote-changing command.

- [ ] **Step 5: Commit any test-driven verification fixes**

Only if tests required fixes, commit each RED→GREEN correction with its test. Otherwise do not create an empty commit.

---

### Task 9: Configure hosted Auth, deploy, and smoke-test production

**Files:**
- Remote Supabase Auth settings and Edge Functions.
- Existing Firebase Hosting target only.
- Make scenario configuration only as required for durable delivery acknowledgement.

**Interfaces:**
- Consumes: explicit target-specific approval from Task 8 and owner-authorized Gmail credentials entered without exposing them.
- Produces: live verified quiz/result/proposal release; direct booking remains on the safe form until its separate backend gate passes.

- [ ] **Step 1: Configure hosted Supabase Auth manually/safely**

In the verified Supabase project, configure the approved Gmail SMTP host/port/user/password or supported credential, sender identity, Magic Link/OTP template containing `{{ .Token }}`, 10-minute expiry, 60-second resend interval, Anonymous Auth, Turnstile, and reviewed rate limits. Never print or paste credentials into chat, commands, logs, or repository files.

- [ ] **Step 2: Apply only the approved additive migration**

Confirm the pending list contains only the approved additive migration; the retirement migration is intentionally not created until Step 6. Do not use migration repair or delete migration history. Run the exact approved `npx supabase@latest db push --linked` command and verify the remote columns/function/grants read-only.

- [ ] **Step 3: Deploy changed Edge Functions and verify Make acknowledgement**

Deploy `finalize-proposal` to the confirmed project. Run one owner-approved controlled email test to the approved test address. Verify Make returns the exact delivery ID, the email arrives, the proposal window starts at confirmed delivery, and a retry does not duplicate the email.

- [ ] **Step 4: Generate types, rebuild, and deploy Firebase Hosting only**

```powershell
npx supabase@latest gen types typescript --linked --schema public | Set-Content -Encoding utf8 src/generated/database.types.ts
npm run test
npm run typecheck
npm run build
npx firebase-tools deploy --only hosting --project elyshaworks-fd2dc
```

Do not deploy Firestore, Functions, Storage, or unrelated Firebase resources.

- [ ] **Step 5: Smoke-test live production**

Test new and returning email OTP, same/another-business paths, no-reload questions, result calculation, complete inclusions, project images, sending/success/error dialog, email delivery, proposal access key, 72-hour timestamp, duplicate prevention, and booking-form fallback. Confirm no fake records remain from controlled testing beyond the explicitly approved test identity/lead policy.

- [ ] **Step 6: Observe compatibility and create the v2 retirement migration later**

After the initial compatibility interval, create `supabase/migrations/202609230002_return_upgrade_for_unverified_quiz_rpc.sql` with a controlled `upgrade_required` response and failing-then-passing static/pgTAP tests. Present and apply it only through a second remote approval gate. After a further stale-client observation interval shows no v2 calls, create `supabase/migrations/202609230003_revoke_unverified_quiz_rpc.sql`, present a third approval gate, revoke browser execution, and verify anonymous/unverified calls are rejected.

- [ ] **Step 7: Push the verified branch and report**

```powershell
git push origin codex/service-professionals-portfolio
```

Report commits, exact targets, migrations/functions deployed, Gmail/Make status without credentials, Firebase version, live smoke results, deferred Docker tests, and the still-gated external booking handoff.
