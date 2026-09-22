# Roadmap Email and Make Scenario Implementation Plan

> **SUPERSEDED — DO NOT IMPLEMENT.** This historical PDF/optional-email plan was replaced on September 22, 2026 by [`2026-09-22-expiring-client-proposal.md`](2026-09-22-expiring-client-proposal.md) and its owner-approved design spec. The current flow requires contact qualification before Question 1, a no-PDF access-key-protected proposal, 72-hour access, +24/+48/+72 follow-ups, and a +96 cold transition. This file is retained only for planning history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor voluntarily submit their name and email after viewing/selecting a roadmap, persist the owned result and lead safely in Supabase, and send a personalized PDF through a private Make scenario using the existing Google and Gmail connections.

**Architecture:** The browser signs in anonymously and writes only owner-scoped quiz progress. A restricted RPC validates the selected tier/platform against the stored answers and active catalog, creates or reuses the lead, and generates a server-authoritative delivery payload. A Supabase Edge Function forwards that payload to an API-key-protected Make webhook; Make creates a Google Doc from an approved template, downloads it as PDF, conditionally includes the discovery-call CTA, and sends through Gmail.

**Tech Stack:** Supabase Anonymous Auth, PostgreSQL/RLS/RPC, Supabase Edge Functions (Deno/TypeScript), `@supabase/supabase-js`, Next.js/React, Make Webhooks, Google Docs, Google Drive, Gmail, pgTAP/static migration tests, Vitest, Playwright.

**Spec:** `docs/portfolio-blueprint.md`, especially Sections 3.5, 5.0, 7, 8, 10, 11, and 12.

## Global Constraints

- Implement this plan only after `2026-09-22-three-tier-quiz-roadmap.md` passes completely.
- The on-page roadmap remains visible before contact submission; email is optional.
- A lead is created only after voluntary email submission or successful booking.
- Never trust browser-supplied prices, owners, lead IDs, CRM fields, delivery status, or Make payloads.
- The browser must never call Make directly or receive the Make webhook URL/API key.
- The Supabase `service_role` key must never appear in frontend code, generated client types, or documentation.
- Production Make secrets live only in Supabase Edge Function secrets; Gmail OAuth remains inside Make.
- Do not add a twelfth Phase 1 table. Store selection and delivery state on `quiz_sessions` and keep the exact 11-table boundary.
- Do not create fake visitors, leads, bookings, or analytics rows in the production database.
- Do not automatically delete generated Google Docs/PDF artifacts until retention is separately approved.
- Do not activate the Make schedule/webhook for production traffic until end-to-end verification and explicit activation approval.
- Do not modify Firebase Hosting, `firebase.json`, hosting targets, domains, or Firestore.

## Review Focus

- Replay/duplicate submission: repeated clicks or Edge retries must reuse the same quiz/lead and must not send duplicate emails after `sent`.
- Ownership attack: another anonymous user’s visitor/session/quiz IDs must fail without revealing whether the records exist.
- Price manipulation: changing tier/platform/offer/add-on fields in the browser must be rejected or recomputed from active catalog data and stored quiz answers.
- Booking race: Make must use the latest server-supplied booking state at send time; requested/scheduled/completed calls suppress the discovery CTA.
- Partial failure: Make timeout or Gmail failure must leave a retryable `failed` state, never `sent`, and must not create another lead.

---

### Task 1: Add server-authoritative roadmap selection and delivery state

**Files:**
- Create: `supabase/migrations/202609220001_add_roadmap_email_delivery.sql`
- Modify: `supabase/tests/01_schema_and_security.test.sql`
- Modify: `supabase/tests/03_rpc_and_integrity.test.sql`
- Modify: `tests/supabase-migrations-static.test.mjs`

**Interfaces:**
- Consumes: existing `quiz_sessions`, `leads`, `bookings`, `package_catalog`, `addon_catalog`, `submit_lead()` and ownership model.
- Produces: selection/delivery columns, `public.persist_quiz_result_v2(...)`, and `public.request_roadmap_email(...)` returning one server-built JSON payload.

- [ ] **Step 1: Write failing static and database tests**

Assert these nullable selection columns and delivery fields exist on `quiz_sessions`:

```text
selected_tier_key TEXT
selected_platform TEXT
selected_offer_key TEXT REFERENCES public.package_catalog(offer_key) ON DELETE RESTRICT
roadmap_email_status TEXT NOT NULL DEFAULT 'not_requested'
roadmap_email_requested_at TIMESTAMPTZ
roadmap_email_sent_at TIMESTAMPTZ
roadmap_email_attempt_count INTEGER NOT NULL DEFAULT 0
```

Require named constraints:

```text
quiz_sessions_selected_tier_check: basic, advanced, complete
quiz_sessions_selected_platform_check: systeme_io, gohighlevel, custom_app
quiz_sessions_roadmap_email_status_check: not_requested, pending, sent, failed
quiz_sessions_roadmap_email_attempt_count_check: >= 0
```

Assert `persist_quiz_result_v2` and `request_roadmap_email` exist, `PUBLIC` and `anon` cannot execute either function, and only `authenticated` can execute them.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:supabase:static
npx supabase test db
```

Expected: static test FAILS because the migration/function does not exist. If Docker is unavailable, record the exact pgTAP command as unexecuted rather than claiming it passed.

- [ ] **Step 3: Add columns, checks, FK, and indexes**

Create the additive migration. Add indexes only for known operations:

```sql
create index quiz_sessions_selected_offer_idx
  on public.quiz_sessions (selected_offer_key)
  where selected_offer_key is not null;

create index quiz_sessions_roadmap_email_pending_idx
  on public.quiz_sessions (roadmap_email_requested_at)
  where roadmap_email_status in ('pending', 'failed');
```

Reuse the existing shared `updated_at` trigger; do not add a new table or destructive statement.

- [ ] **Step 4: Add a versioned result-persistence RPC with bounded display copy**

Keep the existing `persist_quiz_result` signature for compatibility and add `persist_quiz_result_v2` instead of replacing or dropping it. The v2 function keeps the existing server-side offer/add-on price calculation and accepts one additional `p_display_copy_snapshot jsonb` object with exactly these optional keys:

```text
recommended_solution_title
diagnosis_summary
recommendation_reason
future_phase_suggestions
```

Require a JSON object no larger than 12 KB. Reject unknown keys; limit each text value to 1,000 characters; require `future_phase_suggestions` to be an array of no more than five strings of at most 300 characters each. Store this bounded copy under `result_snapshot.display_copy`. Prices, offer names, included features, selected add-ons, ownership, and status continue to come from database-controlled values. This permits personalized presentation copy without allowing the browser to control money or CRM fields.

- [ ] **Step 5: Implement the restricted request RPC**

Create:

```sql
public.request_roadmap_email(
  p_quiz_session_id uuid,
  p_first_name text,
  p_email text,
  p_selected_tier_key text,
  p_selected_platform text,
  p_selected_offer_key text
) returns table (delivery_payload jsonb)
```

The `SECURITY DEFINER` function must use `set search_path = ''` and schema-qualified objects. It must:

1. require `auth.uid()`;
2. lock a completed quiz owned by that UID;
3. validate nonblank first name and a conservative email shape/length;
4. map tier/platform to the expected stable offer key and reject mismatches;
5. allow `custom_complete` only for Complete + Custom App when the stored recommendation is `custom_complete`;
6. read Q8 support keys from stored `answers`, map only allowlisted keys to active add-ons for the selected route, and recompute inclusion/priced/scope-review data from `package_catalog` and `addon_catalog`;
7. create or reuse the quiz-linked lead with CRM values assigned internally;
8. persist selected tier/platform/offer and merge a `visitor_selection` object into `result_snapshot`;
9. set `roadmap_email_status = 'pending'`, increment attempts only for a new/retryable request, and leave a previously `sent` record idempotent;
10. derive current booking state from `bookings` rather than accepting it from the caller;
11. return only the minimum server-built Make payload.

The returned JSON keys are fixed:

```json
{
  "delivery_request_id": "quiz UUID",
  "first_name": "normalized name",
  "email": "normalized email",
  "audience_key": "service_businesses",
  "solution_title": "Lead-to-Client System",
  "tier_key": "advanced",
  "platform": "gohighlevel",
  "offer_key": "platform_growth",
  "offer_name": "Growth System",
  "base_price_usd": 2500,
  "addon_total_usd": 0,
  "estimated_project_investment_usd": 2500,
  "included_features": [],
  "priced_addons": [],
  "scope_review_items": [],
  "diagnosis_summary": "bounded display-copy text",
  "recommendation_reason": "bounded display-copy text",
  "future_phase_suggestions": [],
  "booking_state": "none"
}
```

Do not accept this object from the browser. The two display-copy values originate from the bounded `result_snapshot.display_copy`; all identifiers, offer data, inclusions, and totals are re-read or recalculated from database records.

- [ ] **Step 6: Add ownership, tampering, copy-validation, and replay pgTAP cases**

Test valid owner submission, another owner’s quiz ID, inactive/mismatched offer, incompatible platform, `custom_complete` misuse, oversized/unknown display-copy fields, direct status update rejection, duplicate request behavior, and sent-state replay behavior. Wrap test records in a transaction that always rolls back.

- [ ] **Step 7: Run available tests and commit**

Run:

```bash
npm run test:supabase:static
npx supabase test db
git diff --check
```

Commit:

```bash
git add supabase/migrations/202609220001_add_roadmap_email_delivery.sql supabase/tests/01_schema_and_security.test.sql supabase/tests/03_rpc_and_integrity.test.sql tests/supabase-migrations-static.test.mjs
git commit -m "feat: add secure roadmap email request"
```

---

### Task 2: Connect the quiz to Supabase-owned sessions

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/features/quiz/quiz-backend.ts`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/features/quiz/reducer.ts`
- Modify: `src/features/quiz/types.ts`
- Create: `tests/unit/quiz-backend.test.ts`
- Modify: `tests/unit/quiz-components.test.tsx`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, existing owner RLS/RPCs.
- Produces: `QuizBackend` adapter and owned `visitorId`, `portfolioSessionId`, `quizSessionId` attribution.

- [ ] **Step 1: Write failing adapter tests with an injected fake client**

Test that the adapter:

- calls anonymous sign-in only when no session exists;
- creates one owned visitor and portfolio session;
- creates a quiz session only after audience selection;
- autosaves only answers/current step/last activity fields allowed by RLS;
- calls `persist_quiz_result` once at completion;
- never places the publishable key or access token into rendered copy/logging.

- [ ] **Step 2: Install the official Supabase browser client**

Run: `npm install @supabase/supabase-js`

Do not add any other runtime dependency.

- [ ] **Step 3: Implement a lazy singleton browser client**

`browser.ts` must validate only the two public variables:

```ts
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Export `getSupabaseBrowserClient()`. Never reference `SUPABASE_SERVICE_ROLE_KEY` or a Make secret.

- [ ] **Step 4: Implement the typed quiz backend adapter**

Use an interface so components remain testable:

```ts
export interface QuizBackend {
  initialize(): Promise<{ visitorId: string; portfolioSessionId: string }>;
  startQuiz(input: { visitorId: string; portfolioSessionId: string; audienceKey: AudienceKey }): Promise<string>;
  saveProgress(input: { quizSessionId: string; answers: QuizAnswers; currentStep: number; lastCompletedStep: number }): Promise<void>;
  persistResult(input: { quizSessionId: string; result: CortexResult }): Promise<void>;
}
```

Use only public credentials plus the anonymous user's session. `persistResult()` calls `persist_quiz_result_v2` and passes only the four bounded display-copy fields in addition to the existing scores/recommendation arguments. The adapter must not block local rendering if initialization temporarily fails; it exposes a retryable backend status while local 30-day persistence continues.

- [ ] **Step 5: Wire initialization, autosave, and completion**

Keep all quiz navigation in React. Debounce remote progress writes, cancel stale writes when starting over, and retain local storage as the immediate recovery path. Show a nonblocking status only when remote saving is unavailable; never claim a remote save succeeded when it did not.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npx vitest run tests/unit/quiz-backend.test.ts tests/unit/quiz-components.test.tsx tests/unit/quiz-reducer.test.ts
npm run typecheck
npm run lint
```

Commit:

```bash
git add package.json package-lock.json src/lib/supabase/browser.ts src/features/quiz/quiz-backend.ts src/features/quiz/QuizExperience.tsx src/features/quiz/reducer.ts src/features/quiz/types.ts tests/unit/quiz-backend.test.ts tests/unit/quiz-components.test.tsx
git commit -m "feat: persist owned quiz sessions in Supabase"
```

---

### Task 3: Implement the authenticated roadmap-email Edge Function

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/roadmap-delivery.ts`
- Create: `supabase/functions/send-roadmap-email/index.ts`
- Create: `supabase/functions/send-roadmap-email/roadmap-delivery.test.ts`
- Modify: `supabase/config.toml`
- Create: `tests/supabase-edge-static.test.mjs`

**Interfaces:**
- Consumes: caller JWT, `request_roadmap_email` RPC, `MAKE_ROADMAP_WEBHOOK_URL`, `MAKE_ROADMAP_API_KEY`.
- Produces: `POST /functions/v1/send-roadmap-email` returning `{ status: "sent" | "already_sent", quizSessionId: string }`.

- [ ] **Step 1: Write failing payload and security tests**

Test missing bearer token, invalid JSON, unexpected keys, invalid UUID/name/email lengths, RPC rejection, Make non-2xx/timeout, and duplicate `already_sent`. Add a static test that fails if a Make secret or `service_role` literal appears under `src/`.

- [ ] **Step 2: Implement strict request parsing**

Accept only:

```ts
interface RoadmapEmailRequest {
  quizSessionId: string;
  firstName: string;
  email: string;
  selection: {
    tierKey: "basic" | "advanced" | "complete";
    platform: "systeme_io" | "gohighlevel" | "custom_app";
    offerKey: string;
  };
}
```

Reject additional top-level or selection fields. Limit request size and normalize strings before RPC submission.

- [ ] **Step 3: Call the RPC with the caller's JWT**

Create the Supabase client with the public/publishable key and forward the incoming `Authorization` header so `auth.uid()` and RLS remain authoritative. Do not use the service role to validate ownership.

- [ ] **Step 4: Forward only the RPC payload to Make**

Use:

```ts
await fetch(Deno.env.get("MAKE_ROADMAP_WEBHOOK_URL")!, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-make-apikey": Deno.env.get("MAKE_ROADMAP_API_KEY")!,
  },
  body: JSON.stringify(deliveryPayload),
  signal: AbortSignal.timeout(15_000),
});
```

Never log email addresses, access tokens, webhook URLs, API keys, or full payloads. Return generic client-safe failures.

- [ ] **Step 5: Mark delivery outcome with a server-only update path**

After a successful Make response, call a narrowly scoped server-only database function that changes only `pending → sent` and sets `roadmap_email_sent_at`. On failure, change only `pending → failed`. Revoke function execution from `PUBLIC`, `anon`, and `authenticated`; grant only `service_role`. Add this function in the migration from Task 1 and cover it in static/pgTAP tests.

- [ ] **Step 6: Run Edge tests and commit**

Run:

```bash
deno test supabase/functions/send-roadmap-email/roadmap-delivery.test.ts
node --test tests/supabase-edge-static.test.mjs
npm run typecheck
```

If Deno is unavailable, report it and run the static test; do not claim the Deno test passed.

Commit:

```bash
git add supabase/functions supabase/config.toml tests/supabase-edge-static.test.mjs supabase/migrations/202609220001_add_roadmap_email_delivery.sql supabase/tests
git commit -m "feat: add secure roadmap email function"
```

---

### Task 4: Add the optional email form to the selected roadmap

**Files:**
- Create: `src/features/quiz/RoadmapEmailForm.tsx`
- Create: `src/features/quiz/roadmap-email-client.ts`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/quiz-components.test.tsx`
- Modify: `tests/e2e/portfolio-quiz.spec.ts`

**Interfaces:**
- Consumes: owned `quizSessionId`, selected roadmap, Supabase Edge Function.
- Produces: voluntary lead form and sent/already-sent/failure states.

- [ ] **Step 1: Write failing form tests**

Assert the full result and selected price are visible before the form. Test required name/email, consent checkbox, double-click suppression, success state, safe retry, and that no phone/business/admin/CRM fields can be submitted.

- [ ] **Step 2: Implement the client helper**

`requestRoadmapEmail()` invokes only `send-roadmap-email` with the minimum request contract. It does not call Make, pass a price, or pass booking status.

- [ ] **Step 3: Build the accessible optional form**

Use fields:

- `First name`
- `Email address`
- explicit consent: `Email my personalized roadmap and related follow-up about this request.`

CTA: `Email My PDF Roadmap`.

Success copy: `Your roadmap is on its way. You can keep reviewing it here.`

Failure copy must not imply a lead or email succeeded. Preserve the on-page roadmap and booking action in every state.

- [ ] **Step 4: Update E2E network boundaries**

Before form submission, allow only expected Supabase Auth/REST/RPC traffic and no Make domain request. On submission, assert the browser calls the Supabase Edge Function and still never calls Make directly. Mock the Edge Function in E2E so tests create no remote lead or email.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run tests/unit/quiz-components.test.tsx
npm run test:e2e
npm run typecheck
npm run lint
```

Commit:

```bash
git add src/features/quiz/RoadmapEmailForm.tsx src/features/quiz/roadmap-email-client.ts src/features/quiz/QuizResult.tsx src/app/globals.css tests/unit/quiz-components.test.tsx tests/e2e/portfolio-quiz.spec.ts
git commit -m "feat: add optional PDF roadmap request"
```

---

### Task 5: Build the private Make scenario and approved PDF template

**External objects:**
- Create: private Google Docs template `Elysha Works — Personalized Roadmap Template`
- Create: private Google Drive folder `Elysha Works Roadmap Deliveries`
- Create: Make scenario `Elysha Works — Send Personalized Roadmap PDF`
- Reuse: existing Google/Google Drive/Gmail connections in the current Make team

**Interfaces:**
- Consumes: API-key-authenticated Make webhook payload from the Edge Function.
- Produces: PDF attachment email and JSON webhook response.

- [ ] **Step 1: Create the Google Docs template after approval of the plan**

Use only approved roadmap fields and these exact tags:

```text
{{first_name}}
{{generated_date}}
{{audience_label}}
{{solution_title}}
{{tier_label}}
{{platform_label}}
{{offer_name}}
{{diagnosis_summary}}
{{recommendation_reason}}
{{included_features}}
{{priced_addons}}
{{scope_review_items}}
{{base_price}}
{{addon_total}}
{{planning_estimate}}
{{future_phase_suggestions}}
{{booking_message}}
```

Arrays are converted to newline bullet blocks before template mapping. Do not add testimonials, performance claims, or unapproved scope.

- [ ] **Step 2: Create an API-key-protected custom webhook**

In Make, create **Webhooks → Custom webhook** named `Elysha Works roadmap delivery`. Define the JSON data structure from the fixed RPC payload. Immediately before creating the persistent API key, request the required action-time confirmation. Store the key only in Make and Supabase Edge Function secrets.

- [ ] **Step 3: Add and configure document modules**

Add **Google Docs → Create a Document from a Template** using the approved template and map every tag. Save generated documents into the private delivery folder with filename:

```text
Elysha Works Roadmap - {{first_name}} - {{delivery_request_id}}
```

Add **Google Docs → Download a Document** with output type PDF.

- [ ] **Step 4: Add booking-state routing and Gmail sends**

Add a router:

- Route `booking_state = none`: Gmail **Send an Email** with the PDF attachment and optional discovery-call link.
- Route `booking_state != none`: Gmail **Send an Email** with the same PDF but without the discovery-call link; acknowledge requested/scheduled/completed status using the server-provided booking state.

Use subject:

```text
Your Elysha Works Personalized Roadmap
```

Use a short HTML body with the selected solution/tier/platform and state that the attachment is a planning roadmap, not a binding quotation.

- [ ] **Step 5: Return a deterministic webhook response**

Each route ends with **Webhooks → Webhook response**:

```json
{"status":"sent","delivery_request_id":"{{delivery_request_id}}"}
```

Use HTTP 200 only after Gmail succeeds. Leave the scenario inactive after saving.

- [ ] **Step 6: Record non-secret scenario metadata**

Update `docs/supabase-database.md` with scenario name, module order, secret names, template/folder names, manual activation rule, and recovery steps. Do not record connection IDs, webhook URL, API key, OAuth data, or email credentials.

---

### Task 6: Perform deployment preflight and request remote approval

**Files:**
- Modify: `docs/supabase-database.md`

**Interfaces:**
- Consumes: completed migration, Edge Function, Make scenario, verified project link.
- Produces: exact additive/destructive assessment and approval request.

- [ ] **Step 1: Verify the linked project without exposing credentials**

Run read-only Supabase CLI commands to report project name/ref, remote migration history, existing functions/tables, and Anonymous Auth status. If the target cannot be identified with certainty, stop.

- [ ] **Step 2: Inspect the new SQL for destructive operations**

Search for `drop`, `truncate`, destructive `alter`, object replacement, and naming conflicts. Report that the plan adds columns/functions/indexes only, or disclose every exception.

- [ ] **Step 3: Show exact pending operations**

List:

- `202609220001_add_roadmap_email_delivery.sql`;
- the `send-roadmap-email` Edge Function;
- selection/delivery columns;
- RPC/server-only status function;
- indexes, grants, and tests;
- required Edge secrets by name only.

- [ ] **Step 4: Wait for explicit remote deployment approval**

Do not push the migration, deploy the Edge Function, set secrets, or activate Make in this task step. Present the exact commands and wait.

---

### Task 7: Deploy, verify, test delivery, and activate only after approvals

**Files:**
- Create: `src/types/database.generated.ts`
- Modify: `docs/supabase-database.md`
- Modify: `docs/portfolio-blueprint.md`

**Interfaces:**
- Consumes: explicit remote-deployment approval and required action-time confirmations.
- Produces: verified remote schema/function, generated types, one owner-authorized delivery test, and optional scenario activation.

- [ ] **Step 1: Apply only the approved additive migration**

Use the current supported Supabase CLI push command shown during preflight. Never reset the database or repair history destructively.

- [ ] **Step 2: Configure Edge secrets without printing values**

Set:

```text
MAKE_ROADMAP_WEBHOOK_URL
MAKE_ROADMAP_API_KEY
```

Use interactive/secret-manager input. Never echo values, place them in `.env.local`, or commit them.

- [ ] **Step 3: Deploy the Edge Function and verify remotely**

Confirm read-only that columns, checks, FK, indexes, RPC grants, and function deployment exist. Confirm the 11-table count remains unchanged and no transactional fake data exists.

- [ ] **Step 4: Generate TypeScript database types**

Generate from the confirmed remote project into `src/types/database.generated.ts`. Mark it generated and do not overwrite handwritten quiz types.

- [ ] **Step 5: Run one owner-authorized end-to-end delivery**

Immediately before sending, request confirmation because this creates a Google document and sends an email. Use the owner's real quiz result and destination—not a fake production lead. Verify:

- exactly one lead/quiz link;
- selected tier/platform/offer and server totals match the on-page choice;
- one PDF arrives;
- booking CTA presence matches the server booking state;
- repeated submission returns already-sent and sends no second email;
- delivery state becomes `sent` only after Gmail succeeds.

- [ ] **Step 6: Request activation approval and activate if granted**

Keep the Make scenario inactive until the owner approves activation after the successful test. Activation must not modify Firebase or Firestore.

- [ ] **Step 7: Run final verification and document status**

Run:

```bash
npm run test
npm run test:e2e
npm run test:supabase:static
npm run typecheck
npm run lint
npm run build
git diff --check
```

Run remote read-only checks for migration/function/policy/index existence and Make execution history. Update both docs with actual results, deferred retention decisions, Anonymous Auth/CAPTCHA status, and manual recovery steps.

- [ ] **Step 8: Commit generated types and verified documentation**

```bash
git add src/types/database.generated.ts docs/supabase-database.md docs/portfolio-blueprint.md
git commit -m "docs: record roadmap email deployment"
```
