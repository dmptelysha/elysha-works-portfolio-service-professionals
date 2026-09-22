# Expiring Client Proposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the local portfolio quiz into a Supabase-owned, contact-qualified assessment that issues a personalized access-key-protected proposal for 72 hours, sends three conditional follow-ups through Make, marks unbooked leads cold at +96 hours, and deploys the verified static frontend through the existing Firebase Hosting target.

**Architecture:** Firebase Hosting continues serving a statically exported Next.js portfolio, quiz, and `/proposal/` shell. Supabase Anonymous Auth, PostgreSQL, RLS/RPC, and four Edge Functions own identity, quiz progress, server-verified Cortex finalization, proposal access, and follow-up state. Two inactive Make scenarios deliver the initial Gmail message and poll for due follow-ups; they are activated only after the exact Supabase project and security behavior are verified.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase JS, Supabase PostgreSQL/RLS/RPC/Edge Functions, Deno, Make, Gmail, Firebase Hosting, Vitest, Testing Library, pgTAP, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-expiring-client-proposal-design.md`

## Global Constraints

- Keep exactly the existing 11 Phase 1 `public` tables; do not implement the 19 reserved CRM/portal tables.
- Firebase remains responsible only for the existing static portfolio hosting, domain, SSL, and deployment.
- Do not modify `firebase.json`, `.firebaserc`, Firebase Hosting targets, domains, Firestore databases, or unrelated Firebase applications.
- Contact collection occurs after audience selection and before Question 1; first name, business name, email, and consent are required.
- Proposal access and same-browser recovery expire 72 hours after their documented clocks begin.
- Follow-ups are due at +24, +48, and +72 hours after successful initial delivery; no fourth email is sent; an unbooked lead becomes cold at +96 hours.
- Basic remains functional. Advanced and Complete communicate additional value without inventing capabilities or weakening Basic.
- Keep the seven stable catalog offer keys and approved prices unchanged.
- The raw proposal key, Supabase service-role key, Make webhook URL, Make automation secret, Gmail credentials, CAPTCHA secret, and Google/Firebase browser key must never be committed.
- The historically exposed Google/Firebase browser key must be rotated and restricted before Firebase production deployment; the replacement remains environment-provided and untracked.
- The browser must never call Make or receive a service-role credential.
- Completing the last question requests a server-verified draft; email/access issuance occurs only after the visitor chooses **Create My 3-Day Proposal** with a feasible tier/platform.
- Remote Supabase migration requires the previously requested target-specific report and a new explicit approval after the report is shown.
- Make scenarios remain inactive until schema, functions, secrets, Gmail connection, templates, idempotency, booking suppression, and stop behavior are verified.
- No fake production visitors, leads, bookings, quiz responses, clients, or analytics records may persist.
- All production verification writes must use an owner-approved test address and must be removed or transactionally rolled back where the platform permits.

## Review Focus

- **Identity switching:** an anonymous user must never create, save, finalize, or read a quiz/proposal belonging to another `auth.uid()`.
- **Access-key abuse:** unknown reference, wrong key, expired key, revoked key, and locked proposal must return the same generic response without PII or existence disclosure.
- **Result tampering:** browser-supplied scores, prices, offer keys, result snapshots, CRM status, owner IDs, and follow-up timestamps must be ignored or rejected; the Edge Function recalculates from stored answers and active catalog data.
- **Delivery replay:** retries or duplicate Make executions must not create a second lead/proposal or send the same sequence step more than once under normal acknowledgement behavior.
- **Booking race:** a booking created between follow-up claim and send must suppress the email or stop the sequence at the final pre-send check; cancelled/no-show bookings stop automation and route future contact to manual handling.

---

### Task 1: Make the blueprint authoritative for the approved flow

**Files:**
- Modify: `docs/portfolio-blueprint.md`
- Modify: `docs/supabase-database.md`
- Modify: `docs/superpowers/plans/2026-09-22-roadmap-email-make.md`
- Modify: `tests/live-copy.test.mjs`
- Modify: `tests/supabase-migrations-static.test.mjs`

**Interfaces:**
- Consumes: the approved design spec.
- Produces: one consistent source of truth for the contact-qualified quiz, no-PDF proposal, 72-hour retention, two Make scenarios, and deployment gates.

- [ ] **Step 1: Add failing documentation assertions**

Add assertions to `tests/live-copy.test.mjs` and `tests/supabase-migrations-static.test.mjs` for these exact concepts:

```js
assert.match(blueprint, /first name.*business name.*email/is);
assert.match(blueprint, /Point A.*Point B/is);
assert.match(blueprint, /72 hours/is);
assert.match(blueprint, /\+24.*\+48.*\+72.*\+96/is);
assert.match(blueprint, /access key/is);
assert.doesNotMatch(blueprint, /Email My PDF Roadmap/i);
assert.match(databaseGuide, /finalize-proposal/i);
assert.match(databaseGuide, /verify-proposal/i);
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
node --test tests/live-copy.test.mjs tests/supabase-migrations-static.test.mjs
```

Expected: FAIL because the blueprint still documents the ungated result, 30-day recovery, and PDF proposal.

- [ ] **Step 3: Rewrite the conflicting blueprint sections**

Update Sections 3.3–3.5, 5.0, persistence, security, RPC/Edge Function, retention, delivery phases, acceptance criteria, and Make/email references. Preserve the approved questions, audience definitions, pricing, packages, branding, project strategy, 11-table schema, and Firebase/Supabase responsibility boundary.

State explicitly:

```text
Audience → Contact → Quiz → Point A → Point B → Recommended solution
→ Basic vs Advanced vs Complete → 72-hour proposal → Discovery call
```

Mark `docs/superpowers/plans/2026-09-22-roadmap-email-make.md` as superseded by this plan instead of deleting historical planning context.

- [ ] **Step 4: Update the Supabase operations guide**

Document the four Edge Functions, local/remote environment-variable names, 72-hour window, Make boundaries, remote preflight, function deployment commands, and Firebase deployment order. List names only:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
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

- [ ] **Step 5: Run the focused tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add docs/portfolio-blueprint.md docs/supabase-database.md docs/superpowers/plans/2026-09-22-roadmap-email-make.md tests/live-copy.test.mjs tests/supabase-migrations-static.test.mjs
git commit -m "docs: adopt expiring client proposal flow"
```

---

### Task 2: Create the portable proposal and Cortex view model

**Files:**
- Create: `supabase/functions/_shared/quiz-engine/types.ts`
- Create: `supabase/functions/_shared/quiz-engine/catalog.ts`
- Create: `supabase/functions/_shared/quiz-engine/questions.ts`
- Create: `supabase/functions/_shared/quiz-engine/pricing.ts`
- Create: `supabase/functions/_shared/quiz-engine/roadmap-tiers.ts`
- Create: `supabase/functions/_shared/quiz-engine/roadmap-options.ts`
- Create: `supabase/functions/_shared/quiz-engine/cortex.ts`
- Create: `supabase/functions/_shared/quiz-engine/point-a-point-b.ts`
- Create: `supabase/functions/_shared/quiz-engine/proposal-view.ts`
- Modify: `src/features/quiz/types.ts`
- Modify: `src/features/quiz/catalog.ts`
- Modify: `src/features/quiz/questions.ts`
- Modify: `src/features/quiz/pricing.ts`
- Modify: `src/features/quiz/roadmap-tiers.ts`
- Modify: `src/features/quiz/roadmap-options.ts`
- Modify: `src/features/quiz/cortex.ts`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `tsconfig.json`
- Create: `tests/unit/proposal-view-model.test.ts`
- Modify: `tests/unit/cortex.test.ts`

**Interfaces:**
- Consumes: `CortexResult`, `QuizAnswers`, `RoadmapSelection`, approved quiz definitions, and catalog-backed roadmap variants.
- Produces: `ProposalDraftViewModel`, `ProposalViewModel`, `PointABSummary`, `buildPointABSummary()`, `buildProposalDraft()`, and `buildProposalViewModel()` used by the immediate result and Edge Function.

- [ ] **Step 1: Write failing Point A/Point B tests**

Create fixtures for all three audiences. Assert that the view model uses the selected setup/blocker labels for Point A and the selected goal/capability labels for Point B:

```ts
expect(view.pointA.heading).toBe("Where La Jaysiedel Cakes is now");
expect(view.pointA.evidence).toContain("Through several disconnected tools or spreadsheets.");
expect(view.pointA.evidence).toContain("Production status, delivery, and customer updates are difficult to track.");
expect(view.pointB.heading).toBe("Where the business wants to go");
expect(view.pointB.evidence).toContain("Organize orders, payments, and customer updates.");
```

Assert that the model contains recommendation, original Cortex offer, selected feasible offer, all three comparison tiers, approved prices, expiration timestamp, and no email/internal score trace.

- [ ] **Step 2: Run the focused tests and verify failure**

```powershell
npx vitest run tests/unit/proposal-view-model.test.ts tests/unit/cortex.test.ts
```

Expected: FAIL because the proposal view-model builders do not exist.

- [ ] **Step 3: Add explicit proposal contracts**

Add to `types.ts`:

```ts
export interface LeadContactInput {
  firstName: string;
  businessName: string;
  email: string;
  consent: true;
}

export interface PointABSummary {
  pointA: { heading: string; summary: string; evidence: readonly string[] };
  pointB: { heading: string; summary: string; evidence: readonly string[] };
}

export interface ProposalRecommendationView {
  title: string;
  reason: string;
  buildRoute: BuildRoute;
  platform: PlatformKey;
  offerKey: string;
  offerName: string;
  basePriceUsd: number;
  includedFeatures: readonly string[];
  estimatedProjectInvestmentUsd: number;
}

export interface ProposalContentViewModel {
  client: { firstName: string; businessName: string };
  pointA: PointABSummary["pointA"];
  pointB: PointABSummary["pointB"];
  recommendation: ProposalRecommendationView;
  selection: RoadmapSelection;
  tiers: readonly RoadmapTier[];
}

export interface ProposalDraftViewModel extends ProposalContentViewModel {
  expiresAt: null;
}

export interface ProposalViewModel extends ProposalContentViewModel {
  expiresAt: string;
}
```

Do not put email in `ProposalViewModel` because the proposal page does not need to display it.

- [ ] **Step 4: Implement deterministic Point A/Point B derivation**

Map exact question keys:

```ts
const POINT_A_KEYS = ["q2_setup", "q3_blocker"] as const;
const POINT_B_KEYS = ["q1_goal", "q4_capabilities"] as const;
```

Resolve labels only from the approved active definition. Reject unknown keys instead of echoing browser text. Keep summaries deterministic and audience-aware so client-visible copy is identical in the browser and Edge Function.

- [ ] **Step 5: Move the pure engine into the Edge-compatible shared boundary**

Move the current framework-free types, catalog, questions, pricing, tier mapping, selection, and Cortex calculation into `supabase/functions/_shared/quiz-engine/` using explicit `.ts` relative imports. Export a complete immutable `SCORING_RULES` description covering weights, tie-breaks, feasibility constraints, add-on disposition, and version keys. Keep the existing `src/features/quiz/*.ts` files as thin re-export adapters so component imports remain stable. Enable `allowImportingTsExtensions` in `tsconfig.json` with `noEmit: true`.

- [ ] **Step 6: Render the new content order**

Update `QuizResult` so client identity, Point A, Point B, recommended path, selected package, three-tier comparison, Complete advantages, relevant work, discovery call, and expiry appear in the approved sequence. Keep the existing comparison controls and pricing disclaimers.

- [ ] **Step 7: Run focused tests and typecheck**

```powershell
npx vitest run tests/unit/proposal-view-model.test.ts tests/unit/cortex.test.ts tests/unit/quiz-components.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add supabase/functions/_shared/quiz-engine src/features/quiz tests/unit/proposal-view-model.test.ts tests/unit/cortex.test.ts tests/unit/quiz-components.test.tsx
git commit -m "feat: model personalized point a to point b proposals"
```

---

### Task 3: Add contact qualification and 72-hour browser state

**Files:**
- Create: `src/features/quiz/LeadContactStep.tsx`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/features/quiz/reducer.ts`
- Modify: `src/features/quiz/persistence.ts`
- Modify: `src/features/quiz/types.ts`
- Modify: `src/styles/quiz.css`
- Modify: `src/app/quiz/page.tsx`
- Modify: `tests/unit/quiz-reducer.test.ts`
- Modify: `tests/unit/quiz-persistence.test.ts`
- Modify: `tests/unit/quiz-components.test.tsx`

**Interfaces:**
- Consumes: `LeadContactInput` and selected audience.
- Produces: reducer screen `contact`, action `CONTACT_ACCEPTED`, storage version 3, and `QUIZ_TTL_MS = 72 * 60 * 60 * 1000`.

- [ ] **Step 1: Write failing reducer and persistence tests**

Assert:

```ts
state = quizReducer(state, { type: "SELECT_AUDIENCE", audienceKey: "service_businesses" });
expect(state.screen).toBe("contact");

state = quizReducer(state, {
  type: "CONTACT_ACCEPTED",
  contact: { firstName: "Mara", businessName: "Mara Consulting", email: "mara@example.com", consent: true },
});
expect(state.screen).toBe("intro");
expect(QUIZ_TTL_MS).toBe(72 * 60 * 60 * 1000);
```

Add migration coverage for version-2 attempts: discard pre-contact in-progress records rather than inventing PII; preserve completed local results only until their existing `expiresAt` and never extend them beyond 72 hours from the migration read.

- [ ] **Step 2: Write failing contact-component tests**

Assert required validation, lowercase/trimmed email submission, consent requirement, retained fields on backend failure, no navigation, and accessible error/status messages.

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
npx vitest run tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts tests/unit/quiz-components.test.tsx
```

Expected: FAIL because the contact screen and 72-hour storage version do not exist.

- [ ] **Step 4: Implement reducer and persistence changes**

Use screen order:

```text
audience → contact → intro → question → calculating → result
```

Keep contact fields in component/reducer memory only while submission is pending. The persistence serializer must never write the email address to `localStorage`. After Supabase submission succeeds, persist only owned record IDs and the non-email display identity needed for the temporary result. Update all 30-day UI copy to three days.

- [ ] **Step 5: Build and style the contact form**

Use native inputs with autocomplete values `given-name`, `organization`, and `email`. The consent checkbox text must mention the initial proposal plus up to three follow-ups and the discovery-call suppression rule.

- [ ] **Step 6: Update page metadata**

Replace “without sharing personal information” with accurate contact-qualified assessment language.

- [ ] **Step 7: Run tests, typecheck, and lint**

```powershell
npx vitest run tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts tests/unit/quiz-components.test.tsx
npm run typecheck
npm run lint
```

Expected: PASS with no lint errors.

- [ ] **Step 8: Commit**

```powershell
git add src/features/quiz src/styles/quiz.css src/app/quiz/page.tsx tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts tests/unit/quiz-components.test.tsx
git commit -m "feat: qualify quiz leads before assessment"
```

---

### Task 4: Add the additive proposal migration and approved quiz definitions

**Files:**
- Create: `supabase/migrations/202609220001_add_expiring_proposal_flow.sql`
- Modify: `supabase/seed.sql`
- Modify: `tests/supabase-migrations-static.test.mjs`
- Modify: `supabase/tests/01_schema_and_security.test.sql`
- Modify: `supabase/tests/02_rls_ownership.test.sql`
- Modify: `supabase/tests/03_rpc_and_integrity.test.sql`
- Create: `supabase/tests/04_proposal_flow.test.sql`

**Interfaces:**
- Consumes: existing 11-table schema and approved quiz/Cortex version 1 definitions.
- Produces: proposal columns, orchestration columns, indexes, constraints, grants, `begin_qualified_quiz`, trusted finalization/delivery/access/follow-up functions, and version-1 quiz-definition seed data.

- [ ] **Step 1: Extend the static test with the exact new migration contract**

Append `202609220001_add_expiring_proposal_flow.sql` to `expectedMigrations`. Assert it does not contain `drop table`, `drop schema`, `truncate`, or creation of a twelfth Phase 1 table. Assert it defines:

```text
begin_qualified_quiz
finalize_quiz_proposal
mark_proposal_delivered
verify_proposal_access_state
claim_due_proposal_work
acknowledge_proposal_work
stop_proposal_followups
```

Assert the old `persist_quiz_result` signature is revoked from `authenticated` in the new migration.

- [ ] **Step 2: Add failing pgTAP schema/security tests**

Test every column and constraint from the spec, consent timestamp/version, the three-field selection all-or-none rule, active-proposal completeness, 72-hour lifecycle, follow-up count 0–3, indexes, function privilege boundaries, and RLS-enabled table count of 11.

- [ ] **Step 3: Run static tests and verify failure**

```powershell
npm run test:supabase:static
```

Expected: FAIL because `202609220001_add_expiring_proposal_flow.sql` does not exist.

- [ ] **Step 4: Create the ordered additive migration**

Use `ALTER TABLE ... ADD COLUMN` with named constraints and no data deletion. Add:

```sql
alter table public.quiz_sessions
  add column selected_tier_key text,
  add column selected_platform text,
  add column selected_offer_key text,
  add column selected_roadmap_snapshot jsonb,
  add column proposal_reference uuid,
  add column proposal_access_key_hash text,
  add column proposal_status text not null default 'not_issued',
  add column proposal_issued_at timestamptz,
  add column proposal_expires_at timestamptz,
  add column proposal_last_viewed_at timestamptz,
  add column proposal_failed_attempts integer not null default 0,
  add column proposal_locked_until timestamptz;
```

Add the documented lead orchestration columns, FK to `package_catalog`, unique reference constraint, partial due/expiry indexes, and JSONB object/size checks. Use `ON DELETE RESTRICT` for selected offers.

- [ ] **Step 5: Implement narrow atomic functions**

Every security-definer function uses `set search_path = ''`, schema-qualified names, scalar/minimal JSON inputs, and explicit transaction-safe row locks. `begin_qualified_quiz` is the only new visitor-callable contact RPC. Finalization/delivery/access/follow-up functions are granted only to `service_role`; proposal verification reaches them only through the Edge Function.

Replace the lifecycle function body so every resume sets:

```sql
resume_expires_at = now() + interval '72 hours'
```

Revoke authenticated execution from `submit_lead` and `persist_quiz_result` after the new frontend path is present.

- [ ] **Step 6: Seed the approved quiz definitions idempotently**

Insert exactly three version-1 definitions using the current reviewed question labels/options and the complete `SCORING_RULES` exported by the shared engine. The JSON includes weights, tie-breaks, feasibility constraints, add-on disposition, and this version metadata:

```json
{
  "engine_version": "cortex-local-v0.1",
  "catalog_version": "portfolio-catalog-v0.1",
  "server_verified": true
}
```

Do not invent new questions or answer options. Use `ON CONFLICT (audience_key, version) DO UPDATE` only for the configuration JSON and active flag.

- [ ] **Step 7: Run static and database tests where available**

```powershell
npm run test:supabase:static
npx supabase test db
```

Expected: static PASS. pgTAP PASS when the local database runtime is available; otherwise record the exact Docker/runtime blocker without claiming a pass.

- [ ] **Step 8: Commit**

```powershell
git add supabase/migrations/202609220001_add_expiring_proposal_flow.sql supabase/seed.sql supabase/tests tests/supabase-migrations-static.test.mjs
git commit -m "feat: add secure proposal database workflow"
```

---

### Task 5: Connect the browser to Anonymous Auth and owned quiz records

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/features/quiz/quiz-service.ts`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/features/quiz/reducer.ts`
- Modify: `tests/unit/quiz-components.test.tsx`
- Create: `tests/unit/quiz-service.test.ts`
- Modify: `tests/e2e/portfolio-quiz.spec.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, Anonymous Auth, active quiz definitions, and `begin_qualified_quiz`.
- Produces: `getSupabaseBrowserClient()`, `ensureAnonymousSession()`, `createOwnedQuizContext()`, `submitLeadContact()`, and `saveOwnedQuizProgress()`.

- [ ] **Step 1: Write failing service tests with a fake Supabase client**

Cover anonymous sign-in, existing-session reuse, visitor/session/quiz inserts, definition lookup by audience/version, owned contact RPC arguments, progress saves, retry-safe idempotency, and generic errors that do not print credentials or PII.

- [ ] **Step 2: Add failing component tests**

Assert that successful contact submission advances, pending submission disables duplicate submits, failure retains fields, and question progress calls the service without navigation. Assert that completing the last question calls `finalize-proposal` with operation `preview`, and that **Create My 3-Day Proposal** calls operation `issue` with only the chosen tier/platform and owned quiz ID. The browser never supplies scores or prices.

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
npx vitest run tests/unit/quiz-service.test.ts tests/unit/quiz-components.test.tsx
```

Expected: FAIL because the Supabase service boundary does not exist.

- [ ] **Step 4: Install the official client**

```powershell
npm install @supabase/supabase-js
```

Do not add any service-role package/configuration to frontend code.

- [ ] **Step 5: Implement one browser client singleton**

Fail with a user-safe configuration error when either public variable is absent. Use `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: false`. Never log environment values.

- [ ] **Step 6: Implement the quiz service boundary**

Validate each returned UUID before storing it. Pass `owner_user_id` only from the authenticated session ID, never from component state. Use active `quiz_definitions` data to obtain the UUID/version before inserting `quiz_sessions`.

- [ ] **Step 7: Wire contact and autosave into `QuizExperience`**

Create owned context after audience selection, submit contact through the RPC, then allow intro/questions. Debounce answer progress by 300 ms and flush on Continue. Keep local storage as a 72-hour resilience copy, not the database source of truth.

- [ ] **Step 8: Update E2E request expectations**

Replace the old “no Supabase requests” assertion with routed mock responses for Auth, REST, RPC, and Edge Function endpoints. Assert no full navigation and no request to Firebase/Firestore/Make/Google Analytics.

- [ ] **Step 9: Run unit tests, E2E mock path, typecheck, and lint**

```powershell
npx vitest run tests/unit/quiz-service.test.ts tests/unit/quiz-components.test.tsx
npx playwright test tests/e2e/portfolio-quiz.spec.ts --project=desktop
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add package.json package-lock.json src/lib/supabase src/features/quiz tests/unit/quiz-service.test.ts tests/unit/quiz-components.test.tsx tests/e2e/portfolio-quiz.spec.ts
git commit -m "feat: connect quiz ownership to supabase"
```

---

### Task 6: Implement server-verified finalization and proposal access Edge Functions

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/env.ts`
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/crypto.ts`
- Create: `supabase/functions/_shared/supabase.ts`
- Create: `supabase/functions/_shared/proposal-email.ts`
- Create: `supabase/functions/finalize-proposal/index.ts`
- Create: `supabase/functions/verify-proposal/index.ts`
- Create: `supabase/functions/make-proposal-followups/index.ts`
- Create: `supabase/functions/stop-proposal-followups/index.ts`
- Create: `supabase/functions/tests/proposal-functions.test.ts`
- Modify: `supabase/config.toml`
- Modify: `package.json`

**Interfaces:**
- Consumes: authenticated owner JWT for finalization, reference/key for verification, Make automation secret for claim/ack, server environment secrets, and trusted database functions.
- Produces: four HTTP Edge Function contracts exactly named in the design spec.

- [ ] **Step 1: Write failing Deno tests for shared security helpers**

Test a ten-character non-ambiguous key, HMAC-SHA-256 hashing, constant-time digest comparison, stop-token signing/expiry, strict JSON body size, exact origin allowlist, generic error mapping, and redaction.

Test route behavior with fake database/HTTP adapters:

```ts
Deno.test("wrong and expired proposal keys return the same response", async () => {
  assertEquals(await wrongKey(), { status: 404, body: { error: "proposal_unavailable" } });
  assertEquals(await expiredKey(), { status: 404, body: { error: "proposal_unavailable" } });
});
```

- [ ] **Step 2: Add the Edge test command**

```json
"test:edge": "deno test --allow-env supabase/functions/tests"
```

- [ ] **Step 3: Run and verify failure**

```powershell
npm run test:edge
```

Expected: FAIL because the functions/helpers do not exist. If Deno is unavailable, install the current supported Deno runtime before implementation; do not replace execution with an unverified claim.

- [ ] **Step 4: Implement shared secure helpers**

Allow CORS only from:

```text
https://elyshaworks.com
https://www.elyshaworks.com
http://127.0.0.1:3000
http://localhost:3000
```

Require POST except the stop endpoint's signed GET. Set `Cache-Control: no-store` on every response. Never echo internal exception messages.

- [ ] **Step 5: Implement `finalize-proposal`**

For operation `preview`, read stored answers by owned quiz ID, run the shared engine with active database catalog rows, and return a sanitized draft containing Point A, Point B, recommendation, and feasible tiers without writing proposal access fields or calling Make. For operation `issue`, rerun the calculation, validate the requested selection through `resolveRoadmapSelection`, build snapshots, generate the key/reference, call trusted finalization RPC, send the signed minimal Make payload, and mark delivery only after a successful Make response. Reuse one idempotency UUID on retries.

- [ ] **Step 6: Implement `verify-proposal`**

Accept `{ reference, accessKey }`, call the trusted lock/attempt function, compare HMAC digests, update success/failure atomically, and return only `ProposalViewModel` plus expiry.

- [ ] **Step 7: Implement Make claim/ack and stop functions**

Use the dedicated Make secret, service-role client, UUID claims, 30-minute claim lease, and `claim`/`revalidate`/`acknowledge` operations. The revalidation operation rejects a stale claim or any booking/stop event immediately before Gmail send. `stop-proposal-followups` validates the signed +96-hour token and performs an idempotent stop.

- [ ] **Step 8: Configure per-function JWT behavior**

Keep JWT verification required for `finalize-proposal`. Disable gateway JWT verification only for `verify-proposal`, `make-proposal-followups`, and `stop-proposal-followups`, because those functions implement their own proposal-key or shared-secret verification. Document the reason in `config.toml` comments.

- [ ] **Step 9: Run Edge tests and static secret scans**

```powershell
npm run test:edge
rg -n "service_role|MAKE_.*https://|PROPOSAL_KEY_PEPPER=|AIza[0-9A-Za-z_-]{30,}" src supabase docs --glob '!docs/superpowers/**'
```

Expected: tests PASS; scan contains names/documentation only and no values.

- [ ] **Step 10: Commit**

```powershell
git add supabase/functions supabase/config.toml package.json
git commit -m "feat: secure proposal edge workflow"
```

---

### Task 7: Add the Firebase-compatible protected proposal page

**Files:**
- Create: `src/app/proposal/page.tsx`
- Create: `src/features/proposal/ProposalAccess.tsx`
- Create: `src/features/proposal/proposal-service.ts`
- Create: `src/styles/proposal.css`
- Modify: `src/app/globals.css`
- Create: `tests/unit/proposal-components.test.tsx`
- Modify: `tests/e2e/portfolio-quiz.spec.ts`
- Modify: `tests/live-copy.test.mjs`

**Interfaces:**
- Consumes: static `?ref=` query value, access key, `verify-proposal` response.
- Produces: statically exported `/proposal/index.html`, protected access form, and personalized read-only proposal.

- [ ] **Step 1: Write failing component tests**

Assert no PII before verification, required access key, generic unavailable error, temporary lock messaging without existence disclosure, successful name/business rendering, approved section order, package comparison, booking CTA, expiration, and session-only cache bounded by expiry.

- [ ] **Step 2: Write failing static/E2E assertions**

Assert `out/proposal/index.html` exists after build, URL remains `/proposal/?ref=...`, form submission does not reload, wrong/expired mocked responses look identical, and the page has no horizontal overflow at 320, 390, 768, 1366, and 1920 pixels.

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
npx vitest run tests/unit/proposal-components.test.tsx
node --test tests/live-copy.test.mjs
```

Expected: FAIL because the route does not exist.

- [ ] **Step 4: Implement the static route and service**

Read the query reference in the client component so static export does not require dynamic route generation. Validate UUID shape locally but use the same generic unavailable response for all backend failures. Store only the verified view model and expiry in `sessionStorage`; never store the access key.

- [ ] **Step 5: Implement proposal visual design**

Follow the established dark/gold typography and responsive tokens. Preserve the approved content order and make the three tiers a readable comparison, not a compressed pricing table on mobile.

- [ ] **Step 6: Run tests and production build**

```powershell
npx vitest run tests/unit/proposal-components.test.tsx
npm run build
node --test tests/live-copy.test.mjs
npx playwright test tests/e2e/portfolio-quiz.spec.ts
```

Expected: PASS; `out/proposal/index.html` exists.

- [ ] **Step 7: Commit**

```powershell
git add src/app/proposal src/features/proposal src/styles/proposal.css src/app/globals.css tests/unit/proposal-components.test.tsx tests/e2e/portfolio-quiz.spec.ts tests/live-copy.test.mjs
git commit -m "feat: add protected client proposal page"
```

---

### Task 8: Lock the Make scenario contracts and operator guide

**Files:**
- Create: `docs/make-proposal-automation.md`
- Create: `docs/make-payload-examples/redacted-initial-proposal.json`
- Create: `docs/make-payload-examples/redacted-follow-up-claim.json`
- Modify: `tests/live-copy.test.mjs`

**Interfaces:**
- Consumes: deployed/staged Edge endpoints, scenario-held shared secrets, existing authorized Gmail connection, redacted contract examples.
- Produces: reviewed module contracts and operator instructions for scenarios `Elysha Works — Proposal Delivery` and `Elysha Works — Proposal Follow-up`; the actual inactive scenarios are created after the backend endpoints exist in Task 12.

- [ ] **Step 1: Add failing documentation contract assertions**

Assert the guide names both scenarios, every module in order, confidential-data setting, 15-minute schedule, Data Store idempotency key, pre-send booking check, stop behavior, no PDF, and activation checklist.

- [ ] **Step 2: Write redacted payload contracts**

The initial example contains:

```json
{
  "delivery_id": "00000000-0000-4000-8000-000000000000",
  "first_name": "Example",
  "business_name": "Example Business",
  "recipient_email": "owner-approved-test@example.invalid",
  "point_a_summary": "Redacted example",
  "point_b_summary": "Redacted example",
  "proposal_url": "https://elyshaworks.com/proposal/?ref=00000000-0000-4000-8000-000000000000",
  "access_key": "REDACTED",
  "expires_at": "2030-01-01T00:00:00Z",
  "discovery_call_url": "https://elyshaworks.com/booking/",
  "stop_url": "https://example.invalid/stop?token=REDACTED"
}
```

No payload example contains a usable email, webhook, token, key, or secret.

- [ ] **Step 3: Run the documentation test and verify failure**

```powershell
node --test tests/live-copy.test.mjs
```

Expected: FAIL because the Make guide does not exist.

- [ ] **Step 4: Document Scenario A's exact inactive module contract**

Document modules in this order:

```text
Custom Webhook → Secret/shape filter → Data Store lookup
→ Router (sent/active/new) → Data Store create `processing`
→ Gmail Send Email → Data Store update `sent` → Webhook Response
```

The failure route updates the same delivery record to `failed`; a stale `processing` record is retryable only after its documented lease. Enable confidential scenario data when the account supports it. The Gmail subject is `Your 3-day Elysha Works roadmap for {{business_name}}`. The email contains the proposal link and separate key, not a PDF. The raw access key is never copied into the Data Store.

- [ ] **Step 5: Document Scenario B's exact inactive module contract**

Document modules in this order:

```text
15-minute Scheduler → HTTP claim → Empty-work filter
→ HTTP final booking check → Gmail Send Email → HTTP acknowledge
```

Use the sequence number returned by Supabase to select the +24, +48, or +72 template. Cold transitions are acknowledged without a Gmail module.

- [ ] **Step 6: Document exact modules and rollback**

Record scenario names/IDs, module order, connection names without tokens, webhook/secret storage locations without values, test procedure, activation switch, and rollback: deactivate both scenarios, revoke Make secret, then disable Edge delivery while retaining database records.

- [ ] **Step 7: Run docs tests and commit**

```powershell
node --test tests/live-copy.test.mjs
git add docs/make-proposal-automation.md docs/make-payload-examples tests/live-copy.test.mjs
git commit -m "docs: define make proposal automations"
```

---

### Task 9: Complete local/static verification and branch review

**Files:**
- Modify: only the specific source/test file implicated by a failing command, with the failure and fix recorded in the task log.

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: a tested commit ready for remote preflight.

- [ ] **Step 1: Run the complete local/static suite**

```powershell
npm test
npm run test:supabase:static
npm run test:edge
npm run typecheck
npm run lint
npm run build
npm run test:e2e
git diff --check
```

Expected: all available commands PASS. If Docker is available, also run:

```powershell
npx supabase db reset
npx supabase test db
npx supabase db lint --level warning
npx supabase db diff --local --schema public
```

Expected: migrations reproduce from zero, pgTAP PASS, no lint errors, and no unexpected schema diff. If Docker is unavailable, record these four commands as not run.

- [ ] **Step 2: Scan tracked content for secrets**

```powershell
git grep -n -E "(service_role|postgres(ql)?://|AIza[0-9A-Za-z_-]{30,}|sb_secret_|MAKE_PROPOSAL_WEBHOOK_URL=https://|PROPOSAL_KEY_PEPPER=.+)"
git check-ignore -v .env.local public/booking/booking-config.mjs
git ls-files .env.local public/booking/booking-config.mjs
```

Expected: no secret value in tracked files; both local files ignored; `git ls-files` empty for them.

- [ ] **Step 3: Review branch scope**

```powershell
git status --short
git diff origin/codex/service-professionals-portfolio...HEAD --stat
git log --oneline origin/codex/service-professionals-portfolio..HEAD
```

Exclude test artifacts and preserve unrelated user work.

- [ ] **Step 4: Push the verified branch**

```powershell
git push origin codex/service-professionals-portfolio
```

Expected: remote branch advances to the verified commit.

---

### Task 10: Produce the target-specific Supabase and Firebase preflight report

**Files:**
- Create: `docs/deployment/2026-09-22-client-proposal-preflight.md`

**Interfaces:**
- Consumes: authenticated Supabase/Firebase CLI read-only state and verified local migrations.
- Produces: the exact approval report required before remote database mutation.

- [ ] **Step 1: Verify authenticated project identity read-only**

Run without printing tokens or URLs containing credentials:

```powershell
npx supabase@latest projects list
npx supabase@latest migration list --linked
npx firebase-tools projects:list
npx firebase-tools use
```

Match the linked Supabase reference to the public URL host and the owner-confirmed project name. Match Firebase to `elyshaworks-fd2dc` and hosting site `elysha-works-portfolio`.

- [ ] **Step 2: Inspect remote Supabase objects read-only**

Use supported CLI inspection/dry-run commands to list migration history, schemas, tables, functions, policies, and pending changes. Do not run `db pull`, `migration repair`, `db reset`, or a non-dry-run push.

- [ ] **Step 3: Scan pending SQL for destructive behavior**

Report every `ALTER`, `CREATE OR REPLACE`, and `REVOKE`. Confirm no table/schema drop, rename, truncate, data deletion, or unrelated object replacement. Describe privilege changes to `submit_lead`/`persist_quiz_result` and the lifecycle-function replacement as intentional non-data-destructive behavior changes, not “entirely additive.”

- [ ] **Step 4: Verify remote Auth settings separately**

Record whether Anonymous Auth and CAPTCHA/Turnstile are enabled in the dashboard. SQL migrations do not count as enabling either setting. Never request or display CAPTCHA secrets.

- [ ] **Step 5: Write and present the preflight report**

Include:

```text
Supabase project name and reference
linked environment
existing remote objects/data summary
remote migration history
pending migration and seed list
all altered/replaced/revoked objects
conflict scan
destructive-statement scan
exact dry-run output summary
exact intended deployment commands
Firebase project/site/branch/commit
Make scenario contract readiness and confirmation that no scenario is active before backend deployment
```

- [ ] **Step 6: Stop for explicit approval**

Do not apply the Supabase migration or deploy Edge Functions until the owner explicitly approves this exact report and project reference.

---

### Task 11: Apply and verify the approved Supabase target

**Files:**
- Modify: `src/generated/database.types.ts`
- Modify: `docs/deployment/2026-09-22-client-proposal-preflight.md`

**Interfaces:**
- Consumes: explicit approval from Task 10.
- Produces: remote schema, Edge Functions, configured secrets, generated types, and read-only verification evidence.

- [ ] **Step 1: Re-run dry run immediately before deployment**

```powershell
npx supabase@latest db push --linked --include-seed --dry-run
```

Abort if output differs from the approved report.

- [ ] **Step 2: Apply the approved migrations and seed**

```powershell
npx supabase@latest db push --linked --include-seed
```

Never use remote reset or destructive migration repair.

- [ ] **Step 3: Configure core Edge secrets without printing values**

Use an ignored temporary env file and the supported `supabase secrets set --env-file` workflow for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PROPOSAL_KEY_PEPPER`, `PROPOSAL_STOP_SIGNING_SECRET`, and `PUBLIC_PROPOSAL_BASE_URL`. Verify names with `supabase secrets list`; do not print values. Make-specific secrets are configured only after Scenario A creates its webhook in Task 12.

- [ ] **Step 4: Deploy the four functions to the same project**

```powershell
npx supabase@latest functions deploy finalize-proposal
npx supabase@latest functions deploy verify-proposal --no-verify-jwt
npx supabase@latest functions deploy make-proposal-followups --no-verify-jwt
npx supabase@latest functions deploy stop-proposal-followups --no-verify-jwt
```

- [ ] **Step 5: Run read-only remote verification**

Confirm 11 tables, columns, constraints, indexes, RLS, grants, policies, functions, three quiz definitions, seven packages, add-ons, and zero fake transactional rows. Confirm unrelated objects remain unchanged.

- [ ] **Step 6: Generate remote TypeScript types safely**

Generate to a temporary file, add the generated header, compare, then replace only `src/generated/database.types.ts`:

```powershell
npx supabase@latest gen types typescript --linked --schema public
```

- [ ] **Step 7: Run post-generation typecheck and commit**

```powershell
npm run typecheck
git add src/generated/database.types.ts docs/deployment/2026-09-22-client-proposal-preflight.md
git commit -m "chore: record proposal backend deployment"
git push origin codex/service-professionals-portfolio
```

---

### Task 12: Create and verify Make, activate automation, and deploy Firebase Hosting

**Files:**
- Modify: `docs/deployment/2026-09-22-client-proposal-preflight.md`

**Interfaces:**
- Consumes: verified remote Supabase functions, reviewed Make contracts, authorized Gmail connection, tested frontend build, Firebase target.
- Produces: active email automation and deployed portfolio/quiz/proposal frontend.

- [ ] **Step 1: Create both Make scenarios and leave them inactive**

Create `Elysha Works — Proposal Delivery` and its Custom Webhook first. Generate independent high-entropy `MAKE_PROPOSAL_WEBHOOK_SECRET` and `MAKE_AUTOMATION_SECRET` values without displaying them in chat, source files, documentation, or command output. Configure Scenario A and Scenario B exactly as documented in Task 8. Keep scheduling off.

- [ ] **Step 2: Configure Make-specific Edge secrets**

Add `MAKE_PROPOSAL_WEBHOOK_URL`, `MAKE_PROPOSAL_WEBHOOK_SECRET`, and `MAKE_AUTOMATION_SECRET` to the verified Supabase project through an ignored env file. Confirm secret names only. Re-run a safe health request showing that the functions detect their configuration without returning values.

- [ ] **Step 3: Run controlled Make tests while inactive**

Use one owner-approved address. Send one initial proposal test, verify link/key/access/expiry presentation, then simulate claim payloads for sequence 1–3 without waiting three days. Verify duplicate delivery ID suppression and failed Gmail handling. Remove or clearly label the controlled test record after evidence capture without touching real leads.

- [ ] **Step 4: Verify booking and stop suppression**

Use non-production fixtures or rolled-back test records to prove a booking in each status stops automation and a signed stop link clears future due work. Do not claim production behavior from mocked tests alone.

- [ ] **Step 5: Activate both Make scenarios**

Activate `Elysha Works — Proposal Delivery` first, then `Elysha Works — Proposal Follow-up`. Record scenario IDs and activation timestamps without secrets.

- [ ] **Step 6: Perform final Firebase preflight**

```powershell
git branch --show-current
git status --short
npm test
npm run typecheck
npm run lint
npm run build
npx firebase-tools use
```

Require branch `codex/service-professionals-portfolio`, a clean tracked worktree, successful tests/build, Firebase project `elyshaworks-fd2dc`, and Hosting site `elysha-works-portfolio`.

Also require evidence that the historically exposed Google/Firebase browser key has been rotated, the replacement is restricted to approved HTTP referrers and required APIs, `.env.local` contains the replacement only, and the old key is revoked. Stop deployment if this evidence is unavailable.

- [ ] **Step 7: Deploy only Firebase Hosting**

```powershell
npx firebase-tools deploy --only hosting --project elyshaworks-fd2dc
```

Do not include Firestore, Functions, Auth, Storage, or another Firebase product in the command.

- [ ] **Step 8: Verify production read-only behavior**

Check homepage sections, Projects tabs/scroll preview, `/quiz/`, contact qualification, anonymous session creation, autosave, finalization, `/proposal/`, correct/wrong/expired key behavior, package comparison, booking CTA, mobile overflow, and security headers. Confirm Firebase Hosting and Firestore configuration/resources are unchanged.

- [ ] **Step 9: Complete the deployment report**

Record:

```text
Supabase project name/reference
migrations and Edge Functions deployed
remote verification results
Make scenario IDs/status
Gmail test result
Firebase project/site/release
tests and exact pass counts
generated types path
manual Turnstile/Auth dashboard status
secret rotation status
remaining legal retention decision
confirmation of no fake transactional data
confirmation Firestore was untouched
```

- [ ] **Step 10: Commit and push the final report**

```powershell
git add docs/deployment/2026-09-22-client-proposal-preflight.md
git commit -m "docs: record client proposal production release"
git push origin codex/service-professionals-portfolio
```
