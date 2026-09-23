import {
  createRequestEmailOtpHandler,
  type RequestEmailOtpDependencies,
} from "../request-email-otp/index.ts";
import { PublicHttpError } from "../_shared/http.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message = "values differ") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  }
}

const OWNER_ID = "71000000-0000-4000-8000-000000000001";
const CHALLENGE_ID = "76000000-0000-4000-8000-000000000001";
const DELIVERY_ID = "77000000-0000-4000-8000-000000000001";
const NONCE = "78000000-0000-4000-8000-000000000001";

function request(
  body: unknown = {
    email: " Person@Example.com ",
    purpose: "qualified_quiz",
    turnstileToken: "fresh-turnstile-token",
    visitorId: "73000000-0000-4000-8000-000000000001",
  },
  options: {
    origin?: string;
    method?: string;
    authorization?: string;
    ip?: string;
  } = {},
) {
  return new Request(
    "https://project.supabase.co/functions/v1/request-email-otp",
    {
      method: options.method ?? "POST",
      headers: {
        origin: options.origin ?? "https://elyshaworks.com",
        "content-type": "application/json",
        authorization: options.authorization ?? "Bearer anonymous-jwt",
        ...(options.ip === undefined
          ? { "cf-connecting-ip": "203.0.113.10" }
          : options.ip
          ? { "cf-connecting-ip": options.ip }
          : {}),
      },
      body: options.method === "GET" ? undefined : JSON.stringify(body),
    },
  );
}

function dependencies(
  overrides: Partial<RequestEmailOtpDependencies> = {},
): RequestEmailOtpDependencies {
  const uuids = [CHALLENGE_ID, DELIVERY_ID, NONCE];
  return {
    otpPepper: "p".repeat(32),
    otpGroupingSecret: "g".repeat(32),
    turnstileExpectedHostname: "elyshaworks.com",
    makeKeyVersion: "v1",
    makeEncryptionKey: Uint8Array.from({ length: 32 }, (_, index) => index),
    now: () => new Date("2026-09-23T04:00:00.000Z"),
    randomUuid: () => uuids.shift() ?? crypto.randomUUID(),
    generateOtp: () => "012345",
    loadAnonymousUser: async () => ({ id: OWNER_ID, isAnonymous: true }),
    getClientAddress: (incoming) => incoming.headers.get("cf-connecting-ip"),
    verifyTurnstile: async () => ({
      success: true,
      action: "email_otp_request",
      hostname: "elyshaworks.com",
      errorCodes: [],
    }),
    reuseVerifiedEmail: async () => ({
      challengeId: null,
      expiresAt: null,
      resendAvailableAt: null,
      grantExpiresAt: null,
      resultCode: "not_found",
    }),
    recordChallenge: async () => ({
      challengeId: CHALLENGE_ID,
      expiresAt: "2026-09-23T04:10:00.000Z",
      resendAvailableAt: "2026-09-23T04:01:00.000Z",
      resultCode: "pending_delivery",
    }),
    deliverToMake: async (envelope) => ({
      accepted: true,
      deliveryId: envelope.deliveryId,
    }),
    markDelivery: async (_challengeId, _ownerId, _deliveryId, delivered) =>
      delivered ? "active" : "delivery_failed",
    ...overrides,
  };
}

Deno.test("OTP request rejects bad origin, method, body, and absent bearer token", async () => {
  const handler = createRequestEmailOtpHandler(dependencies());
  const badOrigin = await handler(
    request(undefined, { origin: "https://evil.test" }),
  );
  const badMethod = await handler(request(undefined, { method: "GET" }));
  const badBody = await handler(
    request({ email: "person@example.com", purpose: "qualified_quiz" }),
  );
  const noBearer = await handler(
    request(undefined, { authorization: "Basic nope" }),
  );
  assertEquals(badOrigin.status, 403);
  assertEquals(badMethod.status, 405);
  assertEquals(badBody.status, 400);
  assertEquals(noBearer.status, 401);
});

Deno.test("OTP request requires an anonymous user and a gateway-derived address", async () => {
  const permanent = createRequestEmailOtpHandler(dependencies({
    loadAnonymousUser: async () => ({ id: OWNER_ID, isAnonymous: false }),
  }));
  const noIp = createRequestEmailOtpHandler(dependencies());
  assertEquals((await permanent(request())).status, 403);
  assertEquals((await noIp(request(undefined, { ip: "" }))).status, 503);
});

Deno.test("OTP request rejects malformed email and every invalid Turnstile result", async () => {
  const malformed = createRequestEmailOtpHandler(dependencies());
  assertEquals(
    (await malformed(request({
      email: "not-an-email",
      purpose: "qualified_quiz",
      turnstileToken: "fresh-turnstile-token",
    }))).status,
    400,
  );

  for (
    const result of [
      {
        success: false,
        action: "",
        hostname: "",
        errorCodes: ["invalid-input-response"],
      },
      {
        success: false,
        action: "",
        hostname: "",
        errorCodes: ["timeout-or-duplicate"],
      },
      {
        success: true,
        action: "wrong_action",
        hostname: "elyshaworks.com",
        errorCodes: [],
      },
      {
        success: true,
        action: "email_otp_request",
        hostname: "other.test",
        errorCodes: [],
      },
    ]
  ) {
    const handler = createRequestEmailOtpHandler(dependencies({
      verifyTurnstile: async () => result,
    }));
    const response = await handler(request());
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "security_check_failed" });
  }
});

Deno.test("OTP request maps all issuance limits to one public response", async () => {
  for (
    const message of ["otp_cooldown", "otp_rate_limited", "duplicate key value"]
  ) {
    const handler = createRequestEmailOtpHandler(dependencies({
      recordChallenge: async () => {
        throw new Error(message);
      },
    }));
    const response = await handler(request());
    assertEquals(
      response.status,
      message === "duplicate key value" ? 500 : 429,
    );
    assert(!JSON.stringify(await response.json()).includes(message));
  }
});

Deno.test("successful OTP request persists no plaintext and sends ciphertext-only Make envelope", async () => {
  let databaseArgs: unknown;
  let makeEnvelope: Record<string, unknown> | undefined;
  let turnstileInput: unknown;
  const handler = createRequestEmailOtpHandler(dependencies({
    verifyTurnstile: async (token, ip) => {
      turnstileInput = { token, ip };
      return {
        success: true,
        action: "email_otp_request",
        hostname: "elyshaworks.com",
        errorCodes: [],
      };
    },
    recordChallenge: async (input) => {
      databaseArgs = input;
      return {
        challengeId: CHALLENGE_ID,
        expiresAt: "2026-09-23T04:10:00.000Z",
        resendAvailableAt: "2026-09-23T04:01:00.000Z",
        resultCode: "pending_delivery",
      };
    },
    deliverToMake: async (envelope) => {
      makeEnvelope = envelope as unknown as Record<string, unknown>;
      return { accepted: true, deliveryId: envelope.deliveryId };
    },
  }));
  const response = await handler(request());
  assertEquals(response.status, 200);
  const responseBody = await response.json();
  assertEquals(responseBody, {
    challengeId: CHALLENGE_ID,
    expiresAt: "2026-09-23T04:10:00.000Z",
    resendAvailableAt: "2026-09-23T04:01:00.000Z",
  });
  assertEquals(turnstileInput, {
    token: "fresh-turnstile-token",
    ip: "203.0.113.10",
  });
  assert(makeEnvelope);
  assertEquals(makeEnvelope.keyVersion, "v1");
  assertEquals(Object.hasOwn(makeEnvelope, "signature"), false);
  const serializedMake = JSON.stringify(makeEnvelope);
  const serializedDatabase = JSON.stringify(databaseArgs);
  assert(!serializedMake.includes("person@example.com"));
  assert(!serializedMake.includes("012345"));
  assert(!serializedDatabase.includes("012345"));
  assert(!JSON.stringify(responseBody).includes("person@example.com"));
  assertEquals(response.headers.get("cache-control"), "no-store");
});

Deno.test("same-owner verified email returns a reusable grant without generating or delivering an OTP", async () => {
  let generated = 0;
  let delivered = 0;
  const deps = dependencies({
    generateOtp: () => {
      generated += 1;
      return "012345";
    },
    deliverToMake: async (envelope) => {
      delivered += 1;
      return { accepted: true, deliveryId: envelope.deliveryId };
    },
  });
  Object.assign(deps, {
    reuseVerifiedEmail: async () => ({
      challengeId: CHALLENGE_ID,
      expiresAt: "2026-09-23T04:10:00.000Z",
      resendAvailableAt: "2026-09-23T04:01:00.000Z",
      grantExpiresAt: "2026-09-23T04:10:00.000Z",
      resultCode: "verified_reused",
    }),
  });

  const response = await createRequestEmailOtpHandler(deps)(request());

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    challengeId: CHALLENGE_ID,
    expiresAt: "2026-09-23T04:10:00.000Z",
    resendAvailableAt: "2026-09-23T04:01:00.000Z",
    verified: true,
    grantExpiresAt: "2026-09-23T04:10:00.000Z",
  });
  assertEquals(generated, 0);
  assertEquals(delivered, 0);
});

Deno.test("Make timeout, error, and mismatched acknowledgement invalidate only the pending delivery", async () => {
  for (
    const delivery of [
      async () => {
        throw new Error("timeout");
      },
      async () => ({ accepted: false, deliveryId: DELIVERY_ID }),
      async () => ({ accepted: true, deliveryId: NONCE }),
    ]
  ) {
    const marks: boolean[] = [];
    const handler = createRequestEmailOtpHandler(dependencies({
      deliverToMake: delivery,
      markDelivery: async (_challenge, _owner, _delivery, delivered) => {
        marks.push(delivered);
        return delivered ? "active" : "delivery_failed";
      },
    }));
    const response = await handler(request());
    assertEquals(response.status, 502);
    assertEquals(await response.json(), { error: "otp_delivery_failed" });
    assertEquals(marks, [false]);
  }
});

Deno.test("auth dependency failures stay generic", async () => {
  const handler = createRequestEmailOtpHandler(dependencies({
    loadAnonymousUser: async () => {
      throw new PublicHttpError(401, "authentication_required");
    },
  }));
  const response = await handler(request());
  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "authentication_required" });
});
