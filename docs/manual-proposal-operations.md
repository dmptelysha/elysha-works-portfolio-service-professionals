# Manual proposals: local owner runbook

The reusable proposal route is `/proposal/client/?ref=<opaque reference>`. The link alone opens only an access-code form. A successful code check returns the issued proposal for the current browser page session; refresh locks it again. The route is ready locally. Meghan has **no issued record or live link yet**. This branch has not been deployed.

## Review Meghan's current draft

- Client brand: **Emotional Anchor** (without “The”). Use this exact name in the proposal and any later owner dashboard entry.
- Offline source: `D:\CODEX\Meghan -  Emotional Anchor\sales-page-concept\index.html`. Keep it read-only from this repo.
- Ignored draft: `.tmp/manual-proposals/meghan/draft.json`.
- Ignored captures: `.tmp/manual-proposals/meghan/{desktop,tablet,mobile}.png` and `manifest.json`. They are full-page, watermarked, raster-only snapshots from 1440, 768, and 390 pixel viewports. The manifest records capture time and the source dependency hash.
- Before issuing, open all three images and confirm the current source is the intended design. Review every Point A/B statement, service claim, offer inclusion, price, expiration, and booking path with Elysha. The Basic, Advanced, and Complete $1,500/$2,500/$4,000 USD amounts are editable catalog starting values, **not** an approved Meghan quote. The empty inclusions list intentionally hides the optional picker.

If the offline design changes, run the read-only capture again from this worktree:

```powershell
node scripts/capture-manual-proposal.mjs --source "D:\CODEX\Meghan -  Emotional Anchor\sales-page-concept" --output ".tmp/manual-proposals/meghan" --client "Meghan"
node scripts/manual-proposal.mjs validate --input ".tmp/manual-proposals/meghan/draft.json"
```

Never copy the source HTML, CSS, scripts, original assets, draft JSON, captured PNGs, or the generated code into `public/`, `out/`, Git, or a client message attachment. Issuance uploads only the three watermarked PNGs to private Storage.

## Issue and share, after content and deployment approval

Apply the new Supabase migration and deploy the `manual-proposal-access` Edge function with `PROPOSAL_KEY_PEPPER` set to a stable, random secret of at least 32 characters. Configure the function's portfolio origin and the browser's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the same project. The local authoring process needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROPOSAL_KEY_PEPPER`, and `PUBLIC_PROPOSAL_BASE_URL`. Keep the service key and pepper outside Git; the sample names are in `.env.example`. The base URL must be the HTTPS site origin that serves this branch.

Run from a private terminal whose environment contains those values:

```powershell
node scripts/manual-proposal.mjs validate --input ".tmp/manual-proposals/meghan/draft.json"
node scripts/manual-proposal.mjs draft --input ".tmp/manual-proposals/meghan/draft.json"
node scripts/manual-proposal.mjs issue --input ".tmp/manual-proposals/meghan/draft.json" --id "<draft UUID printed above>"
```

`draft` saves an ignored receipt under `.tmp/manual-proposals/receipts/`. `issue` checks that the reviewed draft, manifest, and actual PNG bytes still match that receipt, uploads private images, generates a random opaque reference and a random 12-character access code, stores only a peppered hash, and prints the share link and code **once**. Copy them securely. Send the link and code separately to Meghan only after confirming the deployed route and access service work. The access code is not recoverable from the database. There is no live issue as part of this branch.

If scope or capture changes after a draft is created, make a new draft rather than modifying an issued snapshot. Use `--supersedes "<prior draft UUID>"` on the new `draft` command to link the revision.

## Rotate, revoke, and clean

```powershell
node scripts/manual-proposal.mjs rotate --id "<proposal draft UUID>"
node scripts/manual-proposal.mjs revoke --id "<proposal draft UUID>"
node scripts/manual-proposal.mjs cleanup
```

`rotate` invalidates the old code and prints a new one once; share it separately from the existing link. `revoke` blocks future access. `cleanup` removes only private preview objects that the database identifies as expired and records their removal. Keep the pepper stable for active proposals: changing it invalidates all their codes. After an expired or revoked proposal, run cleanup as an owner maintenance task.

If `issue` reports a database or network error after uploading previews, do not assume issuance failed: the commit response may have been lost. Inspect the private proposal status by draft UUID before retrying. The tool preserves those private images so a possibly active proposal does not lose its preview. Remove confirmed orphan images through the owner account after reconciliation.

## Future deposit checkout

`Reserve My Slot` currently stays disabled and states that no payment is taken and no slot is held. When a provider is chosen, add a server-side checkout endpoint that re-reads the immutable issued proposal, checks active status and expiry, validates selected tier and inclusion IDs, recalculates the total and 50% deposit in integer cents, and creates the provider session. Record a reservation only after a verified provider webhook confirms the payment. The browser's displayed amount is for review and must not authorize a charge. Confirm fees, tax, refund and slot terms before enabling checkout.

## Local verification

Use `npm run build` with the booking Firebase public API key set locally, then `node --test tests/manual-proposal-export.test.mjs`. Run `npx playwright test tests/e2e/manual-proposal.spec.ts` for development checks. To exercise the built static export in a browser, build with a local mock Supabase URL and publishable key, then set `PLAYWRIGHT_STATIC_EXPORT=1` when running that same Playwright spec; this serves `out/` through a local HTTP server. The browser test uses mocked proposal data and images; it does not issue a record or contact Meghan. The exported route contains only the locked shell. Right-click, print, and common inspection shortcuts are discouraged after unlock, but browsers and operating systems cannot prevent screenshots or copying delivered pixels. The privacy controls are the code gate, short-lived private image URLs, and visible watermark.
