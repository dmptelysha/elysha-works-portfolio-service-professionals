/// <reference lib="deno.ns" />

import { hmacSha256Hex } from "../_shared/crypto.ts";
import { getManualProposalEnv } from "../_shared/env.ts";
import {
  createManualProposalAccessHandler,
  type ManualAccessDependencies,
} from "../manual-proposal-access/index.ts";

const reference = "11111111-1111-4111-8111-111111111111";
const code = "ABCDEFGH2345";
const pepper = "pepper-for-manual-proposals-long-enough";
const snapshot = {
  clientName: "Meghan",
  businessName: "The Emotional Anchor",
  pointA: { heading: "Today", summary: "An offline concept", evidence: ["Source"] },
  pointB: { heading: "Next", summary: "An online path", evidence: ["Launch"] },
  recommendation: { title: "Thoughtful launch", reason: "A focused page" },
  offers: [
    { key: "basic", label: "Basic", priceCents: 150000, included: ["Page"] },
    { key: "advanced", label: "Advanced", priceCents: 250000, included: ["Page"] },
    { key: "complete", label: "Complete", priceCents: 400000, included: ["Page"] },
  ],
  inclusions: [],
  bookingPath: "/booking/",
  currency: "USD",
  expiresAt: "2026-12-01T00:00:00.000Z",
  previewCapturedAt: "2026-10-17T00:00:00.000Z",
  previewSourceHash: "a".repeat(64),
  serviceOnlySecret: "never-return-this",
};
const paths = {
  desktop: "manual/one/desktop.png",
  tablet: "manual/one/tablet.png",
  mobile: "manual/one/mobile.png",
};

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(JSON.stringify(actual) + " !== " + JSON.stringify(expected));
  }
}
function request(body: unknown, origin = "https://elyshaworks.com") {
  return new Request("https://edge.example.test", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("manual access returns only display data and 120-second signed previews", async () => {
  const seen: Array<[string, string, string]> = [];
  const signed: Array<[string, number]> = [];
  const dependencies: ManualAccessDependencies = {
    pepper,
    now: () => new Date("2026-10-17T00:00:00.000Z"),
    verify: async (ref, hash, at) => {
      seen.push([ref, hash, at]);
      return { snapshot, paths, expiresAt: "2026-12-01T00:00:00.000Z" };
    },
    sign: async (path, ttl) => {
      signed.push([path, ttl]);
      return "https://private.example.test/" + path;
    },
  };
  const response = await createManualProposalAccessHandler(dependencies)(
    request({ reference, accessKey: code.toLowerCase() }),
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assertEquals(payload.proposal.reference, reference);
  assertEquals(payload.proposal.clientName, "Meghan");
  assertEquals(payload.proposal.serviceOnlySecret, undefined);
  assertEquals(payload.previewUrls.desktop, "https://private.example.test/manual/one/desktop.png");
  assertEquals(signed, [
    ["manual/one/desktop.png", 120],
    ["manual/one/tablet.png", 120],
    ["manual/one/mobile.png", 120],
  ]);
  assertEquals(seen, [[reference, await hmacSha256Hex("manual-proposal:" + code, pepper), "2026-10-17T00:00:00.000Z"]]);
  if (JSON.stringify(payload).includes(pepper)) throw new Error("pepper leaked");
});

Deno.test("unknown, invalid, expired, revoked, and locked access share one unavailable response", async () => {
  const dependencies: ManualAccessDependencies = {
    pepper,
    now: () => new Date(),
    verify: async () => null,
    sign: async () => { throw new Error("must not sign"); },
  };
  const handler = createManualProposalAccessHandler(dependencies);
  for (const body of [
    { reference, accessKey: code },
    { reference: "invalid", accessKey: code },
    { reference, accessKey: "short" },
  ]) {
    const response = await handler(request(body));
    assertEquals(response.status, 404);
    assertEquals(await response.json(), { error: "proposal_unavailable" });
  }
});

Deno.test("missing private image returns an unavailable marker without a public fallback", async () => {
  const response = await createManualProposalAccessHandler({
    pepper,
    now: () => new Date(),
    verify: async () => ({ snapshot, paths, expiresAt: "2026-12-01T00:00:00.000Z" }),
    sign: async (path) => path.includes("tablet") ? null : "https://private.example.test/" + path,
  })(request({ reference, accessKey: code }));
  const payload = await response.json();
  assertEquals(payload.previewUrls.tablet, null);
  assertEquals(payload.proposal.bookingPath, "/booking/");
});

Deno.test("origin and oversized body are rejected", async () => {
  const handler = createManualProposalAccessHandler({
    pepper,
    now: () => new Date(),
    verify: async () => null,
    sign: async () => null,
  });
  const blocked = await handler(request({ reference, accessKey: code }, "https://attacker.example"));
  assertEquals(blocked.status, 403);
  const oversized = await handler(request({ reference, accessKey: code, padding: "x".repeat(4096) }));
  assertEquals(oversized.status, 413);
});

Deno.test("manual env reads only the proposal pepper", () => {
  assertEquals(getManualProposalEnv((name) => name === "PROPOSAL_KEY_PEPPER" ? pepper : undefined), {
    keyPepper: pepper,
  });
});
