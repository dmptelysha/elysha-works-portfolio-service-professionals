# Service Professionals Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate, responsive Elysha Works portfolio for service professionals while leaving the existing local and live portfolio unchanged.

**Architecture:** Create a framework-free single-page site with semantic HTML, one focused stylesheet, and one progressive-enhancement script. Keep every asset local, reuse only the approved navigation/footer direction and existing project preview images, and use the two newly supplied Elysha portrait files.

**Tech Stack:** HTML5, CSS3, JavaScript, local Manrope WOFF2, local GSAP 3 with ScrollTrigger, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-service-professionals-portfolio-design.md`

## Global Constraints

- Write only inside `C:\Users\eeelay\Documents\Elysha Works\Elysha Works Portfolio Service Professionals`.
- Treat `C:\Users\eeelay\Documents\Elysha Works\Elysha Works Portfolio` and `elyshaworks.com` as read-only references.
- Do not create Firebase configuration or deploy this project.
- Use local Manrope throughout.
- Use only ink black, warm white, white, graphite, soft gray, and gray borders; no yellow or orange.
- Use the supplied Elysha portraits; do not reuse the old portrait or generate a replacement.
- Keep authentic collaboration-photo slots explicit until permission-cleared photos are supplied.
- Keep the hero headline to two lines on desktop and no more than three lines on mobile.
- Preserve semantic landmarks, visible focus, 44px touch targets, reduced-motion behavior, and no horizontal overflow.

## File Map

- `index.html` — semantic page structure and all production copy.
- `styles.css` — design tokens, layout, responsive rules, interactions, and reduced-motion styles.
- `script.js` — navigation, FAQ, back-to-top, and GSAP progressive enhancement.
- `assets/manrope-ew.woff2` — local interface font copied from the existing portfolio.
- `assets/elysha-portrait-full.png` — full supplied portrait from `C:\Users\eeelay\Downloads\59899d5e-3736-43cc-9a6e-c0c8a7702042.png`.
- `assets/elysha-portrait-cutout.png` — transparent supplied portrait from `C:\Users\eeelay\Downloads\Untitled design (5).png`.
- `assets/projects/*.jpg` — four read-only project preview images copied from the existing portfolio.
- `assets/vendor/gsap.min.js` and `assets/vendor/ScrollTrigger.min.js` — local animation runtime copied from the existing portfolio.
- `tests/portfolio.test.mjs` — structure, content, isolation, accessibility-marker, and palette tests.
- `tests/browser-check.mjs` — real desktop/tablet/mobile browser verification and screenshots.
- `docs/superpowers/specs/existing-portfolio-production.sha256` — read-only SHA-256 manifest for every existing portfolio production file before this build.
- `.gitignore` — ignores local screenshots and temporary browser output.

---

### Task 1: Scaffold the isolated project and copy approved assets

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `styles.css`
- Create: `script.js`
- Create: `tests/portfolio.test.mjs`
- Create: `assets/manrope-ew.woff2`
- Create: `assets/elysha-portrait-full.png`
- Create: `assets/elysha-portrait-cutout.png`
- Create: `assets/projects/la-jaysiedel-cakes.jpg`
- Create: `assets/projects/client-portal.jpg`
- Create: `assets/projects/growth-crm.jpg`
- Create: `assets/projects/teacher-elysha.jpg`
- Create: `assets/vendor/gsap.min.js`
- Create: `assets/vendor/ScrollTrigger.min.js`

**Interfaces:**
- Consumes: the approved design spec and read-only source assets.
- Produces: a standalone project shell and stable asset paths for every later task.

- [ ] **Step 1: Write the failing isolation and asset test**

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "index.html", "styles.css", "script.js", "assets/manrope-ew.woff2",
  "assets/elysha-portrait-full.png", "assets/elysha-portrait-cutout.png",
  "assets/projects/la-jaysiedel-cakes.jpg", "assets/projects/client-portal.jpg",
  "assets/projects/growth-crm.jpg", "assets/projects/teacher-elysha.jpg",
  "assets/vendor/gsap.min.js", "assets/vendor/ScrollTrigger.min.js"
];
const assetHashes = {
  "assets/elysha-portrait-full.png": "E956337E8D832AA56AFF367A3481DF423A118FEAE68A344AEF2FC8F3157E494D",
  "assets/elysha-portrait-cutout.png": "C7AD433166BF90814AA17E969F46C0A1A2EC34234F56FA51FE4119ADE53459A0",
  "assets/manrope-ew.woff2": "A30DDCD349703AFF7464C34BEF3FFFDFF405EE50C113440D7C8693C02D210972",
  "assets/vendor/gsap.min.js": "96C01B81F44A3290E2B4532F55E2C9534B2ADC43273A19F3756B2CB41F0FD0B6",
  "assets/vendor/ScrollTrigger.min.js": "308219390E5E3B84CDA0C481E70CAA9820883AE10BDA44E6E9A149A81AAC4B3F",
  "assets/projects/la-jaysiedel-cakes.jpg": "AD83FA18F775A91A3C3CC7AEA07A2EB0CAD86CBAB35E03F9FCE48A178A3307A3",
  "assets/projects/client-portal.jpg": "F00137D48D84884A765BAECDD145A6991E67604A788769358A7CD2B707F50EA4",
  "assets/projects/growth-crm.jpg": "8247D9824218FEAD6C4D15682412EFA5FB5040E7998990E345F2611457A1785F",
  "assets/projects/teacher-elysha.jpg": "51907804964D29F718C95B2A4C2204753E03377F272FBFE83712195B08D84EDC"
};
const sha256 = file => createHash("sha256").update(readFileSync(join(root, file))).digest("hex").toUpperCase();

test("standalone portfolio owns every required file", () => {
  for (const file of required) assert.ok(existsSync(join(root, file)), `missing ${file}`);
  for (const [file, hash] of Object.entries(assetHashes)) assert.equal(sha256(file), hash, `${file} must be an exact approved copy`);
  assert.equal(existsSync(join(root, "firebase.json")), false);
  assert.equal(existsSync(join(root, ".firebaserc")), false);
});

test("the existing portfolio remains byte-for-byte unchanged", () => {
  const existing = join(root, "..", "Elysha Works Portfolio");
  const manifest = readFileSync(join(root, "docs/superpowers/specs/existing-portfolio-production.sha256"), "utf8").trim().split(/\r?\n/);
  const ignoredDirectories = new Set([".firebase", ".local-tools", ".tmp", ".checks", ".git", "node_modules", "tests", "docs", "scripts"]);
  function deployedFiles(directory, prefix = "") {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : deployedFiles(join(directory, entry.name), relative);
      if (["firebase.json", ".firebaserc"].includes(entry.name) || entry.name.endsWith(".md") || entry.name.endsWith(".log") || entry.name.startsWith(".env")) return [];
      return [relative];
    }).sort();
  }
  const manifestPaths = manifest.map(line => line.slice(66)).sort();
  assert.deepEqual(deployedFiles(existing), manifestPaths, "existing portfolio deployable file set changed");
  for (const line of manifest) {
    const [, hash, file] = line.match(/^([A-F0-9]{64})  (.+)$/) ?? [];
    assert.ok(hash && file, `invalid manifest line: ${line}`);
    const actual = createHash("sha256").update(readFileSync(join(existing, file))).digest("hex").toUpperCase();
    assert.equal(actual, hash, `existing portfolio ${file} changed`);
  }
  const configuration = {
    "firebase.json": "92615881287B6445D8C990FE2843641F729BF819D14D5063F3DA3DCC874148C3",
    ".firebaserc": "C20F1239267FC81A04A6A76100789CD42B319D5C87447BDB549AE3B5A0323A69"
  };
  for (const [file, hash] of Object.entries(configuration)) {
    const actual = createHash("sha256").update(readFileSync(join(existing, file))).digest("hex").toUpperCase();
    assert.equal(actual, hash, `existing portfolio configuration ${file} changed`);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/portfolio.test.mjs`

Expected: FAIL with the first missing production file or asset.

- [ ] **Step 3: Create the shell files and copy the exact assets**

Create `package.json`:

```json
{
  "name": "elysha-works-service-professionals-portfolio",
  "private": true,
  "scripts": {
    "test": "node --test tests/portfolio.test.mjs",
    "check": "node --check script.js && node --test tests/portfolio.test.mjs"
  }
}
```

Create `.gitignore`:

```gitignore
.tmp/
*.log
```

Create an HTML shell containing an early `<script>document.documentElement.classList.add("js")</script>`, `styles.css`, both local GSAP scripts, and `script.js` with `defer`. Without JavaScript the `js` class is never added, so navigation and FAQ content remain visible. Create empty `styles.css` and `script.js` files. Copy the source assets exactly:

```powershell
New-Item -ItemType Directory -Force -Path assets\projects,assets\vendor,tests | Out-Null
Copy-Item -LiteralPath 'C:\Users\eeelay\Downloads\59899d5e-3736-43cc-9a6e-c0c8a7702042.png' -Destination 'assets\elysha-portrait-full.png'
Copy-Item -LiteralPath 'C:\Users\eeelay\Downloads\Untitled design (5).png' -Destination 'assets\elysha-portrait-cutout.png'
Copy-Item -LiteralPath '..\Elysha Works Portfolio\assets\manrope-ew.woff2' -Destination 'assets\manrope-ew.woff2'
Copy-Item -LiteralPath '..\Elysha Works Portfolio\assets\vendor\gsap.min.js' -Destination 'assets\vendor\gsap.min.js'
Copy-Item -LiteralPath '..\Elysha Works Portfolio\assets\vendor\ScrollTrigger.min.js' -Destination 'assets\vendor\ScrollTrigger.min.js'
Copy-Item -LiteralPath '..\Elysha Works Portfolio\assets\project-previews\la-jaysiedel-cakes\preview.jpg' -Destination 'assets\projects\la-jaysiedel-cakes.jpg'
Copy-Item -LiteralPath '..\Elysha Works Portfolio\assets\project-previews\client-portal\protected-desktop.jpg' -Destination 'assets\projects\client-portal.jpg'
Copy-Item -LiteralPath '..\Elysha Works Portfolio\assets\project-previews\growth-crm\protected-desktop.jpg' -Destination 'assets\projects\growth-crm.jpg'
Copy-Item -LiteralPath '..\Elysha Works Portfolio\assets\project-previews\esl-tutor\preview.jpg' -Destination 'assets\projects\teacher-elysha.jpg'
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test`

Expected: PASS for the standalone-file and no-Firebase assertions.

- [ ] **Step 5: Commit the scaffold**

```bash
git add package.json .gitignore index.html styles.css script.js assets tests/portfolio.test.mjs
git commit -m "chore: scaffold isolated service professionals portfolio"
```

---

### Task 2: Build the design system, navigation, and hero

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `tests/portfolio.test.mjs`

**Interfaces:**
- Consumes: portrait assets and local Manrope from Task 1.
- Produces: `.site-header`, `#hero`, `.hero-system`, `.button`, `.shell`, and the shared design tokens used by later sections.

- [ ] **Step 1: Add failing navigation, hero, and palette tests**

```js
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");

test("navigation and hero match the approved service-professional direction", () => {
  assert.match(html, /class="site-header"/);
  assert.match(html, /&lt; Elysha Works \/&gt;/);
  assert.match(html, /id="hero"/);
  assert.match(html, /Websites and client systems built to turn interest into action\./);
  assert.match(html, /assets\/elysha-portrait-cutout\.png/);
  for (const stage of ["Attract", "Capture", "Book", "Follow Up", "Manage"]) assert.match(html, new RegExp(stage));
});

test("the palette remains monochrome", () => {
  assert.doesNotMatch(css, /yellow|orange|#f59e0b|#e88900|#ffb000/i);
  assert.match(css, /:focus-visible/);
  for (const token of ["--ink:#080808", "--paper:#f5f3ee", "--graphite:#444", "--line:#c9c7c2"]) {
    assert.match(css.replaceAll(" ", ""), new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test --test-name-pattern="navigation and hero|palette" tests/portfolio.test.mjs`

Expected: FAIL because the semantic navigation, hero copy, and tokens are absent.

- [ ] **Step 3: Implement semantic navigation and hero markup**

Use this exact structure and copy:

```html
<header class="site-header">
  <nav class="nav shell" aria-label="Main navigation">
    <a class="brand" href="#hero" aria-label="Elysha Works home">&lt; Elysha Works /&gt;</a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu"><span class="sr-only">Open menu</span></button>
    <div class="nav-links" id="site-menu">
      <a href="#work">Work</a><a href="#services">Services</a><a href="#process">Process</a><a href="#about">About</a><a href="#faq">FAQ</a>
      <a class="nav-cta" href="mailto:support@elyshaworks.com?subject=New%20project%20inquiry">Start a Project</a>
    </div>
  </nav>
</header>
<main>
  <section class="hero" id="hero" aria-labelledby="hero-title">
    <div class="shell hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">For service professionals</p>
        <h1 id="hero-title">Websites and client systems built to turn interest into action.</h1>
        <p>I help service professionals attract the right clients, capture inquiries, and create seamless experiences that build trust and drive action.</p>
        <div class="actions"><a class="button button-dark" href="mailto:support@elyshaworks.com?subject=New%20project%20inquiry">Tell Me About Your Project</a><a class="button button-outline" href="#work">View Selected Work</a></div>
        <p class="availability">Available for local and international projects.</p>
      </div>
      <div class="hero-system" aria-label="A connected client journey from attraction to management">
        <img src="assets/elysha-portrait-cutout.png" alt="Elysha wearing a black blazer" width="1334" height="1888">
        <ol><li>Attract</li><li>Capture</li><li>Book</li><li>Follow Up</li><li>Manage</li></ol>
      </div>
    </div>
  </section>
```

- [ ] **Step 4: Implement tokens and the approved floating navigation**

Start `styles.css` with:

```css
@font-face{font-family:Manrope;src:url("assets/manrope-ew.woff2") format("woff2");font-display:swap}
:root{--ink:#080808;--paper:#f5f3ee;--white:#fff;--graphite:#444;--muted:#747474;--line:#c9c7c2;--radius:22px;--shell:min(1440px,calc(100% - 64px))}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;overflow-x:hidden;background:var(--paper);color:var(--ink);font-family:Manrope,Arial,sans-serif}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid currentColor;outline-offset:4px}
.shell{width:var(--shell);margin-inline:auto}
.site-header{position:fixed;inset:18px 0 auto;z-index:100;pointer-events:none}
.nav{min-height:58px;display:flex;align-items:center;gap:30px;padding:8px;border:1px solid #666;border-radius:999px;background:rgba(8,8,8,.94);color:var(--white);pointer-events:auto}
.brand{padding:0 18px;font-weight:750;text-decoration:none;color:inherit}.menu-toggle{display:none}.nav-links{margin-left:auto;display:flex;align-items:center;gap:30px}.nav-links a{color:inherit;text-decoration:none}.nav-cta{min-height:42px;display:grid;place-items:center;padding:0 20px;border:1px solid currentColor;border-radius:999px}
.hero{min-height:100svh;padding:150px 0 100px}.hero-grid{display:grid;grid-template-columns:minmax(0,.92fr) minmax(520px,1.08fr);gap:clamp(48px,7vw,120px);align-items:center}.hero h1{max-width:800px;margin:24px 0 32px;font-size:clamp(54px,5.1vw,84px);line-height:.98;letter-spacing:-.055em}.hero-copy>p:not(.eyebrow):not(.availability){max-width:680px;font-size:clamp(18px,1.55vw,24px);line-height:1.65}
```

Complete `.hero-system` with thin monochrome connectors, five contained stage labels, and the portrait centered inside an organic warm-gray shape. Keep every stage inside the right column.

- [ ] **Step 5: Run the focused tests**

Run: `node --test --test-name-pattern="navigation and hero|palette" tests/portfolio.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit navigation and hero**

```bash
git add index.html styles.css tests/portfolio.test.mjs
git commit -m "feat: build monochrome navigation and service hero"
```

---

### Task 3: Add How I Help and the two-column Selected Work grid

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `tests/portfolio.test.mjs`

**Interfaces:**
- Consumes: `.shell`, `.eyebrow`, design tokens, and project image paths.
- Produces: `#help`, `#work`, `.journey-step`, and `.project-card` for navigation and motion hooks.

- [ ] **Step 1: Add failing section-order and project-card tests**

```js
test("How I Help precedes four selected-work cards", () => {
  const ids = ["hero", "help", "work", "process", "about", "fit", "services", "faq", "contact"];
  const positions = ids.map(id => html.indexOf(`id="${id}"`));
  assert.ok(positions.slice(0, 3).every(position => position >= 0));
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
  assert.equal((html.match(/class="project-card"/g) ?? []).length, 4);
  for (const name of ["La Jaysiedel Cakes", "Elysha Works Client Portal", "Elysha Works Growth CRM", "Teacher Elysha"]) assert.match(html, new RegExp(name));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test --test-name-pattern="How I Help" tests/portfolio.test.mjs`

Expected: FAIL because `#help`, `#work`, and the project cards do not exist.

- [ ] **Step 3: Implement the five-stage journey**

Add `#help` after the hero with heading `A clearer journey from first visit to booked appointment.` and five `<article class="journey-step">` elements using these exact titles and descriptions:

```js
[
  ["Website & Landing Page", "Strategic, SEO-ready sites that build trust and convert visitors."],
  ["Lead Capture Funnel", "Clear paths that turn interest into inquiries and qualified leads."],
  ["Online Booking", "Seamless scheduling that makes it easy for clients to book."],
  ["Automated Follow-Up", "Timely emails that build confidence and keep conversations moving."],
  ["CRM Automation", "Organized client systems that track, nurture, and close more clients."]
]
```

Use one shared inline SVG icon style with `stroke="currentColor"`, `fill="none"`, `stroke-width="1.5"`, and round caps/joins.

- [ ] **Step 4: Implement the complete two-by-two project grid**

Each `.project-card` contains `.project-media`, `.project-copy`, and a native anchor that provides the required keyboard behavior and destination:

```html
<a class="project-link" href="#contact" aria-label="Discuss the La Jaysiedel Cakes project">View project direction <span aria-hidden="true">→</span></a>
```

Use exact image paths and tags:

```js
[
  ["assets/projects/la-jaysiedel-cakes.jpg", "Paid project", "La Jaysiedel Cakes", "E-commerce website", "Build an elegant online store that showcases products and makes ordering easy.", ["Web Design","E-commerce","SEO Basics"]],
  ["assets/projects/client-portal.jpg", "Internal project", "Elysha Works Client Portal", "Custom web app", "Create a secure portal for clients to track projects, messages, files, and approvals.", ["Web App","Dashboard","Client Experience"]],
  ["assets/projects/growth-crm.jpg", "Internal project", "Elysha Works Growth CRM", "CRM system", "Develop a centralized system to manage leads, track opportunities, and streamline follow-ups.", ["CRM","Automation","Reporting"]],
  ["assets/projects/teacher-elysha.jpg", "Self-directed case study", "Teacher Elysha", "Service website", "Design a personal brand website to explain services, build trust, and guide parents toward booking.", ["Web Design","Content Strategy","Booking Journey"]]
]
```

- [ ] **Step 5: Style the journey and mathematically complete project grid**

```css
.journey{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid var(--ink)}
.journey-step{position:relative;padding:44px 28px 0;border-right:1px solid var(--line)}.journey-step:last-child{border-right:0}
.project-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:dense;gap:20px}
.project-card{min-height:440px;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(280px,.92fr);overflow:hidden;border:1px solid var(--line);background:var(--white)}
.project-media{overflow:hidden}.project-media img{width:100%;height:100%;object-fit:cover;filter:grayscale(1);transition:transform .7s ease,filter .4s ease}.project-card:is(:hover,:focus-within) img{transform:scale(1.045);filter:grayscale(.25)}
.project-link{min-height:44px;display:inline-flex;align-items:center;gap:12px;color:var(--ink);font-weight:750}.project-link:focus-visible{outline:2px solid var(--ink);outline-offset:4px;border-radius:4px}
```

Two columns × two rows = four occupied cells, with `grid-auto-flow:dense`; there are no empty grid cells.

- [ ] **Step 6: Run the test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit How I Help and Selected Work**

```bash
git add index.html styles.css tests/portfolio.test.mjs
git commit -m "feat: add client journey and selected work grid"
```

---

### Task 4: Add Process, About, and Good Fit sections

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `tests/portfolio.test.mjs`

**Interfaces:**
- Consumes: portrait assets, shared buttons, section headings, and shell.
- Produces: `#process`, `#about`, `#fit`, `.process-phase`, `.photo-slot`, and `.fit-list`.

- [ ] **Step 1: Add failing content and portrait tests**

```js
test("Process, About, and Good Fit use approved content and real portrait assets", () => {
  for (const id of ["process", "about", "fit"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const phase of ["Discover", "Plan", "Build", "Launch & Support"]) assert.match(html, new RegExp(phase.replace("&", "(?:&|&amp;)")));
  assert.equal((html.match(/class="photo-slot"/g) ?? []).length, 3);
  assert.match(html, /assets\/elysha-portrait-full\.png/);
  assert.match(html, /Does this sound familiar\?/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test --test-name-pattern="Process, About" tests/portfolio.test.mjs`

Expected: FAIL because the three sections are absent.

- [ ] **Step 3: Implement Process with authentic-photo slots**

Use four `.process-phase` elements with this copy:

```js
[
  ["01","Discover","We start with a conversation to understand your goals and audience."],
  ["02","Plan","I map the journey, define priorities, and align on the right approach."],
  ["03","Build","I design and develop with clarity, collaboration, and attention to detail."],
  ["04","Launch & Support","We launch with confidence and keep improving together."]
]
```

Add exactly three `.photo-slot` figures labelled `Discovery conversation`, `Journey planning`, and `Review and approvals`. The frame itself displays `Authentic collaboration photo` and the caption supplies the context; do not include stock people.

- [ ] **Step 4: Implement About with the full supplied portrait**

Add `#about` with `<img src="assets/elysha-portrait-full.png" alt="Portrait of Elysha in a black blazer">`, heading `Hi, I’m Elysha.`, and this exact biography:

```text
I’m a funnel strategist, web designer, and automation builder helping service professionals create clearer digital client journeys.

With a background in Computer Science and graphic design, I combine strategy, design, development, and systems so each step—from first visit to follow-up—feels connected and easier to manage.
```

Add these capability rows:

```text
Strategy — I clarify your offer, audience, and path to conversion so your message connects and converts.
Design & Development — I design and build conversion-focused websites and funnels that are clear, intuitive, and on-brand.
Automation — I set up smart automations that streamline follow-up, nurture leads, and keep your pipeline moving.
```

- [ ] **Step 5: Implement the Good Fit checklist**

Use a semantic `<ul class="fit-list">` with these exact five items:

```js
[
  "Your website does not clearly explain what you offer.",
  "Inquiries and scheduling take too much manual work.",
  "Your tools and systems feel disconnected.",
  "Following up with leads is inconsistent.",
  "You are ready to improve an existing client journey."
]
```

End with `Remote collaboration for businesses in the Philippines and worldwide.` and the inquiry action.

- [ ] **Step 6: Style the three sections**

Use a four-column process rail, three-column photo grid, two-column About layout, and 40/60 Good Fit split. Use full-perimeter rules and circles only; do not introduce accent bars or colored selected states.

- [ ] **Step 7: Run the test suite and commit**

Run: `npm test`

Expected: PASS.

```bash
git add index.html styles.css tests/portfolio.test.mjs
git commit -m "feat: add process about and client fit sections"
```

---

### Task 5: Add Services, accessible FAQ, final CTA, and editorial footer

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `tests/portfolio.test.mjs`

**Interfaces:**
- Consumes: shared button styles, shell, monochrome tokens.
- Produces: `#services`, `#faq`, `#contact`, `.faq-trigger`, `[data-faq-panel]`, and `[data-back-to-top]` for Task 6.

- [ ] **Step 1: Add failing completion and FAQ semantics tests**

```js
test("the lower funnel contains five services, seven native FAQs, final CTA, and footer", () => {
  for (const id of ["services", "faq", "contact"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.equal((html.match(/class="service-offer"/g) ?? []).length, 5);
  assert.equal((html.match(/<details class="faq-item"/g) ?? []).length, 7);
  assert.equal((html.match(/<summary class="faq-trigger"/g) ?? []).length, 7);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /support@elyshaworks\.com/);
  assert.match(html, /data-back-to-top/);
});

test("landmarks, headings, project alternatives, and decorative art are semantic", () => {
  const header = html.indexOf("<header");
  const main = html.indexOf("<main");
  const footer = html.indexOf("<footer");
  assert.ok(header >= 0 && main > header && footer > main, "landmarks must appear in document order");
  const headingLevels = [...html.matchAll(/<h([1-6])\b/g)].map(match => Number(match[1]));
  assert.equal(headingLevels.filter(level => level === 1).length, 1, "the page needs exactly one h1");
  assert.equal(headingLevels[0], 1, "the first heading must be h1");
  for (let index = 1; index < headingLevels.length; index += 1) assert.ok(headingLevels[index] <= headingLevels[index - 1] + 1, `heading level jumps at index ${index}`);
  assert.equal((html.match(/<section\b[^>]*aria-labelledby=/g) ?? []).length, 9, "every content section needs an accessible heading");
  assert.equal((html.match(/<img\b[^>]*class="project-image"[^>]*alt="[^"]{12,}"/g) ?? []).length, 4, "project images need descriptive alternatives");
  assert.match(html, /class="cta-path"[^>]*aria-hidden="true"/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test --test-name-pattern="lower funnel|landmarks" tests/portfolio.test.mjs`

Expected: FAIL because the lower-funnel sections do not exist.

- [ ] **Step 3: Implement five service offers**

Use the exact names, prices, and inclusion copy from the spec. Each `.service-offer` includes a monochrome line icon, heading, price, the three approved inclusions, and `Ask About This Service` mailto link with the service name in the subject.

- [ ] **Step 4: Implement seven accessible FAQ items**

Each item uses native disclosure semantics and remains usable without JavaScript:

```html
<details class="faq-item">
  <summary class="faq-trigger"><span>What kinds of businesses do you work with?</span><span class="faq-symbol" aria-hidden="true">+</span></summary>
  <div class="faq-panel"><p>I work with service professionals and service-based businesses that need a clearer website, inquiry, booking, follow-up, or client-management journey.</p></div>
</details>
```

Repeat with the exact seven questions and answers in the approved spec for international collaboration, timeline, content readiness, existing-system improvements, supported platforms, and post-launch support.

- [ ] **Step 5: Implement final CTA and dark editorial footer**

Final CTA heading: `Ready to make your client journey clearer?` Include `Tell Me About Your Project` and `View Selected Work` actions plus an Inquiry-to-Booked path illustration.

Footer requirements:

```html
<footer class="site-footer" aria-label="Site footer">
  <div class="shell footer-lead"><p>Let’s build something great together</p><h2>Your vision, let’s make it happen.</h2><a href="mailto:support@elyshaworks.com">support@elyshaworks.com</a></div>
  <div class="shell footer-grid">
    <div><a class="footer-brand" href="#hero">&lt; Elysha Works /&gt;</a><p>Websites and client systems built around your business.</p></div>
    <nav aria-label="Footer navigation"><h3>Navigation</h3><a href="#work">Work</a><a href="#services">Services</a><a href="#process">Process</a><a href="#about">About</a><a href="#faq">FAQ</a></nav>
    <div><h3>Services</h3><p>Websites & Landing Pages<br>Lead & Booking Funnels<br>Follow-Up & CRM Automation<br>Custom Web Applications</p></div>
    <div><h3>Policies</h3><a href="https://elyshaworks.com/elysha-works-privacy-policy.html">Privacy Policy</a><a href="https://elyshaworks.com/elysha-works-terms-of-service.html">Terms of Service</a><a href="https://elyshaworks.com/ai-usage-policy.html">AI Usage Policy</a></div>
  </div>
  <div class="shell footer-bottom"><p>© 2026 Elysha Works. All rights reserved.</p><a href="#hero" data-back-to-top>Back to top</a></div>
</footer>
```

- [ ] **Step 6: Style the lower funnel and footer**

Use a three-column primary service row and two-column secondary row without card shadows. FAQ uses a 40/60 split. Final CTA and footer use `var(--ink)` backgrounds with `var(--paper)` text and full-contrast borders.

- [ ] **Step 7: Run the test suite and commit**

Run: `npm test`

Expected: PASS.

```bash
git add index.html styles.css tests/portfolio.test.mjs
git commit -m "feat: complete services faq call to action and footer"
```

---

### Task 6: Implement menu, FAQ, back-to-top, and GSAP enhancement

**Files:**
- Modify: `script.js`
- Modify: `tests/portfolio.test.mjs`

**Interfaces:**
- Consumes: `.menu-toggle`, `#site-menu`, `.faq-item`, `[data-back-to-top]`, `.reveal`, `.project-card`, `.photo-slot`.
- Produces: `setMenu(open, returnFocus)`, `setFaq(details)`, and `initMotion()`.

- [ ] **Step 1: Add failing interaction-source tests**

```js
const script = readFileSync(join(root, "script.js"), "utf8");
test("progressive enhancement exposes menu FAQ back-to-top and reduced motion", () => {
  for (const name of ["setMenu", "setFaq", "initMotion"]) assert.match(script, new RegExp(`function ${name}`));
  assert.match(script, /prefers-reduced-motion/);
  assert.match(script, /aria-expanded/);
  assert.match(script, /Escape/);
  assert.match(script, /pointerdown/);
  assert.match(script, /matchMedia\("\(max-width: 820px\)"\)/);
  assert.match(script, /ScrollTrigger/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test --test-name-pattern="progressive enhancement" tests/portfolio.test.mjs`

Expected: FAIL because `script.js` is empty.

- [ ] **Step 3: Implement contained mobile navigation**

```js
const menuButton = document.querySelector(".menu-toggle");
const menu = document.querySelector("#site-menu");
const mobileMenu = matchMedia("(max-width: 820px)");
function setMenu(open, returnFocus = false) {
  if (!menuButton || !menu) return;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menu.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  if (returnFocus) menuButton.focus();
}
menuButton?.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
menu?.addEventListener("click", event => { if (event.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape") setMenu(false, true); });
document.addEventListener("pointerdown", event => {
  if (menu?.classList.contains("is-open") && !event.target.closest(".nav")) setMenu(false);
});
mobileMenu.addEventListener("change", event => { if (!event.matches) setMenu(false); });
```

- [ ] **Step 4: Implement one-open-at-a-time FAQ behavior**

```js
function setFaq(activeDetails) {
  if (!activeDetails.open) return;
  document.querySelectorAll(".faq-item").forEach(item => {
    if (item !== activeDetails) item.open = false;
  });
}
document.querySelectorAll(".faq-item").forEach(details => details.addEventListener("toggle", () => setFaq(details)));
```

- [ ] **Step 5: Implement back-to-top and restrained GSAP motion**

```js
document.querySelector("[data-back-to-top]")?.addEventListener("click", event => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});

function initMotion() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  if (!window.gsap || !window.ScrollTrigger || reduced) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray(".reveal").forEach(element => gsap.from(element, { y: 40, opacity: 0, duration: .8, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 84%", once: true } }));
  gsap.utils.toArray(".project-media img,.photo-slot").forEach(element => gsap.fromTo(element, { scale: .94 }, { scale: 1, ease: "none", scrollTrigger: { trigger: element, start: "top bottom", end: "bottom top", scrub: .5 } }));
}
initMotion();
```

- [ ] **Step 6: Run syntax and unit checks**

Run: `npm run check`

Expected: PASS with valid JavaScript and all structure tests green.

- [ ] **Step 7: Commit interaction behavior**

```bash
git add script.js tests/portfolio.test.mjs
git commit -m "feat: add accessible portfolio interactions and motion"
```

---

### Task 7: Complete responsive rules and browser verification

**Files:**
- Modify: `styles.css`
- Create: `tests/browser-check.mjs`
- Create: `.tmp/desktop.png`
- Create: `.tmp/tablet.png`
- Create: `.tmp/mobile.png`

**Interfaces:**
- Consumes: every production selector and interaction from Tasks 2–6.
- Produces: final verified desktop, tablet, and mobile local outcomes.

- [ ] **Step 1: Add responsive CSS rules**

At `1100px`, reduce hero/map density and stack project-card media above copy. At `820px`, switch the navigation to the menu button, convert journey/process rails to vertical timelines, stack About/FAQ/Good Fit, and make actions wrap. At `620px`, use 20px page gutters, one project/service/photo column, minimum 44px buttons, and a hero title no larger than 52px.

```css
@media(max-width:1100px){.hero-grid{grid-template-columns:minmax(0,1fr) minmax(430px,.8fr)}.project-card{grid-template-columns:1fr}.project-media{min-height:280px}}
@media(max-width:820px){:root{--shell:min(100% - 40px,720px)}.nav{flex-wrap:wrap}.nav-links{width:100%;flex-wrap:wrap}.js .menu-toggle{display:grid;margin-left:auto}.js .nav-links{display:none}.js .nav-links.is-open{display:grid;position:absolute;top:68px;left:0;right:0;padding:22px;border:1px solid #666;border-radius:22px;background:var(--ink)}.hero-grid,.about-grid,.fit-grid,.faq-grid{grid-template-columns:1fr}.journey,.process-rail{grid-template-columns:1fr}.project-grid{grid-template-columns:1fr}.photo-grid{grid-template-columns:1fr}.hero h1{font-size:clamp(44px,9vw,66px)}}
@media(max-width:620px){:root{--shell:calc(100% - 40px)}.hero{padding-top:118px}.hero h1{font-size:clamp(40px,12vw,52px)}.actions{display:grid}.button{width:100%;min-height:48px}.nav-links a,.service-link,.site-footer a,[data-back-to-top]{min-height:44px;display:flex;align-items:center}.services-primary,.services-secondary,.footer-grid{grid-template-columns:1fr}.hero-system{min-height:600px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
```

- [ ] **Step 2: Create a real browser check**

Use Playwright from the shared workspace installation only for verification. `tests/browser-check.mjs` owns its local server lifecycle, checks three viewports, exercises the required interactions, writes screenshots, and fails on any regression:

```js
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
const require = createRequire(join(process.cwd(), "..", "Elysha Works Growth CRM", "package.json"));
const { chromium } = require("@playwright/test");
const root = process.cwd();
const types = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".png":"image/png", ".jpg":"image/jpeg", ".woff2":"font/woff2" };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = resolve(root, requested);
    if (!file.startsWith(root)) throw new Error("invalid path");
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});
await mkdir(join(root, ".tmp"), { recursive: true });
await new Promise((resolveReady, rejectReady) => {
  server.once("error", rejectReady);
  server.listen(0, "127.0.0.1", resolveReady);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("server did not expose a TCP port");
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const [name,width,height] of [["desktop",1440,1000],["tablet",820,1180],["mobile",390,844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: name === "mobile" ? "reduce" : "no-preference" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    const metrics = await page.evaluate(() => {
      const heading = document.querySelector("#hero-title");
      const style = getComputedStyle(heading);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        heroLines: heading.getBoundingClientRect().height / parseFloat(style.lineHeight),
        projectTops: [...document.querySelectorAll(".project-card")].map(card => Math.round(card.getBoundingClientRect().top)),
        projectHeights: [...document.querySelectorAll(".project-card")].map(card => Math.round(card.getBoundingClientRect().height)),
        motion: document.documentElement.dataset.motion
      };
    });
    if (metrics.scrollWidth > metrics.clientWidth + 1) throw new Error(`${name} overflows by ${metrics.scrollWidth - metrics.clientWidth}px`);
    if (metrics.heroLines > (name === "desktop" ? 2.2 : 3.2)) throw new Error(`${name} hero wraps to ${metrics.heroLines.toFixed(1)} lines`);
    if (name === "desktop") {
      for (const [left,right] of [[0,1],[2,3]]) {
        if (Math.abs(metrics.projectTops[left] - metrics.projectTops[right]) > 1 || Math.abs(metrics.projectHeights[left] - metrics.projectHeights[right]) > 1) throw new Error(`desktop project row ${left / 2 + 1} is uneven`);
      }
      await page.locator(".nav-links a[href='#work']").click();
      if (await page.evaluate(() => Math.abs(document.querySelector("#work").getBoundingClientRect().top) > 140)) throw new Error("navigation anchor did not reach Selected Work");
    }
    if (name === "mobile") {
      if (metrics.motion !== "reduced") throw new Error("reduced motion was not respected");
      const menuButton = page.locator(".menu-toggle");
      await menuButton.click();
      if (await menuButton.getAttribute("aria-expanded") !== "true") throw new Error("mobile menu did not open");
      if (await menuButton.getAttribute("aria-label") !== "Close menu") throw new Error("mobile menu label did not update");
      await page.keyboard.press("Escape");
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("Escape did not close the menu");
      if (await menuButton.getAttribute("aria-label") !== "Open menu") throw new Error("mobile menu label did not reset");
      await menuButton.click();
      await page.locator("main").click({ position: { x: 10, y: 10 } });
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("outside click did not close the menu");
      await menuButton.click();
      await page.setViewportSize({ width: 900, height: 844 });
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("desktop breakpoint did not reset the menu");
      await page.setViewportSize({ width: 390, height: 844 });
      await menuButton.click();
      await page.locator("#site-menu a[href='#work']").click();
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("menu link did not close the menu");
      await page.locator(".faq-item").first().locator("summary").click();
      if (!(await page.locator(".faq-item").first().evaluate(details => details.open))) throw new Error("FAQ did not open");
      await page.locator(".faq-item").nth(1).locator("summary").click();
      if (await page.locator(".faq-item").first().evaluate(details => details.open)) throw new Error("FAQ did not close the previous item");
      const mailto = await page.locator("a.button[href^='mailto:']").first().getAttribute("href");
      if (!mailto?.includes("support@elyshaworks.com")) throw new Error("inquiry link is incorrect");
      if (await page.locator(".project-link").first().getAttribute("href") !== "#contact") throw new Error("project action is incorrect");
      await page.locator(".project-link").first().focus();
      if (await page.locator(".project-link").first().evaluate(link => getComputedStyle(link).outlineStyle === "none")) throw new Error("project action has no visible keyboard focus");
      await page.keyboard.press("Enter");
      if (await page.evaluate(() => Math.abs(document.querySelector("#contact").getBoundingClientRect().top) > 140)) throw new Error("project keyboard action did not reach the final CTA");
      const shortTargets = await page.locator("a,button,summary").evaluateAll(elements => elements.filter(element => element.getClientRects().length && element.getBoundingClientRect().height < 44).length);
      if (shortTargets) throw new Error(`${shortTargets} mobile controls are shorter than 44px`);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.locator("[data-back-to-top]").click();
      await page.waitForTimeout(100);
      if (await page.evaluate(() => scrollY) > 2) throw new Error("Back to top failed");
    }
    if (errors.length) throw new Error(`${name}: ${errors.join("; ")}`);
    await page.screenshot({ path: `.tmp/${name}.png`, fullPage: true });
    await context.close();
  }
  const noJsContext = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(origin, { waitUntil: "networkidle" });
  if (!(await noJsPage.locator("#site-menu").isVisible())) throw new Error("navigation is hidden without JavaScript");
  await noJsPage.locator(".faq-item summary").first().click();
  if (!(await noJsPage.locator(".faq-item").first().evaluate(details => details.open))) throw new Error("FAQ is unusable without JavaScript");
  await noJsContext.close();
} finally {
  await browser?.close();
  await new Promise(resolveClosed => server.close(resolveClosed));
}
```

- [ ] **Step 3: Run the self-contained browser check**

Run: `node tests/browser-check.mjs`

Expected: exit code 0, the server closes automatically, and three screenshots appear in `.tmp`.

- [ ] **Step 4: Inspect the actual screenshots**

Verify:

- Desktop hero title stays within two lines and the right-side portrait/map remains contained.
- Every desktop two-column project row has equal card heights.
- Tablet menu button and stacked sections have no overlap.
- Mobile has one readable column, complete portraits, 44px actions, and no horizontal scroll.
- Process photo slots are intentional and do not imply real client photos.
- Navigation and footer match the existing portfolio direction without importing its cinematic behavior.

- [ ] **Step 5: Run the final checks**

Run: `npm run check`

Expected: PASS.

Run: `git status --short`

Expected before Task 7's commit: only the responsive stylesheet and browser-check script are pending; `.tmp` is ignored. After Step 6 commits those files, `git status --short` must be empty.

- [ ] **Step 6: Commit responsive completion**

```bash
git add styles.css tests/browser-check.mjs
git commit -m "feat: finish responsive service professionals portfolio"
```

- [ ] **Step 7: Verify isolation from the existing portfolio**

Run:

```powershell
Test-Path -LiteralPath 'firebase.json'
Test-Path -LiteralPath '.firebaserc'
npm test
git status --short
```

Expected: both `Test-Path` commands return `False`; the manifest-backed test proves every scoped existing portfolio production file is byte-for-byte unchanged; the new repository is clean. Do not run a Firebase command.
