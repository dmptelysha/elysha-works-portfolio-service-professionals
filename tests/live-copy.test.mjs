import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

test("the portfolio blueprint remains the documented source of truth", () => {
  assert.ok(existsSync(fromRoot("docs/portfolio-blueprint.md")));
});

test("the Next homepage composes the approved seven-section React experience", () => {
  const page = readFileSync(fromRoot("src/app/page.tsx"), "utf8");
  assert.doesNotMatch(page, /live-home\.html/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  for (const component of [
    "Hero",
    "ProjectsSection",
    "FounderSection",
    "TestimonialSection",
    "FaqSection",
    "FinalCtaSection",
    "SiteFooter",
  ]) {
    assert.match(page, new RegExp(`<${component}`), `missing ${component}`);
  }
});

test("the homepage exposes the approved roadmap hero hierarchy", () => {
  const snapshot = readFileSync(fromRoot("src/components/home/Hero.tsx"), "utf8");
  const content = readFileSync(fromRoot("src/data/site-content.ts"), "utf8");

  assert.match(snapshot, /hero-promise-accent/);
  assert.match(snapshot, /hero-trust/);
  assert.match(content, /Strategy-first guidance for growing businesses\./);
  assert.match(content, /Get My Personalized Roadmap/);
  assert.match(content, /See how the assessment works/);
});

test("the authored homepage styles are available", () => {
  for (const file of ["public/hero-roadmap.css", "src/styles/portfolio.css"]) {
    assert.ok(existsSync(fromRoot(file)), `missing ${file}`);
  }

  const layout = readFileSync(fromRoot("src/app/layout.tsx"), "utf8");
  assert.match(layout, /public\/hero-roadmap\.css/);
  assert.match(layout, /styles\/portfolio\.css/);
});

test("the root layout no longer injects the legacy runtime", () => {
  const layout = readFileSync(fromRoot("src/app/layout.tsx"), "utf8");
  for (const legacy of [
    "LiveRuntime",
    "scrollcraft.css",
    "public/site.css",
    "scroll-scenes.css",
    "v3-project-viewer.css",
    "rhea-chat.css",
  ]) {
    assert.doesNotMatch(layout, new RegExp(legacy.replaceAll("/", "\\/")));
  }
});

test("the local quiz feature has no Supabase or database client boundary", () => {
  const quizRoot = fromRoot("src/features/quiz");
  const source = readdirSync(quizRoot, { recursive: true })
    .filter((file) => /\.(?:ts|tsx)$/.test(String(file)))
    .map((file) => readFileSync(join(quizRoot, String(file)), "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /@supabase|supabase-js|\.from\s*\(|\/rest\/v1|service_role/i);
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
    "out/quiz/index.html",
    "out/quiz/__next.quiz.__PAGE__.txt",
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
