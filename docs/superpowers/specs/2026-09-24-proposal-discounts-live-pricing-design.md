# Proposal Discounts and Live Local Pricing Design

**Date:** September 24, 2026

**Status:** Approved design captured for owner review before implementation planning

**Scope:** Assessment roadmap selection, proposal pricing, coupon enforcement, protected proposal snapshots, and result-page readability

## Purpose

Let a verified assessment client choose one of the three roadmap tiers before the protected proposal is issued, see the selected one-time investment update immediately in USD and the business location's display currency, and apply one eligible launch coupon. The issued and emailed proposal must preserve the same server-validated selection, discount, and totals shown at confirmation time.

This work also fixes the unreadable Point A-to-Point B text and the clipped investment copy visible in the current result layout.

## Approved Business Rules

### Source pricing

- USD remains the source of truth for every package, add-on, discount, proposal, and stored monetary value.
- The existing three public tiers and their package/platform variants remain unchanged.
- The lowest undiscounted package remains USD 1,500.
- A valid discount may reduce the final payable estimate below USD 1,500. For example, `PINOYAKO` reduces USD 1,500 to USD 750.
- A discount applies to the complete selected one-time project estimate, including priced add-ons. It does not apply to third-party recurring costs.
- Calculate the USD discount first, round to cents, and then calculate the indicative local equivalent.

### `PINOYAKO`

- Case-insensitive code: `PINOYAKO`.
- Eligible only when the assessment's selected business country has `country_code = 'PH'`.
- Discount: 50%.
- Capacity: first 50 successful redemptions.
- One successful redemption per verified email address.

### `EARLYBIRDWORKS`

- Case-insensitive code: `EARLYBIRDWORKS`.
- Eligible only when the assessment's selected business country is a configured non-Philippine country.
- The catch-all `ZZ` location is not eligible; the client must select the actual business country.
- Discount: 15%.
- Capacity: first 100 successful redemptions.
- One successful redemption per verified email address.

### Shared coupon behavior

- A proposal accepts at most one coupon. Coupons never stack.
- Eligibility is based on the assessment's business location, not inferred nationality, browser location, or IP address.
- Coupon input is normalized with trim plus uppercase.
- A capacity slot is permanently consumed only after protected proposal issuance and initial email delivery succeed.
- A pending issuance temporarily reserves a slot so concurrent requests cannot oversubscribe the limit.
- Failed delivery releases the reservation. An interrupted request expires safely and becomes available again.
- Retries for the same quiz session are idempotent and cannot consume a second slot.
- A verified email that already redeemed a campaign cannot redeem that campaign through another business or assessment.
- Existing issued proposals remain immutable.

## User Experience

### Roadmap selection and confirmation

The result page remains a single continuous roadmap. Before issuance:

1. The client compares Basic, Advanced, and Complete and chooses a feasible package/platform variant.
2. The selected-roadmap summary and Project investment section recalculate immediately from that selection.
3. An eligible client may enter one coupon code and apply it.
4. The pricing panel shows the selected estimate and local conversion.
5. The client selects **Confirm roadmap and email proposal**.
6. The server validates the selection, location, coupon, capacity, and verified-email uniqueness before issuing the proposal.

The current automatic issuance effect must be removed. A draft proposal may be previewed automatically, but no package selection, coupon redemption, proposal access key, or email delivery is finalized until the client confirms.

After successful issuance, the selection and coupon controls become read-only and clearly state **Proposal confirmed**. The result page and protected proposal use the issued server snapshot rather than recomputing mutable pricing in the browser.

### Coupon controls

The Project investment card contains:

- a labeled coupon input;
- an **Apply coupon** action;
- a clear eligibility hint based on the selected business country;
- an inline live region for success, invalid, ineligible, exhausted, already-used, and temporary-error states; and
- a remove action before proposal confirmation.

The input must not reveal whether a verified email has previously redeemed a coupon until after authenticated server validation. Public capacity details may state “first 50” or “first 100,” but the interface does not need to expose an exact remaining count.

### Discount emphasis

Without a coupon, show the normal selected USD estimate and its indicative local equivalent.

With a valid coupon, use semantic pricing markup:

- `<del>` for the original USD amount;
- a prominent discounted USD amount;
- a savings line such as **You save $750 · 50% off**;
- the discounted local equivalent beneath it; and
- a concise note that USD is the source price and conversion is indicative.

Example:

```text
Original:  $1,500
           --------
Now:       $750 USD
You save:  $750 · 50% off
Approx.:   ₱43,500 PHP
```

Starting-price variants retain the “starting at” meaning on both original and discounted values.

### Live local conversion

- Continue using the existing `currency-quote` Edge Function and business-country selection.
- A package/platform or coupon change recalculates the local amount immediately from the latest stored quote without another network round trip.
- Show the display currency and quote timestamp when available.
- Refresh the currency quote before confirmation when it is older than 15 minutes.
- If refresh fails, keep the authoritative USD calculation, identify the local amount as temporarily unavailable, and provide **Retry conversion**. Currency failure never blocks package selection or proposal confirmation.
- Philippine clients see PHP. Other supported countries see their configured display currency.

### Readability fixes

- The dark cells inside the gold Point A-to-Point B card must use readable light text or a gold-compatible light cell surface; no inherited dark-on-dark combination is allowed.
- The Project investment card must wrap long copy inside its grid column at intermediate laptop/tablet widths.
- Price rows, coupon controls, and savings copy must stack cleanly on mobile with no horizontal overflow.
- The crossed-out amount must remain understandable to assistive technology; discounted and savings values must not rely on color alone.

## Pricing Model

Introduce a pure shared pricing function used by the browser and Edge Function:

```ts
interface DiscountCampaignQuote {
  campaignKey: "pinoyako" | "earlybirdworks";
  code: string;
  percentage: 50 | 15;
}

interface ProjectPriceQuote {
  originalTotalUsd: number;
  discountAmountUsd: number;
  finalTotalUsd: number;
  localCurrency: string;
  localSymbol: string;
  finalTotalLocal: number | null;
  fxRate: number | null;
  fxRateTimestamp: string | null;
  campaign: DiscountCampaignQuote | null;
}
```

The browser uses this function for immediate display only. The Edge Function recalculates the same quote from catalog data, selected roadmap, stored assessment location, and server-loaded campaign configuration. Browser totals, percentages, and eligibility flags are never trusted during issuance.

## Server API

Extend `finalize-proposal` rather than create a separate public coupon endpoint.

### Preview

`operation: "preview"` accepts an optional roadmap selection and normalized coupon code. It returns a draft proposal plus a server-validated price quote. Preview never creates or reserves a redemption.

### Issue

`operation: "issue"` accepts:

```json
{
  "operation": "issue",
  "quizSessionId": "uuid",
  "selection": { "tierKey": "basic", "platform": "systeme_io" },
  "couponCode": "PINOYAKO"
}
```

`couponCode` may be null or omitted. Exact-key request validation remains in force.

Typed public failures must distinguish:

- `coupon_invalid`
- `coupon_ineligible`
- `coupon_exhausted`
- `coupon_already_redeemed`
- `coupon_temporarily_unavailable`

Errors must not reveal another client's email or redemption record.

## Database Design

Add two private tables through an additive migration.

### `discount_campaigns`

| Column | Purpose |
|---|---|
| `campaign_key` | Stable internal key and primary key |
| `code` | Normalized unique public coupon code |
| `discount_percent` | Checked integer percentage |
| `eligibility_scope` | `philippines` or `international` |
| `max_redemptions` | 50 or 100 |
| `active` | Operational kill switch |
| `created_at`, `updated_at` | Audit timestamps |

Seed the two approved campaigns idempotently in the migration. Direct browser reads and writes are forbidden.

### `discount_redemptions`

| Column | Purpose |
|---|---|
| `id` | UUID primary key |
| `campaign_key` | Campaign foreign key |
| `quiz_session_id` | Unique assessment/proposal attempt |
| `lead_id` | Owning verified lead |
| `redeemer_digest` | HMAC digest of canonical verified email; never plaintext |
| `status` | `pending`, `redeemed`, or `released` |
| `reserved_until` | Crash-safe pending reservation expiry |
| `original_total_usd` | Server-calculated pre-discount total |
| `discount_amount_usd` | Server-calculated discount |
| `final_total_usd` | Server-calculated payable estimate |
| `redeemed_at`, `released_at`, `created_at` | Lifecycle audit fields |

Enforce one active/successful redemption per campaign and `redeemer_digest`, and one redemption lifecycle per quiz session. RLS is enabled with no browser policy. Service access occurs only through narrowly granted security-definer functions.

Use a dedicated `COUPON_REDEMPTION_SECRET` in the Edge Function to produce the HMAC digest from the canonical email established by the verified lead. The digest and secret must never be returned or logged.

### Atomic lifecycle

1. Lock the campaign row inside a transaction.
2. Release expired pending reservations.
3. Check campaign activity, country eligibility, verified-email uniqueness, and `pending + redeemed < max_redemptions`.
4. Insert or return the idempotent pending reservation for the quiz session.
5. Build and persist the selected proposal snapshot.
6. Deliver the initial proposal email.
7. On success, atomically mark the proposal delivered and reservation redeemed.
8. On handled delivery failure, mark the reservation released and leave the proposal retryable.

The database functions must revalidate quiz ownership, lead linkage, campaign, and totals. They are revoked from `public`, `anon`, and `authenticated` and granted only to `service_role` where appropriate.

## Proposal Snapshot

Extend the proposal investment snapshot with:

- original selected total USD;
- campaign key and display code;
- discount percentage;
- discount amount USD;
- final total USD;
- final local total;
- currency, rate, and timestamp; and
- redemption identifier or immutable redemption status metadata required for audit.

`estimated_project_investment_usd` stores the final discounted USD total for a newly issued proposal. The original amount and discount breakdown remain in the versioned JSON snapshot. Increment the accepted snapshot version rather than silently changing the meaning of an existing version.

The protected proposal page, email summary, assessment result, and database record must all read the same issued snapshot.

## State and Components

- Add coupon input, validation state, server quote, and confirmation state to the assessment reducer.
- Keep draft selection mutable until successful issuance.
- Derive the displayed investment from `resolveRoadmapSelection(result, selection)` rather than the original recommendation total.
- Create a focused pricing presentation component shared by the selected-roadmap summary and Project investment section where practical.
- Keep campaign validation and capacity logic out of React components.
- Lock roadmap buttons and coupon controls after issuance.
- Persist only non-sensitive draft coupon input locally. Never persist redemption digests or privileged responses.

## Security and Abuse Controls

- The verified lead email and stored business country are the only eligibility inputs at issuance.
- Never trust a browser-supplied percentage, limit, USD total, local total, country eligibility flag, or remaining count.
- Rate-limit repeated preview/issue coupon attempts using the existing authenticated anonymous-owner boundary.
- Do not log raw verified emails, coupon redemption HMAC inputs, access keys, or secrets.
- Coupon codes themselves are promotional identifiers, not secrets.
- Admin rollback deactivates a campaign; it does not delete successful redemption history or rewrite issued proposals.

## Testing

### Pure unit tests

- Every feasible tier/platform selection produces its own estimate.
- Selection changes recalculate USD and local currency immediately.
- 50% and 15% discounts round correctly.
- Discount covers the selected one-time total including priced add-ons.
- USD is calculated before local conversion.
- Failed/missing FX returns a correct USD quote with no fabricated local amount.

### Component and reducer tests

- Gold path cells remain readable and investment copy wraps.
- Applying `PINOYAKO` to USD 1,500 renders `<del>$1,500</del>` and a prominent USD 750.
- Applying `EARLYBIRDWORKS` shows 15% savings for an eligible international location.
- Country-ineligible, invalid, exhausted, and already-used messages are accessible.
- Only one coupon is active.
- Tier/platform changes update original, discounted, and local totals.
- Confirmation replaces the current automatic issuance behavior.
- Controls lock after successful issuance and remain usable after a retryable failure.

### Edge Function tests

- The server ignores browser-computed totals and recalculates from catalog data.
- PH and international eligibility rules are enforced from the stored quiz location.
- `ZZ` is ineligible.
- Exact request-key validation rejects unexpected pricing fields.
- Email/retry behavior is idempotent.

### PostgreSQL/pgTAP tests

- The 50th `PINOYAKO` and 100th `EARLYBIRDWORKS` redemptions succeed.
- The 51st and 101st fail with `coupon_exhausted`.
- Concurrent last-slot attempts cannot both succeed.
- The same verified-email digest cannot redeem a campaign twice across businesses.
- Released and expired pending reservations return capacity.
- A successful retry reuses its quiz-session reservation.
- Browser roles cannot read campaign counters or redemption rows.

### Browser tests

- Desktop, short laptop, tablet, and mobile have no horizontal overflow.
- Point A-to-Point B copy is visibly readable against its cell background.
- Package changes update Project investment without navigation.
- Crossed-out original, discounted amount, savings, and PHP/local equivalent are all visible.
- A confirmed proposal reloads with the identical issued breakdown.

## Documentation and Deployment

Update the portfolio blueprint and Supabase database documentation with the approved coupon rules, pricing order, capacity semantics, snapshot version, and operational rollback.

Release order:

1. Run unit, component, Edge Function, pgTAP, browser, type, lint, and production-build verification.
2. Apply the additive database migration and seed the two inactive campaigns.
3. Configure `COUPON_REDEMPTION_SECRET` without exposing its value.
4. Deploy the updated `finalize-proposal` Edge Function.
5. Activate both campaigns after server smoke tests pass.
6. Deploy Firebase Hosting.
7. Run live smoke tests for one eligible preview per campaign without consuming a slot; use controlled issuance only with owner approval.

Rollback deactivates the campaigns and restores the previous frontend issuance path only if necessary. It never deletes redemption history or rewrites already issued proposal snapshots.

## Acceptance Criteria

- All roadmap choices update the authoritative Project investment amount.
- PHP and other supported local equivalents update immediately from a current quote.
- `PINOYAKO` gives 50% off to the first 50 eligible Philippine verified emails.
- `EARLYBIRDWORKS` gives 15% off to the first 100 eligible international verified emails.
- Limits cannot be oversubscribed under concurrency.
- Failed email issuance does not permanently consume a slot.
- Original prices are visibly and semantically crossed out when discounted.
- Issued result, protected proposal, email, and stored snapshot agree exactly.
- The reported dark-on-dark and clipping defects are fixed across supported viewports.
