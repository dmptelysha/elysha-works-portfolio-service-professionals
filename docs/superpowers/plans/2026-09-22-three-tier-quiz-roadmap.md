# Three-Tier Quiz Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-offer quiz result with an ungated, no-reload Basic/Advanced/Complete comparison where the visitor can choose a feasible Systeme.io, HighLevel, or Custom App variant and receive a recalculated personalized roadmap.

**Architecture:** Keep the seven stable catalog records as the pricing source of truth and add a pure presentation/selection layer that groups them into three public tiers. The Cortex remains responsible for the technical recommendation; a separate roadmap-selection module builds feasible alternatives and recalculates inclusions, add-ons, and totals without mutating the original recommendation. React owns only interaction state and local persistence.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Playwright, existing CSS design system.

**Spec:** `docs/portfolio-blueprint.md`, especially Sections 3.5, 5.0, 5.1–5.5, and 6.

## Global Constraints

- Keep all seven stable `offer_key` values and all already approved prices unchanged.
- Public tiers are exactly `basic`, `advanced`, and `complete`.
- Systeme.io and HighLevel use the same one-time build price for equivalent tier/scope.
- `custom_complete` is a scope-review escalation inside Complete, not a fourth public card.
- A functional Basic option must not be weakened to force an upgrade.
- A platform preference may not override a Cortex technical incompatibility.
- The full result remains visible without name, email, booking, or database access.
- Selection and recalculation must happen without navigation or page reload.
- This plan does not connect Supabase, Make, Gmail, or any analytics endpoint.
- Existing Firebase Hosting configuration and existing Firestore/Supabase data remain untouched.

## Review Focus

- Hard custom requirements: inventory, advanced operational roles, or a Cortex custom route must disable Systeme.io and HighLevel with an explicit explanation.
- Tier/platform switching: every feasible switch must derive the correct stable offer key and recalculate included/priced/scope-review items without double charging.
- `custom_complete`: critical custom results must remain Complete while showing `$10,000+` and scope review.
- Persistence compatibility: existing version-1 local quiz attempts must still load, then normalize to the new selection model without losing answers or the original result.
- Responsive/accessibility behavior: three tier cards and platform controls must work at 320px without horizontal overflow and with keyboard-visible selected/disabled states.

---

### Task 1: Lock the public tier contract in types and catalog configuration

**Files:**
- Modify: `src/features/quiz/types.ts`
- Create: `src/features/quiz/roadmap-tiers.ts`
- Modify: `tests/unit/quiz-config.test.ts`

**Interfaces:**
- Consumes: existing `PackageDefinition`, `PlatformKey`, `PACKAGE_BY_KEY`.
- Produces: `PublicTierKey`, `RoadmapVariant`, `RoadmapTier`, `RoadmapSelection`, `PUBLIC_TIER_DEFINITIONS`, `offerKeyForTierPlatform()`.

- [ ] **Step 1: Write failing mapping tests**

Add assertions covering the exact approved matrix:

```ts
expect(offerKeyForTierPlatform("basic", "systeme_io")).toBe("platform_launch");
expect(offerKeyForTierPlatform("basic", "gohighlevel")).toBe("platform_launch");
expect(offerKeyForTierPlatform("basic", "custom_app")).toBe("custom_starter");
expect(offerKeyForTierPlatform("advanced", "custom_app")).toBe("custom_foundation");
expect(offerKeyForTierPlatform("complete", "systeme_io")).toBe("platform_scale");
expect(offerKeyForTierPlatform("complete", "custom_app")).toBe("custom_growth");
```

Also assert that every referenced offer exists, supports the mapped platform, and exposes the approved base price: `$1,500/$3,000`, `$2,500/$5,000`, and `$4,000/$7,500`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/quiz-config.test.ts`

Expected: FAIL because the public-tier types and mapping do not exist.

- [ ] **Step 3: Add the exact public-tier types**

Add these contracts to `types.ts`:

```ts
export type PublicTierKey = "basic" | "advanced" | "complete";
export type RoadmapFeasibility =
  | { available: true }
  | { available: false; reason: string };

export interface RoadmapSelection {
  tierKey: PublicTierKey;
  platform: PlatformKey;
  offerKey: string;
}
```

Define `RoadmapVariant` with `platform`, `offer`, `feasibility`, `includedCapabilities`, `selectedSupportItems`, `pricedAddons`, `scopeReviewItems`, `addonTotalUsd`, and `estimatedProjectInvestmentUsd`. Define `RoadmapTier` with `tierKey`, `label`, `promise`, `recommended`, and `variants`.

- [ ] **Step 4: Implement immutable tier definitions and lookup**

Create `roadmap-tiers.ts` with the exact mapping:

```ts
export const PUBLIC_TIER_DEFINITIONS = [
  {
    tierKey: "basic",
    label: "Basic",
    promise: "A complete working version of your primary journey.",
    offerKeys: {
      systeme_io: "platform_launch",
      gohighlevel: "platform_launch",
      custom_app: "custom_starter",
    },
  },
  {
    tierKey: "advanced",
    label: "Advanced",
    promise: "A connected journey with qualification, automation, and visibility.",
    offerKeys: {
      systeme_io: "platform_growth",
      gohighlevel: "platform_growth",
      custom_app: "custom_foundation",
    },
  },
  {
    tierKey: "complete",
    label: "Complete",
    promise: "The broadest standard implementation for connected growth and operations.",
    offerKeys: {
      systeme_io: "platform_scale",
      gohighlevel: "platform_scale",
      custom_app: "custom_growth",
    },
  },
] as const;
```

`offerKeyForTierPlatform(tierKey, platform)` must use these definitions and throw for an unknown combination rather than silently falling back.

- [ ] **Step 5: Run tests, typecheck, and commit the contract**

Run:

```bash
npx vitest run tests/unit/quiz-config.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add src/features/quiz/types.ts src/features/quiz/roadmap-tiers.ts tests/unit/quiz-config.test.ts
git commit -m "feat: define three-tier roadmap catalog"
```

---

### Task 2: Extract reusable pricing and expose technical constraints

**Files:**
- Create: `src/features/quiz/pricing.ts`
- Modify: `src/features/quiz/cortex.ts`
- Modify: `src/features/quiz/types.ts`
- Modify: `tests/unit/cortex.test.ts`
- Create: `tests/unit/quiz-pricing.test.ts`

**Interfaces:**
- Consumes: `PACKAGE_BY_KEY`, `ADDON_BY_KEY`, Q8 option keys, existing Cortex flags.
- Produces: `resolveOfferPricing(offerKey, selectedSupportOptionKeys)`, `CortexResult.technicalConstraintSignals`, `CortexResult.selectedSupportOptionKeys`.

- [ ] **Step 1: Write failing pricing-partition tests**

Cover these cases in `quiz-pricing.test.ts`:

```ts
const platform = resolveOfferPricing("platform_launch", ["support_booking", "support_portal"]);
expect(platform.selectedSupportItems).toHaveLength(2);
expect(platform.selectedSupportItems.find((item) => item.key === "advanced_booking_setup")?.disposition)
  .toBe("included");
expect(platform.pricedAddons.map((item) => item.addonKey))
  .toContain("platform_membership_course_area");

const custom = resolveOfferPricing("custom_growth", ["support_portal", "support_dashboard"]);
expect(custom.includedCapabilities).toEqual(expect.arrayContaining([
  "basic_custom_portal_module",
  "custom_dashboard_reporting_module",
]));
expect(custom.pricedAddons).toEqual([]);
```

Assert each selected support item appears in exactly one of included, priced, or scope-review output and totals never go negative.

- [ ] **Step 2: Run the new test and verify failure**

Run: `npx vitest run tests/unit/quiz-pricing.test.ts`

Expected: FAIL because `pricing.ts` does not exist.

- [ ] **Step 3: Move pricing resolution into a pure module**

Move the existing Q8-to-addon mapping, inclusion checks, integration allowance handling, portal route handling, SMS disclosure, and total calculation out of `cortex.ts` into `pricing.ts`.

Use this signature:

```ts
export function resolveOfferPricing(
  offerKey: string,
  selectedSupportOptionKeys: readonly string[],
): {
  includedCapabilities: readonly string[];
  selectedAddons: readonly string[];
  selectedSupportItems: readonly SelectedSupportItem[];
  pricedAddons: readonly PricedAddon[];
  scopeReviewItems: readonly ScopeReviewItem[];
  addonTotalUsd: number;
  estimatedRecurringCosts: readonly string[];
};
```

Validate that the offer exists and every support option is an approved Q8 key. Do not accept client-supplied prices.

- [ ] **Step 4: Expose only the constraints needed by the comparison layer**

Extend `CortexResult` with:

```ts
technicalConstraintSignals: readonly SignalTag[];
selectedSupportOptionKeys: readonly string[];
```

Populate `technicalConstraintSignals` from genuine custom-operation signals already produced by the Cortex. Keep the ordered recommendation/decision trace unchanged.

- [ ] **Step 5: Run pricing and Cortex regression tests**

Run:

```bash
npx vitest run tests/unit/quiz-pricing.test.ts tests/unit/cortex.test.ts
npm run typecheck
```

Expected: all existing personas and new partition tests PASS.

- [ ] **Step 6: Commit the reusable pricing boundary**

```bash
git add src/features/quiz/pricing.ts src/features/quiz/cortex.ts src/features/quiz/types.ts tests/unit/cortex.test.ts tests/unit/quiz-pricing.test.ts
git commit -m "refactor: make roadmap pricing reusable"
```

---

### Task 3: Build feasible tier alternatives and selected-roadmap snapshots

**Files:**
- Create: `src/features/quiz/roadmap-options.ts`
- Create: `tests/unit/roadmap-options.test.ts`

**Interfaces:**
- Consumes: `CortexResult`, `PUBLIC_TIER_DEFINITIONS`, `resolveOfferPricing()`.
- Produces: `buildRoadmapTiers(result)`, `defaultRoadmapSelection(result)`, `resolveRoadmapSelection(result, selection)`.

- [ ] **Step 1: Write failing feasibility and selection tests**

Pin these behaviors:

```ts
const platformResult = calculateRecommendation(coachProgram);
const platformTiers = buildRoadmapTiers(platformResult);
expect(platformTiers).toHaveLength(3);
expect(platformTiers.flatMap((tier) => tier.variants)).toHaveLength(9);
expect(defaultRoadmapSelection(platformResult).offerKey)
  .toBe(platformResult.recommendedOfferKey);

const customResult = calculateRecommendation(inventoryBusiness);
const complete = buildRoadmapTiers(customResult).find((tier) => tier.tierKey === "complete")!;
expect(complete.variants.find((item) => item.platform === "systeme_io")?.feasibility.available)
  .toBe(false);
expect(complete.variants.find((item) => item.platform === "gohighlevel")?.feasibility.available)
  .toBe(false);
expect(defaultRoadmapSelection(customResult).offerKey).toBe("custom_complete");
```

Also assert a disabled option returns the same explicit reason for display and cannot be resolved as the active selection.

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run tests/unit/roadmap-options.test.ts`

Expected: FAIL because the roadmap option builder does not exist.

- [ ] **Step 3: Implement the pure comparison builder**

`buildRoadmapTiers(result)` must:

- build exactly three tiers;
- build three platform variants per tier;
- mark the Cortex tier and platform as recommended;
- disable both platform variants when `recommendedBuildRoute === "custom"` and genuine technical constraints are present;
- leave Custom App selectable for a platform-compatible result;
- use `custom_complete`, `$10,000+`, and scope review for a critical Complete custom recommendation;
- otherwise use the standard matrix from Task 1;
- call `resolveOfferPricing()` separately for each feasible offer using `result.selectedSupportOptionKeys`.

Use one shared unavailability message derived from constraint labels, for example:

```ts
"This option cannot reliably support inventory and permission-based operational roles. Choose Custom App to keep those requirements."
```

- [ ] **Step 4: Implement selection resolution with fail-closed validation**

`resolveRoadmapSelection(result, selection)` must throw when the tier/platform pair is unavailable or when `selection.offerKey` does not equal the catalog mapping. It returns an immutable selected snapshot containing both the original recommendation and the visitor's selected tier/platform/offer/pricing.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run tests/unit/roadmap-options.test.ts tests/unit/cortex.test.ts tests/unit/quiz-pricing.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add src/features/quiz/roadmap-options.ts tests/unit/roadmap-options.test.ts
git commit -m "feat: calculate feasible roadmap choices"
```

---

### Task 4: Persist the visitor's selection without losing existing attempts

**Files:**
- Modify: `src/features/quiz/types.ts`
- Modify: `src/features/quiz/reducer.ts`
- Modify: `src/features/quiz/persistence.ts`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `tests/unit/quiz-reducer.test.ts`
- Modify: `tests/unit/quiz-persistence.test.ts`

**Interfaces:**
- Consumes: `defaultRoadmapSelection()`, `resolveRoadmapSelection()`.
- Produces: `QuizState.roadmapSelection`, reducer action `SELECT_ROADMAP`, `SavedQuizAttempt.storageVersion = 2` with version-1 normalization.

- [ ] **Step 1: Write failing reducer tests**

Assert `CALCULATION_SUCCESS` selects the Cortex recommendation by default, `SELECT_ROADMAP` changes only to a feasible choice, and `START_OVER` clears the selection.

```ts
expect(completed.roadmapSelection).toEqual({
  tierKey: "advanced",
  platform: "systeme_io",
  offerKey: "platform_growth",
});
```

- [ ] **Step 2: Write failing persistence migration tests**

Create one existing storage-version-1 fixture. Assert `loadQuizAttempt()` returns it as version 2, preserves answers/result, and defaults the roadmap selection from the saved recommendation. Assert invalid or unavailable saved selections are discarded in favor of the recommendation rather than trusted.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npx vitest run tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts
```

Expected: FAIL because roadmap selection and storage version 2 do not exist.

- [ ] **Step 4: Implement reducer and persistence changes**

Add:

```ts
type QuizAction =
  | { type: "SELECT_ROADMAP"; selection: RoadmapSelection }
  // existing actions remain
```

Store `roadmapSelection` beside `result`, not inside the immutable Cortex recommendation. Bump the stored format to version 2 and normalize version-1 attempts at read time. Continue using the existing 30-day expiry.

- [ ] **Step 5: Wire state into `QuizResult`**

Pass the current selection and a callback:

```tsx
<QuizResult
  result={state.result}
  selection={state.roadmapSelection}
  onSelect={(selection) => dispatch({ type: "SELECT_ROADMAP", selection })}
  onStartOver={startOver}
  persistenceAvailable={persistenceAvailable}
/>
```

- [ ] **Step 6: Run tests, typecheck, and commit**

Run:

```bash
npx vitest run tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add src/features/quiz/types.ts src/features/quiz/reducer.ts src/features/quiz/persistence.ts src/features/quiz/QuizExperience.tsx tests/unit/quiz-reducer.test.ts tests/unit/quiz-persistence.test.ts
git commit -m "feat: persist selected roadmap locally"
```

---

### Task 5: Replace the single-offer result UI with the three-tier comparison

**Files:**
- Create: `src/features/quiz/RoadmapComparison.tsx`
- Create: `src/features/quiz/RoadmapSelectionSummary.tsx`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/quiz-components.test.tsx`

**Interfaces:**
- Consumes: `buildRoadmapTiers()`, `resolveRoadmapSelection()`, `RoadmapSelection`.
- Produces: accessible three-tier comparison, platform controls, selected estimate, unchanged ungated diagnostic sections and booking CTA.

- [ ] **Step 1: Write the failing component test**

Complete the quiz, then assert:

```ts
expect(screen.getByRole("heading", { name: /compare your roadmap options/i })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: /^basic$/i })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: /^advanced$/i })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: /^complete$/i })).toBeInTheDocument();
expect(screen.getAllByRole("button", { name: /systeme\.io/i })).toHaveLength(3);
expect(screen.getAllByRole("button", { name: /highlevel/i })).toHaveLength(3);
expect(screen.getAllByRole("button", { name: /custom app/i })).toHaveLength(3);
```

Click Basic Custom App and assert the selected summary shows `Custom Starter` and `$3,000`; click Complete Custom App and assert `Custom Growth` and `$7,500`. For the inventory persona, assert platform buttons are disabled and the explanation is visible.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npx vitest run tests/unit/quiz-components.test.tsx`

Expected: FAIL because the comparison UI does not exist.

- [ ] **Step 3: Implement focused comparison components**

`RoadmapComparison` renders three cards. Each card includes tier name, promise, recommended badge when applicable, platform buttons, base price, concise inclusion advantages, and one `Choose this roadmap` action. Use native buttons with `aria-pressed`; unavailable platform buttons use `disabled` plus visible explanatory copy.

`RoadmapSelectionSummary` renders the authoritative selected offer, itemized estimate, relevant included capabilities, priced add-ons, scope-review items, and the planning-estimate disclaimer. It must not use the original recommendation price after the visitor changes the selection.

- [ ] **Step 4: Refactor `QuizResult` without removing diagnostic context**

Keep the business snapshot, growth blocker, recommended solution, why-this-fits explanation, relevant projects, and booking CTA. Replace the old single `Recommended base offer`, included-capabilities, priced-addons, and investment blocks with:

1. Cortex recommendation summary;
2. three-tier comparison;
3. selected-roadmap summary;
4. next actions.

Label preference changes truthfully: `Recommended` remains on the Cortex choice; `Your selection` labels the visitor's chosen alternative.

- [ ] **Step 5: Add responsive and focus-visible styling**

Use the existing dark/gold brand tokens. The desktop layout may use three columns; tablet uses two/one as space requires; mobile uses one column. Do not use fixed widths that overflow. Preserve 44px minimum tap targets, visible focus rings, readable disabled states, and no color-only selection indicator.

- [ ] **Step 6: Run component tests and commit**

Run:

```bash
npx vitest run tests/unit/quiz-components.test.tsx
npm run typecheck
npm run lint
```

Expected: PASS.

Commit:

```bash
git add src/features/quiz/RoadmapComparison.tsx src/features/quiz/RoadmapSelectionSummary.tsx src/features/quiz/QuizResult.tsx src/app/globals.css tests/unit/quiz-components.test.tsx
git commit -m "feat: add three-tier quiz result comparison"
```

---

### Task 6: Verify the complete local quiz flow across viewports

**Files:**
- Modify: `tests/e2e/portfolio-quiz.spec.ts`
- Modify: `docs/portfolio-blueprint.md`

**Interfaces:**
- Consumes: completed three-tier local experience.
- Produces: browser-level regression coverage and blueprint implementation-status note.

- [ ] **Step 1: Extend the no-network E2E test**

After quiz completion, assert the three cards are visible, select a different feasible tier/platform, verify the price/offer changes without a new navigation entry, reload, resume the completed result, and verify the selection is restored. Keep the existing assertion that no Supabase, Firebase database, analytics, or Edge Function request occurs in this first plan.

- [ ] **Step 2: Extend responsive coverage**

At `320×568`, `390×844`, `768×1024`, `1366×768`, `1920×1080`, and `2560×1440`, assert no horizontal overflow on the completed result and each tier/platform action is reachable.

- [ ] **Step 3: Run the full verification suite**

Run:

```bash
npm run test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0. The build must continue producing Firebase-compatible static output.

- [ ] **Step 4: Update implementation status in the blueprint**

Mark the three-tier local comparison as implemented and tested, but keep PDF email, Supabase connection, Make activation, Gmail delivery, and remote deployment explicitly pending.

- [ ] **Step 5: Commit the verified quiz experience**

```bash
git add tests/e2e/portfolio-quiz.spec.ts docs/portfolio-blueprint.md
git commit -m "test: verify three-tier roadmap flow"
```

