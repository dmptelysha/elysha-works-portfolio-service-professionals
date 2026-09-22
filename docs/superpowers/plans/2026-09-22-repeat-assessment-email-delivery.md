# Repeat Assessment and Verified Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send proposal email only after a real Make/Gmail acknowledgement and ask a returning same-device visitor whether a reused email is for the same or another business.

**Architecture:** Extend the restricted `begin_qualified_quiz` RPC with a same-owner email match and an explicit `same_business`/`another_business` decision. Keep the browser response minimal, link same-business retakes to the stable lead, create a new lead for another business, and require a structured delivery acknowledgement from Make before Supabase records `sent`.

**Tech Stack:** PostgreSQL/Supabase RPC and pgTAP, TypeScript/React/Vitest, Supabase Edge Functions/Deno, Make custom webhook and Gmail.

**Spec:** `docs/portfolio-blueprint.md`

## Global Constraints

- Email existence is disclosed only for records belonging to the current `auth.uid()` through its owned visitor.
- Different-device recognition requires later email OTP verification; no public email-enumeration endpoint is added.
- Existing CRM-controlled fields and the original lead source IDs are not overwritten on same-business reuse.
- Another-business selection creates a separate lead and preserves duplicate-email support.
- Supabase records delivery only after Make returns a matching structured acknowledgement.
- Secrets remain in Supabase Edge Function secrets and Make connection/header configuration, never browser code or Git.

## Review Focus

- Same email under a different owner must never trigger the returning-business response.
- RPC replay for an already-linked quiz must remain idempotent.
- `another_business` must not silently reuse the prior lead.
- A generic Make 2xx response must not count as delivered.
- The confirmation UI must retain the entered contact data across the extra decision.

---

### Task 1: Privacy-safe repeat-email RPC

**Files:**
- Create: `supabase/migrations/202609220004_add_repeat_assessment_business_scope.sql`
- Modify: `supabase/tests/03_rpc_and_integrity.test.sql`
- Modify: `tests/supabase-migrations-static.test.mjs`
- Modify: `src/generated/database.types.ts`

**Interfaces:**
- Consumes: owned visitor/session/quiz IDs and normalized contact details.
- Produces: `begin_qualified_quiz(..., p_business_scope text)` returning `submission_status`, nullable `lead_id`, `quiz_session_id`, and nullable `existing_business_name`.

- [ ] Add failing pgTAP/static assertions for same-owner challenge, other-owner privacy, same-business reuse, another-business creation, replay, grants, and supporting `(visitor_id, email, updated_at desc)` index.
- [ ] Run `npm run test:supabase:static` and the supported DB test workflow; confirm the new assertions fail before migration implementation.
- [ ] Add the replacement security-definer RPC with fixed `search_path`, ownership checks, explicit decision validation, stable lead reuse, separate-lead creation, and least-privilege EXECUTE grants.
- [ ] Update generated function types to exactly match the migration contract.
- [ ] Re-run Supabase static and database tests until green.

### Task 2: Returning-business confirmation UI

**Files:**
- Modify: `supabase/functions/_shared/quiz-engine/types.ts`
- Modify: `src/features/quiz/quiz-service.ts`
- Modify: `src/features/quiz/LeadContactStep.tsx`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/styles/quiz.css`
- Modify: `tests/unit/quiz-service.test.ts`
- Modify: `tests/unit/quiz-components.test.tsx`

**Interfaces:**
- Consumes: Task 1 `submission_status` result.
- Produces: `LeadContactSubmissionResult` and a confirmation callback that resubmits with `same_business` or `another_business`.

- [ ] Add failing unit/component tests proving the first submit shows the same/another-business question, keeps entered values, reuses on `same_business`, creates separately on `another_business`, and blocks duplicate pending submits.
- [ ] Run the focused Vitest files and confirm failures are caused by the missing result/confirmation behavior.
- [ ] Implement the typed service result, minimal confirmation panel, accessible buttons, and second RPC call with the chosen scope.
- [ ] Re-run focused tests, then `npm test`, `npm run typecheck`, and `npm run lint`.

### Task 3: Verified Make delivery acknowledgement

**Files:**
- Modify: `supabase/functions/_shared/proposal-email.ts`
- Modify: `supabase/functions/tests/proposal-functions.test.ts`
- Modify: `docs/supabase-database.md`

**Interfaces:**
- Consumes: Make HTTP response.
- Produces: delivery success only for JSON `{ "accepted": true, "delivery_id": "<matching operation UUID>" }`.

- [ ] Add failing Deno tests for plain 2xx, mismatched delivery ID, malformed JSON, and matching acknowledgement.
- [ ] Run `npm run test:edge` and confirm the acknowledgement tests fail before implementation.
- [ ] Parse and validate the bounded response body; throw on every non-matching response so `finalize-proposal` records failure rather than false success.
- [ ] Re-run Edge tests until green.
- [ ] Configure Make as webhook → idempotency lookup → Gmail send → delivery record → final Webhook Response with the matching acknowledgement. Require action-time confirmation immediately before saving/activating the email-sending automation or sending a test email.

### Task 4: Blueprint, remote migration, deploy, and smoke verification

**Files:**
- Modify: `docs/portfolio-blueprint.md`
- Modify: `docs/supabase-database.md`

**Interfaces:**
- Consumes: tested migrations, UI, Edge Function, and Make acknowledgement contract.
- Produces: deployed Supabase/Firebase flow with read-only post-deployment verification.

- [ ] Document same-device recognition, OTP requirement for cross-device recognition, multiple-business lead rules, and verified Make acknowledgement.
- [ ] Run full tests, typecheck, lint, build, and migration safety inspection.
- [ ] Show the exact additive remote migration/Edge deployment/Firebase Hosting commands and stop for any required deployment confirmation.
- [ ] Apply only approved additive Supabase migration, deploy the affected Edge Function, then Firebase Hosting; never reset or drop remote objects.
- [ ] Smoke-test with rollback-safe/read-only checks, and only send a real test email after action-time confirmation.
