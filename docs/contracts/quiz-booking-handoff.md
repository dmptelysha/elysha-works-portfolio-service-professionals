# Quiz-to-booking handoff contract

Status: **defined but not enabled**. The portfolio continues to open the existing `/booking/` form until the separate booking backend implements and verifies this contract.

## Goal

After an email-verified quiz visitor chooses **Book a Discovery Call**, the booking application may skip repeated identity fields and open directly on date selection. The browser must never carry the visitor's name, email address, business name, lead ID, or quiz ID in a URL or client-readable payload.

## Issuer contract

The trusted Supabase server creates an opaque, cryptographically random **256-bit token**. Only a **SHA-256 token hash** is stored with:

- the intended booking-service audience;
- the linked lead and quiz references;
- a maximum **10-minute TTL**;
- `created_at`, `expires_at`, and nullable `consumed_at` timestamps.

The raw token is returned once and placed only in the booking redirect fragment or another transport that the approved backend contract explicitly protects. There is **no PII in the URL**, query string, browser history, analytics properties, or logs.

## Consumer contract

The external booking backend must implement:

```text
POST /v1/handoffs/consume
```

The request carries only the opaque token. The backend hashes it, validates the intended audience and TTL, then performs an **atomic single-use** consume that sets `consumed_at` only when it was previously null. A replay must be rejected with the same generic unavailable response used for an invalid or expired token. The response exposes only the booking fields needed to render date selection and never returns Supabase credentials or internal CRM fields.

The endpoint must require the approved server/App Check authentication boundary, rate limiting, generic error messages, and redacted operational logs. Contract tests must cover expiry, audience mismatch, concurrent consumption, and replay rejection.

## Safe production fallback

Until the consumer passes its separate repository tests, the quiz and proposal CTAs remain ordinary links to `/booking/`. That route displays the existing booking form. This **safe form fallback** prevents false prefill, PII leakage, and a client-only bypass. The portfolio issuer must not be enabled merely because the visual date picker exists.

## Activation gate

Enable direct-to-date selection only after all of the following are verified:

1. The external consumer is deployed at the approved booking origin.
2. Atomic consumption and replay rejection pass under concurrent tests.
3. No PII appears in URLs, logs, analytics, or browser storage.
4. Expired or invalid handoffs fall back safely to the normal booking form.
5. A completed booking writes the trusted booking record needed to stop proposal follow-ups.

