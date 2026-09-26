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

test("the portfolio blueprint remains the documented source of truth", () => {
  const blueprintPath = fromRoot("docs/portfolio-blueprint.md");
  assert.ok(existsSync(blueprintPath));

  const blueprint = readFileSync(blueprintPath, "utf8");
  assert.match(blueprint, /first name.*business name.*email/is);
  assert.match(blueprint, /Point A.*Point B/is);
  assert.match(blueprint, /72 hours/is);
  assert.match(blueprint, /\+24.*\+48.*\+72.*\+96/is);
  assert.match(blueprint, /access key/is);
  assert.doesNotMatch(blueprint, /Email My PDF Roadmap/i);
});

test("the authoritative docs describe the verified proposal workflow", () => {
  const docs = [
    readFileSync(fromRoot("docs/portfolio-blueprint.md"), "utf8"),
    readFileSync(fromRoot("docs/supabase-database.md"), "utf8"),
  ].join("\n");

  assert.match(docs, /verified email.*before.*lead/is);
  assert.match(docs, /custom.*OTP.*Make.*Gmail/is);
  assert.match(docs, /HMAC.*digest/is);
  assert.match(docs, /60-second.*resend/is);
  assert.match(docs, /10-minute.*OTP/is);
  assert.match(docs, /begin_custom_verified_qualified_quiz/is);
  assert.match(docs, /never.*plaintext.*OTP/is);
  assert.match(docs, /complete approved inclusions/is);
  assert.match(docs, /accepted.*true.*delivery_id/is);
  assert.match(docs, /booking.*handoff.*external.*consumer/is);
  assert.doesNotMatch(docs, /SMTP_PASSWORD\s*=\s*[^<\s]/i);
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
  const styles = readFileSync(fromRoot("public/hero-roadmap.css"), "utf8");

  assert.match(snapshot, /hero-promise-accent/);
  assert.match(snapshot, /hero-trust/);
  assert.doesNotMatch(snapshot, /elysha-portrait-cutout\.png/);
  assert.match(content, /Strategy-first guidance for growing businesses\./);
  assert.match(content, /Get My Personalized Roadmap/);
  assert.doesNotMatch(content, /See how the assessment works/);
  assert.match(styles, /@keyframes\s+hero-cta-border-orbit/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test("the static booking route uses a plain anchor instead of Next route prefetching", () => {
  const finalCta = readFileSync(fromRoot("src/components/home/FinalCtaSection.tsx"), "utf8");

  assert.doesNotMatch(finalCta, /from ["']next\/link["']/);
  assert.match(finalCta, /<a className="portfolio-text-link" href=\{finalCta\.secondaryHref\}>/);
});

test("direct booking prefill stays gated behind the external one-time handoff contract", () => {
  const contractPath = fromRoot("docs/contracts/quiz-booking-handoff.md");
  assert.ok(existsSync(contractPath), "missing secure booking handoff contract");
  const contract = readFileSync(contractPath, "utf8");

  assert.match(contract, /opaque.*256-bit/is);
  assert.match(contract, /SHA-256.*hash/is);
  assert.match(contract, /10-minute.*TTL/is);
  assert.match(contract, /atomic.*single-use/is);
  assert.match(contract, /replay.*reject/is);
  assert.match(contract, /no PII.*URL/is);
  assert.match(contract, /safe.*form.*fallback/is);
  assert.match(contract, /POST \/v1\/handoffs\/consume/);
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

test("the quiz uses only the publishable Supabase browser boundary", () => {
  const source = [
    readFileSync(fromRoot("src/lib/supabase/browser.ts"), "utf8"),
    readFileSync(fromRoot("src/features/quiz/quiz-service.ts"), "utf8"),
  ].join("\n");

  assert.match(source, /@supabase\/supabase-js/);
  assert.match(source, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /signInAnonymously/);
  assert.doesNotMatch(source, /service[_-]?role|SUPABASE_SERVICE/i);
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
    "out/proposal/index.html",
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

test("the protected proposal route is client-verified and does not embed private content", () => {
  const page = readFileSync(fromRoot("src/app/proposal/page.tsx"), "utf8");
  const access = readFileSync(fromRoot("src/features/proposal/ProposalAccess.tsx"), "utf8");
  const service = readFileSync(fromRoot("src/features/proposal/proposal-service.ts"), "utf8");

  assert.match(page, /ProposalAccess/);
  assert.match(access, /sessionStorage/);
  assert.match(service, /verify-proposal/);
  assert.doesNotMatch(`${page}\n${access}`, /mara@example|Mara Consulting/i);
  assert.doesNotMatch(access, /localStorage/);
});

test("the Make proposal automation guide locks the inactive delivery and follow-up contracts", () => {
  const guide = readFileSync(fromRoot("docs/make-proposal-automation.md"), "utf8");
  const initial = readFileSync(fromRoot("docs/make-payload-examples/redacted-initial-proposal.json"), "utf8");
  const followup = readFileSync(fromRoot("docs/make-payload-examples/redacted-follow-up-claim.json"), "utf8");

  assert.match(guide, /Elysha Works — Proposal Delivery/);
  assert.match(guide, /Custom Webhook.*Secret\/shape filter.*Data Store lookup.*Router.*Data Store create.*Gmail Send Email.*Data Store update.*Webhook Response/is);
  assert.match(guide, /Elysha Works — Proposal Follow-up/);
  assert.match(guide, /15-minute Scheduler.*HTTP claim.*Empty-work filter.*HTTP final booking check.*Gmail Send Email.*HTTP acknowledge/is);
  assert.match(guide, /confidential scenario data/i);
  assert.match(guide, /delivery_id.*idempotency/is);
  assert.match(guide, /\+24.*\+48.*\+72.*cold.*\+96/is);
  assert.match(guide, /deactivate both scenarios.*revoke.*secret.*disable Edge delivery.*retain/is);
  assert.match(guide, /inactive.*backend.*verified/is);
  assert.match(guide, /does not generate or attach a PDF/i);

  for (const payload of [initial, followup]) {
    assert.doesNotMatch(payload, /@(?:gmail|outlook|yahoo|elyshaworks)\./i);
    assert.doesNotMatch(payload, /hook\.(?:us\d+\.)?make\.com|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/i);
  }
  assert.match(initial, /"access_key": "REDACTED"/);
  assert.match(initial, /"stop_url": "https:\/\/example\.invalid\/stop\?token=REDACTED"/);
  assert.match(followup, /"work_kind": "follow_up"/);
});

test("the Make OTP runbook preserves encrypted, authenticated, idempotent delivery", () => {
  const guidePath = fromRoot("docs/make-email-otp-scenario.md");
  assert.ok(existsSync(guidePath), "missing custom Make OTP scenario runbook");
  const guide = readFileSync(guidePath, "utf8");

  for (const field of ["deliveryId", "timestamp", "nonce", "keyVersion", "iv", "ciphertext", "tag"]) {
    assert.match(guide, new RegExp(`\\b${field}\\b`), `missing encrypted envelope field ${field}`);
  }
  assert.match(guide, /AES-256-GCM.*advanced.*keychain/is);
  assert.match(guide, /inner.*outer.*deliveryId.*timestamp.*nonce.*keyVersion/is);
  assert.doesNotMatch(guide, /MAKE_OTP_SIGNING_SECRET|canonical HMAC signature/is);
  assert.match(guide, /10-minute.*code/is);
  assert.match(guide, /sequential processing/is);
  assert.match(guide, /confidential.*data/is);
  assert.match(guide, /incomplete executions.*disabled/is);
  assert.match(guide, /deliveryId.*created_at.*status/is);
  assert.match(guide, /Data Store record key is `deliveryId`; its record fields contain only `created_at` and `status`/i);
  assert.match(guide, /pending.*never resent automatically/is);
  assert.match(guide, /generic failure.*without request data/is);
  assert.match(guide, /MAKE_OTP_ENCRYPTION_KEY.*MAKE_OTP_KEY_VERSION.*versioned transport key/is);
  assert.match(guide, /accepted.*true.*deliveryId.*same UUID/is);
  assert.match(guide, /inactive/is);
});
