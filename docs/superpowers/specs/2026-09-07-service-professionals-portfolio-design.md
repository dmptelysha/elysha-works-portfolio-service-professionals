# Elysha Works Service Professionals Portfolio Design

## Purpose and isolation

Build a new standalone portfolio for Elysha Works focused exclusively on service professionals. The project lives at `C:\Users\eeelay\Documents\Elysha Works\Elysha Works Portfolio Service Professionals` and does not modify, copy over, publish, or replace the existing `Elysha Works Portfolio` project or the live `elyshaworks.com` site.

The existing portfolio is a read-only reference for two elements only: its floating navigation treatment and its editorial footer structure. The new page receives its own HTML, CSS, JavaScript, images, font file, and local animation dependency.

## Audience and message

The page speaks to service professionals who need a clearer path from first visit to inquiry, booked appointment, follow-up, and organized client management. It presents Elysha as a funnel strategist, web designer, and automation builder who combines strategy, design, and systems.

Primary promise: websites and client systems built to turn interest into action.

Primary action: `Tell Me About Your Project`.

Secondary action: `View Selected Work` or a section-specific equivalent.

Until a discovery-call URL is supplied, inquiry actions open an email to `support@elyshaworks.com` with a useful subject line. Navigation links remain in-page anchors.

## Visual direction

- Typeface: local Manrope only, with a restrained editorial weight hierarchy.
- Palette: ink black, warm white, white, graphite, soft gray, and gray borders. No yellow, orange, or unrelated accent colors.
- Layout: wide editorial compositions, clear rules, generous vertical spacing, and large headings that remain within two or three lines.
- Surfaces: flat and monochrome with restrained contrast; no gradients, glass effects, or decorative color fills.
- Imagery: the supplied Elysha portrait assets are the only personal portraits used. Collaboration-photo areas remain intentionally reserved until authentic, permission-cleared photos are supplied.
- Icons: simple monochrome line icons from one consistent family.
- Motion: subtle GSAP scroll reveals and image scaling, plus CSS hover transitions. All motion respects `prefers-reduced-motion`.

## Page architecture

The site is a single responsive page with ten sections in this order:

1. Hero
2. How I Help
3. Selected Work
4. Process
5. About Me
6. Is This a Good Fit?
7. Services & Investment
8. FAQ
9. Final CTA
10. Footer

The page follows a clear attention-to-action flow: the hero states the offer, How I Help explains the system, Selected Work and Process establish credibility, About and Good Fit establish trust, Services and FAQ reduce uncertainty, and the final CTA asks for an inquiry.

## Navigation

The navigation adapts the approved floating pill treatment from the existing portfolio:

- Left: `< Elysha Works />` wordmark treatment.
- Desktop links: Work, Services, Process, About, FAQ.
- Primary action: Start a Project.
- Tablet and mobile: compact wordmark and contained menu button; opening the menu reveals the same links in a monochrome panel.
- The navigation stays visible and does not inherit the existing portfolio's cinematic hero hide/show logic.

## Hero

The hero uses an editorial split composition. The left side contains the service-professional eyebrow, a two-line maximum headline, supporting copy, two actions, and the local/international availability note. The right side uses the supplied transparent portrait cutout inside a monochrome system map that shows Attract, Capture, Book, Follow Up, and Manage.

The system map uses thin rules and simple interface fragments. It remains secondary to the headline and portrait. On mobile it becomes a compact vertical diagram below the copy without overlapping the portrait or viewport edges.

## How I Help

This section explains one connected journey in five steps:

1. Website & Landing Page
2. Lead Capture Funnel
3. Online Booking
4. Automated Follow-Up
5. CRM Automation

Desktop uses a horizontal connected rail with equal columns. Tablet and mobile use a vertical timeline. Each step includes one line icon, a clear name, and a concise outcome statement.

## Selected Work

Selected Work uses a two-column grid with four project containers:

- La Jaysiedel Cakes — paid e-commerce website
- Elysha Works Client Portal — internal custom app
- Elysha Works Growth CRM — internal CRM system
- Teacher Elysha — self-directed case study

Each card contains a project image, category, name, project type, a one-sentence goal, three restrained tags, and a clear arrow action. Desktop cards form a complete two-by-two grid with equal heights and no empty cells. Mobile uses one card per row. Cards have an understated image scale and border response on hover and keyboard focus.

## Process

The Process section presents four phases: Discover, Plan, Build, and Launch & Support. A connected horizontal rail is used on desktop and a vertical sequence on mobile.

Three large collaboration-photo frames sit below the phases for Discovery conversation, Journey planning, and Review and approvals. Until authentic photos are supplied, each frame uses a deliberate monochrome placeholder with the exact intended photo label. No stock person or fabricated client interaction is shown.

## About Me

About uses the supplied full portrait as a tall editorial image and the transparent cutout as a responsive fallback where it produces a cleaner crop. Copy explains Elysha's Computer Science and graphic design background and the combination of strategy, design, development, and automation.

Three capability rows cover Strategy, Design & Development, and Automation. The section ends with primary inquiry and selected-work actions.

## Is This a Good Fit?

A large left-side prompt, `Does this sound familiar?`, balances a right-side checklist. The checklist covers unclear offers, manual inquiries and scheduling, disconnected tools, inconsistent lead follow-up, and improving an existing client journey. The section ends with the international remote-collaboration note and an inquiry action.

## Services & Investment

Five offers are shown without colored accents:

- Websites & Landing Pages — starting at $1,500
- Lead & Booking Funnels — starting at $1,500
- Follow-Up & CRM Automation — starting at $1,000
- Custom Web Applications — custom quotation
- Focused Support — $30/hour

The first three offers form a balanced desktop row. Custom applications and focused support form a secondary row. Each service lists three concise inclusions where applicable and has an inquiry link. A note explains that final investment depends on scope, content, integrations, and support.

## FAQ

The FAQ uses a split layout with a large introductory heading and an accessible accordion. Questions cover business fit, international work, project timeline, content readiness, improving existing systems, supported platforms, and post-launch support.

Accordion buttons expose `aria-expanded` and connect to labelled answer panels. Only one answer needs to be open at a time. Keyboard and reduced-motion behavior remain usable.

## Final CTA

The final CTA is an ink-black full-width section with warm-white text. It asks whether the visitor is ready to make the client journey clearer and provides one primary inquiry action plus a secondary link to Selected Work. A simple monochrome path illustration connects Inquiry to Booked.

## Footer

The footer adapts the existing portfolio's editorial hierarchy and information architecture:

- Large invitation and `support@elyshaworks.com` contact line.
- Elysha Works identity and positioning statement.
- Navigation, Services, Contact, and Policies columns.
- Privacy Policy, Terms of Service, and AI Usage Policy links point to the current Elysha Works policy pages until dedicated copies are added to this local project.
- Copyright line and Back to top control.

The footer keeps the existing portfolio's dark editorial treatment rather than the light footer shown in the generated reference.

## Responsive behavior

- Desktop: wide containers, two-column hero and work grid, horizontal journey/process rails.
- Tablet: reduced type scale, simplified diagram, two-column work grid where space permits, and stacked content groups.
- Mobile: single-column flow, contained navigation drawer, portrait below hero copy, vertical timelines, one project card per row, full-width actions, and comfortable body text.
- The document prevents horizontal overflow at every breakpoint.

## Accessibility and resilience

- Semantic landmarks and heading order.
- Visible focus states with full-perimeter outlines.
- Minimum 44px interactive targets on touch layouts.
- Sufficient monochrome contrast.
- Descriptive image alternative text; decorative diagrams are hidden from assistive technology.
- Menu, FAQ, and back-to-top behavior work without a framework.
- Content remains readable when JavaScript is unavailable; JavaScript enhances motion and disclosure only.

## File structure

```text
Elysha Works Portfolio Service Professionals/
  index.html
  styles.css
  script.js
  assets/
    elysha-portrait-full.png
    elysha-portrait-cutout.png
    manrope-ew.woff2
    vendor/
      gsap.min.js
      ScrollTrigger.min.js
    projects/
      la-jaysiedel-cakes.png
      client-portal.png
      growth-crm.png
      teacher-elysha.png
  docs/superpowers/specs/
    2026-09-07-service-professionals-portfolio-design.md
```

The project intentionally has no Firebase configuration. It remains local until the user explicitly selects a hosting target and requests deployment.

## Verification

- Validate HTML semantics and JavaScript syntax.
- Run local browser checks at desktop, tablet, and mobile widths.
- Confirm the existing portfolio files and Firebase configuration are unchanged.
- Check navigation, menu, FAQ, inquiry links, project anchors, and back-to-top behavior.
- Capture actual desktop and mobile screenshots from the running local site for review.
- Check for horizontal overflow, portrait cropping, section overlap, focus visibility, and reduced-motion behavior.
