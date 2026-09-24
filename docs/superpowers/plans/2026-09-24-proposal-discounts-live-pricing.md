# Proposal Discounts and Live Local Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let verified assessment clients choose and confirm a roadmap, apply one capacity-limited location-eligible coupon, and receive an issued proposal whose discounted USD and live local-currency totals remain consistent across the result page, email, protected proposal, and database.

**Architecture:** Keep catalog USD pricing and roadmap feasibility in the shared quiz engine. Add a pure quote calculator for instant browser updates, but make the `finalize-proposal` Edge Function and private PostgreSQL campaign/redemption ledger authoritative for eligibility, capacity, and issuance. Replace automatic proposal issuance with explicit confirmation, then persist a versioned immutable proposal snapshot and redeem the reserved coupon only when initial email delivery succeeds.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest/Testing Library, Playwright, Supabase Edge Functions on Deno, PostgreSQL/PLpgSQL, pgTAP, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-09-24-proposal-discounts-live-pricing-design.md`

## Global Constraints

- USD remains the authoritative source price; local currency is indicative and never blocks proposal issuance.
- `PINOYAKO` is case-insensitive, gives 50% off to `country_code = 'PH'`, and is limited to 50 successfully delivered proposals.
- `EARLYBIRDWORKS` is case-insensitive, gives 15% off to configured non-PH/non-`ZZ` countries, and is limited to 100 successfully delivered proposals.
- A discount applies to the selected one-time estimate including priced add-ons, but never to recurring third-party costs.
- One campaign redemption is allowed per canonical verified email; one coupon is allowed per proposal; coupons never stack.
- Pending reservations prevent concurrent oversubscription, failed delivery releases capacity, and same-session retries are idempotent.
- Browser-supplied percentages, totals, location flags, capacity, and redemption state are untrusted.
- Existing `finalize_quiz_proposal` and `mark_proposal_delivered` RPC signatures remain available during rollout; new behavior uses additive V2 RPCs.
- Existing issued proposal snapshots remain readable and immutable.
- Coupon controls and roadmap selection lock after successful issuance.
- Original discounted prices use semantic `<del>` markup, and status/error feedback is accessible without relying on color.
- Do not expose verified email addresses, redemption digests, service-role credentials, or secret values in browser code, logs, tests, or documentation.
- Do not deploy, activate campaigns, or mutate remote infrastructure until all local/static checks and the target-specific remote preflight have passed and the owner explicitly authorizes deployment.

## File Structure

### Create

- `supabase/functions/_shared/quiz-engine/discounts.ts` — pure coupon normalization and price-quote calculation.
- `src/features/quiz/discounts.ts` — frontend re-export of the shared discount module.
- `src/features/quiz/ProjectInvestment.tsx` — selected estimate, coupon controls, crossed-out price, savings, and local conversion.
- `tests/unit/proposal-discounts.test.ts` — pure pricing rules and rounding.
- `supabase/migrations/202609240005_add_proposal_discount_campaigns.sql` — private campaign/redemption tables plus service-only coupon and V2 proposal RPCs.
- `supabase/tests/07_proposal_discounts.test.sql` — capacity, idempotency, eligibility, concurrency, and RLS coverage.

### Modify

- `supabase/functions/_shared/quiz-engine/types.ts` — discount, quote, and proposal-snapshot types/version.
- `supabase/functions/_shared/quiz-engine/proposal-view.ts` — build selected/discounted immutable investment snapshots.
- `supabase/functions/_shared/env.ts` — require `COUPON_REDEMPTION_SECRET` for proposal issuance.
- `supabase/functions/_shared/proposal-email.ts` — send sanitized selected pricing and discount summary.
- `supabase/functions/finalize-proposal/index.ts` — preview/issue coupon validation, reservation, release, delivery, and redemption.
- `src/features/quiz/quiz-service.ts` — preview/issue request contracts and typed coupon failures.
- `src/features/quiz/reducer.ts` — draft coupon, quote, confirmation, and issued-lock state.
- `src/features/quiz/QuizExperience.tsx` — remove automatic issuance and orchestrate apply/confirm/refresh/retry.
- `src/features/quiz/QuizResult.tsx` — derive investment from the selected roadmap and render confirmation controls.
- `src/features/quiz/RoadmapComparison.tsx` — disable package/platform changes after issuance.
- `src/features/quiz/RoadmapSelectionSummary.tsx` — display the shared selected quote instead of a recommendation-only total.
- `src/features/proposal/ProposalAccess.tsx` — render issued original/discount/final/local pricing.
- `src/styles/quiz.css` — fix dark-on-dark cells, investment wrapping, coupon layout, and mobile overflow.
- `src/styles/proposal.css` — protected proposal discount hierarchy and responsive wrapping.
- `tests/unit/premium-roadmap.test.ts` — proposal snapshot price/version coverage.
- `tests/unit/proposal-view-model.test.ts` — immutable issued discount breakdown.
- `tests/unit/proposal-components.test.tsx` — protected proposal `<del>` and final totals.
- `tests/unit/quiz-service.test.ts` — request/response and public coupon error mapping.
- `tests/unit/quiz-reducer.test.ts` — coupon/confirmation/locking transitions.
- `tests/unit/quiz-components.test.tsx` — explicit confirmation and accessible pricing behavior.
- `supabase/functions/tests/proposal-functions.test.ts` — server authority, eligibility, reservation, release, and retry.
- `tests/e2e/portfolio-quiz.spec.ts` — live selection updates, coupon display, readability, and overflow.
- `tests/supabase-migrations-static.test.mjs` — new private tables/RPC security and migration inventory.
- `src/generated/database.types.ts` — regenerate after the migration is applied to the verified schema.
- `docs/portfolio-blueprint.md` — approved coupon and explicit-confirmation rules.
- `docs/supabase-database.md` — secret, private ledger, RPC, testing, activation, and rollback operations.
- `.env.example` — add the secret name only, never a value.

## Review Focus

- A quote exactly 15 minutes old versus 15 minutes plus one millisecond must have deterministic refresh behavior; Task 5 tests the boundary.
- Decimal add-on totals and non-integer FX rates must round USD to cents before local conversion; Task 1 tests both positive and zero-decimal display currencies.
- Two concurrent clients competing for the final campaign slot must produce one reservation and one `coupon_exhausted`; Task 3 pins the database boundary and row lock, and Task 4 sends parallel issue requests through a serialized reservation fake to pin the public outcomes.
- A webhook acknowledgement lost after the provider accepted delivery must reuse the same proposal reference and reservation on retry rather than send or count twice; Task 4 pins the operation ID and idempotent retry path.
- A legacy already-issued proposal with no `proposalSnapshotVersion` or discount fields must still render and verify; Task 2 adds compatibility tests.

---

### Task 1: Shared Discount Quote Domain

**Files:**
- Create: `supabase/functions/_shared/quiz-engine/discounts.ts`
- Create: `src/features/quiz/discounts.ts`
- Create: `tests/unit/proposal-discounts.test.ts`
- Modify: `supabase/functions/_shared/quiz-engine/types.ts`

**Interfaces:**
- Consumes: existing `BusinessLocation` and selected `RoadmapVariant.estimatedProjectInvestmentUsd`.
- Produces:
  - `PROPOSAL_SNAPSHOT_VERSION = "proposal-snapshot-2026.09-v2"`
  - `CouponCampaignKey = "pinoyako" | "earlybirdworks"`
  - `ValidatedDiscountCampaign`
  - `ProjectPriceQuote`
  - `normalizeCouponCode(value: string): string`
  - `calculateProjectPriceQuote(input: { originalTotalUsd: number; location: BusinessLocation; campaign?: ValidatedDiscountCampaign | null }): ProjectPriceQuote`
  - `isCurrencyQuoteFresh(timestamp: string | null, now: Date, maxAgeMs?: number): boolean`

- [ ] **Step 1: Write failing pure-domain tests**

```ts
import {
  calculateProjectPriceQuote,
  isCurrencyQuoteFresh,
  normalizeCouponCode,
} from "@/features/quiz/discounts";

const ph = {
  businessCountry: "Philippines",
  countryCode: "PH",
  displayCurrency: "PHP",
  currencySymbol: "₱",
  fxRate: 58.125,
  fxRateTimestamp: "2026-09-24T00:00:00.000Z",
} as const;

it("normalizes public coupon input without accepting extra text", () => {
  expect(normalizeCouponCode("  pinoyako ")).toBe("PINOYAKO");
  expect(normalizeCouponCode("pinoy ako")).toBe("PINOY AKO");
});

it("discounts the complete selected estimate before PHP conversion", () => {
  expect(calculateProjectPriceQuote({
    originalTotalUsd: 1750.25,
    location: ph,
    campaign: { campaignKey: "pinoyako", code: "PINOYAKO", percentage: 50 },
  })).toMatchObject({
    originalTotalUsd: 1750.25,
    discountAmountUsd: 875.13,
    finalTotalUsd: 875.12,
    finalTotalLocal: 50866,
  });
});

it("uses an exact fifteen-minute freshness boundary", () => {
  const now = new Date("2026-09-24T00:15:00.000Z");
  expect(isCurrencyQuoteFresh(ph.fxRateTimestamp, now)).toBe(true);
  expect(isCurrencyQuoteFresh(ph.fxRateTimestamp, new Date(now.getTime() + 1))).toBe(false);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npx vitest run tests/unit/proposal-discounts.test.ts`

Expected: FAIL because `@/features/quiz/discounts` and the new quote types/functions do not exist.

- [ ] **Step 3: Define the shared quote types and proposal snapshot version**

Add to `types.ts`:

```ts
export const PROPOSAL_SNAPSHOT_VERSION = "proposal-snapshot-2026.09-v2" as const;
export type CouponCampaignKey = "pinoyako" | "earlybirdworks";

export interface ValidatedDiscountCampaign {
  campaignKey: CouponCampaignKey;
  code: "PINOYAKO" | "EARLYBIRDWORKS";
  percentage: 50 | 15;
}

export interface ProjectPriceQuote {
  originalTotalUsd: number;
  discountAmountUsd: number;
  finalTotalUsd: number;
  localCurrency: string;
  localSymbol: string;
  finalTotalLocal: number | null;
  fxRate: number | null;
  fxRateTimestamp: string | null;
  campaign: ValidatedDiscountCampaign | null;
}
```

- [ ] **Step 4: Implement the minimal pure calculator and frontend re-export**

Use integer cents to prevent floating-point drift:

```ts
const FX_MAX_AGE_MS = 15 * 60 * 1000;
const toCents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;

export function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase();
}

export function calculateProjectPriceQuote({ originalTotalUsd, location, campaign }: QuoteInput): ProjectPriceQuote {
  if (!Number.isFinite(originalTotalUsd) || originalTotalUsd < 0) throw new Error("Invalid original total");
  const originalCents = toCents(originalTotalUsd);
  const discountCents = campaign ? Math.round(originalCents * campaign.percentage / 100) : 0;
  const finalTotalUsd = fromCents(originalCents - discountCents);
  const validRate = typeof location.fxRate === "number" && Number.isFinite(location.fxRate) && location.fxRate > 0;
  return Object.freeze({
    originalTotalUsd: fromCents(originalCents),
    discountAmountUsd: fromCents(discountCents),
    finalTotalUsd,
    localCurrency: location.displayCurrency,
    localSymbol: location.currencySymbol,
    finalTotalLocal: validRate ? Math.round(finalTotalUsd * location.fxRate!) : null,
    fxRate: validRate ? location.fxRate : null,
    fxRateTimestamp: validRate ? location.fxRateTimestamp : null,
    campaign: campaign ? Object.freeze({ ...campaign }) : null,
  });
}
```

`src/features/quiz/discounts.ts` must contain only:

```ts
export * from "../../../supabase/functions/_shared/quiz-engine/discounts.ts";
```

- [ ] **Step 5: Add edge-case assertions and verify GREEN**

Add tests for 15%, no coupon, zero, invalid negative/NaN totals, null FX, `fxRate = 1`, non-integer FX, and campaign object immutability.

Run: `npx vitest run tests/unit/proposal-discounts.test.ts`

Expected: PASS with all quote-domain tests green.

- [ ] **Step 6: Commit the domain layer**

```powershell
git add -- supabase/functions/_shared/quiz-engine/discounts.ts supabase/functions/_shared/quiz-engine/types.ts src/features/quiz/discounts.ts tests/unit/proposal-discounts.test.ts
git commit -m "feat: add authoritative proposal price quotes"
```

### Task 2: Versioned Discount Proposal Snapshots and Read-Only Delivery Views

**Files:**
- Modify: `supabase/functions/_shared/quiz-engine/proposal-view.ts`
- Modify: `supabase/functions/_shared/quiz-engine/types.ts`
- Modify: `supabase/functions/_shared/proposal-email.ts`
- Modify: `src/features/proposal/ProposalAccess.tsx`
- Modify: `src/styles/proposal.css`
- Modify: `tests/unit/premium-roadmap.test.ts`
- Modify: `tests/unit/proposal-view-model.test.ts`
- Modify: `tests/unit/proposal-components.test.tsx`
- Modify: `tests/unit/quiz-components.test.tsx`
- Modify: `supabase/functions/tests/proposal-functions.test.ts`

**Interfaces:**
- Consumes: Task 1 `ProjectPriceQuote`, `PROPOSAL_SNAPSHOT_VERSION`, and `calculateProjectPriceQuote`.
- Produces:
  - `buildProposalDraft(contact, answers, result, selection, priceQuote)`
  - `ProposalContentViewModel.proposalSnapshotVersion`
  - `ProposalContentViewModel.investment: ProjectPriceQuote & { basePriceUsd: number }`
  - sanitized email fields `original_total_usd`, `discount_amount_usd`, `final_total_usd`, `discount_code`, `discount_percent`, `local_total`, and `local_currency`.

- [ ] **Step 1: Write failing snapshot and legacy-rendering tests**

```ts
it("stores the selected discounted estimate in a V2 proposal snapshot", () => {
  const proposal = buildProposalDraft(identity, answers, result, selection, quote);
  expect(proposal.proposalSnapshotVersion).toBe("proposal-snapshot-2026.09-v2");
  expect(proposal.investment).toMatchObject({
    originalTotalUsd: 1500,
    discountAmountUsd: 750,
    finalTotalUsd: 750,
    finalTotalLocal: 43500,
    campaign: { code: "PINOYAKO", percentage: 50 },
  });
  expect(proposal.recommendation.estimatedProjectInvestmentUsd).toBe(750);
});

it("renders a legacy issued proposal without discount fields", () => {
  render(<ProposalAccess reference={REFERENCE} service={legacyProposalService} />);
  expect(screen.getByText("$1,500")).toBeInTheDocument();
  expect(screen.queryByText(/you save/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/unit/premium-roadmap.test.ts tests/unit/proposal-view-model.test.ts tests/unit/proposal-components.test.tsx tests/unit/quiz-components.test.tsx`

Expected: FAIL because the builder lacks a price quote/version and the protected proposal lacks discount rendering.

- [ ] **Step 3: Update the proposal builder and types**

Make `priceQuote` mandatory for newly built snapshots. Replace recommendation-only totals with the selected quote:

```ts
return Object.freeze({
  proposalSnapshotVersion: PROPOSAL_SNAPSHOT_VERSION,
  // existing fields
  investment: Object.freeze({
    basePriceUsd: selected.offer.basePriceUsd,
    ...priceQuote,
  }),
  recommendation: Object.freeze({
    // existing fields
    offerKey: selection.offerKey,
    offerName: selected.offer.name,
    basePriceUsd: selected.offer.basePriceUsd,
    estimatedProjectInvestmentUsd: priceQuote.finalTotalUsd,
  }),
});
```

Use `resolveRoadmapSelection` inside the builder so the stored offer and selected total always correspond to `selection`.

Update every builder fixture in `premium-roadmap.test.ts`, `proposal-view-model.test.ts`, `proposal-components.test.tsx`, and `quiz-components.test.tsx` to construct its quote with `calculateProjectPriceQuote`. Do not add an optional/default quote parameter: every newly created snapshot must state its selected price explicitly.

- [ ] **Step 4: Extend the email contract without exposing privileged fields**

Add the issued quote to `InitialProposalDelivery.proposal` and serialize only display-safe values:

```ts
original_total_usd: payload.proposal.price.originalTotalUsd,
discount_amount_usd: payload.proposal.price.discountAmountUsd,
final_total_usd: payload.proposal.price.finalTotalUsd,
discount_code: payload.proposal.price.campaign?.code ?? null,
discount_percent: payload.proposal.price.campaign?.percentage ?? null,
local_total: payload.proposal.price.finalTotalLocal,
local_currency: payload.proposal.price.localCurrency,
```

Assert the webhook body excludes redemption IDs, HMAC digests, capacity counts, and secrets.

- [ ] **Step 5: Render new and legacy protected proposals**

Add a compatibility helper in `ProposalAccess.tsx` that treats absent discount fields as an undiscounted legacy quote. New snapshots render:

```tsx
{investment.campaign ? (
  <div className="proposal-discount-price">
    <del>{usd.format(investment.originalTotalUsd)}</del>
    <strong>{usd.format(investment.finalTotalUsd)} USD</strong>
    <span>You save {usd.format(investment.discountAmountUsd)} · {investment.campaign.percentage}% off</span>
  </div>
) : <strong>{usd.format(investment.finalTotalUsd)} USD</strong>}
```

Show the immutable local amount and quote timestamp when present. Add CSS that wraps long amounts and stacks the breakdown below 520px.

- [ ] **Step 6: Run snapshot, component, and email tests**

Run: `npx vitest run tests/unit/premium-roadmap.test.ts tests/unit/proposal-view-model.test.ts tests/unit/proposal-components.test.tsx tests/unit/quiz-components.test.tsx`

Run: `deno test --allow-env supabase/functions/tests/proposal-functions.test.ts`

Expected: PASS; legacy and V2 snapshots both render, and email payload tests expose only approved display data.

- [ ] **Step 7: Commit snapshot and read-only views**

```powershell
git add -- supabase/functions/_shared/quiz-engine/proposal-view.ts supabase/functions/_shared/quiz-engine/types.ts supabase/functions/_shared/proposal-email.ts src/features/proposal/ProposalAccess.tsx src/styles/proposal.css tests/unit/premium-roadmap.test.ts tests/unit/proposal-view-model.test.ts tests/unit/proposal-components.test.tsx tests/unit/quiz-components.test.tsx supabase/functions/tests/proposal-functions.test.ts
git commit -m "feat: version discounted proposal snapshots"
```

### Task 3: Private Campaign Ledger and Atomic Capacity Enforcement

**Files:**
- Create: `supabase/migrations/202609240005_add_proposal_discount_campaigns.sql`
- Create: `supabase/tests/07_proposal_discounts.test.sql`
- Modify: `tests/supabase-migrations-static.test.mjs`

**Interfaces:**
- Consumes: existing `quiz_sessions`, `leads`, proposal columns, and active catalog rows.
- Produces service-role-only RPCs:
  - `preview_proposal_discount(uuid,text,text,timestamptz)`
  - `reserve_proposal_discount(uuid,text,text,numeric,numeric,numeric,timestamptz)`
  - `release_proposal_discount(uuid,uuid,timestamptz)`
  - `finalize_quiz_proposal_v2(uuid,text,text,text,jsonb,jsonb,uuid,text,uuid)`
  - `mark_proposal_delivered_v2(uuid,uuid,uuid,timestamptz)`

- [ ] **Step 1: Write failing pgTAP and static contract tests**

Add `supabase/tests/07_proposal_discounts.test.sql` with fixtures for PH, US, and `ZZ` quiz sessions and assertions equivalent to:

```sql
select is(
  (select discount_percent from public.preview_proposal_discount(
    :'ph_quiz_id', ' pinoyako ', repeat('a', 64), :'now'::timestamptz
  )),
  50,
  'PINOYAKO is available to an eligible PH quiz'
);

select throws_ok(
  $$select * from public.preview_proposal_discount(
    :'us_quiz_id', 'PINOYAKO', repeat('b', 64), :'now'::timestamptz
  )$$,
  'P0001', 'coupon_ineligible',
  'PH campaign rejects an international quiz'
);
```

Generate 50 redeemed PH fixtures and 100 redeemed international fixtures, assert those boundary redemptions succeed, and assert the next unique digest receives `coupon_exhausted`. Add a transaction-level final-slot test that locks the campaign row and proves the second reservation cannot observe stale capacity. Assert a released/expired pending row can be reused and the same campaign/digest cannot be redeemed across another business.

Update the static test to expect 14 total public/private runtime tables and verify private-table RLS, `security definer`, blank `search_path`, service-role-only grants, campaign row locks, pending expiry, exact 50/100 seed values, and no browser grant.

- [ ] **Step 2: Run database/static tests and verify RED**

Run: `npm run test:supabase:static`

Expected: FAIL because migration `202609240005` and the five RPCs do not exist.

When Docker is available, also run: `npx supabase test db`

Expected: FAIL because `07_proposal_discounts.test.sql` references missing tables/functions.

- [ ] **Step 3: Create private tables and inactive campaign rows**

The migration creates `private.discount_campaigns` and `private.discount_redemptions`, enables RLS, and revokes all direct access from `public`, `anon`, and `authenticated`.

Core constraints:

```sql
discount_percent integer not null check (discount_percent between 1 and 99),
eligibility_scope text not null check (eligibility_scope in ('philippines','international')),
max_redemptions integer not null check (max_redemptions > 0),
status text not null check (status in ('pending','redeemed','released')),
redeemer_digest text not null check (redeemer_digest ~ '^[0-9a-f]{64}$'),
check (original_total_usd >= 0 and discount_amount_usd >= 0 and final_total_usd >= 0),
check (round(original_total_usd - discount_amount_usd, 2) = final_total_usd),
unique (campaign_key, redeemer_digest),
unique (quiz_session_id)
```

Seed `PINOYAKO` at 50%/50 and `EARLYBIRDWORKS` at 15%/100 with `active = false`. Tests explicitly activate campaigns inside their transaction; production activation remains a separately approved release action.

- [ ] **Step 4: Implement preview, reserve, release, finalize V2, and delivery V2 RPCs**

Use `SELECT ... FOR UPDATE` on the campaign row in preview/reserve paths. Reserve must:

```sql
update private.discount_redemptions
set status = 'released', released_at = p_at
where status = 'pending' and reserved_until <= p_at;

select count(*) into v_used
from private.discount_redemptions
where campaign_key = v_campaign.campaign_key
  and status in ('pending','redeemed');

if v_used >= v_campaign.max_redemptions then
  raise exception 'coupon_exhausted' using errcode = 'P0001';
end if;
```

Validate the stored quiz country and derive `lead_id` from the quiz. Reuse a released row for the same campaign/digest, return a same-session pending/redeemed row idempotently, and reject a redeemed row tied to another quiz as `coupon_already_redeemed`.

`finalize_quiz_proposal_v2` retains all V1 selection/catalog/version checks and additionally validates `proposalSnapshotVersion`, selected quote arithmetic, and an optional matching pending redemption. It writes `estimated_project_investment_usd` from `investment.finalTotalUsd`.

`mark_proposal_delivered_v2` locks both quiz and redemption, activates the proposal, sets the 72-hour expiry, and changes the matching pending redemption to `redeemed` in one transaction. A null redemption id follows the undiscounted path.

- [ ] **Step 5: Lock down grants and preserve rollout compatibility**

For every new function:

```sql
revoke execute on function public.<signature> from public, anon, authenticated;
grant execute on function public.<signature> to service_role;
```

Do not replace or drop the V1 finalize/delivery functions in this migration.

- [ ] **Step 6: Verify migration behavior**

Run: `npm run test:supabase:static`

Expected: PASS with the new migration/security checks.

Run when Docker is available: `npx supabase test db`

Expected: PASS including `07_proposal_discounts.test.sql`; if Docker is unavailable, report this as an unresolved release gate rather than treating static SQL matching as equivalent.

- [ ] **Step 7: Commit the database contract**

```powershell
git add -- supabase/migrations/202609240005_add_proposal_discount_campaigns.sql supabase/tests/07_proposal_discounts.test.sql tests/supabase-migrations-static.test.mjs
git commit -m "feat: enforce proposal coupon capacity"
```

### Task 4: Server-Authoritative Coupon Preview and Issuance

**Files:**
- Modify: `supabase/functions/_shared/env.ts`
- Modify: `supabase/functions/finalize-proposal/index.ts`
- Modify: `supabase/functions/tests/proposal-functions.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Tasks 1–3 quote/snapshot types and database RPCs.
- Produces:
  - `getProposalEnv().couponRedemptionSecret`
  - preview body `{ operation, quizSessionId, selection?, couponCode? }`
  - issue body `{ operation, quizSessionId, selection, couponCode? }`
  - typed public coupon failures and issued immutable `ProjectPriceQuote`.

- [ ] **Step 1: Write failing handler tests for authority and lifecycle**

Extend dependency fakes with `previewDiscount`, `reserveDiscount`, `releaseDiscount`, and V2 finalization/delivery calls. Add tests that assert:

```ts
it("recalculates the selected quote and ignores browser pricing fields", async () => {
  const response = await handler(request({
    operation: "issue",
    quizSessionId: QUIZ_ID,
    selection: { tierKey: "basic", platform: "systeme_io" },
    couponCode: "pinoyako",
    finalTotalUsd: 1,
  }));
  expect(response.status).toBe(400);
  expect(reserveDiscount).not.toHaveBeenCalled();
});

it("releases a pending coupon when delivery fails", async () => {
  deliver.mockRejectedValue(new Error("rejected"));
  const response = await handler(issueRequest("PINOYAKO"));
  expect(response.status).toBe(502);
  expect(releaseDiscount).toHaveBeenCalledWith(QUIZ_ID, REDEMPTION_ID, expect.any(String));
});

it("reuses the proposal reference and reservation after an ambiguous delivery retry", async () => {
  deliver.mockRejectedValueOnce(new Error("acknowledgement lost")).mockResolvedValueOnce();
  expect((await handler(issueRequest("EARLYBIRDWORKS"))).status).toBe(502);
  expect((await handler(issueRequest("EARLYBIRDWORKS"))).status).toBe(200);
  expect(deliver.mock.calls[0][0].operationId).toBe(deliver.mock.calls[1][0].operationId);
  expect(reserveDiscount).toHaveBeenNthCalledWith(2, expect.objectContaining({ quizSessionId: QUIZ_ID }));
});
```

Cover PH/international/`ZZ`, invalid code, exhausted, already-redeemed, no coupon, preview without reservation, active proposal idempotency, and exact request-key validation.

Add a parallel last-slot handler test whose reservation fake serializes access exactly like the campaign row lock:

```ts
const [first, second] = await Promise.all([
  handler(issueRequestFor(QUIZ_A, "EARLYBIRDWORKS")),
  handler(issueRequestFor(QUIZ_B, "EARLYBIRDWORKS")),
]);
expect([first.status, second.status].sort()).toEqual([200, 409]);
expect(await second.json()).toMatchObject({ error: "coupon_exhausted" });
```

- [ ] **Step 2: Run Edge tests and verify RED**

Run: `deno test --allow-env supabase/functions/tests/proposal-functions.test.ts`

Expected: FAIL because the handler and environment do not support coupons or reservations.

- [ ] **Step 3: Add the redemption secret configuration**

Extend `getProposalEnv`:

```ts
couponRedemptionSecret: required(get, "COUPON_REDEMPTION_SECRET", 32),
```

Add only `COUPON_REDEMPTION_SECRET=` to `.env.example`. Tests use a fake 32+ character value and assert missing/short values fail closed.

- [ ] **Step 4: Extend request validation and server dependencies**

Allow only `operation`, `quizSessionId`, `selection`, and `couponCode`. Require selection for issue; accept optional selection for preview. Normalize coupon code and reject non-string/overlong input.

Derive the stable digest only from the canonical stored lead email:

```ts
const redeemerDigest = await hmacSha256Hex(
  `proposal-coupon:${owned.email.trim().toLowerCase()}`,
  dependencies.couponRedemptionSecret,
);
```

Map known database reason codes to the five approved public coupon failures. Unknown database errors remain generic.

- [ ] **Step 5: Implement preview and issue orchestration**

Preview resolves the requested/default roadmap, asks the database for a validated campaign when a code is supplied, calculates the quote, and builds a draft without reserving.

Issue order:

1. Load owned quiz and active catalog.
2. Return the existing active immutable snapshot idempotently.
3. Resolve selection and selected estimate.
4. Validate/reserve coupon if present.
5. Calculate quote and build V2 proposal snapshot.
6. Finalize through `finalize_quiz_proposal_v2`.
7. Deliver using the stable proposal reference as operation ID.
8. On delivery failure, best-effort release the reservation, record a sanitized event, and return `proposal_delivery_failed`.
9. On acknowledgement, call `mark_proposal_delivered_v2` to activate proposal and redeem the reservation atomically.

Analytics properties include campaign key, percent, original/final USD, tier, platform, and offer—but not code input, email, digest, or redemption ID.

- [ ] **Step 6: Verify Edge tests and type consistency**

Run: `deno test --allow-env supabase/functions/tests`

Expected: PASS for all Edge Function tests.

Run: `npm run typecheck`

Expected: PASS after shared type changes.

- [ ] **Step 7: Commit server orchestration**

```powershell
git add -- supabase/functions/_shared/env.ts supabase/functions/finalize-proposal/index.ts supabase/functions/tests/proposal-functions.test.ts .env.example
git commit -m "feat: validate coupons during proposal issuance"
```

### Task 5: Browser Service, Reducer, and Explicit Confirmation Flow

**Files:**
- Modify: `src/features/quiz/quiz-service.ts`
- Modify: `src/features/quiz/reducer.ts`
- Modify: `src/features/quiz/QuizExperience.tsx`
- Modify: `tests/unit/quiz-service.test.ts`
- Modify: `tests/unit/quiz-reducer.test.ts`
- Modify: `tests/unit/quiz-components.test.tsx`

**Interfaces:**
- Consumes: Task 4 preview/issue response and Task 1 freshness helper.
- Produces:
  - `previewProposal(context, selection?, couponCode?)`
  - `issueProposal(context, selection, couponCode?)`
  - reducer fields `couponInput`, `appliedCampaign`, `priceQuote`, `proposalConfirmationStatus`, `couponMessage`
  - actions `SET_COUPON_INPUT`, `COUPON_APPLIED`, `COUPON_REJECTED`, `REMOVE_COUPON`, `PROPOSAL_CONFIRMING`, `PROPOSAL_ISSUED`, `PROPOSAL_CONFIRMATION_FAILED`, `REFRESH_LOCATION_QUOTE`.

- [ ] **Step 1: Write failing service contract tests**

Assert preview/issue bodies omit coupon when empty, uppercase normalized coupon codes, include selection for preview when provided, parse V2 quotes, and map public error codes to exact safe messages.

```ts
expect(invoke).toHaveBeenCalledWith("finalize-proposal", {
  body: {
    operation: "issue",
    quizSessionId: QUIZ_ID,
    selection: { tierKey: "basic", platform: "systeme_io" },
    couponCode: "PINOYAKO",
  },
});
```

- [ ] **Step 2: Write failing reducer tests**

Cover:

- coupon input trim/uppercase only at submission, not destructive while typing;
- applying one campaign replaces no other campaign because only one field exists;
- changing selection recalculates from the validated campaign;
- coupon errors preserve editable selection;
- `PROPOSAL_CONFIRMING` blocks duplicate confirmation;
- `PROPOSAL_ISSUED` locks selection/coupon;
- validation/capacity failures that happen before snapshot persistence keep controls editable;
- an ambiguous delivery failure locks pricing to the initialized snapshot and offers only an idempotent delivery retry;
- result reset clears coupon state.

- [ ] **Step 3: Write failing orchestration tests and prove automatic issuance still exists**

Render a completed assessment and assert, before implementation:

```ts
expect(service.issueProposal).not.toHaveBeenCalled();
expect(screen.getByRole("button", { name: /confirm roadmap and email proposal/i })).toBeInTheDocument();
```

Expected RED reason: the current effect calls `issueProposal` automatically and the confirm button does not exist.

Add a stale-rate test with `now = 2026-09-24T00:15:00.001Z` that expects `getCurrencyQuote` and `saveOwnedQuizProgress` before issue, plus an exact-boundary test at `00:15:00.000Z` that skips refresh.

- [ ] **Step 4: Implement service parsing and reducer state**

Do not accept partial quote objects. Validate finite non-negative totals, valid currency codes, campaign enum/code/percent pairs, and parseable timestamps. Keep public error messages centralized in `quiz-service.ts`.

Reducer selection changes call `resolveRoadmapSelection` and `calculateProjectPriceQuote` using the current validated campaign and latest `state.location`.

- [ ] **Step 5: Replace automatic issuance with explicit confirmation**

Delete the result-screen auto-issue effect. Add callbacks:

```ts
const applyCoupon = async (code: string) => {
  const context = await ensureOwnedContext(state.audienceKey!);
  const proposal = await service.previewProposal(context, state.roadmapSelection!, code);
  dispatch({ type: "COUPON_APPLIED", proposal });
};

const confirmProposal = async () => {
  dispatch({ type: "PROPOSAL_CONFIRMING" });
  const location = await refreshQuoteIfStale();
  const issued = await service.issueProposal(context, state.roadmapSelection!, state.appliedCampaign?.code);
  dispatch({ type: "PROPOSAL_ISSUED", proposal: issued.proposal, location });
};
```

Use the existing delivery dialog only after explicit confirmation starts. Preserve focus trapping and retry behavior. If the server returns `proposal_delivery_failed` after snapshot initialization, dispatch a distinct `PROPOSAL_DELIVERY_RETRY_REQUIRED` action that locks selection/coupon changes and retries the same selection/code/reference; coupon validation errors continue to use editable `PROPOSAL_CONFIRMATION_FAILED` state.

- [ ] **Step 6: Run focused service/reducer/orchestration tests**

Run: `npx vitest run tests/unit/quiz-service.test.ts tests/unit/quiz-reducer.test.ts tests/unit/quiz-components.test.tsx`

Expected: PASS with no automatic issue call, exact FX freshness behavior, one coupon, and issued locking.

- [ ] **Step 7: Commit browser orchestration**

```powershell
git add -- src/features/quiz/quiz-service.ts src/features/quiz/reducer.ts src/features/quiz/QuizExperience.tsx tests/unit/quiz-service.test.ts tests/unit/quiz-reducer.test.ts tests/unit/quiz-components.test.tsx
git commit -m "feat: confirm selected proposal pricing"
```

### Task 6: Accessible Investment UI and Readability Fixes

**Files:**
- Create: `src/features/quiz/ProjectInvestment.tsx`
- Modify: `src/features/quiz/QuizResult.tsx`
- Modify: `src/features/quiz/RoadmapComparison.tsx`
- Modify: `src/features/quiz/RoadmapSelectionSummary.tsx`
- Modify: `src/styles/quiz.css`
- Modify: `tests/unit/quiz-components.test.tsx`
- Modify: `tests/e2e/portfolio-quiz.spec.ts`

**Interfaces:**
- Consumes: Task 5 state/callbacks and Task 1 `ProjectPriceQuote`.
- Produces `ProjectInvestment` props:

```ts
interface ProjectInvestmentProps {
  quote: ProjectPriceQuote;
  couponInput: string;
  couponMessage: string | null;
  countryCode: string;
  locked: boolean;
  busy: boolean;
  onCouponInput: (value: string) => void;
  onApplyCoupon: () => Promise<void>;
  onRemoveCoupon: () => void;
  onRetryConversion: () => Promise<void>;
  onConfirm: () => Promise<void>;
}
```

- [ ] **Step 1: Add failing semantic pricing and selection tests**

```tsx
expect(screen.getByText("$1,500", { selector: "del" })).toBeInTheDocument();
expect(screen.getByText("$750 USD")).toBeInTheDocument();
expect(screen.getByText(/you save \$750 · 50% off/i)).toBeInTheDocument();
expect(screen.getByText(/approximately ₱43,500 PHP/i)).toBeInTheDocument();
```

Switch from Basic to Advanced and assert original, final, savings, and PHP amounts all update. Assert one labeled coupon input, one live status region, ineligible `ZZ` copy, retry conversion when local total is null, and locked controls after issue.

- [ ] **Step 2: Add failing browser assertions for the reported defects**

In the existing four-project viewport matrix, assert:

```ts
await expect(page.getByTestId("point-a-b-row").locator("dd").first()).toHaveCSS("color", "rgb(242, 240, 232)");
expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
await expect(page.getByRole("heading", { name: /project investment/i })).toBeVisible();
```

Use a normal pointer click on every roadmap button at mobile size to catch overlay/overflow regressions.

- [ ] **Step 3: Run component/E2E tests and verify RED**

Run: `npx vitest run tests/unit/quiz-components.test.tsx`

Run: `npm run test:e2e -- tests/e2e/portfolio-quiz.spec.ts`

Expected: FAIL on absent `<del>`, automatic/current investment values, dark-on-dark text, or overflow.

- [ ] **Step 4: Build `ProjectInvestment` and wire selected quote rendering**

Use `Intl.NumberFormat` for USD/local display. Render campaign pricing with `<del>`, a separate prominent final total, savings, and conversion timestamp. The coupon input accepts text but does not claim success until the server preview returns a validated campaign.

`RoadmapSelectionSummary` receives the already derived quote; it does not rebuild coupon eligibility. `QuizResult` replaces `proposal.investment.estimatedTotalUsd` with the selected quote and renders the new component in section 13.

Disable roadmap/platform buttons when `locked` and show **Proposal confirmed** on the selected tier.

- [ ] **Step 5: Fix the precise CSS root causes**

Keep the dark snapshot cells but explicitly restore readable light text inside gold cards:

```css
.result-card--gold .snapshot-list div { background: #0b0c0b; }
.result-card--gold .snapshot-list dd { color: #f2f0e8; }
```

Add `min-width: 0`, `overflow-wrap: anywhere`, responsive grid stacking, full-width mobile coupon controls, and non-shrinking price columns to the investment block. Do not add horizontal scrolling to hide a layout defect.

- [ ] **Step 6: Verify component and browser behavior**

Run: `npx vitest run tests/unit/quiz-components.test.tsx tests/unit/proposal-components.test.tsx`

Run: `npm run test:e2e -- tests/e2e/portfolio-quiz.spec.ts`

Expected: PASS across desktop, short-laptop, tablet, and mobile with readable point cells and no horizontal overflow.

- [ ] **Step 7: Commit the product UI**

```powershell
git add -- src/features/quiz/ProjectInvestment.tsx src/features/quiz/QuizResult.tsx src/features/quiz/RoadmapComparison.tsx src/features/quiz/RoadmapSelectionSummary.tsx src/styles/quiz.css tests/unit/quiz-components.test.tsx tests/e2e/portfolio-quiz.spec.ts
git commit -m "feat: show live discounted project investment"
```

### Task 7: Documentation, Generated Types, and Whole-System Verification

**Files:**
- Modify: `docs/portfolio-blueprint.md`
- Modify: `docs/supabase-database.md`
- Modify: `src/generated/database.types.ts`
- Modify: any test fixture whose versioned proposal shape legitimately changed in Tasks 1–6.

**Interfaces:**
- Consumes: all prior tasks and the linked Supabase schema after approved migration application.
- Produces: documented operations, reproducible generated types, and a release-candidate commit with full evidence.

- [ ] **Step 1: Add failing documentation/static assertions**

Extend `tests/supabase-migrations-static.test.mjs` to require documentation for:

```js
for (const phrase of [
  "COUPON_REDEMPTION_SECRET",
  "PINOYAKO",
  "EARLYBIRDWORKS",
  "first 50",
  "first 100",
  "pending reservation",
  "proposal-snapshot-2026.09-v2",
]) assert.match(databaseDocsAndBlueprint, new RegExp(escape(phrase), "i"));
```

Run: `npm run test:supabase:static`

Expected: FAIL until both documents contain the operating contract.

- [ ] **Step 2: Update product and operations documentation**

Document calculation order, eligibility, one-per-email HMAC identity, capacity semantics, failed-delivery release, snapshot immutability, FX fallback, explicit confirmation, secret configuration, inactive-first rollout, campaign deactivation rollback, and the prohibition on deleting redemption audit history.

- [ ] **Step 3: Regenerate database types from the verified schema**

After applying the migration to the local Docker-backed database:

```powershell
npx supabase gen types typescript --local --schema public | Set-Content -Encoding utf8 src/generated/database.types.ts
```

Inspect the diff to confirm only expected table/RPC types changed. Do not hand-edit generated declarations. After an approved remote migration, run the linked generation command to a temporary file and compare it with the committed local output; any difference blocks deployment.

- [ ] **Step 4: Run the full local verification matrix**

Run each separately and record exit status:

```powershell
npm test
npm run test:supabase:static
npm run test:edge
npm run lint
npm run typecheck
npm run build
npm run test:e2e -- tests/e2e/portfolio-quiz.spec.ts
git diff --check
```

Expected:

- 0 failing static/unit/Edge/browser tests;
- 0 TypeScript errors;
- production build exit 0;
- lint exit 0 (report any pre-existing warnings explicitly);
- diff check exit 0.

When Docker is available:

```powershell
npx supabase start
npx supabase test db
npx supabase db lint --level warning
```

Expected: all pgTAP tests pass and no database lint warning remains unexplained. If Docker is unavailable, database integration remains an explicit release blocker.

- [ ] **Step 5: Run the target-specific remote preflight without mutation**

```powershell
npx supabase projects list
npx supabase migration list --linked
npx supabase db push --linked --dry-run
git status --short --branch
git log --oneline origin/codex/service-professionals-portfolio..HEAD
```

Report exact project, pending migration, campaign inactive state, required secret name without its value, function to deploy, Firebase target, destructive-statement scan, and rollback. Stop for explicit deployment authorization before any remote write.

- [ ] **Step 6: Commit documentation and generated types**

```powershell
git add -- docs/portfolio-blueprint.md docs/supabase-database.md src/generated/database.types.ts tests/supabase-migrations-static.test.mjs
git commit -m "docs: record proposal discount operations"
```

- [ ] **Step 7: Request whole-branch review**

Use the required review workflow to inspect the entire branch against the design specification, with special attention to capacity races, retry idempotency, legacy proposal compatibility, exact pricing agreement, and browser accessibility. Apply validated corrections with focused tests, then rerun Step 4.

## Deployment Sequence After Separate Owner Approval

1. Push the reviewed branch commit.
2. Apply `202609240005_add_proposal_discount_campaigns.sql` with both campaigns inactive.
3. Regenerate/confirm linked database types if they were not generated locally.
4. Configure `COUPON_REDEMPTION_SECRET` through the approved Supabase secret workflow without printing it.
5. Deploy `finalize-proposal`; deploy any other Edge Function only if its runtime code changed.
6. Run server preview smoke tests for PH and international fixtures without issuing email or consuming capacity.
7. Activate campaigns through a separately reviewed additive migration created only after the smoke tests pass.
8. Run one owner-approved controlled issuance for each campaign; verify one redemption, exact email totals, protected proposal totals, and no secret/PII leakage.
9. Build and deploy Firebase Hosting to `elysha-works-portfolio` in project `elyshaworks-fd2dc`.
10. Verify `https://elyshaworks.com/quiz/` and the Firebase hosting URL, confirm the live JS calls the new issue contract, and confirm no horizontal overflow at the required viewports.
11. If issuance fails, deactivate campaigns first; preserve issued snapshots and redemption history while investigating.
