# Make Email OTP Feasibility Gate

Status: **GO with encrypted transport; plaintext webhook delivery is prohibited.**

Reviewed on 2026-09-23 for Make organization `8478597`, team `2606464`. The existing Elysha Works proposal-delivery scenario (`6362134`) was inspected only to verify that the workspace exposes the required scenario controls. No Gmail module was run, no recipient was used, and no email was sent during this gate.

## Evidence

| Required primitive | Evidence | Decision |
|---|---|---|
| Sequential webhook processing | The scenario settings UI exposes **Process data in order**. Make documents that this serializes webhook executions. | Required: enable before production. |
| Confidential execution data | The scenario settings UI exposes **Keep data confidential**, which prevents processed bundle data from being retained in execution logs. | Required: enable before any OTP run. |
| No incomplete-execution payload retention | The scenario settings UI exposes **Store incomplete executions**. | Required: keep disabled. |
| HMAC-SHA256 | Make's `sha256(text; encoding; key; key encoding)` function returns an HMAC when a key is supplied. | Supported for the outer envelope signature. |
| AES-256-GCM decryption with a hidden key | Make's Encryptor **AES decrypt (advanced)** module supports GCM, IV, authentication tag, and an encrypted keychain. | Supported and required before parsing recipient/OTP data. |
| Webhook headers and request fields | Make webhook logs and custom webhooks expose request headers and parsed fields. | The timestamp, nonce, delivery ID, signature, IV, ciphertext, tag, and key version are available for validation. |
| Replay reservation | Data Store **Add/replace a record** throws when a key already exists and overwrite is disabled. Combined with sequential processing, an unseen delivery ID can be reserved before decryption/send. | Supported; reserve `pending` before decryption/Gmail. |
| Matching acknowledgement | Webhook Response can return a controlled JSON response at the end of a successful run. | Return only `{accepted:true,deliveryId}`. |

Official references:

- [Scenario settings](https://help.make.com/scenario-settings)
- [Text and binary hash functions](https://help.make.com/text-and-binary-functions)
- [Webhooks](https://help.make.com/webhooks)
- [Data stores](https://help.make.com/l6du-data-stores)
- [AES](https://help.make.com/aes-advanced-encryption-standard)
- [Encryptor modules](https://apps.make.com/crypto)

## Critical Finding and Ruling

Make documents that custom webhook logs retain the request URL, method, headers, and body for approximately three days. **Keep data confidential** protects scenario execution bundles, but it does not make a plaintext webhook request an acceptable OTP transport.

Therefore the Edge Function must never send `to` or `otp` as plaintext webhook fields. It encrypts the inner JSON payload using AES-256-GCM and a dedicated transport key stored only in Supabase Edge secrets and a Make advanced-encryption keychain. Make's webhook sees only a versioned authenticated envelope:

```json
{
  "deliveryId": "00000000-0000-4000-8000-000000000000",
  "timestamp": "2026-09-23T00:00:00.000Z",
  "nonce": "00000000-0000-4000-8000-000000000001",
  "keyVersion": "otp-transport-v1",
  "iv": "BASE64URL_12_BYTES",
  "ciphertext": "BASE64URL_CIPHERTEXT",
  "tag": "BASE64URL_16_BYTES",
  "signature": "LOWERCASE_HEX_HMAC_SHA256"
}
```

The decrypted inner payload has exact keys `deliveryId`, `to`, `otp`, `expiresInMinutes`, and `templateVersion`. The OTP remains six digits and the email remains canonical. Make validates outer shape, timestamp, nonce, signature, and replay reservation before decryption. Decryption uses AES-256-GCM and fails closed on wrong key, IV, tag, or ciphertext.

The versioned canonical HMAC input is:

```text
elysha-otp-envelope-v1\n<timestamp>\n<nonce>\n<deliveryId>\n<keyVersion>\n<iv>\n<ciphertext>\n<tag>
```

Every outer field has a strict format excluding newline characters. The HMAC secret and AES transport key are independent. Neither value is stored in the repository, browser environment, Make Data Store, execution notes, or documentation.

## Required Scenario Order

1. Custom webhook receives ciphertext-only envelope.
2. Reject malformed/stale outer fields.
3. Reconstruct and compare the HMAC-SHA256 signature.
4. Reserve `deliveryId` as `pending` with overwrite disabled.
5. AES decrypt (advanced) using the hidden keychain.
6. Validate the exact decrypted shape and matching `deliveryId`.
7. Gmail sends the OTP.
8. Update the reserved record to `delivered`.
9. Respond `{accepted:true,deliveryId:<same UUID>}`.

Scenario settings: **Process data in order = Yes**, **Keep data confidential = Yes**, **Store incomplete executions = No**. A `pending` reservation is not automatically resent after an ambiguous failure.

## Stop Conditions

Production cutover is blocked if the target workspace cannot:

- use AES decrypt (advanced) with a hidden 256-bit keychain;
- compute HMAC-SHA256 over the exact canonical envelope;
- keep processed execution data confidential;
- process webhook executions in order;
- reserve a delivery ID before decrypt/send without overwrite;
- keep incomplete execution storage disabled; or
- return the exact matching delivery acknowledgement.

The actual scenario remains inactive until a synthetic encrypted-envelope test and one owner-approved delivery test pass. Creating the persistent webhook and encrypted keychain is deferred to the deployment task because those actions create credentials and require action-time confirmation.
