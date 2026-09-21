# Homepage and Local Quiz Cortex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the injected legacy homepage with the approved seven-section React experience and add a fully interactive, no-reload `/quiz` journey powered by the versioned local Cortex without connecting to Supabase.

**Architecture:** Preserve the approved hero markup and stylesheet, then rebuild the homepage as focused React components with a contextual sticky navbar. Implement the quiz as a typed reducer-driven client feature whose questions, catalog, Cortex, persistence, and result presentation have separate boundaries; use versioned local storage for 30-day recovery and pure deterministic functions for scoring and pricing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, authored CSS, Vitest, Testing Library, jsdom, Playwright, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-22-homepage-quiz-cortex-design.md`

## Global Constraints

- The homepage section order is exactly Hero, Projects, Founder/About, Testimonial, FAQ, Final CTA, Footer.
- Preserve the approved hero's copy, hierarchy, Inter typography, black atmosphere, white text, `#FFD369` accent, glow, and responsive behavior.
- Do not render a navbar over the hero; reveal the sticky navbar when Projects reaches the viewport top and hide it when the hero returns.
- The hero's two assessment actions navigate to `/quiz`.
- The quiz contains audience selection followed by six audience questions and two universal questions.
- Use `cortex-local-v0.1` exactly as documented in blueprint Sections 6.8–6.13.
- Store no personal information and make no Supabase, database, analytics, or lead-submission request in this phase.
- Do not modify `firebase.json`, `.firebaserc`, hosting targets, Firebase projects, Firestore, booking infrastructure, legal pages, or protected project-preview assets.
- Use only verified repository project content and the explicitly approved testimonial placeholder.
- Preserve existing dirty-worktree changes; stage only the files named by the current task.
- Do not use CSS `zoom` or whole-section `transform: scale()` for responsiveness.
- Respect `prefers-reduced-motion` and prevent horizontal overflow from 320px through 2560px widths.

## Review Focus

- Corrupt, expired, or version-incompatible local quiz state must restart safely without losing control of the interface; Task 4 tests all three cases.
- Multi-select answers and unknown option keys must not inflate or corrupt scoring; Task 3 tests per-question caps and boundary rejection.
- Choosing Custom App without a genuine custom signal must not force the custom route; Task 3 locks the platform-preference guardrail.
- An add-on included in the chosen package must never be charged twice; Task 3 tests selected, included, priced, and scope-review partitions.
- Short laptops and 320px mobile screens must not clip hero/result content, overflow horizontally, or let the contextual navbar cover the active section; Task 11 covers these browser conditions.

---

## Planned File Structure

### Shared data and homepage

- `src/data/projects.ts` — verified project records and protected-preview URLs.
- `src/data/site-content.ts` — founder, testimonial placeholder, FAQ, final CTA, footer, and navigation copy.
- `src/components/home/Hero.tsx` — approved hero markup only.
- `src/components/home/ContextualNav.tsx` — Projects-triggered sticky navigation and mobile menu.
- `src/components/home/ProjectsSection.tsx` — two featured and two supporting projects.
- `src/components/home/ProjectPreviewDialog.tsx` — accessible protected screenshot viewer.
- `src/components/home/FounderSection.tsx` — verified portrait and approved founder copy.
- `src/components/home/TestimonialSection.tsx` — approved honest placeholder.
- `src/components/home/FaqSection.tsx` — eight-question accordion.
- `src/components/home/FinalCtaSection.tsx` — closing roadmap action.
- `src/components/home/SiteFooter.tsx` — identity, navigation, and verified legal/social links.
- `src/styles/portfolio.css` — homepage, contextual navigation, and shared section styles.

### Quiz feature

- `src/features/quiz/types.ts` — stable domain types and public interfaces.
- `src/features/quiz/questions.ts` — all 95 stable options and tag mappings.
- `src/features/quiz/catalog.ts` — seven packages, approved add-ons, inclusion keys, and prices.
- `src/features/quiz/cortex.ts` — pure scoring, route, package, pricing, and explanation engine.
- `src/features/quiz/persistence.ts` — versioned local-storage validation and 30-day expiry.
- `src/features/quiz/reducer.ts` — screen, answer, navigation, resume, and completion transitions.
- `src/features/quiz/QuizExperience.tsx` — client orchestrator.
- `src/features/quiz/AudienceSelector.tsx` — three audience cards.
- `src/features/quiz/QuizQuestion.tsx` — accessible single/multi-select question screen.
- `src/features/quiz/QuizResult.tsx` — complete recommendation and price breakdown.
- `src/styles/quiz.css` — quiz and result visual system.

### Routes and tests

- `src/app/page.tsx` — React homepage composition.
- `src/app/quiz/page.tsx` — static-export-safe quiz route.
- `src/app/layout.tsx` — shared fonts/styles only; remove legacy runtime injection.
- `tests/unit/quiz-config.test.ts` — definition completeness and catalog integrity.
- `tests/unit/cortex.test.ts` — scoring and pricing contract.
- `tests/unit/quiz-persistence.test.ts` — local envelope validation.
- `tests/unit/quiz-reducer.test.ts` — navigation state machine.
- `tests/unit/home-components.test.tsx` — homepage structure and accessible interactions.
- `tests/unit/quiz-components.test.tsx` — quiz and result interaction.
- `tests/e2e/portfolio-quiz.spec.ts` — viewport, navigation, persistence, and no-network verification.
- `vitest.config.ts`, `tests/vitest.setup.ts`, `playwright.config.ts` — test runners.

---

### Task 1: Generate and analyze section-specific visual references

**Files:**
- Create: `docs/design-references/homepage-quiz/projects.webp`
- Create: `docs/design-references/homepage-quiz/founder.webp`
- Create: `docs/design-references/homepage-quiz/testimonial.webp`
- Create: `docs/design-references/homepage-quiz/faq.webp`
- Create: `docs/design-references/homepage-quiz/final-cta-footer.webp`
- Create: `docs/design-references/homepage-quiz/quiz-question.webp`
- Create: `docs/design-references/homepage-quiz/quiz-result.webp`
- Create: `docs/design-references/homepage-quiz/analysis.md`

**Interfaces:**
- Consumes: approved hero screenshots/styles and the design spec.
- Produces: seven implementation references plus measured analysis used by Tasks 5–9.

- [ ] **Step 1: Generate one fresh reference per requested section**

Use the image-generation workflow with the approved hero as the brand reference. Every prompt must specify Inter-led typography, near-black atmospheric background, `#FFD369` gold, white type, restrained glow, open editorial layout, no invented claims, no fake client identity, and a 1366×768-safe composition. Generate each section as a standalone image; do not crop a larger board.

- [ ] **Step 2: Inspect each reference at original detail**

Record in `analysis.md` for every reference: grid, max content width, type hierarchy, spacing rhythm, border/divider treatment, image treatment, control states, mobile reflow intent, and anything intentionally excluded.

- [ ] **Step 3: Verify brand and content boundaries**

Confirm that the testimonial says only **Client testimonial will be added after review and approval**, project references use repository names/assets, and no generated image introduces prices, metrics, services, people, or outcomes absent from the blueprint.

- [ ] **Step 4: Commit the visual source of truth**

```bash
git add docs/design-references/homepage-quiz
git commit -m "docs: add homepage and quiz visual references"
```

### Task 2: Add the typed quiz configuration and test harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/vitest.setup.ts`
- Create: `src/features/quiz/types.ts`
- Create: `src/features/quiz/questions.ts`
- Create: `src/features/quiz/catalog.ts`
- Create: `src/data/projects.ts`
- Create: `src/data/site-content.ts`
- Create: `tests/unit/quiz-config.test.ts`

**Interfaces:**
- Consumes: blueprint question copy, option keys, tag dictionary, seven package records, add-ons, and verified repository content.
- Produces: `QuizDefinition`, `QuestionDefinition`, `QuizAnswers`, `PackageDefinition`, `AddonDefinition`, `QUIZ_DEFINITIONS`, `PACKAGE_CATALOG`, `ADDON_CATALOG`, `PROJECTS`, and `SITE_CONTENT`.

- [ ] **Step 1: Install the focused test dependencies**

```bash
npm install --save-dev vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test
```

Add scripts:

```json
{
  "test:static": "node --test tests/live-copy.test.mjs",
  "test:unit": "vitest run",
  "test:e2e": "playwright test",
  "test": "npm run test:static && npm run test:unit"
}
```

- [ ] **Step 2: Configure Vitest and the DOM matchers**

```ts
// vitest.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/vitest.setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
```

```ts
// tests/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write failing configuration tests**

Test exact invariants:

```ts
expect(Object.keys(QUIZ_DEFINITIONS)).toEqual([
  "coaches_educators",
  "service_businesses",
  "custom_order_businesses",
]);
expect(QUIZ_DEFINITIONS.coaches_educators.questions).toHaveLength(8);
expect(allOptionKeys).toHaveLength(95);
expect(new Set(allOptionKeys).size).toBe(95);
expect(PACKAGE_CATALOG).toHaveLength(7);
expect(ADDON_CATALOG).toHaveLength(21);
expect(PROJECTS).toHaveLength(4);
```

Also assert every question has a stable key, Q4/Q8 are multi-select, Q6/Q7 are universal, every signal tag belongs to the approved dictionary, package/add-on keys and prices match the blueprint, and no project contains an invented numeric outcome.

- [ ] **Step 4: Run the test and verify the missing modules fail**

Run: `npm run test:unit -- tests/unit/quiz-config.test.ts`

Expected: FAIL because the configuration modules do not exist.

- [ ] **Step 5: Implement the public domain types**

Define exact unions and interfaces:

```ts
export type AudienceKey =
  | "coaches_educators"
  | "service_businesses"
  | "custom_order_businesses";

export type SignalTag =
  | "credibility" | "lead_generation" | "booking" | "enrollment"
  | "checkout" | "follow_up" | "pipeline" | "onboarding"
  | "course_delivery" | "disconnected_tools" | "multiple_offers"
  | "portal" | "dashboard" | "custom_orders" | "approvals"
  | "inventory" | "multiple_roles" | "integration" | "order_tracking"
  | "migration" | "simple_scope" | "no_system_effect";

export interface QuizOption {
  key: string;
  label: string;
  signals: readonly SignalTag[];
  addonKey?: string;
  readiness?: ReadinessLevel;
  platformPreference?: "systeme_io" | "gohighlevel" | "custom_app";
}
```

Add complete result, package, add-on, explanation-trace, and saved-attempt interfaces named in the spec. Do not include Supabase IDs.

- [ ] **Step 6: Enter all reviewed content once**

Implement all 95 stable option keys and tag mappings from blueprint Section 6.10. Mirror the seven packages and 21 add-ons from `supabase/seed.sql` as typed local configuration, including inclusion keys, integration limits, starting-price flags, and scope-review flags. Add the four verified projects and all approved homepage copy.

- [ ] **Step 7: Run configuration tests**

Run: `npm run test:unit -- tests/unit/quiz-config.test.ts`

Expected: PASS with 95 unique options, seven packages, 21 add-ons, and four projects.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/vitest.setup.ts tests/unit/quiz-config.test.ts src/features/quiz/types.ts src/features/quiz/questions.ts src/features/quiz/catalog.ts src/data/projects.ts src/data/site-content.ts
git commit -m "feat: add typed portfolio quiz configuration"
```

### Task 3: Implement the pure Cortex engine with locked outcomes

**Files:**
- Create: `src/features/quiz/cortex.ts`
- Create: `tests/unit/cortex.test.ts`

**Interfaces:**
- Consumes: `QuizAnswers`, `AudienceKey`, `QUIZ_DEFINITIONS`, `PACKAGE_CATALOG`, and `ADDON_CATALOG` from Task 2.
- Produces: `calculateRecommendation(input: CortexInput): CortexResult` and `validateAnswers(input: CortexInput): ValidationResult`.

- [ ] **Step 1: Write failing aggregation and validation tests**

Cover:

```ts
expect(validateAnswers(validInput)).toEqual({ valid: true, missingQuestionKeys: [] });
expect(() => calculateRecommendation(inputWithUnknownOption)).toThrow(
  /unknown option key/i,
);
expect(result.scores.customApp).toBeLessThanOrEqual(18);
```

Create a Q4/Q8 answer that selects every option and assert every per-question dimension contribution is capped at `3` while `inventory` and `multiple_roles` flags remain present.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm run test:unit -- tests/unit/cortex.test.ts`

Expected: FAIL because `calculateRecommendation` and `validateAnswers` do not exist.

- [ ] **Step 3: Implement signal aggregation and traces**

Use a single reviewed `SIGNAL_WEIGHTS` record and explicit keys:

```ts
export function calculateRecommendation(input: CortexInput): CortexResult {
  const validated = assertCompleteAnswers(input);
  const scored = aggregateAnswers(validated);
  const solution = chooseSolutions(scored, validated);
  const route = chooseBuildRoute(scored, solution, validated);
  const offer = chooseOffer(route, scored, validated);
  const pricing = resolvePricing(offer, validated);
  return buildResult(input, scored, solution, route, offer, pricing);
}
```

Clamp each dimension after aggregating each question, not after the entire quiz. Store question key, option keys, tags, before/after values, and triggered flags in `explanationTrace`.

- [ ] **Step 4: Write the ten acceptance-persona tests**

Create named fixtures for all blueprint Section 6.13 personas. Assert exact primary solution, platform, route, offer key, readiness, base price, and relevant flags. Include Custom App preference without a genuine custom signal and Researching with high-complexity scope.

- [ ] **Step 5: Write tie-break and package-boundary tests**

Assert:

- Website wins a credibility/information tie.
- Funnel wins a booking/enrollment tie.
- CRM wins pipeline visibility; Automation wins repetitive communication.
- Systeme.io wins course/enrollment platform ties; GoHighLevel wins booking/pipeline ties.
- Complexity `4/5`, `8/9`, `9/10`, and `12/13` cross the documented package boundaries.
- Portal/dashboard raises Custom Starter to Custom Growth.
- Inventory or advanced roles returns Custom Complete.

- [ ] **Step 6: Write pricing partition tests**

Assert a selected capability appears in exactly one of:

```ts
result.includedCapabilities
result.pricedAddons
result.scopeReviewItems
```

Verify package allowances consume standard integrations, migration is `$500+` with scope review, SMS is disclosed but not silently priced, `adjustmentTotalUsd === 0`, and the investment equals base plus priced add-ons.

- [ ] **Step 7: Implement route, offer, tie-break, and pricing helpers**

Keep helpers pure and file-local except for the two public functions. Do not read local storage, React state, environment variables, or network data inside `cortex.ts`.

- [ ] **Step 8: Run the Cortex suite**

Run: `npm run test:unit -- tests/unit/cortex.test.ts`

Expected: PASS for validation, caps, all ten personas, ties, guardrails, package boundaries, pricing, and deterministic repeated execution.

- [ ] **Step 9: Commit**

```bash
git add src/features/quiz/cortex.ts tests/unit/cortex.test.ts
git commit -m "feat: implement local quiz cortex"
```

### Task 4: Implement quiz reducer and 30-day local persistence

**Files:**
- Create: `src/features/quiz/persistence.ts`
- Create: `src/features/quiz/reducer.ts`
- Create: `tests/unit/quiz-persistence.test.ts`
- Create: `tests/unit/quiz-reducer.test.ts`

**Interfaces:**
- Consumes: `QuizAnswers`, `CortexResult`, version constants, and question definitions.
- Produces: `loadQuizAttempt(storage, now)`, `saveQuizAttempt(storage, attempt)`, `clearQuizAttempt(storage)`, `createInitialQuizState()`, and `quizReducer(state, action)`.

- [ ] **Step 1: Write failing persistence tests**

Use an in-memory `Storage` test double and fixed timestamps. Test valid restoration, exactly-30-day boundary, expired state, corrupt JSON, missing required properties, unknown audience, incompatible storage/Cortex/question/catalog versions, and preservation of an immutable completed result snapshot.

- [ ] **Step 2: Run persistence tests and confirm failure**

Run: `npm run test:unit -- tests/unit/quiz-persistence.test.ts`

Expected: FAIL because persistence functions do not exist.

- [ ] **Step 3: Implement strict local-envelope validation**

Use one key:

```ts
export const QUIZ_STORAGE_KEY = "elysha-works:quiz-attempt:v1";
export const QUIZ_STORAGE_VERSION = 1;
export const QUIZ_TTL_MS = 30 * 24 * 60 * 60 * 1000;
```

Return a discriminated result such as `{ status: "valid", attempt }`, `{ status: "missing" }`, or `{ status: "discarded", reason }`. Never throw for user-controlled stored JSON.

- [ ] **Step 4: Write failing reducer tests**

Cover audience selection, intro continuation, single/multi-select answers, Back, answer editing, resume, dismiss resume, restart, invalid Next, calculation start, calculation success, and calculation failure preserving answers.

- [ ] **Step 5: Implement the reducer**

Use explicit screens:

```ts
type QuizScreen =
  | "audience"
  | "intro"
  | "question"
  | "calculating"
  | "result"
  | "error";
```

Keep storage writes outside the reducer; it remains pure. Return the first missing question key when completion is attempted early.

- [ ] **Step 6: Run both suites**

Run: `npm run test:unit -- tests/unit/quiz-persistence.test.ts tests/unit/quiz-reducer.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/quiz/persistence.ts src/features/quiz/reducer.ts tests/unit/quiz-persistence.test.ts tests/unit/quiz-reducer.test.ts
git commit -m "feat: add local quiz state and recovery"
```

### Task 5: Preserve the approved hero and build the contextual navbar

**Files:**
- Create: `src/components/home/Hero.tsx`
- Create: `src/components/home/ContextualNav.tsx`
- Create: `src/styles/portfolio.css`
- Create: `tests/unit/home-components.test.tsx`
- Retain: `public/hero-roadmap.css`

**Interfaces:**
- Consumes: `SITE_CONTENT`, the existing hero classes, and Next `Link`.
- Produces: exact React hero and Projects-triggered navigation consumed by Task 8.

- [ ] **Step 1: Write failing component tests for the hero and contextual navbar**

Assert exact hero copy, four benefits, both `/quiz` links, no logo/navbar inside the hero, desktop nav links, mobile menu accessibility, and nav hidden state before the Projects observer reports intersection.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm run test:unit -- tests/unit/home-components.test.tsx`

Expected: FAIL because the hero and navbar components do not exist.

- [ ] **Step 3: Implement the React hero without visual reinterpretation**

Port the current `.hero-roadmap` hierarchy exactly, replacing anchors with `Link href="/quiz"`. Preserve the classes expected by `public/hero-roadmap.css` and the existing hero responsive test.

- [ ] **Step 4: Implement `ContextualNav` with observer injection seam**

Observe `#projects` and the hero. The nav is visible only after the hero leaves and Projects has been reached. Close the mobile menu on Escape, link activation, outside click, and desktop breakpoint. Use `aria-current="location"` for the active section and restore focus to the menu button after Escape.

- [ ] **Step 5: Run focused tests**

Run: `npm run test:unit -- tests/unit/home-components.test.tsx`

Expected: PASS for the hero hierarchy and navbar behavior.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/Hero.tsx src/components/home/ContextualNav.tsx src/styles/portfolio.css public/hero-roadmap.css tests/unit/home-components.test.tsx
git commit -m "feat: preserve hero and add contextual navigation"
```

### Task 6: Build the verified Projects section and preview dialog

**Files:**
- Create: `src/components/home/ProjectsSection.tsx`
- Create: `src/components/home/ProjectPreviewDialog.tsx`
- Modify: `src/styles/portfolio.css`
- Modify: `tests/unit/home-components.test.tsx`

**Interfaces:**
- Consumes: `PROJECTS` from `src/data/projects.ts`.
- Produces: `ProjectsSection` with `id="projects"` and an accessible dialog that loads only allow-listed local preview URLs.

- [ ] **Step 1: Write failing project rendering and dialog tests**

Assert four verified projects, two featured layouts, status labels, no fabricated numeric metrics, local preview buttons, dialog title/description, Escape close, close-button focus return, and rejection of a preview URL not present in `PROJECTS`.

- [ ] **Step 2: Run the tests and confirm failure**

Run: `npm run test:unit -- tests/unit/home-components.test.tsx`

Expected: FAIL because the project components do not exist.

- [ ] **Step 3: Implement Projects and the allow-listed viewer**

Render two featured project articles and two supporting articles from data, not duplicated markup. The dialog uses a sandboxed iframe with `referrerPolicy="no-referrer"`, device-size controls, focus trapping, Escape close, and an explicit close button. Never interpolate an arbitrary URL supplied by the visitor.

- [ ] **Step 4: Style to the approved Projects reference**

Use image-led editorial rhythm, gold hairlines, dark open surfaces, and nonuniform featured/supporting scale. At mobile widths, stack content and keep preview controls within the viewport.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- tests/unit/home-components.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/ProjectsSection.tsx src/components/home/ProjectPreviewDialog.tsx src/styles/portfolio.css tests/unit/home-components.test.tsx
git commit -m "feat: add verified project showcase"
```

### Task 7: Build Founder, testimonial, FAQ, final CTA, and footer

**Files:**
- Create: `src/components/home/FounderSection.tsx`
- Create: `src/components/home/TestimonialSection.tsx`
- Create: `src/components/home/FaqSection.tsx`
- Create: `src/components/home/FinalCtaSection.tsx`
- Create: `src/components/home/SiteFooter.tsx`
- Modify: `src/styles/portfolio.css`
- Modify: `tests/unit/home-components.test.tsx`

**Interfaces:**
- Consumes: `SITE_CONTENT`, existing portrait `/assets/v3-hero/elysha-portrait-cutout.png`, and verified legal links.
- Produces: the remaining five homepage sections with `about` and `faq` anchors.

- [ ] **Step 1: Write failing content and interaction tests**

Assert approved founder heading/copy, portrait alt text, exact testimonial placeholder with no attribution, all eight FAQ questions, one-at-a-time FAQ expansion, `/quiz` final CTA, Privacy/Terms links, and omission of social anchors whose URL is absent.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:unit -- tests/unit/home-components.test.tsx`

Expected: FAIL because the section components do not exist.

- [ ] **Step 3: Implement the five components from configuration**

Use semantic `section`, `figure`, `details`/controlled disclosure, navigation, and footer landmarks. Do not place placeholder links with `href="#"`.

- [ ] **Step 4: Style each section as a distinct rhythm**

Follow the reference analysis: editorial founder split, restrained full-width testimonial placeholder, two-column FAQ at desktop, luminous but concise final CTA, and compact footer. Keep the same typography/palette while avoiding repeated card grids.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- tests/unit/home-components.test.tsx`

Expected: PASS for content, FAQ interaction, CTA, and legal boundaries.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/FounderSection.tsx src/components/home/TestimonialSection.tsx src/components/home/FaqSection.tsx src/components/home/FinalCtaSection.tsx src/components/home/SiteFooter.tsx src/styles/portfolio.css tests/unit/home-components.test.tsx
git commit -m "feat: complete portfolio homepage sections"
```

### Task 8: Compose the React homepage and remove the legacy runtime boundary

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/live-copy.test.mjs`
- Stop importing: `src/app/live-runtime.tsx`

**Interfaces:**
- Consumes: all homepage components from Tasks 5–7.
- Produces: the exact seven-section homepage, shared stylesheet imports, and a clean React boundary used by browser tests.

- [ ] **Step 1: Replace obsolete static assertions with failing React-boundary assertions**

Update `tests/live-copy.test.mjs` to assert:

```js
assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
assert.doesNotMatch(page, /live-home\.html/);
assert.match(page, /<Hero/);
assert.match(page, /<ProjectsSection/);
```

Also assert `layout.tsx` no longer renders `LiveRuntime` or imports Rhea/scroll-scene styles, while it still imports fonts, `hero-roadmap.css`, `globals.css`, and `portfolio.css`.

- [ ] **Step 2: Run static tests and confirm failure against the legacy shell**

Run: `npm run test:static`

Expected: FAIL because `page.tsx` still reads `live-home.html` and uses `dangerouslySetInnerHTML`.

- [ ] **Step 3: Compose the exact homepage order**

Render:

```tsx
<>
  <Hero />
  <ContextualNav />
  <ProjectsSection />
  <FounderSection />
  <TestimonialSection />
  <FaqSection />
  <FinalCtaSection />
  <SiteFooter />
</>
```

The navigation is application chrome and is not counted as a content section. Keep the DOM order of the seven content sections exactly as approved.

- [ ] **Step 4: Remove the legacy runtime from the root layout**

Stop rendering `LiveRuntime` and stop importing legacy homepage/Rhea/scroll-scene/project-viewer styles. Import `src/styles/portfolio.css`. Do not delete public legacy assets because auxiliary routes may still reference them.

- [ ] **Step 5: Run static, unit, lint, and type checks**

Run: `npm run test:static && npm run test:unit -- tests/unit/home-components.test.tsx && npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx src/app/globals.css tests/live-copy.test.mjs
git commit -m "feat: compose custom React homepage"
```

### Task 9: Build the no-reload quiz question journey

**Files:**
- Create: `src/app/quiz/page.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/features/quiz/QuizExperience.tsx`
- Create: `src/features/quiz/AudienceSelector.tsx`
- Create: `src/features/quiz/QuizQuestion.tsx`
- Create: `src/styles/quiz.css`
- Create: `tests/unit/quiz-components.test.tsx`

**Interfaces:**
- Consumes: quiz reducer, persistence functions, question definitions, and `calculateRecommendation`.
- Produces: accessible `/quiz` audience, intro, question, resume, calculating, and error states.

- [ ] **Step 1: Write failing audience and question-flow tests**

Use Testing Library and user-event to assert:

- three audience cards
- audience selection opens instructions
- Continue opens Q1 with `Question 1 of 8`
- single-select advances without a document navigation
- multi-select permits several choices and requires Continue
- Back preserves selections
- Q8 completion invokes `calculateRecommendation` once
- missing required answers cannot calculate

- [ ] **Step 2: Write failing resume and error tests**

Mock `loadQuizAttempt` for valid unfinished, expired, corrupt, and completed attempts. Assert Resume, Start Over, Not Now, restored progress, safe clean state, result restoration, calculation Retry, and answers preserved after a calculation error.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm run test:unit -- tests/unit/quiz-components.test.tsx`

Expected: FAIL because quiz components and route do not exist.

- [ ] **Step 4: Implement the route and client orchestrator**

Keep `page.tsx` as a static-export-safe server wrapper and put hooks in `QuizExperience.tsx` with `"use client"`. Import `src/styles/quiz.css` from the root layout. Persist after completed answers and after calculation. Use a live region for progress/errors and move focus to each new question heading.

- [ ] **Step 5: Implement accessible audience and answer controls**

Use real buttons, `aria-pressed` for multi-select choices, and radio semantics or single-choice buttons with a clear selected state. Disable Continue until the current required selection is valid. Do not use clickable `div` elements.

- [ ] **Step 6: Style question screens from the approved reference**

Use a focused central composition, gold progress line, strong white question type, generous answer rows, and explicit hover/focus/selected states. Ensure 44px minimum targets and natural wrapping at 320px.

- [ ] **Step 7: Run component tests**

Run: `npm run test:unit -- tests/unit/quiz-components.test.tsx`

Expected: PASS for no-reload state transitions, navigation, persistence prompts, errors, and keyboard-accessible controls.

- [ ] **Step 8: Commit**

```bash
git add src/app/quiz/page.tsx src/app/layout.tsx src/features/quiz/QuizExperience.tsx src/features/quiz/AudienceSelector.tsx src/features/quiz/QuizQuestion.tsx src/styles/quiz.css tests/unit/quiz-components.test.tsx
git commit -m "feat: add interactive local quiz flow"
```

### Task 10: Build the complete recommendation result

**Files:**
- Create: `src/features/quiz/QuizResult.tsx`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `src/styles/quiz.css`
- Modify: `tests/unit/quiz-components.test.tsx`

**Interfaces:**
- Consumes: `CortexResult` and audience-filtered `PROJECTS`.
- Produces: complete result view, restart action, relevant projects, and booking CTA.

- [ ] **Step 1: Write a failing result-completeness test**

Render a fixed `CortexResult` and assert all sixteen result blocks from the spec, exact base/add-on/total formatting, `Starting at` and scope-review labels, separate recurring-cost notice, explanation reasons, relevant projects, no contact gate, and booking link.

- [ ] **Step 2: Write defensive rendering tests**

Assert empty supporting solutions are omitted cleanly, zero priced add-ons show an Included/No additional priced support message, unknown configuration references produce a safe error view rather than `$0`, and Restart clears only quiz storage.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm run test:unit -- tests/unit/quiz-components.test.tsx`

Expected: FAIL because `QuizResult` does not exist.

- [ ] **Step 4: Implement `QuizResult`**

Use `Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })`. Render values from the immutable result snapshot only; do not recalculate during presentation. Mark the output as a planning estimate, not a binding quotation.

- [ ] **Step 5: Style the result from the approved reference**

Use one strong recommendation focal area, open itemized rows, restrained gold dividers, and clear Included/Priced/Scope Review groupings. Avoid nested card stacks. Stack all columns on mobile without changing reading order.

- [ ] **Step 6: Run component tests**

Run: `npm run test:unit -- tests/unit/quiz-components.test.tsx`

Expected: PASS for all result branches.

- [ ] **Step 7: Commit**

```bash
git add src/features/quiz/QuizResult.tsx src/features/quiz/QuizExperience.tsx src/styles/quiz.css tests/unit/quiz-components.test.tsx
git commit -m "feat: render transparent quiz recommendations"
```

### Task 11: Add browser-level responsive, sticky-nav, and no-network verification

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/portfolio-quiz.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/hero-responsive-check.mjs` if selectors require alignment with the React hero

**Interfaces:**
- Consumes: built homepage and `/quiz` route.
- Produces: repeatable end-to-end checks across the required viewport matrix.

- [ ] **Step 1: Configure Playwright with the local Next server**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "short-laptop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
```

- [ ] **Step 2: Write failing homepage behavior tests**

Assert the nav is hidden in the hero, appears at Projects, has correct links/CTA, hides after returning to the hero, does not cover the Projects heading, FAQ works, project dialog opens/closes with focus return, and all seven sections appear in exact DOM order.

- [ ] **Step 3: Write failing quiz journey and no-reload tests**

Complete one audience path, record the initial navigation-entry count, and assert it remains unchanged through all eight questions. Reload after Q3 to test Resume. Complete the quiz and assert the expected result blocks and local snapshot.

- [ ] **Step 4: Block unexpected backend traffic**

Capture requests and fail if a quiz interaction contacts a Supabase hostname, `/rest/v1`, `/auth/v1`, `/functions/v1`, Firebase database endpoint, analytics collection endpoint, or any nonlocal API. Static font/image/document requests remain allowed.

- [ ] **Step 5: Add responsive assertions**

For widths `320`, `360`, `375`, `390`, `430`, `768`, `834`, `1024`, `1366`, `1440`, `1536`, `1920`, and `2560`, assert `scrollWidth <= clientWidth + 1`. At short-laptop height, assert hero CTA and secondary link remain within the first viewport. At mobile widths, assert answer controls and result rows remain at least 44px tall and CTA text does not overflow.

- [ ] **Step 6: Run browser tests**

Run: `npx playwright install chromium`

Run: `npm run test:e2e`

Expected: PASS in all four Playwright projects and the explicit viewport loop.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/portfolio-quiz.spec.ts tests/hero-responsive-check.mjs package.json package-lock.json
git commit -m "test: verify portfolio and quiz in browser"
```

### Task 12: Final static-export and regression verification

**Files:**
- Modify: `tests/live-copy.test.mjs`
- Modify: project files only when a failing verification exposes a product defect

**Interfaces:**
- Consumes: all prior tasks.
- Produces: reproducible clean build, static export, test evidence, and final review-ready branch.

- [ ] **Step 1: Extend static-export assertions**

Assert after build:

```js
for (const file of [
  "out/index.html",
  "out/quiz/index.html",
  "out/booking/index.html",
  "out/elysha-works-privacy-policy/index.html",
  "out/elysha-works-terms-of-service/index.html",
]) {
  assert.ok(existsSync(fromRoot(file)), `missing ${file}`);
}
```

Also statically scan `src/features/quiz` for `@supabase`, `supabase-js`, `.from(`, `/rest/v1`, and service-role strings; expect no match.

- [ ] **Step 2: Run the complete automated suite**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected: every command exits `0`; `out/quiz/index.html` exists.

- [ ] **Step 3: Inspect the production export**

Serve `out` locally and verify `/`, `/quiz/`, `/booking/`, Privacy, Terms, and one protected project preview return `200`. Confirm no console errors, failed local assets, or unexpected network calls.

- [ ] **Step 4: Compare implementation against every visual reference**

Capture desktop, short-laptop, tablet, and mobile screenshots for the homepage, a representative quiz question, and a result. Compare typography, alignment, spacing, glow restraint, button hierarchy, and section rhythm to `docs/design-references/homepage-quiz/analysis.md`. Fix product CSS, not test tolerances, when the visual contract is missed.

- [ ] **Step 5: Confirm infrastructure boundaries**

Run:

```bash
git diff --name-only $(git merge-base HEAD origin/HEAD)..HEAD
git diff -- firebase.json .firebaserc supabase/migrations supabase/seed.sql
```

Expected: no task commit changes Firebase configuration, Supabase migrations, or seed data.

- [ ] **Step 6: Route any discovered defect back to its owning task**

If Steps 2–5 expose a defect, correct it in the file set and test cycle of Tasks 2–11, use that task's explicit staging command, and rerun the entire Task 12 verification sequence. If no defect is found, create no empty final commit.
