# Elysha Works Homepage and Local Quiz Design

**Date:** 2026-09-22  
**Status:** Approved design; implementation not started  
**Authoritative business rules:** `docs/portfolio-blueprint.md`

## Objective

Replace the legacy injected homepage implementation with a maintainable custom React build, preserve the already approved hero, design every remaining homepage section, and add a complete no-reload quiz journey with a deterministic local Cortex calculation.

This phase does not connect the frontend to Supabase or any other database. It does not modify Firebase Hosting, Firebase projects, Firestore, deployment targets, booking infrastructure, legal pages, or protected project-preview assets.

## Approved scope

The homepage contains exactly these seven content sections:

1. Existing Hero
2. Projects
3. Founder / About Elysha
4. Testimonial
5. FAQ
6. Final CTA
7. Footer

The audience selector is not inserted into the homepage. Clicking **Get My Personalized Roadmap** opens `/quiz`, where the audience selection and complete assessment occur.

## Architecture decision

Use a progressive React componentization approach:

- Preserve the approved hero's hierarchy and visual behavior while moving the homepage away from `dangerouslySetInnerHTML` and legacy DOM-selector orchestration.
- Build every homepage section as a focused typed React component.
- Build `/quiz` as a client-rendered React flow controlled by a reducer/state machine.
- Keep quiz definitions, catalog data, Cortex calculations, local persistence, and UI rendering in separate modules.
- Keep the Cortex pure and deterministic so it can be tested without rendering React.
- Keep the local configuration shaped for a later Supabase adapter, but include no Supabase client import or database request in this phase.

The rejected hybrid approach would leave the homepage coupled to legacy HTML and scripts. The rejected monolithic approach would mix page content, interaction state, scoring, and pricing in a single component. Both would make the quiz harder to test and maintain.

## Homepage design

### Existing hero

The existing hero is the visual source of truth. Preserve:

- Inter typography
- black atmospheric background
- white primary text
- `#FFD369` gold accent
- restrained glow and fine dividers
- current responsive typography and spacing behavior
- four benefit items
- primary and secondary assessment actions

Both assessment actions navigate to `/quiz`.

### Contextual sticky navbar

Do not display a navbar over the hero. Reveal it when the Projects section reaches the top of the viewport, keep it sticky through the rest of the homepage, and hide it when the user scrolls back into the hero.

Desktop content:

- Elysha Works logo on the left
- Projects, About, and FAQ navigation on the right
- gold **Get My Roadmap** CTA linking to `/quiz`
- active-section state

The bar uses a compact dark translucent surface and a restrained gold-tinted divider. On mobile, show the logo, roadmap CTA, and an accessible menu button. The quiz has a simpler always-visible header with the logo and **Back to portfolio**.

### Projects

Use only the four verified repository projects and their real preview assets. Present two larger featured projects followed by two supporting projects to avoid a repetitive generic card grid. Each presentation includes only verified project name, status, audience/business type, problem, solution, tools, and honest outcome or intended improvement. Do not invent metrics.

Retain access to the existing protected project previews through an accessible viewer or equivalent React integration without changing the underlying protected assets.

### Founder / About

Use an editorial split composition with Elysha's existing portrait, a gold eyebrow, large white heading, blueprint-approved copy, and a strategy-call action. Maintain the hero's typography and palette rather than introducing a second unrelated style.

### Testimonial

Render a complete testimonial-style layout using the approved placeholder statement: **Client testimonial will be added after review and approval.** Do not display a fabricated quotation, person, business, attribution, or outcome. The layout must be ready to receive one approved testimonial later without redesign.

### FAQ

Use the eight blueprint questions in an accessible accordion. Support keyboard operation, visible focus, semantic `button`/region relationships or native disclosure behavior, and clear expanded states. One-at-a-time expansion is preferred for reading focus.

### Final CTA and footer

The final CTA echoes the hero's gold atmosphere without copying the full hero. It uses a concise roadmap message, one dominant `/quiz` action, and an optional strategy-call secondary action.

The footer contains the Elysha Works identity, positioning, verified navigation/social URLs only, and the existing Privacy and Terms links. Missing social URLs are omitted rather than represented by dead links.

## Quiz design

### Route and screens

The `/quiz` journey contains:

1. Audience selection
2. Brief instructions
3. Eight one-question screens
4. Calculation transition
5. Complete personalized result
6. Audience-relevant projects
7. Strategy-call CTA
8. Footer

### Interaction

- All transitions occur in React without document reloads.
- Single-select questions may advance after a deliberate selection animation; users can always go Back.
- Multi-select questions require an explicit Continue action.
- Back preserves existing answers.
- A progress indicator shows `Question X of 8` and a visual progress line.
- Answer controls expose idle, hover, focus, selected, disabled, and validation states.
- Result display requires no name, email, or phone number.
- Reduced-motion preferences disable nonessential movement.

### Local persistence

Save after every completed answer in a versioned local-storage envelope containing:

- storage schema version
- Cortex version
- question-set version
- catalog version
- audience key
- current step
- answers
- creation timestamp
- last-activity timestamp
- 30-day expiration timestamp
- completion state
- result snapshot after calculation

An unfinished valid record produces Resume Quiz, Start Over, and Not Now actions. Expired, corrupt, or version-incompatible state is ignored safely. Start Over removes only the quiz record controlled by this application. Clearing browser storage or changing devices prevents recovery, as stated in the blueprint.

## Cortex and pricing

Use `cortex-local-v0.1` exactly as documented in Sections 6.8–6.13 of `docs/portfolio-blueprint.md`.

Key requirements:

- stable option keys and explicit signal tags
- `0–3` integer vectors
- per-question dimension caps
- minimum qualifying score of `4`
- supporting components within two points of the primary result
- ordered Website/Funnel and CRM/Automation tie-breakers
- genuine custom-operation signal before the custom route can win
- explicit critical-custom guardrails
- package thresholds based on raw complexity and capability requirements
- Q6 readiness does not change package scope
- Q7 preference cannot override feasibility
- package inclusion resolution before add-on pricing
- `adjustment_total_usd = 0` in this version
- explanation trace for every recommendation

The seven package records and approved add-ons mirror the existing version-controlled seed data. They are local read-only configuration in this phase and must not be duplicated across UI components.

## Result composition

The result displays:

1. Business Snapshot
2. Growth Blocker diagnosis
3. Primary Recommended Solution
4. Supporting Components
5. Recommended Build Route and Platform
6. Recommended Base Offer
7. Included Capabilities
8. Selected Support
9. Priced Add-ons
10. Scope-review Items
11. Itemized Estimated Project Investment
12. Separate Recurring-cost Notice
13. Why This Fits
14. Suggested Next Phase
15. Relevant Projects
16. Book a Strategy Call

The result is an estimate, not a binding quotation. The exact versioned result is saved locally so later scoring or catalog changes do not reinterpret a completed assessment.

## Accessibility and responsive behavior

- Use semantic landmarks and heading order.
- Ensure all interactive elements are keyboard reachable.
- Maintain visible `:focus-visible` states using the gold accent.
- Announce progress, validation errors, and completed calculation using appropriate live regions.
- Preserve readable line lengths and at least 44px mobile tap targets.
- Test intentional layouts at 320, 360, 375, 390, 430, 768, 834, 1024, 1366, 1440, 1536, 1920, and 2560 pixel widths where relevant.
- Prevent horizontal scrolling at every supported breakpoint.
- Keep the hero visually stable while the following sections gain distinct but coherent responsive compositions.

## Visual-reference workflow

Before frontend implementation, generate and inspect separate section-specific visual references for Projects, Founder, Testimonial placeholder, FAQ, Final CTA/Footer, quiz question flow, and result view. The approved hero is not regenerated. Each reference must preserve the existing black, white, and gold brand world and be analyzed for typography, spacing, responsive intent, controls, and component structure before coding.

## Error handling

- Incomplete answers block calculation and identify the missing step.
- Invalid option keys are rejected by the Cortex boundary.
- Corrupt or incompatible saved state offers a clean restart.
- Calculation failure preserves answers and offers Retry or Start Over.
- Unknown catalog keys fail safely and are never silently priced at zero.
- The frontend performs no database or analytics writes in this phase.

## Testing strategy

### Pure Cortex tests

- every stable option key maps to approved signals
- score aggregation and per-question caps
- qualification threshold and supporting-solution rule
- route eligibility and platform tie-breaks
- all package bands and upward guardrails
- readiness independence
- add-on inclusion and no-double-charge behavior
- deterministic explanation trace and totals
- all ten acceptance personas in blueprint Section 6.13

### State and persistence tests

- answer, continue, back, and edit flows
- refresh and resume
- 30-day expiration
- version incompatibility and corrupt data
- restart isolation
- completed snapshot restoration

### Interface tests

- hero action opens `/quiz`
- question navigation does not reload the page
- single- and multi-select behavior
- focus management and keyboard controls
- validation and calculation failure states
- result section completeness
- contextual navbar appearance and disappearance
- homepage section anchors
- mobile and desktop overflow checks

### Boundary tests

- no Supabase client import in the quiz implementation
- no quiz network request
- no Firebase or Firestore configuration change
- existing booking, legal, and protected preview routes remain available

## Deferred work

- Supabase authentication and persistence
- database-backed quiz definitions and catalog reads
- analytics-event writes
- lead and booking RPC integration
- approved real testimonial copy
- production quiz-definition seed version
- cross-device quiz recovery

