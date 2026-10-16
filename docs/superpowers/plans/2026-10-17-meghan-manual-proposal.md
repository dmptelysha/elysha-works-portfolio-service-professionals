# Meghan Manual Proposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable private manual-proposal page, with Meghan as its first draft, that unlocks with a generated access code and supports view-only design previews, offer selection, live totals, and discovery-call booking.

**Architecture:** Keep the Firebase-exported Next.js route as a locked shell. Store issued proposal snapshots in a service-only Supabase table and three watermarked captures in private Storage; an Edge Function verifies the separate code and releases display-safe content plus short-lived image URLs. Local authoring tools prepare the captures and issue or rotate the code. Checkout remains visibly disabled until a provider is connected.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest/Testing Library, Playwright, Supabase Edge Functions on Deno, PostgreSQL/pgTAP, Supabase private Storage, Firebase static export.

**Spec:** `docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md`

## Global Constraints

- Work only in the `codex/megan-proposal` worktree; leave `D:\CODEX\Meghan -  Emotional Anchor` read-only.
- Use Node 24 or newer for the local authoring CLI, which imports the pure shared TypeScript model with built-in type stripping; the deployed app has no Node 24 dependency.
- Keep the QuizUp result and existing `/proposal/` route unchanged.
- Check in a client-neutral draft template and validation schema; keep Meghan's filled draft and captured images in ignored local staging.
- The client route is `/proposal/client/?ref=<opaque-reference>`; neither its HTML nor its URL contains the access code or client proposal content.
- Generate a cryptographically random 12-character code from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. Show the plaintext once to Elysha; store only a domain-separated, peppered hash. A later dashboard may call the same issuer, but no dashboard is built now.
- Three private, watermarked full-page captures use 1440px desktop, 768px tablet, and 390px mobile viewports. No original Emotional Anchor HTML/CSS/JS/assets enter `public/` or `out/`.
- Seed editable Basic, Advanced, and Complete draft prices at $1,500/$2,500/$4,000 USD. Their scope requires Elysha's review before issue; Meghan's breathwork service prices are unrelated.
- Quote money in integer cents. Priced optional inclusions increase total and 50% deposit; an odd cent goes to the deposit. No tax or provider fee is added now.
- `Book a Discovery Call` links to `/booking/`. `Reserve My Slot` displays the deposit but is disabled; no payment or reservation is recorded.
- Right-click, print, and shortcut handlers are deterrents only; the UI never promises screenshot or DevTools prevention.
- Do not deploy Firebase or Supabase, upload to remote Storage, issue a live code, or contact Meghan without an explicit deployment/delivery request.

## File Structure

| Unit | Files | Responsibility |
| --- | --- | --- |
| Shared model | `supabase/functions/_shared/manual-proposal-model.ts`, `src/features/manual-proposal/model.ts` | Validate display data and calculate the quote in one place. |
| Private persistence | `supabase/migrations/202610170001_manual_proposals.sql` | Private table, private bucket, service-only RPCs, immutable issued snapshots, atomic access attempts. |
| Access API | `supabase/functions/manual-proposal-access/index.ts`, `supabase/functions/_shared/env.ts`, `supabase/config.toml` | Code verification and short-lived private image URLs. |
| Capture tool | `scripts/capture-manual-proposal.mjs` | Render the untouched offline source into ignored, watermarked viewport images. |
| Authoring tool | `scripts/manual-proposal.mjs`, `scripts/manual-proposal-core.mjs`, `scripts/manual-proposal.template.json` | Create drafts, upload local captures, issue/regenerate/revoke access, and display the link/code once. |
| Locked route | `src/app/proposal/client/page.tsx`, `src/features/manual-proposal/ManualProposalAccess.tsx`, `src/features/manual-proposal/service.ts` | Keep content hidden until the Edge endpoint verifies the code. |
| Document | `src/features/manual-proposal/ManualProposalDocument.tsx`, `ManualProposalPreviewDialog.tsx`, `src/styles/manual-proposal.css`, `src/app/layout.tsx` | Strategic page, modal preview, tier selection, total and CTA states. |
| Operations | `docs/manual-proposal-operations.md` | Draft, capture, issue, rotate, revoke, and future provider handoff. |

## Review Focus

- Duplicate offer or inclusion keys, missing tiers, negative cents, and unknown selections must fail validation instead of displaying a misleading total; Task 1 tests them.
- The fifth wrong code and a concurrent sixth attempt must lock the proposal atomically without exposing content; Task 2 tests the database boundary.
- A missing Storage object or expired signed URL must not expose a public fallback or break booking; Tasks 3 and 6 test both states.
- A CSS or referenced asset change in the offline source must change the capture hash; Task 4 tests this without writing to that source.
- Direct static-export navigation, refresh, and an absent `ref` must show only the locked shell until a new valid code is entered; Task 8 tests the exported route.

---

### Task 1: Shared Manual Proposal Model and Quote

**Files:**
- Create: `supabase/functions/_shared/manual-proposal-model.ts`
- Create: `src/features/manual-proposal/model.ts` (re-export)
- Test: `tests/unit/manual-proposal-model.test.ts`

**Interfaces:**
- Produces `TierKey = "basic" | "advanced" | "complete"`, `ManualOffer { key, label, priceCents, included }`, `PricedInclusion { key, label, priceCents }`, `ManualProposalView { reference, clientName, businessName, pointA, pointB, recommendation, offers, inclusions, bookingPath, currency, expiresAt, previewCapturedAt, previewSourceHash }`. Preview URLs are a separate short-lived response field.
- Produces `ManualProposalDraft` with all view copy, three offers, optional priced inclusions, a local capture-manifest path, booking path, currency, and expiry; `validateManualDraft(input: unknown): ManualProposalDraft` and `calculateManualQuote(proposal: ManualProposalView, tierKey: TierKey, inclusionKeys: readonly string[]): { baseCents, additionsCents, totalCents, depositCents, balanceCents }`.

- [ ] **Step 1: Write the failing test.** Assert exactly three unique tiers, nonnegative integer prices, unique inclusion keys, a safe same-site booking path, USD currency, capture metadata, rejection of unknown selections, and Basic $1,500 plus a $1.01 inclusion yielding total $1,501.01, deposit $750.51, balance $750.50.
- [ ] **Step 2: Run `npx vitest run tests/unit/manual-proposal-model.test.ts` -> FAIL** because the shared model is absent.
- [ ] **Step 3: Implement the two pure functions and re-export.** Keep display validation separate from any service-role fields; never accept a browser-supplied quote as authority.
- [ ] **Step 4: Run `npx vitest run tests/unit/manual-proposal-model.test.ts` -> PASS** including the malformed-input cases.
- [ ] **Step 5: Commit** the three files as `feat: add manual proposal model and quote`.

### Task 2: Private Persistence and Atomic Verification

**Files:**
- Create: `supabase/migrations/202610170001_manual_proposals.sql`
- Test: `supabase/tests/08_manual_proposals.test.sql`
- Modify: `tests/supabase-migrations-static.test.mjs`

**Interfaces:**
- Produces `private.manual_proposals` with internal `id`, nullable public `reference`, version/supersedes link, status, immutable JSON snapshot, three private object paths, access hash, failed-attempt state, issuance/expiry timestamps, and preview-cleanup timestamp.
- Produces service-role-only RPCs `create_manual_proposal_draft(snapshot jsonb, expires_at timestamptz, supersedes_id uuid default null) -> uuid`, `issue_manual_proposal(id uuid, reference uuid, access_hash text, preview_paths jsonb, issued_at timestamptz) -> uuid`, `verify_manual_proposal_access(reference uuid, candidate_hash text, attempted_at timestamptz) -> row/null`, `rotate_manual_proposal_code(id uuid, access_hash text)`, `revoke_manual_proposal(id uuid)`, `list_expired_manual_preview_objects() -> rows`, and `mark_manual_preview_cleaned(id uuid)`. A new draft with `supersedes_id` increments the version; issued snapshots never change in place.
- `verify_manual_proposal_access` locks the row, compares 32-byte hashes with the existing private constant-time helper, records the attempt in the same transaction, and locks for 15 minutes after five failures. Service role alone can execute these RPCs.

- [ ] **Step 1: Write failing pgTAP/static tests.** Cover anon/authenticated denial, private bucket, draft-to-active transition, immutable issued snapshot, revision versioning, expiry/revocation, fifth failed attempt plus concurrent sixth, successful access reset, code rotation, malformed JSON/hash, and cleanup only when no unexpired issued version references the objects.
- [ ] **Step 2: Run `npm run test:supabase:static` and `npm run test:supabase:db` -> FAIL** for the missing migration/RPCs.
- [ ] **Step 3: Add the migration.** Use `security definer` RPCs with fixed empty search paths and exact grants; create a private `manual-proposal-previews` Storage bucket without public object policies.
- [ ] **Step 4: Run `npm run test:supabase:static` and `npm run test:supabase:db` -> PASS** with service-only access and atomic lockout confirmed.
- [ ] **Step 5: Commit** the migration and tests as `feat: store private manual proposals`.

### Task 3: Access Edge Function

**Files:**
- Create: `supabase/functions/manual-proposal-access/index.ts`
- Test: `supabase/functions/tests/manual-proposal-access.test.ts`
- Modify: `supabase/functions/_shared/env.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes Task 1 `ManualProposalView` and Task 2 `verify_manual_proposal_access`.
- Produces `createManualProposalAccessHandler(dependencies): (request: Request) => Promise<Response>`. The request is `POST { reference, accessKey }`; success returns `{ proposal: ManualProposalView, previewUrls: { desktop: string | null, tablet: string | null, mobile: string | null } }`, and all access failures return the same unavailable response.
- Computes `hmacSha256Hex("manual-proposal:" + normalizedCode, PROPOSAL_KEY_PEPPER)`. Uses a dedicated `getManualProposalEnv` so unrelated quiz coupon/email secrets are not required. Storage URLs expire after 120 seconds.

- [ ] **Step 1: Write failing Deno tests.** Cover valid code, invalid/ref/expiry/revocation/lockout indistinguishability, disallowed Origin, oversized body, missing Storage object, no service key in output, and 120-second signed URL arguments.
- [ ] **Step 2: Run `deno test --allow-env supabase/functions/tests/manual-proposal-access.test.ts` -> FAIL** because the handler does not exist.
- [ ] **Step 3: Implement the handler, env reader, and `verify_jwt = false` config.** Follow the existing `verify-proposal` CORS and no-store response pattern; return asset-unavailable markers if signing fails.
- [ ] **Step 4: Run `deno test --allow-env supabase/functions/tests/manual-proposal-access.test.ts` -> PASS** and run `npm run test:edge` to guard the quiz endpoints.
- [ ] **Step 5: Commit** the four files as `feat: verify manual proposal access`.

### Task 4: Read-Only Offline Capture

**Files:**
- Create: `scripts/capture-manual-proposal.mjs`
- Test: `tests/manual-proposal-capture.test.mjs`

**Interfaces:**
- Produces `captureManualPreview({ sourceDir, outputDir, browser }): Promise<{ sourceHash: string; files: { desktop: string; tablet: string; mobile: string } }>`.
- Outputs only under ignored `.tmp/manual-proposals/`. Uses a local server, Playwright Chromium, full-page captures at 1440x900, 768x1024, and 390x844, with a baked repeating concept watermark. Hash the current HTML and its referenced local CSS, JS, and assets.

- [ ] **Step 1: Write failing Node tests** using a small temporary HTML/CSS/image fixture. Assert three image widths, watermark visibility, unchanged source bytes, and a new hash after a CSS or referenced-asset edit.
- [ ] **Step 2: Run `node --test tests/manual-proposal-capture.test.mjs` -> FAIL** because capture is absent.
- [ ] **Step 3: Implement the capture module and CLI.** Start and stop the local server within the command; reject output paths inside the source folder or tracked `public/`.
- [ ] **Step 4: Run `node --test tests/manual-proposal-capture.test.mjs` -> PASS**. Then capture the current `D:\CODEX\Meghan -  Emotional Anchor\sales-page-concept` into ignored local staging and inspect all three images.
- [ ] **Step 5: Commit** the script and test only as `feat: capture private proposal previews`.

### Task 5: Draft and Issue Tool

**Files:**
- Create: `scripts/manual-proposal-core.mjs`
- Create: `scripts/manual-proposal.mjs`
- Create: `scripts/manual-proposal.template.json` (client-neutral checked-in template)
- Test: `tests/manual-proposal-authoring.test.mjs`
- Modify: `.env.example` (secret names only)

**Interfaces:**
- Consumes Task 1 draft validator (imported through Node 24 type stripping), Task 2 RPCs, and Task 4 capture manifest.
- Produces `generateManualAccessCode(randomBytes: (length: number) => Uint8Array): string` using 12 unbiased alphabet selections, plus CLI verbs `draft` (with optional `--supersedes`), `issue`, `rotate`, `revoke`, and `cleanup`.
- `issue` uploads only the three captures to private Storage under versioned internal-ID paths, generates the public reference and code, calls the issue RPC with the domain-separated HMAC hash, then prints link and code once. Never prints the service key or writes the plaintext code to a file.

- [ ] **Step 1: Write failing Node tests** with fake RPC/Storage clients. Assert 12 allowed characters, distinct codes from different random bytes, hash-only persistence, one-time plaintext display, no output on failed issue, private upload paths, revision linkage, rotate/revoke behavior, and cleanup that skips objects still referenced by an active version.
- [ ] **Step 2: Run `node --test tests/manual-proposal-authoring.test.mjs` -> FAIL** because the issuer is absent.
- [ ] **Step 3: Implement the core, CLI, and template.** Use the existing Supabase JS dependency and local env; validate the ignored JSON input before any write. Include capture time/source hash in the issued snapshot. For Meghan, prepare an ignored local draft from `PRODUCT.md`/`DESIGN.md` and the draft tier prices, with no invented results or approved-price claim.
- [ ] **Step 4: Run `node --test tests/manual-proposal-authoring.test.mjs` -> PASS**. Exercise only a local/test Supabase target; do not upload or issue remotely.
- [ ] **Step 5: Commit** the tool, client-neutral template, test, and env-name documentation as `feat: author manual proposals`.

### Task 6: Locked Client Route

**Files:**
- Create: `src/app/proposal/client/page.tsx`
- Create: `src/features/manual-proposal/ManualProposalAccess.tsx`
- Create: `src/features/manual-proposal/service.ts`
- Test: `tests/unit/manual-proposal-access.test.tsx`

**Interfaces:**
- Consumes Task 1 `ManualProposalView` and Task 3 response contract.
- Produces `ManualProposalAccess({ service? }: { service?: ManualProposalService })` and `verifyManualProposal(reference: string, accessKey: string): Promise<VerifiedManualProposal>`, where `VerifiedManualProposal = { proposal: ManualProposalView; previewBlobs: { desktop: string | null; tablet: string | null; mobile: string | null } }`.
- The route is noindex; the locked shell renders no name, price, or preview URL. Valid access fetches signed images into in-memory Blob URLs and revokes them on unmount. Refresh returns to the lock.

- [ ] **Step 1: Write failing component tests.** Assert missing/invalid ref and wrong/expired/locked codes share safe messaging, paste works, no content exists before verification, refresh relocks, and a missing/expired image becomes a preview-unavailable state without hiding booking.
- [ ] **Step 2: Run `npx vitest run tests/unit/manual-proposal-access.test.tsx` -> FAIL** because the route/service is absent.
- [ ] **Step 3: Implement the route, service, and access component.** Keep the existing QuizUp `ProposalAccess` untouched; never cache the manual proposal in sessionStorage or localStorage.
- [ ] **Step 4: Run `npx vitest run tests/unit/manual-proposal-access.test.tsx` -> PASS** and run `npm run typecheck`.
- [ ] **Step 5: Commit** the route, service, component, and test as `feat: add locked manual proposal route`.

### Task 7: Proposal Document and Preview Modal

**Files:**
- Create: `src/features/manual-proposal/ManualProposalDocument.tsx`
- Create: `src/features/manual-proposal/ManualProposalPreviewDialog.tsx`
- Create: `src/styles/manual-proposal.css`
- Modify: `src/app/layout.tsx` (stylesheet import only)
- Modify: `src/features/manual-proposal/ManualProposalAccess.tsx` (render verified document)
- Test: `tests/unit/manual-proposal-components.test.tsx`

**Interfaces:**
- Consumes Task 1 quote function and Task 6 verified view with in-memory preview Blob URLs.
- Produces a personalized strategy sequence, selectable Basic/Advanced/Complete cards, conditional priced-inclusion controls, live total/deposit/balance, `/booking/` link, disabled `Reserve My Slot` control, and a focus-managed desktop/tablet/mobile modal.

- [ ] **Step 1: Write failing component tests.** Assert Point A precedes Point B, all three tiers display issued snapshot data, tier/add-on choices update cents, booking link works, reserve cannot submit, modal traps/restores focus and changes image, and right-click/print/F12 deterrents do not block access-code paste or Escape.
- [ ] **Step 2: Run `npx vitest run tests/unit/manual-proposal-components.test.tsx` -> FAIL** because the document/modal is absent.
- [ ] **Step 3: Implement the document, modal, and responsive stylesheet.** Match Elysha Works branding; keep Meghan styling inside the raster preview. Use a concept notice rather than implying her current draft claims are published facts.
- [ ] **Step 4: Run `npx vitest run tests/unit/manual-proposal-components.test.tsx` -> PASS** and run `npm run typecheck`.
- [ ] **Step 5: Commit** the UI files and test as `feat: present manual proposal choices`.

### Task 8: Export, Browser, and Operations Verification

**Files:**
- Create: `tests/e2e/manual-proposal.spec.ts`
- Create: `tests/manual-proposal-export.test.mjs`
- Create: `docs/manual-proposal-operations.md`
- Modify: `GATES.md` (implementation evidence)

**Interfaces:**
- Consumes all earlier tasks; produces the local review handoff and a documented issue/rotate/revoke process. It does not activate remote data or deploy.

- [ ] **Step 1: Write failing E2E/export tests.** Mock the access endpoint and private images; assert direct `/proposal/client/?ref=...` navigation, absent-ref lock, valid unlock, modal modes, mobile no-overflow, disabled checkout, and refresh relock. Assert `out/proposal/client/index.html` exists after export and no Meghan source HTML/assets appear in `out/`.
- [ ] **Step 2: Run `npx playwright test tests/e2e/manual-proposal.spec.ts` and `node --test tests/manual-proposal-export.test.mjs` -> FAIL** for the missing finished route/export.
- [ ] **Step 3: Add the operations runbook and fix only observed integration defects.** Include how to inspect current captures, review tier scope, issue code once, rotate/revoke, clean old assets, and connect a future payment provider whose server recalculates the issued quote and records a reservation only after a verified webhook. Keep the actual Meghan draft in ignored staging until Elysha approves issue/deployment.
- [ ] **Step 4: Run `npm run test:unit`, `npm run test:edge`, `npm run test:supabase:static`, `npm run test:supabase:db`, `npm run build`, targeted Playwright, and export checks -> PASS** or record any local-service limitation precisely. Visually inspect desktop/tablet/mobile captures and the actual local route.
- [ ] **Step 5: Commit** integration tests, runbook, and any focused fixes as `test: verify manual proposal flow`. Report the clean branch, exact verification, preview location, and explicit remaining deployment/payment steps.
