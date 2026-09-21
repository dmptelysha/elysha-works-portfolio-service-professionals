# Booking browser configuration

The portfolio booking page uses Firebase App Check before calling the existing booking API. Its Firebase Web API key is browser configuration, not an authorization secret: the deployed browser must receive it to initialize Firebase. Moving the source value into an environment variable keeps the literal out of Git, but does not make the deployed value private.

## Required environment variable

Set this variable locally in the ignored `.env.local` file and in the trusted build/deployment environment:

```text
NEXT_PUBLIC_BOOKING_FIREBASE_API_KEY
```

Do not commit `.env.local` or the generated `public/booking/booking-config.mjs` file. `npm run dev`, `npm run preview`, and `npm run build` generate that module from the environment before starting.

## Required Google Cloud action

The key previously committed to Git history must be treated as exposed even after the current source file is cleaned. In Google Cloud Console:

1. Replace or rotate the alerted key.
2. Allow only the Firebase APIs required by the booking App Check initialization.
3. Apply HTTP referrer restrictions for `https://elyshaworks.com/*` and `https://www.elyshaworks.com/*`.
4. Put the replacement value in the local and deployment environment settings.
5. Verify booking and App Check, then revoke the old key.
6. Resolve the GitHub secret-scanning alert only after the old key is revoked or confirmed unusable.

Do not add Calendar credentials, OAuth client secrets, service-account JSON, App Check private credentials, or Firebase Admin credentials to any `NEXT_PUBLIC_*` variable.
