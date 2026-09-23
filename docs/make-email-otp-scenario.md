# Make email OTP delivery scenario

This runbook defines the dedicated, inactive **Elysha Works — Email OTP Delivery** scenario. Supabase generates and verifies each 10-minute code. Make decrypts the one-time delivery envelope and sends the transactional message through the owner-approved Gmail OAuth connection. Make never decides whether a code is valid.

## Security contract

The webhook accepts only this outer envelope:

- `deliveryId`
- `timestamp`
- `nonce`
- `keyVersion`
- `iv`
- `ciphertext`
- `tag`

`ciphertext` is authenticated AES-256-GCM. The decrypted JSON contains exactly `deliveryId`, `timestamp`, `nonce`, `keyVersion`, `to`, `otp`, `expiresInMinutes`, and `templateVersion`. Because the routing metadata is duplicated inside the authenticated ciphertext, Make must reject the request unless all four inner values exactly match the outer `deliveryId`, `timestamp`, `nonce`, and `keyVersion`.

Use lowercase hexadecimal for `iv`, `ciphertext`, and `tag`. The protected AES key is a 256-bit hexadecimal value stored only in Make's **advanced encrypted keychain** and Supabase Edge Function Secrets. Never copy it into a scenario field, note, variable, execution log, blueprint export, public table, client environment variable, or Git.

Reject a malformed UUID, a timestamp outside the five-minute freshness window, a reused nonce, an unknown `keyVersion`, malformed hexadecimal, failed GCM authentication, an inner/outer mismatch, a non-six-digit `otp`, an `expiresInMinutes` value other than `10`, or an unknown `templateVersion`. Do not include any submitted field in an error message.

## Scenario settings before Gmail is connected

- Keep the scenario **inactive** and scheduling off.
- Enable **sequential processing** so two deliveries cannot reserve the same ID concurrently.
- Enable **confidential scenario data**.
- Keep storage of **incomplete executions disabled** so decrypted inputs are not retained for replay.
- Do not enable automatic retries on the Gmail module.

If Make no longer supports confidential processing, an advanced hidden keychain, authenticated AES-256-GCM decryption, or the required validation/filter operations, stop. Revise the protocol before any live email; never weaken encryption, authentication, or idempotency to fit the scenario builder.

## Module order

The saved Make scenario currently uses this flow:

1. **Webhooks / Custom webhook** — receive the ciphertext-only outer envelope.
2. **Encryptor / AES decrypt (advanced)** — use AES-256-GCM through the protected hexadecimal keychain; malformed or tampered input fails here.
3. **JSON / Parse JSON** — parse the authenticated plaintext.
4. **Make Code / Validate request** — enforce the UUID, version, timestamp, email, OTP, template, and exact inner/outer metadata rules.
5. **Data Store / Check the delivery ID** — reject a delivery ID that has already been reserved.
6. **Data Store / Reserve the unseen delivery ID as pending** — create the idempotency record before Gmail.
7. **Gmail / Send an email** — send the transactional code through the approved Gmail OAuth connection.
8. **Data Store / Update the delivery ID to delivered** — update only after Gmail accepts the send.
9. **Webhooks / Response** — after Make has learned the webhook schema from one controlled encrypted sample, return `{ "accepted": true, "deliveryId": "<same UUID>" }`.

The Data Store record key is `deliveryId`; its record fields contain only `created_at` and `status`. It must never contain the recipient, OTP, IV, ciphertext, tag, or encryption key.

The scenario remains inactive until the response module is mapped from a controlled encrypted sample and the complete validation matrix passes. Do not activate it merely because the modules have been saved.

An existing `pending` or `delivered` reservation is a duplicate and must not reach Gmail. A `pending` reservation after an ambiguous failure is never resent automatically; one missed code is safer than sending the same security code twice. A client may request a newly generated challenge after the server-side cooldown.

## Gmail message

Use the owner-approved Gmail OAuth connection. The message is transactional, not promotional.

**Subject:** `Your Elysha Works verification code`

**Body:**

```text
Use this verification code to continue your Elysha Works assessment:

{{otp}}

This code expires in 10 minutes. If you did not request it, you can ignore this email.

Elysha Works
```

Do not include marketing copy, a proposal link, tracking pixels, or the recipient's name in this message. The code email must identify its 10-minute lifetime.

## Error route

Attach a separate error handler to validation, decryption, reservation, and Gmail modules. It returns a generic failure without request data, decrypted fields, provider details, or stack traces:

```json
{ "accepted": false }
```

Use a non-2xx status. Never echo the recipient, OTP, ciphertext, IV, tag, nonce, or encryption key. Leave an already-created reservation as `pending` after an ambiguous Gmail outcome.

## Inactive validation matrix

Before any controlled email, keep Gmail disconnected or route to a non-sending test branch and confirm:

1. malformed envelope → generic rejection;
2. stale timestamp → generic rejection;
3. tampered `ciphertext`, `iv`, or `tag` → GCM authentication failure;
4. wrong `keyVersion` → rejection;
5. repeated `deliveryId` or `nonce` → duplicate suppression before Gmail;
6. mismatched inner/outer metadata → generic rejection;
7. valid envelope → reaches the Gmail boundary once and returns the exact acknowledgement shape.

Only after those cases pass may the approved Gmail OAuth connection be attached for one owner-controlled delivery test. The scenario remains inactive until the complete production preflight is approved.

## Key rotation

`MAKE_OTP_ENCRYPTION_KEY` and `MAKE_OTP_KEY_VERSION` form one versioned transport key. Rotate them as a pair:

1. create a new protected AES keychain and new `keyVersion` in provider secret stores;
2. configure Make to accept the old and new key versions without displaying either key;
3. configure Supabase Edge Function Secrets to send only the new version;
4. validate one encrypted request and acknowledgement on the new version;
5. wait longer than the maximum request freshness window;
6. remove and revoke the old key from Make and Supabase after explicit approval;
7. record only rotation metadata, never secret values.

Never place the key in a public database table, client-side environment variable, browser bundle, chat, screenshot, shell output, Make note, or Git history.
