import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  cleanupPreviews,
  createDraft,
  generateManualAccessCode,
  issueDraft,
  revokeDraft,
  rotateCode,
} from "../scripts/manual-proposal-core.mjs";

const draft = {
  clientName: "Meghan",
  businessName: "The Emotional Anchor",
  pointA: { heading: "Current state", summary: "An offline concept", evidence: ["Design exists"] },
  pointB: { heading: "Future state", summary: "A live page", evidence: ["Responsive launch"] },
  recommendation: { title: "Focus on launch", reason: "Confirm scope together." },
  offers: [
    { key: "basic", label: "Basic", priceCents: 150000, included: ["Page"] },
    { key: "advanced", label: "Advanced", priceCents: 250000, included: ["Page", "Booking"] },
    { key: "complete", label: "Complete", priceCents: 400000, included: ["Page", "Booking", "Automation"] },
  ],
  inclusions: [],
  bookingPath: "/booking/",
  currency: "USD",
  expiresAt: "2026-12-01T00:00:00.000Z",
  captureManifestPath: ".tmp/manual-proposals/meghan/manifest.json",
};
const manifest = {
  sourceHash: "a".repeat(64),
  capturedAt: "2026-10-17T00:00:00.000Z",
  files: {
    desktop: ".tmp/manual-proposals/meghan/desktop.png",
    tablet: ".tmp/manual-proposals/meghan/tablet.png",
    mobile: ".tmp/manual-proposals/meghan/mobile.png",
  },
};
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const pepper = "secret-pepper-for-testing-long-enough";

function fakeClient({ failIssue = false } = {}) {
  const calls = [];
  const uploads = [];
  const removed = [];
  const client = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "issue_manual_proposal" && failIssue) return { data: null, error: new Error("issue failed") };
      if (name === "create_manual_proposal_draft") return { data: "22222222-2222-4222-8222-222222222222", error: null };
      if (name === "list_expired_manual_preview_objects") {
        return { data: [{ id: "old", preview_paths: { desktop: "manual/old/desktop.png", tablet: "manual/old/tablet.png", mobile: "manual/old/mobile.png" } }], error: null };
      }
      return { data: null, error: null };
    },
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "manual-proposal-previews");
        return {
          upload: async (path, bytes, options) => {
            uploads.push([path, bytes, options]);
            return { data: {}, error: null };
          },
          remove: async (paths) => {
            removed.push(paths);
            return { data: {}, error: null };
          },
        };
      },
    },
  };
  return { client, calls, uploads, removed };
}

test("generated code has twelve unbiased non-ambiguous characters", () => {
  const first = generateManualAccessCode((length) => Buffer.alloc(length, 0));
  const second = generateManualAccessCode((length) => Buffer.alloc(length, 1));
  assert.match(first, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);
  assert.match(second, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);
  assert.notEqual(first, second);
});

test("draft stores reviewed snapshot metadata and supersedes the prior version", async () => {
  const fake = fakeClient();
  const id = await createDraft({
    client: fake.client, draft, manifest,
    supersedesId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(id, "22222222-2222-4222-8222-222222222222");
  assert.equal(fake.calls[0][0], "create_manual_proposal_draft");
  assert.equal(fake.calls[0][1].p_supersedes_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(fake.calls[0][1].p_snapshot.previewSourceHash, manifest.sourceHash);
  assert.equal(fake.calls[0][1].p_snapshot.captureManifestPath, undefined);
});

test("issue uploads only PNG captures privately and persists a hash, then prints code once", async () => {
  const fake = fakeClient();
  const output = [];
  await issueDraft({
    client: fake.client,
    draftId: "22222222-2222-4222-8222-222222222222",
    draft,
    manifest,
    pepper,
    baseUrl: "https://elyshaworks.com",
    randomBytes: (length) => Buffer.alloc(length, 0),
    uuid: () => "33333333-3333-4333-8333-333333333333",
    readCapture: async () => png,
    write: (message) => output.push(message),
  });
  assert.equal(fake.uploads.length, 3);
  assert.deepEqual(fake.uploads.map(([path]) => path), [
    "manual/22222222-2222-4222-8222-222222222222/desktop.png",
    "manual/22222222-2222-4222-8222-222222222222/tablet.png",
    "manual/22222222-2222-4222-8222-222222222222/mobile.png",
  ]);
  assert.ok(fake.uploads.every(([, bytes, options]) => bytes === png && options.contentType === "image/png" && options.upsert === false));
  const issue = fake.calls.find(([name]) => name === "issue_manual_proposal")[1];
  const expected = createHmac("sha256", pepper).update("manual-proposal:" + "2".repeat(12)).digest("hex");
  assert.equal(issue.p_access_hash, expected);
  assert.equal(Object.values(issue).some((value) => value === "2".repeat(12)), false);
  assert.equal(output.length, 1);
  assert.match(output[0], /https:\/\/elyshaworks\.com\/proposal\/client\/\?ref=33333333-3333-4333-8333-333333333333/);
  assert.match(output[0], /222222222222/);
});

test("failed issue emits no code and removes uploaded private objects", async () => {
  const fake = fakeClient({ failIssue: true });
  const output = [];
  await assert.rejects(() => issueDraft({
    client: fake.client, draftId: "22222222-2222-4222-8222-222222222222",
    draft, manifest, pepper,
    baseUrl: "https://elyshaworks.com",
    randomBytes: (length) => Buffer.alloc(length, 0),
    uuid: () => "33333333-3333-4333-8333-333333333333",
    readCapture: async () => png,
    write: (message) => output.push(message),
  }));
  assert.deepEqual(output, []);
  assert.equal(fake.removed.length, 1);
  assert.equal(fake.removed[0].length, 3);
});

test("a failed output write after issuance leaves active private previews intact", async () => {
  const fake = fakeClient();
  await assert.rejects(() => issueDraft({
    client: fake.client, draftId: "22222222-2222-4222-8222-222222222222",
    draft, manifest, pepper,
    baseUrl: "https://elyshaworks.com",
    randomBytes: (length) => Buffer.alloc(length, 0),
    uuid: () => "33333333-3333-4333-8333-333333333333",
    readCapture: async () => png,
    write: () => { throw new Error("output failed"); },
  }), /output failed/);
  assert.equal(fake.calls.some(([name]) => name === "issue_manual_proposal"), true);
  assert.deepEqual(fake.removed, []);
});

test("rotation prints a new code after hash update; revoke prints none", async () => {
  const fake = fakeClient();
  const output = [];
  await rotateCode({
    client: fake.client, id: "22222222-2222-4222-8222-222222222222",
    pepper, randomBytes: (length) => Buffer.alloc(length, 1),
    write: (message) => output.push(message),
  });
  assert.equal(fake.calls[0][0], "rotate_manual_proposal_code");
  assert.equal(output.length, 1);
  assert.match(output[0], /333333333333/);
  await revokeDraft({ client: fake.client, id: "22222222-2222-4222-8222-222222222222" });
  assert.equal(fake.calls[1][0], "revoke_manual_proposal");
  assert.equal(output.length, 1);
});

test("cleanup removes only server-approved expired preview paths", async () => {
  const fake = fakeClient();
  const count = await cleanupPreviews({ client: fake.client });
  assert.equal(count, 1);
  assert.deepEqual(fake.removed, [[
    "manual/old/desktop.png", "manual/old/tablet.png", "manual/old/mobile.png",
  ]]);
  assert.equal(fake.calls[1][0], "mark_manual_preview_cleaned");
});
