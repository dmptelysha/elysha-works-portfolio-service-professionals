import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const out = join(process.cwd(), "out");

test("static export includes a direct locked proposal route without client content", () => {
  const route = join(out, "proposal", "client", "index.html");
  assert.ok(existsSync(route), "Run npm run build before this test; the proposal route must export.");
  const html = readFileSync(route, "utf8");
  assert.match(html, /Private Proposal/);
  assert.doesNotMatch(html, /The Emotional Anchor|Meghan|ABCDEFGHJKLM/);
});

test("offline Meghan source and captured previews are absent from the public export", () => {
  assert.ok(existsSync(out), "Run npm run build before this test.");
  const pending = [out];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      assert.doesNotMatch(entry.name, /meghan|emotional.anchor|sales.page.concept|manual.proposal.preview/iu);
      if (entry.isDirectory()) pending.push(path);
    }
  }
});
