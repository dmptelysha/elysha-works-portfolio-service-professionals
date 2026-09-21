import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("tracked source contains no Google-style API key literal", () => {
  const result = spawnSync(
    "git",
    ["grep", "-l", "-E", "AIza[0-9A-Za-z_-]{35}", "--", "."],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 1, result.stdout || result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("the generated booking config is ignored by Git", () => {
  const ignored = spawnSync(
    "git",
    ["check-ignore", "--no-index", "public/booking/booking-config.mjs"],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(ignored.status, 0, ignored.stderr);
  assert.equal(ignored.stdout.trim(), "public/booking/booking-config.mjs");
  assert.match(
    readFileSync(join(root, ".gitignore"), "utf8"),
    /^public\/booking\/booking-config\.mjs$/m,
  );
});

test("the generator requires an environment-provided browser key", async () => {
  const { buildBookingConfig } = await import(
    "../scripts/generate-booking-config.mjs"
  );

  assert.throws(
    () => buildBookingConfig({}),
    /NEXT_PUBLIC_BOOKING_FIREBASE_API_KEY is required/,
  );
});

test("the generator emits a valid public booking configuration", async () => {
  const { buildBookingConfig } = await import(
    "../scripts/generate-booking-config.mjs"
  );
  const fakeBrowserKey = `A${"x".repeat(38)}`;
  const source = buildBookingConfig({
    NEXT_PUBLIC_BOOKING_FIREBASE_API_KEY: fakeBrowserKey,
  });

  assert.match(source, /mode:'production'/);
  assert.match(source, /apiBaseUrl:'https:\/\/crm\.elyshaworks\.com'/);
  assert.match(source, new RegExp(JSON.stringify(fakeBrowserKey)));
  assert.doesNotMatch(source, /apiKey:(?:undefined|null)/);
});
