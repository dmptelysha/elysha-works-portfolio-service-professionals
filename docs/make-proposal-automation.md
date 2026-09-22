# Make proposal automation operator guide

Status: both Make scenarios are created and intentionally inactive. The shared automation secret has been rotated, stored as a Supabase Edge Function secret, and configured in Scenario B through the `X-Make-Automation-Secret` request header. No scenario has been run and no email has been sent. Both scenarios must remain inactive until controlled email and suppression tests pass.

This automation sends a link and a separate access key to a private three-day proposal page. It does not generate or attach a PDF. Supabase remains authoritative for proposal expiry, booking suppression, follow-up eligibility, and cold-lead transitions. Make never receives a Supabase service-role credential.

## Secrets and connections

Store values only in the services that consume them:

| Name | Storage location | Purpose |
|---|---|---|
| `MAKE_PROPOSAL_WEBHOOK_SECRET` | Supabase Edge secret plus Make Custom Webhook API-key vault | Sent only as `x-make-apikey`; Make rejects unauthenticated requests. The Edge Function also derives the optional `X-Elysha-Signature` defense-in-depth header from this value. |
| `MAKE_AUTOMATION_SECRET` | Supabase Edge Function secret plus Scenario B's private HTTP-module headers | Authenticates claim, revalidate, and acknowledge calls through `X-Make-Automation-Secret`; never store it in browser code, a public table, or a client-side environment variable |
| Gmail connection | Make connection vault | Sends from the owner-approved Gmail account |

Never place values in this repository, Make notes, Data Store fields, browser code, scenario names, or execution screenshots. Enable **confidential scenario data** in Make when the account supports it. Scenario exports and execution history must be treated as sensitive because an initial run temporarily contains the raw access key.

## Scenario A — Elysha Works — Proposal Delivery

Scenario ID: `6362134`. Connection name: `Elysha's Gmail connection (dmpt.elysha@gmail.com)`; only the display name is documented, never its token.

Keep the scenario inactive while building it. Its modules, in exact order, are:

```text
Authenticated Custom Webhook → Shape validation → Data Store lookup
→ Router (sent/active/new) → Data Store create `processing`
→ Gmail Send Email → Data Store update `sent` → Webhook Response
```

1. **Authenticated Custom Webhook** receives the flat contract in `make-payload-examples/redacted-initial-proposal.json`. Make API-key authentication is enabled and requires the `x-make-apikey` header. The production webhook URL exists only in the `MAKE_PROPOSAL_WEBHOOK_URL` Supabase secret; the key exists only in Make's keychain and the `MAKE_PROPOSAL_WEBHOOK_SECRET` Supabase secret.
2. **Shape validation** requires all 15 approved fields and requires `X-Elysha-Operation-Id` to equal `delivery_id` when the request-header value is available for mapping. The Edge Function continues to emit `X-Elysha-Signature` for defense in depth, but Make's native API-key authentication is the enforced request-authentication boundary.
3. **Data Store lookup** uses `delivery_id` as the idempotency key. The store may contain only `delivery_id`, status, lease timestamps, attempt count, and redacted error code. It must not store the raw access key, email body, recipient email, stop token, or proposal content.
4. **Router** returns success without another send when status is `sent`; rejects a still-active `processing` lease; and permits `new`, `failed`, or a stale `processing` record to proceed. A processing lease is stale after 20 minutes.
5. **Data Store create `processing`** claims delivery before Gmail. A concurrent duplicate must not pass this step.
6. **Gmail Send Email** uses subject `Your 3-day Elysha Works roadmap for {{business_name}}`. The body includes the first name, short Point A → Point B summary, recommendation, proposal URL, access key shown separately, exact expiry, discovery-call link, and signed stop link. Do not create a PDF or put the raw key into logs or Data Store fields.
7. **Data Store update `sent`** records success without the email body or key. The failure route updates the same record to `failed` with a redacted error code so a controlled retry is possible.
8. **Webhook Response** returns a success only after Gmail confirms send. Any earlier failure returns non-2xx, allowing `finalize-proposal` to avoid starting the 72-hour clock.

## Scenario B — Elysha Works — Proposal Follow-up

Scenario ID: `6362311`. Schedule: every 15 minutes. The schedule is configured but the scenario is inactive. All ten HTTP modules use the rotated `X-Make-Automation-Secret` header. Make validation reports no setup errors or warnings; live response mappings and email delivery remain unverified until the controlled test is approved and run.

Its modules, in exact order, are:

```text
15-minute Scheduler → HTTP claim → Empty-work filter
→ HTTP final booking check → Gmail Send Email → HTTP acknowledge
```

1. **HTTP claim** posts `{ "operation": "claim", "limit": 10 }` to `make-proposal-followups` with `X-Make-Automation-Secret`. The response may contain `follow_up` work or a `cold` transition.
2. **Empty-work filter** ends the run when no work is returned. A `cold` item goes directly to HTTP acknowledge logic without Gmail.
3. **HTTP final booking check** posts `operation: revalidate`, `leadId`, and `claimId` immediately before each Gmail send. Continue only when `eligible` is exactly `true`. This is the required pre-send booking and stop check.
4. **Gmail Send Email** chooses the template from `sequence_number`: +24 hours, +48 hours, or +72 hours. The +72 message is an expiry notice and discovery-call invitation; it must not promise that access remains available after the exact expiry timestamp.
5. **HTTP acknowledge** posts `operation: acknowledge`, the same `leadId` and `claimId`, and `delivered: true` only after Gmail success. On a Gmail failure, acknowledge with `delivered: false`; the claim can be retried after its 20-minute lease.

At +96 hours, Supabase—not Make—marks an unbooked, unstopped lead cold after three successful follow-ups. Any booking record or signed stop-link use suppresses future sends. Never infer eligibility from cached Make data.

## Controlled test procedure

1. Confirm both scenarios are inactive and the Edge Functions point to the explicitly approved Supabase project.
2. Use one owner-approved test address and a rollback-safe database fixture. Never use a real visitor record for scenario testing.
3. Scenario A: send one signed example, confirm one Gmail message, then replay the same `delivery_id` and confirm no duplicate send.
4. Verify the proposal URL and separate key open the proposal and that the displayed expiry matches the email.
5. Force a Gmail error and confirm the Data Store state becomes `failed`, contains no raw key, and a controlled retry sends once.
6. Scenario B: simulate sequence 1, 2, and 3 claims without waiting three days. Confirm the +24, +48, and +72 templates and acknowledgements.
7. Create a test booking before the final booking check and confirm Gmail is skipped. Test the signed stop URL and confirm later claims are suppressed.
8. Confirm the +96 cold transition performs no Gmail action.
9. Remove or clearly label controlled fixtures without deleting real or historical production records.

## Activation checklist

- Exact Supabase project and migrations were approved, deployed, and read-only verified.
- Anonymous Auth is enabled and CAPTCHA/Turnstile is production-ready.
- Scenario IDs and non-secret connection display names are recorded in the deployment report.
- Confidential scenario data is enabled when available.
- API-key rejection, idempotency, failure recovery, booking suppression, stop suppression, and three templates passed controlled tests.
- Scenario A is activated first; Scenario B scheduling is activated only after Scenario A succeeds.
- Firebase Hosting is deployed separately only after its own branch, key-rotation, and target checks pass.

## Rollback

Deactivate both scenarios, revoke the Make webhook and automation secret values, then disable Edge delivery while retaining database records and audit history. Do not delete leads, proposal state, bookings, or analytics attribution during automation rollback.
