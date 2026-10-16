# Gates: Meghan manual proposal design

Scope: Define and review the reusable manual-proposal design before implementation.

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
