# Supabase Portfolio Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the version-controlled Supabase/PostgreSQL database, security model, approved configuration seed, and database tests defined by `docs/portfolio-blueprint.md`, without deploying remotely.

**Architecture:** Six ordered SQL migrations create the 11 Phase 1 tables, deferred circular relationships, integrity/index/trigger layer, least-privilege RLS/grants, restricted RPCs, and manual retention helpers. Idempotent seed data includes only catalog/configuration facts explicitly approved by the blueprint. pgTAP tests verify live database behavior when a local stack is available; Node static tests provide immediate structural red/green checks in this environment.

**Tech Stack:** PostgreSQL/Supabase SQL, Supabase CLI project configuration, pgTAP, Node.js built-in test runner, Markdown.

**Spec:** `docs/portfolio-blueprint.md`

## Global Constraints

- Create exactly the 11 Phase 1 tables; do not create reserved future CRM/portal tables.
- Keep Firebase Hosting and every existing Firebase/Firestore file and resource untouched.
- Do not link, push, reset, or mutate a remote Supabase project without explicit target verification and user approval.
- Use `public` schema qualification, named constraints, deliberate `ON DELETE` actions, RLS on every table, fixed `search_path` for security-definer functions, and least privilege.
- Never store or print secrets; never put `service_role` credentials in frontend code.
- Seed only approved blueprint/repository configuration; never create fake transactional data.

## Review Focus

- Cross-owner UUID attachment must be rejected on visitor/session/quiz writes and every RPC.
- Column-level grants must prevent owners from changing identity, attribution, scoring, pricing, result snapshots, lead links, and CRM-controlled fields.
- Lead creation/linking must be idempotent and preserve the canonical one-lead-per-quiz relationship.
- Public configuration visibility must hide inactive/draft rows while sensitive tables remain non-enumerable.
- Cleanup helpers must never remove converted or historically attributed records and must remain unscheduled.

---

### Task 1: Project scaffold and structural test harness

**Files:**
- Create: `supabase/config.toml`
- Create: `tests/supabase-migrations-static.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: standard Supabase paths and `npm run test:supabase:static`.
- Consumes: blueprint table/function/migration requirements.

- [ ] Write structural tests that require the six ordered migrations, seed, pgTAP test files, exact table set, RLS enablement, required RPC names, and absence of reserved tables/transactional seed rows.
- [ ] Run the static tests and verify they fail because Supabase assets do not exist.
- [ ] Add local Supabase configuration and the test script.
- [ ] Re-run the scaffold-specific assertions.

### Task 2: Core and catalog schema migrations

**Files:**
- Create: `supabase/migrations/202609210001_create_core_tables.sql`
- Create: `supabase/migrations/202609210002_create_catalog_content_tables.sql`
- Create: `supabase/migrations/202609210003_add_constraints_indexes_triggers.sql`

**Interfaces:**
- Produces: all 11 tables, named PK/FK/check/unique constraints, deferred quiz-to-lead FK, shared timestamp trigger, and documented indexes.
- Consumes: table/column definitions and deletion rules from the blueprint.

- [ ] Extend static tests for every table, required relationship, status constraint, trigger, and high-value index; run and verify failure.
- [ ] Implement the three schema migrations with explicit ordering and schema qualification.
- [ ] Re-run static tests and inspect SQL for circular-FK and deletion-policy correctness.

### Task 3: Grants, RLS, and authorization helper

**Files:**
- Create: `supabase/migrations/202609210004_add_rls_grants_policies.sql`
- Create: `supabase/tests/01_schema_and_security.test.sql`
- Create: `supabase/tests/02_rls_ownership.test.sql`

**Interfaces:**
- Produces: default-deny admin helper using `app_metadata.role = 'admin'`, RLS policies, column-safe grants, schema/grant/ownership pgTAP coverage.
- Consumes: Phase 1 tables and `auth.uid()`.

- [ ] Extend static tests for all-table RLS, revocations, admin helper, policy coverage, and pgTAP files; verify failure.
- [ ] Implement grants and policies, including parent ownership checks and protected-column boundaries.
- [ ] Add pgTAP schema/security and ownership tests.
- [ ] Re-run static tests.

### Task 4: Restricted RPCs and retention helper

**Files:**
- Create: `supabase/migrations/202609210005_create_portfolio_rpc_functions.sql`
- Create: `supabase/migrations/202609210006_add_retention_helpers.sql`
- Create: `supabase/tests/03_rpc_and_integrity.test.sql`

**Interfaces:**
- Produces: `submit_lead`, `submit_booking`, `record_analytics_event`, `link_quiz_session_to_lead`, `persist_quiz_result`, and manual `mark_expired_quiz_sessions` functions.
- Consumes: Phase 1 tables, ownership policies, server-controlled defaults, and allowed analytics events.

- [ ] Extend static tests for fixed search paths, execute revocations/grants, minimum RPC surface, allowlists, and unscheduled cleanup; verify failure.
- [ ] Implement scalar-argument RPCs with ownership validation and minimal return values.
- [ ] Add pgTAP RPC/integrity tests for success, cross-owner rejection, replay behavior, protected fields, constraints, and sensitive-table enumeration.
- [ ] Re-run static tests.

### Task 5: Approved idempotent seed data

**Files:**
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: seven approved packages and all explicitly defined add-ons; quiz definitions only if complete question/scoring data is approved.
- Consumes: package/add-on names, prices, inclusions, limits, and quiz text from the blueprint.

- [ ] Extend static tests for seven package keys/prices, approved add-ons, idempotency, and forbidden transactional inserts; verify failure.
- [ ] Implement conflict-safe configuration inserts without overwriting later admin edits.
- [ ] Document skipped project/site-content/quiz-definition seeds when source data is incomplete.
- [ ] Re-run static tests.

### Task 6: Documentation and verification

**Files:**
- Create: `docs/supabase-database.md`
- Modify: `package.json`

**Interfaces:**
- Produces: setup, local commands, tests, safe deployment gate, environment-variable names, dashboard requirements, deferred decisions, and type-generation command.
- Consumes: completed Supabase structure and observed local/remote tool state.

- [ ] Extend static tests for documentation requirements; verify failure.
- [ ] Write setup/deployment documentation without secrets.
- [ ] Run full static tests, existing project tests, lint/typecheck, and `git diff --check`.
- [ ] Attempt `npx supabase` validation and local database commands only if tooling/runtime supports them; record exact blockers honestly.
- [ ] Inspect local link metadata read-only and prepare the remote target/migration/destructiveness report without applying migrations.
