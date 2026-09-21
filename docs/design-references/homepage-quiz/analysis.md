# Homepage and quiz visual-reference analysis

These images are implementation references, not content sources. The blueprint and verified repository data remain authoritative. Generated microcopy, imagery, prices, dates, outcomes, and project links must not be copied unless the same value is approved in the blueprint or repository.

## Shared visual language

- Near-black canvas with localized, low-opacity warm-gold atmosphere at the edges.
- White Inter-led typography, `#FFD369` accents, fine gold-gray dividers, and restrained glow.
- Open editorial layouts instead of repeated floating cards or glass panels.
- Desktop content should use a fluid container around 86–92vw with a controlled 1440–1560px maximum; mobile content stacks in source order with 20–24px side padding.
- Primary actions use a solid gold surface, dark text, a centered label, and a right-aligned arrow. Hover lifts slightly without changing color.
- Focus indicators must remain visible in gold/white, controls must be at least 44px high, and motion must respect `prefers-reduced-motion`.

## `projects.webp`

- **Grid:** two large alternating featured rows followed by two quieter supporting records.
- **Hierarchy:** gold eyebrow, oversized white section title, then project name, status, problem/solution/outcome copy, stable tags, and preview action.
- **Spacing:** generous section padding; featured records use roughly a 55/45 media-to-copy split with gold hairline separation.
- **Image treatment:** large protected-preview imagery with dark edge treatment; supporting projects use smaller horizontal frames.
- **Controls:** preview actions are text-forward with arrow affordances; the production viewer must be an accessible modal with explicit close and focus return.
- **Mobile:** stack media before copy, keep status/tags wrapping naturally, and keep the preview action within the viewport.
- **Excluded:** generated project metrics, external links, or claims. Production uses only the four verified repository projects and allow-listed local previews.

## `founder.webp`

- **Grid:** editorial portrait/copy split, approximately 44/56, with the portrait acting as the visual anchor.
- **Hierarchy:** small gold eyebrow, large white founder heading, short readable paragraphs, and a compact principles list.
- **Spacing:** the portrait and copy have a wide central gutter; copy line length stays near 55–65 characters.
- **Image treatment:** use the verified Elysha portrait with a dark fade into the page, not a framed profile card.
- **Mobile:** portrait first, copy second, with the heading scaled via `clamp()`.
- **Excluded:** the generated slogan and any unapproved biography details. Production copy comes from `SITE_CONTENT` and the blueprint.

## `testimonial.webp`

- **Grid:** one full-width editorial statement with decorative quote marks and no client card.
- **Hierarchy:** small gold eyebrow followed by the exact approved placeholder: **Client testimonial will be added after review and approval.**
- **Spacing:** intentionally calm, with ample vertical breathing room between denser sections.
- **Border treatment:** one fine horizontal gold divider is enough; no boxed testimonial carousel.
- **Mobile:** retain the large quote gesture but reduce its visual footprint so it cannot force overflow.
- **Excluded:** client identity, attribution, role, rating, result, or performance claim.

## `faq.webp`

- **Grid:** fixed editorial introduction on the left and the accordion on the right at desktop; one column below tablet width.
- **Hierarchy:** gold eyebrow, strong white title, short intro, then numbered questions.
- **Spacing:** compact row rhythm with a larger open-answer gap; dividers span the question column.
- **Controls:** the full question row is a button, plus/minus is decorative, only one item is open, and `aria-expanded`/`aria-controls` are required.
- **Mobile:** intro precedes the accordion; question labels wrap without colliding with the disclosure icon.
- **Excluded:** the generated sample answer is not authoritative. Production answers use approved `SITE_CONTENT` copy.

## `final-cta-footer.webp`

- **Grid:** centered closing CTA above a thin divider; footer becomes a left identity block plus right navigation, with a final legal row.
- **Hierarchy:** gold eyebrow, two-line white/gold heading, short support copy, one dominant CTA, and a modest secondary booking action.
- **Spacing:** the CTA remains concise rather than repeating the full hero; footer density is lower and more utilitarian.
- **Controls:** primary CTA follows the hero button language; footer links are plain text with visible hover/focus states.
- **Mobile:** CTA button becomes full width; footer groups stack and legal links remain real routes rather than placeholders.
- **Excluded:** generated copyright year, social links, contact details, or unverified legal text.

## `quiz-question.webp`

- **Grid:** narrow focused question column inside a wider page, with a minimal top bar and no app sidebar.
- **Hierarchy:** quiz eyebrow, progress label/line, large question, short instruction, answer controls, navigation, and privacy reassurance.
- **Spacing:** answer rows are compact but at least 44px high; Back and Continue are visually separated.
- **Control states:** default, hover, keyboard focus, and selected states must be visibly distinct. Single-choice and multi-select use correct semantics.
- **Mobile:** top bar simplifies, question size reduces fluidly, answer rows wrap, and navigation buttons remain reachable without horizontal scrolling.
- **Excluded:** contact fields, database language, fake progress persistence claims, and any network-dependent behavior.

## `quiz-result.webp`

- **Grid:** a large narrative recommendation column with a narrower itemized investment rail; stack the rail after the recommendation on mobile.
- **Hierarchy:** roadmap eyebrow and recommendation headline first, then business snapshot, primary/platform/package decision, reasons, supporting solution, relevant projects, and the transparent price breakdown.
- **Spacing:** use open bordered groups and dividers, not nested card stacks. The total and booking CTA receive the strongest emphasis after the recommendation.
- **Data treatment:** Included, Priced add-ons, and Scope review are separate partitions; recurring third-party costs are disclosed separately.
- **Controls:** booking is primary and retake is secondary. The presentation reads only the immutable Cortex result snapshot.
- **Mobile:** retain source order, use tabular numerals for prices, avoid truncated labels, and allow the CTA to span the result width.
- **Excluded:** generated add-on values, project thumbnails, copy, and claims. The production result is calculated only from `cortex-local-v0.1`, the approved catalog, and verified projects.

## Content boundary verification

- The production testimonial is limited to the exact approved placeholder and has no attribution.
- Project implementation is limited to La Jaysiedel Cakes, Teacher Elysha, Client Portal, and Growth CRM, using repository assets and protected local previews only.
- No visual reference authorizes new packages, add-ons, prices, scores, quiz options, client identities, metrics, outcomes, or external URLs.
- The existing hero remains the source of truth for the page-wide typography, color, glow restraint, and CTA behavior.
