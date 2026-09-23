# Business Systems Assessment V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight-question score-only quiz with the approved audience-specific diagnostic, deterministic recommendation engine, and structured premium roadmap while preserving verified lead capture and proposal delivery.

**Architecture:** Keep `supabase/functions/_shared/quiz-engine` as the authoritative portable engine and retain the frontend re-export boundary. Normalize answers into a structured assessment profile, derive platform/package/page/automation/payment recommendations with explicit hard overrides, then render and persist the resulting roadmap snapshot.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Supabase/Postgres/Edge Functions, Firebase static hosting.

**Spec:** `docs/portfolio-blueprint.md`

## Global Constraints

- Preserve the three audiences and verified lead/OTP/proposal delivery flow.
- USD is the only stored base-price source of truth; location changes display currency and payment guidance only.
- Timeline affects lead readiness only.
- Platform preference never overrides hard technical requirements and never forces a custom app.
- Inventory, raw-material tracking, custom calculations, complex roles, and specialized production/approval states require the custom route.
- Client-facing copy must not expose internal scoring, database, DNS, webhook, or mail-server terminology.
- Results remain deterministic and versioned from raw stored answers.

## Review Focus

- A custom-app preference with only a simple booking journey must remain on a simpler platform.
- A Systeme.io preference with inventory, roles, or production stages must be overridden to Custom App.
- Demand health and timeline must not increase price or package tier.
- Page, automation, payment, and integration counts must respect package limits.
- Local-currency failure must fall back to USD rather than displaying a fabricated rate.

---

### Task 1: Versioned diagnostic questions and answer metadata

**Files:**
- Modify: `supabase/functions/_shared/quiz-engine/types.ts`
- Modify: `supabase/functions/_shared/quiz-engine/questions.ts`
- Modify: `tests/unit/quiz-config.test.ts`
- Modify: `tests/unit/cortex.test.ts`

**Interfaces:**
- Produces: eleven keyed questions per audience and option metadata consumed by the recommendation engine.
- Consumes: existing audience keys and immutable `QuizAnswers` structure.

- [ ] Add failing tests asserting the eleven approved question keys, audience-specific options, selection limits, and new version identifiers.
- [ ] Run `npx vitest run tests/unit/quiz-config.test.ts tests/unit/cortex.test.ts` and confirm failures reference the old eight-question definition.
- [ ] Add factual question definitions for business model, Point B, Point A, bottlenecks, demand, customer journey, post-conversion, scope, timeline, platform preference, and audience add-ons.
- [ ] Re-run the focused tests and confirm the configuration contract passes.

### Task 2: Deterministic platform, package, and generated-scope engine

**Files:**
- Modify: `supabase/functions/_shared/quiz-engine/cortex.ts`
- Create: `supabase/functions/_shared/quiz-engine/roadmap-builders.ts`
- Create: `supabase/functions/_shared/quiz-engine/location.ts`
- Modify: `supabase/functions/_shared/quiz-engine/catalog.ts`
- Modify: `supabase/functions/_shared/quiz-engine/pricing.ts`
- Modify: `tests/unit/cortex.test.ts`
- Modify: `tests/unit/quiz-pricing.test.ts`

**Interfaces:**
- Produces: a versioned `CortexResult` containing the structured profile, reasons, generated pages/screens, automations, payment guidance, client requirements, third-party costs, and local display price.
- Consumes: Task 1 option metadata and existing package catalog.

- [ ] Add failing literal scenario tests A–H from the approved master specification.
- [ ] Confirm RED for missing new fields and incorrect platform overrides.
- [ ] Implement requirement classification, hard overrides, fit rules, package limits, and structured roadmap generators.
- [ ] Implement safe country/currency metadata with USD fallback and configurable FX input.
- [ ] Run focused engine/pricing tests and confirm all scenarios pass deterministically.

### Task 3: Premium roadmap proposal model

**Files:**
- Modify: `supabase/functions/_shared/quiz-engine/point-a-point-b.ts`
- Modify: `supabase/functions/_shared/quiz-engine/proposal-view.ts`
- Modify: `supabase/functions/_shared/quiz-engine/roadmap-options.ts`
- Modify: `tests/unit/proposal-view-model.test.ts`
- Modify: `tests/unit/roadmap-options.test.ts`

**Interfaces:**
- Produces: the 21 client-facing roadmap sections and three-tier/platform comparison.
- Consumes: Task 2 structured `CortexResult`.

- [ ] Add failing tests for synthesized Point A/B, bottlenecks, missing-system explanation, platform alternatives, exact included scope, ownership, 50/50 schedule, and disclaimer.
- [ ] Confirm RED because the current proposal exposes only Point A/B, recommendation, and tiers.
- [ ] Build the complete structured proposal without generic AI copy or internal terminology.
- [ ] Re-run proposal and roadmap tests to GREEN.

### Task 4: Quiz and roadmap UI

**Files:**
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/features/quiz/QuizQuestion.tsx`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `src/features/quiz/RoadmapComparison.tsx`
- Modify: `src/features/quiz/RoadmapSelectionSummary.tsx`
- Modify: `src/features/quiz/reducer.ts`
- Modify: `src/features/quiz/persistence.ts`
- Modify: `src/styles/quiz.css`
- Modify: `tests/unit/quiz-components.test.tsx`
- Modify: `tests/unit/quiz-reducer.test.ts`
- Modify: `tests/unit/quiz-persistence.test.ts`

**Interfaces:**
- Produces: a short branched assessment and scannable premium roadmap with local pricing and disabled unsupported platforms.
- Consumes: Tasks 1–3 engine and proposal contracts.

- [ ] Add failing interaction tests for eleven screens, two-choice bottleneck cap, location selection, resume, package switching, and all roadmap sections.
- [ ] Confirm RED against the current eight-screen UI.
- [ ] Update reducer, persistence validation, question UI, and result UI.
- [ ] Re-run focused component/reducer/persistence tests to GREEN.

### Task 5: Supabase persistence and regeneration

**Files:**
- Create: `supabase/migrations/202609230003_add_business_systems_assessment_v2.sql`
- Modify: `supabase/functions/finalize-proposal/index.ts`
- Modify: `tests/supabase-migrations-static.test.mjs`
- Modify: `supabase/functions/tests/proposal-functions.test.ts`

**Interfaces:**
- Produces: saved structured fields and immutable V2 snapshots that can regenerate the same roadmap.
- Consumes: Task 2 and Task 3 snapshots.

- [ ] Add failing tests for V2 versions, structured assessment fields, snapshot validation, and deterministic regeneration.
- [ ] Confirm RED against the current V1-only database guard.
- [ ] Add backward-safe columns and replace version checks in the finalization RPC without exposing protected proposal fields.
- [ ] Re-run static migration and Edge Function tests to GREEN.

### Task 6: Blueprint, stale baseline assertion, and complete verification

**Files:**
- Modify: `docs/portfolio-blueprint.md`
- Modify: `tests/live-copy.test.mjs`

**Interfaces:**
- Produces: authoritative documentation matching the shipped V2 behavior.
- Consumes: all previous task contracts.

- [ ] Correct the stale Make runbook assertion to use the live `deliveryId` contract.
- [ ] Update the blueprint with the V2 question, engine, package, currency, payment, roadmap, versioning, and persistence rules.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:supabase:static`, and `npm run build`.
- [ ] Review the complete diff for secrets, internal jargon in client copy, and accidental unrelated changes.

