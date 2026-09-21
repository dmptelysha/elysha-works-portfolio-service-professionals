import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const fromRoot = (...parts) => join(root, ...parts);

const requiredPublicFiles = [
  "public/assets/fonts/fonts.css",
  "public/assets/v3-hero/elysha-portrait-cutout.png",
  "public/assets/v3-hero/rows/coaching.webp",
  "public/assets/project-previews/esl-tutor/index.html",
  "public/assets/project-previews/client-portal/protected-desktop.jpg",
  "public/booking/index.html",
  "public/booking/booking-entry.mjs",
  "public/thank-you/index.html",
  "public/thank-you/thank-you.mjs",
  "public/ai-usage-policy/index.html",
  "public/elysha-works-privacy-policy/index.html",
  "public/elysha-works-terms-of-service/index.html",
];

test("live snapshot assets and auxiliary routes are available under public", () => {
  for (const file of requiredPublicFiles) {
    assert.ok(existsSync(fromRoot(file)), `missing ${file}`);
  }
});

test("the portfolio blueprint remains documentation, not homepage functionality", () => {
  assert.ok(existsSync(fromRoot("docs/portfolio-blueprint.md")));
  const page = readFileSync(fromRoot("src/app/page.tsx"), "utf8");
  assert.doesNotMatch(page, /lead qualifier|quiz/i);
});

test("the Next homepage renders the complete live portfolio snapshot", () => {
  const snapshotPath = fromRoot("src/content/live-home.html");
  assert.ok(existsSync(snapshotPath), "missing live homepage snapshot");

  const snapshot = readFileSync(snapshotPath, "utf8");
  assert.match(snapshot, /Clear websites\./);
  for (const id of ["problem", "journey", "work", "services", "process", "about", "faq", "contact"]) {
    assert.match(snapshot, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.doesNotMatch(snapshot, /lead qualifier|portfolio quiz/i);

  const page = readFileSync(fromRoot("src/app/page.tsx"), "utf8");
  assert.match(page, /live-home\.html/);
  assert.match(page, /dangerouslySetInnerHTML/);
  assert.match(page, /suppressHydrationWarning/);
});

test("the live homepage styles and scripts are exposed as public assets", () => {
  for (const file of ["public/site.css", "public/scroll-scenes.css", "public/site.js"]) {
    assert.ok(existsSync(fromRoot(file)), `missing ${file}`);
  }
});

test("client-only enhancements begin after React hydration", () => {
  const layout = readFileSync(fromRoot("src/app/layout.tsx"), "utf8");
  const runtimePath = fromRoot("src/app/live-runtime.tsx");
  assert.ok(existsSync(runtimePath), "missing client runtime");
  assert.doesNotMatch(layout, /document\.documentElement\.classList\.add/);

  const runtime = readFileSync(runtimePath, "utf8");
  assert.match(runtime, /^"use client";/);
  assert.match(runtime, /useEffect/);
  assert.match(runtime, /classList\.add\("js-ready"\)/);
  assert.doesNotMatch(layout, /next\/script/);
  for (const script of [
    "/assets/vendor/scrollcraft/scrollcraft.js",
    "/site.js",
    "/assets/v3-project-viewer.js",
    "/assets/v3-content-guard.js",
    "/assets/rhea-chat.mjs",
  ]) {
    assert.match(runtime, new RegExp(script.replaceAll("/", "\\/")));
  }
});

test("Firebase Hosting serves the Next static export from out", () => {
  const firebase = JSON.parse(readFileSync(fromRoot("firebase.json"), "utf8"));
  assert.equal(firebase.hosting.public, "out");
  assert.equal(firebase.hosting.site, "elysha-works-portfolio");
  assert.equal(firebase.emulators.hosting.port, 5002);

  const firebaserc = JSON.parse(readFileSync(fromRoot(".firebaserc"), "utf8"));
  assert.equal(firebaserc.projects.default, "elyshaworks-fd2dc");

  const packageJson = JSON.parse(readFileSync(fromRoot("package.json"), "utf8"));
  assert.equal(packageJson.scripts.preview, "next dev");
  assert.equal(
    packageJson.scripts["firebase:serve"],
    "firebase emulators:start --only hosting",
  );
});

test("the static export contains the homepage and live auxiliary routes", () => {
  const expected = [
    "out/index.html",
    "out/booking/index.html",
    "out/thank-you/index.html",
    "out/ai-usage-policy/index.html",
    "out/elysha-works-privacy-policy/index.html",
    "out/elysha-works-terms-of-service/index.html",
    "out/assets/project-previews/esl-tutor/index.html",
  ];

  for (const file of expected) {
    assert.ok(existsSync(fromRoot(file)), `missing ${file}`);
  }
});
