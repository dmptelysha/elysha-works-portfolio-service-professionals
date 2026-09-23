import {
  createVerifyEmailOtpHandler,
  type VerifyEmailOtpDependencies,
} from "../verify-email-otp/index.ts";
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
const GRANT_EXPIRY = "2026-09-23T04:20:00.000Z";

function request(
  body: unknown = { challengeId: CHALLENGE_ID, code: "012345" },
  authorization = "Bearer anonymous-jwt",
) {
  return new Request(
    "https://project.supabase.co/functions/v1/verify-email-otp",
    {
      method: "POST",
      headers: {
        origin: "https://elyshaworks.com",
        "content-type": "application/json",
        authorization,
      },
      body: JSON.stringify(body),
    },
  );
}

function dependencies(
  overrides: Partial<VerifyEmailOtpDependencies> = {},
): VerifyEmailOtpDependencies {
  return {
    otpPepper: "p".repeat(32),
    now: () => new Date("2026-09-23T04:10:00.000Z"),
    loadAnonymousUser: async () => ({ id: OWNER_ID, isAnonymous: true }),
    getChallengeContext: async () => ({
      email: "person@example.com",
      purpose: "qualified_quiz",
      resultCode: "ok",
    }),
    verifyDigest: async () => ({
      verified: true,
      grantExpiresAt: GRANT_EXPIRY,
      resultCode: "verified",
    }),
    ...overrides,
  };
}

Deno.test("verification validates exact keys, UUID, six digits, and bearer token", async () => {
  const handler = createVerifyEmailOtpHandler(dependencies());
  for (
    const [input, status] of [
      [{ challengeId: CHALLENGE_ID, code: "012345", extra: true }, 400],
      [{ challengeId: "not-a-uuid", code: "012345" }, 400],
      [{ challengeId: CHALLENGE_ID, code: "12345" }, 400],
      [{ challengeId: CHALLENGE_ID, code: "12A456" }, 400],
    ] as const
  ) {
    assertEquals((await handler(request(input))).status, status);
  }
  assertEquals((await handler(request(undefined, "Basic nope"))).status, 401);
});

Deno.test("verification preserves leading zeroes and derives an owner-bound digest", async () => {
  let captured: Record<string, unknown> | undefined;
  const handler = createVerifyEmailOtpHandler(dependencies({
    verifyDigest: async (input) => {
      captured = input as unknown as Record<string, unknown>;
      return {
        verified: true,
        grantExpiresAt: GRANT_EXPIRY,
        resultCode: "verified",
      };
    },
  }));
  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    verified: true,
    grantExpiresAt: GRANT_EXPIRY,
  });
  assert(captured);
  assertEquals(captured.challengeId, CHALLENGE_ID);
  assertEquals(captured.ownerUserId, OWNER_ID);
  assertEquals((captured.candidateDigest as string).length, 64);
  assert(!(captured.candidateDigest as string).includes("012345"));
});

Deno.test("verification rejects permanent users and wrong-owner context generically", async () => {
  const permanent = createVerifyEmailOtpHandler(dependencies({
    loadAnonymousUser: async () => ({ id: OWNER_ID, isAnonymous: false }),
  }));
  const wrongOwner = createVerifyEmailOtpHandler(dependencies({
    getChallengeContext: async () => null,
  }));
  assertEquals((await permanent(request())).status, 403);
  const response = await wrongOwner(request());
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "verification_failed" });
});

Deno.test("wrong, expired, superseded, consumed, fifth, and sixth attempts are indistinguishable", async () => {
  for (
    const state of [
      "wrong_code",
      "expired",
      "superseded",
      "consumed",
      "fifth_attempt",
      "sixth_attempt",
    ]
  ) {
    const handler = createVerifyEmailOtpHandler(dependencies({
      verifyDigest: async () => ({
        verified: false,
        grantExpiresAt: null,
        resultCode: state,
      }),
    }));
    const response = await handler(request());
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "verification_failed" });
  }
});

Deno.test("only one of two concurrent correct verification calls can succeed", async () => {
  let consumed = false;
  const handler = createVerifyEmailOtpHandler(dependencies({
    verifyDigest: async () => {
      if (consumed) {
        return { verified: false, grantExpiresAt: null, resultCode: "invalid" };
      }
      consumed = true;
      return {
        verified: true,
        grantExpiresAt: GRANT_EXPIRY,
        resultCode: "verified",
      };
    },
  }));
  const responses = await Promise.all([handler(request()), handler(request())]);
  assertEquals(responses.map((response) => response.status).sort(), [200, 400]);
});

Deno.test("unexpected service errors never expose database or secret text", async () => {
  const secret = "database said private.email_otp_challenges plus " +
    "p".repeat(32);
  const handler = createVerifyEmailOtpHandler(dependencies({
    getChallengeContext: async () => {
      throw new Error(secret);
    },
  }));
  const response = await handler(request());
  assertEquals(response.status, 500);
  const body = JSON.stringify(await response.json());
  assert(!body.includes(secret));
  assertEquals(body, JSON.stringify({ error: "verification_unavailable" }));
});

Deno.test("authentication failures retain the approved public error only", async () => {
  const handler = createVerifyEmailOtpHandler(dependencies({
    loadAnonymousUser: async () => {
      throw new PublicHttpError(401, "authentication_required");
    },
  }));
  const response = await handler(request());
  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "authentication_required" });
});
