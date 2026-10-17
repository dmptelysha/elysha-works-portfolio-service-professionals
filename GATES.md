# Gates: Meghan manual proposal implementation

Scope: Design, build, and locally verify the reusable manual-proposal flow before deployment.

Implementation scope: Build and locally verify the approved reusable manual-proposal flow in the isolated Meghan branch; do not deploy or issue a live code.

- [x] G1: A written spec exists on the Megan branch and records the agreed preview, access, offer, and CTA behavior.
  CHECK: rg -n "private preview|Basic, Advanced, and Complete|50%|Discovery Call|access key" docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md
  EXPECT: /50%/
  EVIDENCE: 45:`Book a Discovery Call` uses the existing `/booking/` route. A `Reserve My Slot` area displays the calculated 50% deposit but its payment control is disabled and explicitly says checkout is being c

- [x] G2: The spec makes browser capture limits and the unconnected payment state explicit.
  CHECK: rg -n "cannot prevent|payment provider|disabled" docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md
  EXPECT: /cannot prevent/
  EVIDENCE: 45:`Book a Discovery Call` uses the existing `/booking/` route. A `Reserve My Slot` area displays the calculated 50% deposit but its payment control is disabled and explicitly says checkout is being c

- [x] G3: Only design-stage files changed in the Megan worktree.
  CHECK: git show --pretty=format: --name-only c5fd1b5
  EXPECT: /docs\/superpowers\/specs\/2026-10-17-meghan-manual-proposals-design.md/
  EVIDENCE: GATES.md | docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md

- [x] G4: The spec has no placeholders or conflicting descriptions of what works before checkout is connected.
  EVIDENCE: Placeholder scan returned no matches; spec lines 7, 45, and 51 consistently describe the deposit control as unavailable until a provider is connected.

- [x] G5: The system generates Meghan's access code, shows it once to Elysha, and stores only its hash.
  CHECK: rg -n "cryptographically random|displays the share link and access code once|stores only a peppered hash" docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md
  EXPECT: /cryptographically random/
  EVIDENCE: Spec lines 19-20 require random code generation, one-time display, and hash-only storage.

- [x] G6: The implementation plan maps all required work to exact files and test cycles.
  CHECK: rg -n "^### Task [0-9]+:|^\*\*Files:\*\*|^\*\*Interfaces:\*\*|Write the failing test|Run.*FAIL|Run.*PASS" docs/superpowers/plans/2026-10-17-meghan-manual-proposal.md
  EXPECT: /Task 8:/
  EVIDENCE: 192:- [ ] **Step 2: Run `npx playwright test tests/e2e/manual-proposal.spec.ts` and `node --test tests/manual-proposal-export.test.mjs` -> FAIL** for the missing finished route/export. | 194:- [ ] **S

- [x] G7: The plan includes the approved access, preview, quote, booking, and disabled-checkout boundaries.
  CHECK: rg -n "12-character|private Storage|1440|768|390|50%|booking|disabled|no deployment" docs/superpowers/plans/2026-10-17-meghan-manual-proposal.md
  EXPECT: /12-character/
  EVIDENCE: Plan Global Constraints and Tasks 1-8 cover access, private captures, pricing, booking, and checkout state.

- [x] G8: The plan's interfaces and tests have been checked against the spec and contain no placeholders.
  EVIDENCE: Self-review matched the spec's draft template, currency, booking path, capture metadata, version cleanup, server-side future checkout, and browser limits; placeholder scan was clear.

- [x] G9: A private, hash-only, rate-limited manual proposal access path exists and is tested.
  EVIDENCE: Private SQL migration and service-only RPCs passed the new 27-assertion pgTAP file; Edge access tests 5/5 and all Edge tests 49/49 passed; static migration checks 21/21 passed.

- [x] G10: The offline Meghan design is captured read-only at three viewports, watermarked, and kept outside the public export.
  EVIDENCE: Current ignored .tmp/manual-proposals/meghan desktop/tablet/mobile PNGs and manifest were visually inspected; source hash 9a8f261aab529ec24d7f45b45995fe132cfb52b911cb1d4dcae4882e1d6985c9. Capture tests 3/3 and export absence test 2/2 passed; source directory remained untouched.

- [x] G11: Meghan's locked proposal route supports a separate code, in-page preview, offers, quote, and booking; checkout remains disabled.
  EVIDENCE: The QuizUp-themed inline preview sits above the offers, minimizes to a compact heading, and retains a full modal. Focused document tests 6/6 and local static-export browser tests 9 passed across four viewports after the revision. The static route stays locked without client data; the 50% reserve button remains disabled and booking links to /booking/.

- [x] G12: The reusable local authoring flow has a client-neutral template and supports draft, issue, rotate, revoke, and cleanup without a live issue.
  EVIDENCE: Authoring tests 9/9 passed, Meghan staged draft validates with three offers and captures, capture accepts a client-specific watermark, receipts hash image bytes, and docs/manual-proposal-operations.md records the CLI and review process. No live draft or code was issued.

- [x] G13: Unit, Edge, database/static, export, build, and browser checks have fresh evidence or documented environment limitations.
  EVIDENCE: Initial full unit 184/184, Edge 49/49, migration static 21/21, authoring/capture/export Node 14/14, static source tests 19/19, and new pgTAP migration 27/27 passed. After the UI revision, focused document unit 6/6, local static-export Playwright 9 with 3 viewport-independent skips across four viewports, export absence 2/2, typecheck, lint (0 errors, 4 image warnings), and production static build passed. The full historical database suite failed older QuizUp pgTAP files 01 and 03-06 under local Supabase CLI 2.121.0; that existing suite incompatibility is outside this branch's SQL changes and remains a limitation.

- [x] G14: Whole-branch review and clean working-tree handoff are complete.
  EVIDENCE: Independent code review issues were fixed in 2a91a75; reviewer confirmed ready for local handoff, and final advisor reported NO CHANGE. The subsequent QuizUp theme and preview-placement correction was self-reviewed, checked in the local browser, and verified with focused unit, export, and four-viewport browser tests. The final commit and remote branch sync complete the handoff.
