# Live Firebase Copy Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the current live Elysha Works portfolio in this repository while retaining the existing Next.js, Tailwind CSS, TypeScript, documentation, Git, and GitHub setup.

**Architecture:** The homepage becomes an App Router page rendered by React/TypeScript. The live snapshot's visual assets, fonts, animation scripts, booking flow, project previews, thank-you page, and legal pages move into `public` so their existing URLs and behavior remain intact. Existing authored CSS is retained for visual fidelity and loaded alongside Tailwind; quiz and lead-qualifier work is explicitly deferred.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Firebase Hosting static export, existing vanilla JavaScript/CSS for live animation and auxiliary routes.

**Spec:** `C:\Users\eeelay\Documents\Elysha Works\Elysha Works Portfolio - Live Firebase Copy` plus the user's 2026-09-21 migration request. `docs/portfolio-blueprint.md` is preserved but not implemented in this plan.

## Global Constraints

- Preserve `docs/**`, `.git/**`, the configured GitHub `origin`, and the current Next.js/Tailwind/TypeScript configuration.
- Do not modify the source snapshot folder.
- Do not add the quiz, lead qualifier, blueprint result screen, Supabase, or new portfolio copy.
- Preserve the live snapshot's design, content, links, animations, responsive behavior, booking flow, legal pages, and project previews.
- Keep Firebase Hosting compatible with `next build` static output.
- Do not commit or push unless the user requests it.

## Review Focus

- Root-relative and directory-relative asset URLs must work from `/`, `/booking/`, `/thank-you/`, legal pages, and project-preview routes.
- Existing deferred scripts must initialize after the React-rendered homepage DOM exists.
- Navigation, modal project viewer, chat panel, booking links, and reduced-motion behavior must remain functional.
- Desktop and mobile layouts must visually match the source snapshot without overflow or overlapping text.
- The migration must not import quiz UI or overwrite `docs/portfolio-blueprint.md`.

---

### Task 1: Import the Live Snapshot Assets and Auxiliary Routes

**Files:**
- Create: `public/assets/**`
- Create: `public/booking/**`
- Create: `public/thank-you/**`
- Create: `public/ai-usage-policy/**`
- Create: `public/elysha-works-privacy-policy/**`
- Create: `public/elysha-works-terms-of-service/**`
- Create: `public/ai-usage-policy.html`
- Create: `public/elysha-works-privacy-policy.html`
- Create: `public/elysha-works-terms-of-service.html`
- Test: `tests/live-copy.test.mjs`

**Interfaces:**
- Consumes: Files from the read-only live snapshot path.
- Produces: Stable public URLs used by the migrated homepage and existing static flows.

- [ ] **Step 1: Add a failing asset manifest test**

Create `tests/live-copy.test.mjs` to assert that representative assets and every auxiliary route entry point exist under `public`, including fonts, hero images, project preview HTML, booking HTML/modules, thank-you HTML/modules, and legal pages.

- [ ] **Step 2: Run the asset test and verify it fails**

Run: `node --test tests/live-copy.test.mjs`

Expected: FAIL because `public` does not yet contain the live snapshot.

- [ ] **Step 3: Copy the snapshot's assets and auxiliary routes**

Copy only `assets`, `booking`, `thank-you`, the three clean-URL legal directories, and the three top-level legal HTML files into `public`. Do not copy the snapshot's root `index.html`, `site.css`, `scroll-scenes.css`, or `site.js` in this step.

- [ ] **Step 4: Run the asset test and verify it passes**

Run: `node --test tests/live-copy.test.mjs`

Expected: PASS with all expected public routes and assets present.

### Task 2: Port the Live Homepage into Next.js

**Files:**
- Create: `src/app/live-portfolio.tsx`
- Create: `src/app/live-portfolio.client.tsx`
- Create: `public/site.js`
- Create: `public/site.css`
- Create: `public/scroll-scenes.css`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/live-copy.test.mjs`

**Interfaces:**
- Consumes: Public URLs produced by Task 1 and homepage markup/styles/scripts from the live snapshot.
- Produces: `LivePortfolio` React component and a statically rendered `/` route matching the live portfolio.

- [ ] **Step 1: Add failing homepage structure assertions**

Extend `tests/live-copy.test.mjs` to assert that the TSX source contains the live hero headline, the `problem`, `journey`, `work`, `services`, `process`, `about`, `faq`, and `contact` sections, and contains no quiz or lead-qualifier component.

- [ ] **Step 2: Run the homepage test and verify it fails**

Run: `node --test tests/live-copy.test.mjs`

Expected: FAIL because the current Next.js page is only the setup placeholder.

- [ ] **Step 3: Convert the live HTML body to typed JSX**

Implement the snapshot's semantic header, main sections, project viewer dialog, chat panel, and footer in `src/app/live-portfolio.tsx`. Convert HTML attributes to React equivalents (`className`, `tabIndex`, `htmlFor`, camel-cased SVG attributes), preserve data attributes and accessible labels, and keep all asset and route URLs rooted at `/`.

- [ ] **Step 4: Restore live client behavior after hydration**

Use `src/app/live-portfolio.client.tsx` and `next/script` to load `/assets/vendor/scrollcraft/scrollcraft.js`, `/site.js`, `/assets/v3-project-viewer.js`, `/assets/rhea-chat.mjs`, and `/assets/v3-content-guard.js` after the homepage DOM is interactive. Keep scripts single-loaded and preserve reduced-motion behavior.

- [ ] **Step 5: Restore the exact live visual layer**

Copy `site.css`, `scroll-scenes.css`, and `site.js` into `public`; import their styles from the root layout with stable `<link>` elements. Retain `@import "tailwindcss"` in `globals.css`, remove only placeholder-specific page styling, and use the live font CSS and metadata/favicon values.

- [ ] **Step 6: Run the homepage test and static checks**

Run: `node --test tests/live-copy.test.mjs`, `npm run lint`, and `npm run typecheck`.

Expected: All commands exit `0`.

### Task 3: Preserve Firebase Static Export and Verify Both Viewports

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc` only if the verified live Firebase project ID is available from the existing local Firebase project.
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `tests/live-copy.test.mjs`

**Interfaces:**
- Consumes: The statically rendered Next.js homepage and imported public routes.
- Produces: A deployable `out` directory and local preview commands for the migrated portfolio.

- [ ] **Step 1: Add a build-output test**

Extend `tests/live-copy.test.mjs` to verify after build that `out/index.html`, booking, thank-you, legal, and project-preview entry points exist and reference their required assets.

- [ ] **Step 2: Configure Firebase Hosting for the Next.js export**

Set Firebase Hosting `public` to `out`, preserve clean URLs, trailing slashes, cache and security headers from the existing Firebase configuration where applicable, and add package scripts for `preview` and `firebase:serve` without changing the deploy target.

- [ ] **Step 3: Build and run the output test**

Run: `npm run build` followed by `node --test tests/live-copy.test.mjs`.

Expected: Both commands exit `0`, with the complete site emitted under `out`.

- [ ] **Step 4: Run local browser verification**

Start the Next.js dev server and inspect `/` at desktop and mobile widths. Verify the hero is visible, images load, navigation works, project viewer opens and closes, FAQ controls work, chat opens, booking links reach `/booking/`, and no content overlaps.

- [ ] **Step 5: Run Firebase emulator verification**

Start Firebase Hosting against `out` on a separate port and verify `/`, `/booking/`, `/thank-you/`, all legal routes, and representative project-preview routes return HTTP `200`.

- [ ] **Step 6: Review scope and Git changes**

Run `git status --short`, confirm `docs/portfolio-blueprint.md` is unchanged, confirm no quiz-related source was added, and report any unrelated pre-existing working-tree changes without reverting them.

