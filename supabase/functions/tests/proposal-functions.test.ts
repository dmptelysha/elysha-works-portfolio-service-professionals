/// <reference lib="deno.ns" />
// deno-lint-ignore-file require-await

import {
  constantTimeEqualHex,
  deriveAccessKey,
  hmacSha256Hex,
  signStopToken,
  verifyStopToken,
} from "../_shared/crypto.ts";
import { ALLOWED_ORIGINS, corsHeaders } from "../_shared/cors.ts";
import { readJsonObject } from "../_shared/http.ts";
import { deliverInitialProposal } from "../_shared/proposal-email.ts";
import { getProposalEnv } from "../_shared/env.ts";
import { QUIZ_DEFINITIONS } from "../_shared/quiz-engine/questions.ts";
import {
  createFinalizeProposalHandler,
  type FinalizeProposalDependencies,
  type OwnedProposalInput,
} from "../finalize-proposal/index.ts";
import { createFollowupHandler } from "../make-proposal-followups/index.ts";
import { createStopFollowupHandler } from "../stop-proposal-followups/index.ts";
import { createVerifyProposalHandler } from "../verify-proposal/index.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message = "values differ",
) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  }
}

const displayPrice = {
  originalTotalUsd: 2500,
  discountAmountUsd: 375,
  finalTotalUsd: 2125,
  localCurrency: "PHP",
  localSymbol: "₱",
  finalTotalLocal: 123250,
  fxRate: 58,
  fxRateTimestamp: "2026-09-24T00:00:00.000Z",
  campaign: {
    campaignKey: "earlybirdworks" as const,
    code: "EARLYBIRDWORKS" as const,
    percentage: 15 as const,
  },
};

Deno.test("proposal access keys are ten non-ambiguous characters and deterministic for retries", async () => {
  const first = await deriveAccessKey(
    "50000000-0000-4000-8000-000000000001",
    "pepper-for-tests",
  );
  const retry = await deriveAccessKey(
    "50000000-0000-4000-8000-000000000001",
    "pepper-for-tests",
  );
  assertEquals(first, retry);
  assert(
    /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(first),
    `unexpected key: ${first}`,
  );
});

Deno.test("HMAC digests compare without ordinary string equality", async () => {
  const digest = await hmacSha256Hex("ABCD234567", "pepper-for-tests");
  const same = await hmacSha256Hex("ABCD234567", "pepper-for-tests");
  const other = await hmacSha256Hex("WXYZ987654", "pepper-for-tests");
  assertEquals(digest.length, 64);
  assert(constantTimeEqualHex(digest, same));
  assert(!constantTimeEqualHex(digest, other));
  assert(!constantTimeEqualHex(digest, "not-a-digest"));
});

Deno.test("signed stop tokens enforce their exact expiry", async () => {
  const secret = "stop-signing-secret-for-tests";
  const token = await signStopToken({
    leadId: "60000000-0000-4000-8000-000000000001",
    expiresAtEpochSeconds: 1_800_000_000,
  }, secret);
  assertEquals(
    (await verifyStopToken(token, secret, 1_799_999_999))?.leadId,
    "60000000-0000-4000-8000-000000000001",
  );
  assertEquals(await verifyStopToken(token, secret, 1_800_000_000), null);
  assertEquals(
    await verifyStopToken(`${token}tampered`, secret, 1_799_999_999),
    null,
  );
});

Deno.test("CORS allows only the four approved portfolio origins", () => {
  assertEquals(ALLOWED_ORIGINS, [
    "https://elyshaworks.com",
    "https://www.elyshaworks.com",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ]);
  assertEquals(
    corsHeaders("https://elyshaworks.com")["Access-Control-Allow-Origin"],
    "https://elyshaworks.com",
  );
  assertEquals(
    corsHeaders("https://attacker.example")["Access-Control-Allow-Origin"],
    undefined,
  );
});

Deno.test("JSON parsing rejects oversized and non-object request bodies", async () => {
  const tooLarge = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(128) }),
  });
  await assertRejects(() => readJsonObject(tooLarge, 64));
  const arrayBody = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "[]",
  });
  await assertRejects(() => readJsonObject(arrayBody, 64));
});

async function assertRejects(callback: () => Promise<unknown>) {
  let rejected = false;
  try {
    await callback();
  } catch {
    rejected = true;
  }
  assert(rejected, "expected promise to reject");
}

Deno.test("wrong and expired proposal keys return the same generic response", async () => {
  const pepper = "pepper-for-tests";
  const correctHash = await hmacSha256Hex("ABCD234567", pepper);
  const base = {
    proposalStatus: "active",
    proposalExpiresAt: "2026-09-25T05:00:00.000Z",
    proposalAccessKeyHash: correctHash,
    proposalFailedAttempts: 0,
    proposalLockedUntil: null,
    selectedRoadmapSnapshot: {
      client: { firstName: "Mara", businessName: "Mara Consulting" },
    },
  };
  const attempted: boolean[] = [];
  const handler = createVerifyProposalHandler({
    pepper,
    now: () => new Date("2026-09-23T05:00:00.000Z"),
    lookup: async () => base,
    recordAttempt: async (_reference, granted) => {
      attempted.push(granted);
    },
  });
  const wrong = await handler(
    new Request("https://edge.test", {
      method: "POST",
      headers: {
        origin: "https://elyshaworks.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reference: "70000000-0000-4000-8000-000000000001",
        accessKey: "WXYZ987654",
      }),
    }),
  );

  const expiredHandler = createVerifyProposalHandler({
    pepper,
    now: () => new Date("2026-09-26T05:00:00.000Z"),
    lookup: async () => base,
    recordAttempt: async () => undefined,
  });
  const expired = await expiredHandler(
    new Request("https://edge.test", {
      method: "POST",
      headers: {
        origin: "https://elyshaworks.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reference: "70000000-0000-4000-8000-000000000001",
        accessKey: "ABCD234567",
      }),
    }),
  );

  assertEquals(wrong.status, 404);
  assertEquals(expired.status, 404);
  assertEquals(await wrong.json(), { error: "proposal_unavailable" });
  assertEquals(await expired.json(), { error: "proposal_unavailable" });
  assertEquals(attempted, [false]);
  assertEquals(wrong.headers.get("cache-control"), "no-store");
});

const serviceAnswers = Object.fromEntries(
  QUIZ_DEFINITIONS.service_businesses.questions.map((
    question,
  ) => [question.key, [question.options[0].key]]),
);

function ownedProposalInput(): OwnedProposalInput {
  return {
    ownerUserId: "10000000-0000-4000-8000-000000000001",
    quizSessionId: "50000000-0000-4000-8000-000000000001",
    questionSetId: "20000000-0000-4000-8000-000000000001",
    leadId: "60000000-0000-4000-8000-000000000001",
    audienceKey: "service_businesses",
    answers: serviceAnswers,
    firstName: "Mara",
    businessName: "Mara Consulting",
    email: "mara@example.com",
    proposalStatus: "not_issued",
    proposalReference: null,
    proposalExpiresAt: null,
    selectedRoadmapSnapshot: null,
    location: null,
  };
}

const pinoyCampaign = {
  campaignKey: "pinoyako" as const,
  code: "PINOYAKO" as const,
  percentage: 50 as const,
};

function proposalRequest(body: Record<string, unknown>) {
  return new Request("https://edge.test", {
    method: "POST",
    headers: {
      origin: "https://elyshaworks.com",
      "content-type": "application/json",
      authorization: "Bearer visitor",
    },
    body: JSON.stringify(body),
  });
}

function discountDependencies(
  overrides: Partial<FinalizeProposalDependencies> = {},
): FinalizeProposalDependencies {
  return {
    keyPepper: "proposal-pepper-for-tests-1234567890",
    couponRedemptionSecret: "coupon-redemption-secret-for-tests-123456",
    stopSigningSecret: "stop-signing-secret-for-tests-123456",
    publicBaseUrl: "https://elyshaworks.com",
    supabaseUrl: "https://project.supabase.co",
    now: () => new Date("2026-09-24T05:00:00.000Z"),
    loadOwnedQuiz: async () => ({
      ...ownedProposalInput(),
      location: {
        businessCountry: "Philippines",
        countryCode: "PH",
        displayCurrency: "PHP",
        currencySymbol: "₱",
        fxRate: 58,
        fxRateTimestamp: "2026-09-24T04:55:00.000Z",
      },
    }),
    assertApprovedConfiguration: async () => undefined,
    previewDiscount: async () => pinoyCampaign,
    reserveDiscount: async () => ({
      redemptionId: "97000000-0000-4000-8000-000000000001",
      campaign: pinoyCampaign,
    }),
    releaseDiscount: async () => undefined,
    finalize: async () => undefined,
    deliver: async () => undefined,
    markDelivered: async () => "2026-09-27T05:00:00.000Z",
    recordEvent: async () => undefined,
    ...overrides,
  };
}

Deno.test("proposal coupon secret is required and must be at least 32 characters", () => {
  const base = new Map([
    ["PUBLIC_PROPOSAL_BASE_URL", "https://elyshaworks.com"],
    ["PROPOSAL_KEY_PEPPER", "proposal-pepper-for-tests-1234567890"],
    ["PROPOSAL_STOP_SIGNING_SECRET", "stop-signing-secret-for-tests-123456"],
  ]);
  let failed = false;
  try {
    getProposalEnv((name) => base.get(name));
  } catch {
    failed = true;
  }
  assert(failed, "missing coupon redemption secret must fail closed");
  base.set("COUPON_REDEMPTION_SECRET", "short");
  failed = false;
  try {
    getProposalEnv((name) => base.get(name));
  } catch {
    failed = true;
  }
  assert(failed, "short coupon redemption secret must fail closed");
});

Deno.test("proposal requests reject browser-computed pricing before reserving a coupon", async () => {
  let reserveCalls = 0;
  const handler = createFinalizeProposalHandler(discountDependencies({
    reserveDiscount: async () => {
      reserveCalls += 1;
      return { redemptionId: crypto.randomUUID(), campaign: pinoyCampaign };
    },
  }));

  const response = await handler(proposalRequest({
    operation: "issue",
    quizSessionId: "50000000-0000-4000-8000-000000000001",
    selection: { tierKey: "basic", platform: "systeme_io" },
    couponCode: "pinoyako",
    finalTotalUsd: 1,
  }));

  assertEquals(response.status, 400);
  assertEquals(reserveCalls, 0);
});

Deno.test("coupon preview derives the digest from stored canonical email and never reserves", async () => {
  const previewed: unknown[] = [];
  let reserveCalls = 0;
  const secret = "coupon-redemption-secret-for-tests-123456";
  const handler = createFinalizeProposalHandler(discountDependencies({
    couponRedemptionSecret: secret,
    loadOwnedQuiz: async () => ({
      ...ownedProposalInput(),
      email: "  Mara@Example.COM ",
      location: {
        businessCountry: "Philippines",
        countryCode: "PH",
        displayCurrency: "PHP",
        currencySymbol: "₱",
        fxRate: 58,
        fxRateTimestamp: "2026-09-24T04:55:00.000Z",
      },
    }),
    previewDiscount: async (input) => {
      previewed.push(input);
      return pinoyCampaign;
    },
    reserveDiscount: async () => {
      reserveCalls += 1;
      return { redemptionId: crypto.randomUUID(), campaign: pinoyCampaign };
    },
  }));

  const response = await handler(proposalRequest({
    operation: "preview",
    quizSessionId: "50000000-0000-4000-8000-000000000001",
    selection: { tierKey: "basic", platform: "systeme_io" },
    couponCode: " pinoyako ",
  }));
  const body = await response.json();
  const expectedDigest = await hmacSha256Hex("proposal-coupon:mara@example.com", secret);

  assertEquals(response.status, 200);
  assertEquals(reserveCalls, 0);
  assertEquals((previewed[0] as Record<string, unknown>).redeemerDigest, expectedDigest);
  assertEquals(body.proposal.investment.campaign.code, "PINOYAKO");
  assertEquals(body.proposal.investment.finalTotalUsd, body.proposal.investment.originalTotalUsd / 2);
});

Deno.test("failed proposal delivery releases its pending coupon reservation", async () => {
  const released: unknown[] = [];
  const handler = createFinalizeProposalHandler(discountDependencies({
    releaseDiscount: async (input) => {
      released.push(input);
    },
    deliver: async () => {
      throw new Error("delivery rejected");
    },
  }));

  const response = await handler(proposalRequest({
    operation: "issue",
    quizSessionId: "50000000-0000-4000-8000-000000000001",
    selection: { tierKey: "basic", platform: "systeme_io" },
    couponCode: "PINOYAKO",
  }));

  assertEquals(response.status, 502);
  assertEquals(await response.json(), { error: "proposal_delivery_failed" });
  assertEquals(released.length, 1);
});

Deno.test("ambiguous delivery retry reuses the proposal reference and coupon lifecycle", async () => {
  const owned = {
    ...ownedProposalInput(),
    location: {
      businessCountry: "United States",
      countryCode: "US",
      displayCurrency: "USD",
      currencySymbol: "$",
      fxRate: 1,
      fxRateTimestamp: "2026-09-24T04:55:00.000Z",
    },
  };
  const earlyBird = { campaignKey: "earlybirdworks" as const, code: "EARLYBIRDWORKS" as const, percentage: 15 as const };
  const operationIds: string[] = [];
  let deliveryAttempt = 0;
  let reserveCalls = 0;
  const handler = createFinalizeProposalHandler(discountDependencies({
    loadOwnedQuiz: async () => ({ ...owned }),
    previewDiscount: async () => earlyBird,
    reserveDiscount: async () => {
      reserveCalls += 1;
      return { redemptionId: "97000000-0000-4000-8000-000000000002", campaign: earlyBird };
    },
    finalize: async (input) => {
      owned.proposalReference = input.proposalReference;
      owned.selectedRoadmapSnapshot = input.proposalSnapshot;
    },
    deliver: async (payload) => {
      operationIds.push(payload.operationId);
      deliveryAttempt += 1;
      if (deliveryAttempt === 1) throw new Error("acknowledgement lost");
    },
  }));
  const requestBody = {
    operation: "issue",
    quizSessionId: owned.quizSessionId,
    selection: { tierKey: "advanced", platform: "gohighlevel" },
    couponCode: "EARLYBIRDWORKS",
  };

  const first = await handler(proposalRequest(requestBody));
  const second = await handler(proposalRequest(requestBody));

  assertEquals(first.status, 502);
  assertEquals(second.status, 200);
  assertEquals(reserveCalls, 2);
  assertEquals(operationIds.length, 2);
  assertEquals(operationIds[0], operationIds[1]);
});

Deno.test("known coupon database failures map to approved public responses", async () => {
  const expected: Array<[string, number]> = [
    ["coupon_invalid", 400],
    ["coupon_ineligible", 403],
    ["coupon_exhausted", 409],
    ["coupon_already_redeemed", 409],
    ["coupon_temporarily_unavailable", 503],
  ];
  for (const [code, status] of expected) {
    const handler = createFinalizeProposalHandler(discountDependencies({
      previewDiscount: async () => {
        throw new Error(code);
      },
    }));
    const response = await handler(proposalRequest({
      operation: "preview",
      quizSessionId: "50000000-0000-4000-8000-000000000001",
      couponCode: "PINOYAKO",
    }));
    assertEquals(response.status, status);
    assertEquals(await response.json(), { error: code });
  }
});

Deno.test("parallel last-slot issues produce one success and one exhausted response", async () => {
  const earlyBird = { campaignKey: "earlybirdworks" as const, code: "EARLYBIRDWORKS" as const, percentage: 15 as const };
  let claimed = false;
  const handler = createFinalizeProposalHandler(discountDependencies({
    loadOwnedQuiz: async (_request, quizSessionId) => ({
      ...ownedProposalInput(),
      quizSessionId,
      email: `${quizSessionId}@example.test`,
      location: {
        businessCountry: "United States",
        countryCode: "US",
        displayCurrency: "USD",
        currencySymbol: "$",
        fxRate: 1,
        fxRateTimestamp: "2026-09-24T04:55:00.000Z",
      },
    }),
    previewDiscount: async () => earlyBird,
    reserveDiscount: async (input) => {
      await Promise.resolve();
      if (claimed) throw new Error("coupon_exhausted");
      claimed = true;
      return {
        redemptionId: input.quizSessionId.replace(/^50000000/u, "97000000"),
        campaign: earlyBird,
      };
    },
  }));
  const issue = (quizSessionId: string) => handler(proposalRequest({
    operation: "issue",
    quizSessionId,
    selection: { tierKey: "advanced", platform: "gohighlevel" },
    couponCode: "EARLYBIRDWORKS",
  }));

  const [first, second] = await Promise.all([
    issue("50000000-0000-4000-8000-000000000001"),
    issue("50000000-0000-4000-8000-000000000002"),
  ]);

  assertEquals([first.status, second.status].sort(), [200, 409]);
  const exhausted = first.status === 409 ? first : second;
  assertEquals(await exhausted.json(), { error: "coupon_exhausted" });
});

Deno.test("an active issued proposal returns its immutable snapshot without touching coupon capacity", async () => {
  let previewCalls = 0;
  let reserveCalls = 0;
  const handler = createFinalizeProposalHandler(discountDependencies({
    loadOwnedQuiz: async () => ({
      ...ownedProposalInput(),
      proposalStatus: "active",
      proposalReference: "70000000-0000-4000-8000-000000000001",
      proposalExpiresAt: "2026-09-27T05:00:00.000Z",
      selectedRoadmapSnapshot: { proposalSnapshotVersion: "proposal-snapshot-2026.09-v2", immutable: true },
    }),
    previewDiscount: async () => {
      previewCalls += 1;
      return pinoyCampaign;
    },
    reserveDiscount: async () => {
      reserveCalls += 1;
      return { redemptionId: crypto.randomUUID(), campaign: pinoyCampaign };
    },
  }));

  const response = await handler(proposalRequest({
    operation: "issue",
    quizSessionId: "50000000-0000-4000-8000-000000000001",
    selection: { tierKey: "basic", platform: "systeme_io" },
    couponCode: "PINOYAKO",
  }));
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.proposal.immutable, true);
  assertEquals(previewCalls, 0);
  assertEquals(reserveCalls, 0);
});

Deno.test("finalization preview and issue recalculate from stored answers and never return the raw key", async () => {
  const finalized: unknown[] = [];
  const deliveries: unknown[] = [];
  const handler = createFinalizeProposalHandler({
    keyPepper: "proposal-pepper-for-tests-1234567890",
    couponRedemptionSecret: "coupon-redemption-secret-for-tests-123456",
    stopSigningSecret: "stop-signing-secret-for-tests-123456",
    publicBaseUrl: "https://elyshaworks.com",
    supabaseUrl: "https://project.supabase.co",
    now: () => new Date("2026-09-22T05:00:00.000Z"),
    loadOwnedQuiz: async () => ownedProposalInput(),
    assertApprovedConfiguration: async () => undefined,
    previewDiscount: async () => {
      throw new Error("unexpected coupon preview");
    },
    reserveDiscount: async () => {
      throw new Error("unexpected coupon reservation");
    },
    releaseDiscount: async () => undefined,
    finalize: async (input) => {
      finalized.push(input);
    },
    deliver: async (payload) => {
      deliveries.push(payload);
    },
    markDelivered: async () => "2026-09-25T05:00:00.000Z",
    recordEvent: async () => undefined,
  });

  const preview = await handler(
    new Request("https://edge.test", {
      method: "POST",
      headers: {
        origin: "https://elyshaworks.com",
        "content-type": "application/json",
        authorization: "Bearer visitor",
      },
      body: JSON.stringify({
        operation: "preview",
        quizSessionId: "50000000-0000-4000-8000-000000000001",
      }),
    }),
  );
  assertEquals(preview.status, 200);
  const previewBody = await preview.json();
  assert(previewBody.proposal.pointA.summary.length > 0);
  assertEquals(previewBody.proposal.expiresAt, null);

  const issue = await handler(
    new Request("https://edge.test", {
      method: "POST",
      headers: {
        origin: "https://elyshaworks.com",
        "content-type": "application/json",
        authorization: "Bearer visitor",
      },
      body: JSON.stringify({
        operation: "issue",
        quizSessionId: "50000000-0000-4000-8000-000000000001",
        selection: { tierKey: "advanced", platform: "gohighlevel" },
      }),
    }),
  );
  assertEquals(issue.status, 200);
  const issueBody = await issue.json();
  assertEquals(issueBody.proposal.expiresAt, "2026-09-25T05:00:00.000Z");
  assert(
    !("accessKey" in issueBody),
    "raw access key leaked to browser response",
  );
  assertEquals(finalized.length, 1);
  assertEquals(deliveries.length, 1);
  const delivery = deliveries[0] as { proposal: Record<string, unknown> };
  assert(
    /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(
      String(delivery.proposal.accessKey),
    ),
  );
  assert(!("scores" in delivery.proposal));
  assertEquals(delivery.proposal.offerKey, "platform_growth");
});

Deno.test("Make follow-up claim, revalidation, and acknowledgement require the shared secret", async () => {
  const secret = "make-automation-secret-for-tests-123456";
  const calls: string[] = [];
  const handler = createFollowupHandler({
    automationSecret: secret,
    now: () => new Date("2026-09-23T05:00:00.000Z"),
    claim: async () => {
      calls.push("claim");
      return [{ work_kind: "follow_up" }];
    },
    revalidate: async () => {
      calls.push("revalidate");
      return true;
    },
    acknowledge: async () => {
      calls.push("acknowledge");
      return { follow_up_count: 1 };
    },
  });
  const unauthorized = await handler(
    new Request("https://edge.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "claim" }),
    }),
  );
  assertEquals(unauthorized.status, 401);

  for (
    const body of [
      { operation: "claim", limit: 10 },
      {
        operation: "revalidate",
        leadId: "60000000-0000-4000-8000-000000000001",
        claimId: "80000000-0000-4000-8000-000000000001",
      },
      {
        operation: "acknowledge",
        leadId: "60000000-0000-4000-8000-000000000001",
        claimId: "80000000-0000-4000-8000-000000000001",
        delivered: true,
      },
    ]
  ) {
    const response = await handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-make-automation-secret": secret,
        },
        body: JSON.stringify(body),
      }),
    );
    assertEquals(response.status, 200);
  }
  assertEquals(calls, ["claim", "revalidate", "acknowledge"]);
});

Deno.test("signed stop endpoint is idempotent at its trusted dependency boundary", async () => {
  const signingSecret = "stop-signing-secret-for-tests-123456";
  const token = await signStopToken({
    leadId: "60000000-0000-4000-8000-000000000001",
    expiresAtEpochSeconds: 1_800_000_000,
  }, signingSecret);
  const stopped: string[] = [];
  const handler = createStopFollowupHandler({
    signingSecret,
    now: () => new Date((1_799_999_000) * 1000),
    stop: async (leadId) => {
      stopped.push(leadId);
    },
  });
  const response = await handler(
    new Request(`https://edge.test?token=${encodeURIComponent(token)}`),
  );
  assertEquals(response.status, 200);
  assertEquals(stopped, ["60000000-0000-4000-8000-000000000001"]);
});

Deno.test("Make delivery signs the exact minimum-data body without putting the secret in it", async () => {
  const oldUrl = Deno.env.get("MAKE_PROPOSAL_WEBHOOK_URL");
  const oldSecret = Deno.env.get("MAKE_PROPOSAL_WEBHOOK_SECRET");
  Deno.env.set(
    "MAKE_PROPOSAL_WEBHOOK_URL",
    "https://hook.example.test/proposal",
  );
  Deno.env.set(
    "MAKE_PROPOSAL_WEBHOOK_SECRET",
    "webhook-secret-for-tests-1234567890",
  );
  let captured: RequestInit | undefined;
  try {
    await deliverInitialProposal({
      operationId: "70000000-0000-4000-8000-000000000001",
      recipient: {
        email: "mara@example.com",
        firstName: "Mara",
        businessName: "Mara Consulting",
      },
      proposal: {
        reference: "70000000-0000-4000-8000-000000000001",
        url:
          "https://elyshaworks.com/proposal/?ref=70000000-0000-4000-8000-000000000001",
        accessKey: "ABCD234567",
        expiresAt: "2026-09-25T05:00:00.000Z",
        discoveryCallUrl: "https://elyshaworks.com/booking/",
        stopUrl:
          "https://project.supabase.co/functions/v1/stop-proposal-followups?token=signed",
        pointA: "Current state",
        pointB: "Desired state",
        recommendation: "Growth System",
        tierKey: "advanced",
        platform: "gohighlevel",
        offerKey: "platform_growth",
        price: displayPrice,
      },
    }, async (_input, init) => {
      captured = init;
      return Response.json({
        accepted: true,
        delivery_id: "70000000-0000-4000-8000-000000000001",
      });
    });
  } finally {
    if (oldUrl === undefined) Deno.env.delete("MAKE_PROPOSAL_WEBHOOK_URL");
    else Deno.env.set("MAKE_PROPOSAL_WEBHOOK_URL", oldUrl);
    if (oldSecret === undefined) {
      Deno.env.delete("MAKE_PROPOSAL_WEBHOOK_SECRET");
    } else Deno.env.set("MAKE_PROPOSAL_WEBHOOK_SECRET", oldSecret);
  }
  const headers = new Headers(captured?.headers);
  const body = JSON.parse(String(captured?.body)) as Record<string, unknown>;
  assertEquals(
    headers.get("x-make-apikey"),
    "webhook-secret-for-tests-1234567890",
  );
  assert(headers.get("x-elysha-signature")?.startsWith("sha256="));
  assert(!String(captured?.body).includes("webhook-secret-for-tests"));
  assertEquals(body.delivery_id, "70000000-0000-4000-8000-000000000001");
  assertEquals(body.access_key, "ABCD234567");
  assertEquals(body.discovery_call_url, "https://elyshaworks.com/booking/");
  assertEquals(body.original_total_usd, 2500);
  assertEquals(body.discount_amount_usd, 375);
  assertEquals(body.final_total_usd, 2125);
  assertEquals(body.discount_code, "EARLYBIRDWORKS");
  assertEquals(body.discount_percent, 15);
  assertEquals(body.local_total, 123250);
  assertEquals(body.local_currency, "PHP");
  assert(!("recipient" in body));
  assert(!("proposal" in body));
  assert(!("redemption_id" in body));
  assert(!("redeemer_digest" in body));
  assert(!("capacity" in body));
  assert(!("coupon_redemption_secret" in body));
});

Deno.test("Make delivery rejects generic or mismatched success responses", async () => {
  const oldUrl = Deno.env.get("MAKE_PROPOSAL_WEBHOOK_URL");
  const oldSecret = Deno.env.get("MAKE_PROPOSAL_WEBHOOK_SECRET");
  Deno.env.set("MAKE_PROPOSAL_WEBHOOK_URL", "https://hook.example.test/proposal");
  Deno.env.set("MAKE_PROPOSAL_WEBHOOK_SECRET", "webhook-secret-for-tests-1234567890");
  const payload = {
    operationId: "70000000-0000-4000-8000-000000000001",
    recipient: { email: "mara@example.com", firstName: "Mara", businessName: "Mara Consulting" },
    proposal: {
      reference: "70000000-0000-4000-8000-000000000001",
      url: "https://elyshaworks.com/proposal/?ref=70000000-0000-4000-8000-000000000001",
      accessKey: "ABCD234567",
      expiresAt: "2026-09-25T05:00:00.000Z",
      discoveryCallUrl: "https://elyshaworks.com/booking/",
      stopUrl: "https://project.supabase.co/functions/v1/stop-proposal-followups?token=signed",
      pointA: "Current state",
      pointB: "Desired state",
      recommendation: "Growth System",
      tierKey: "advanced",
      platform: "gohighlevel",
      offerKey: "platform_growth",
      price: displayPrice,
    },
  };
  try {
    for (const response of [
      new Response("Accepted", { status: 200 }),
      Response.json({ accepted: true, delivery_id: "80000000-0000-4000-8000-000000000001" }),
      Response.json({ accepted: false, delivery_id: payload.operationId }),
    ]) {
      await assertRejects(() => deliverInitialProposal(payload, async () => response.clone()));
    }
  } finally {
    if (oldUrl === undefined) Deno.env.delete("MAKE_PROPOSAL_WEBHOOK_URL");
    else Deno.env.set("MAKE_PROPOSAL_WEBHOOK_URL", oldUrl);
    if (oldSecret === undefined) Deno.env.delete("MAKE_PROPOSAL_WEBHOOK_SECRET");
    else Deno.env.set("MAKE_PROPOSAL_WEBHOOK_SECRET", oldSecret);
  }
});
