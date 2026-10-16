# Gates: Meghan manual proposal design

Scope: Define and review the reusable manual-proposal design before implementation.

- [x] G1: A written spec exists on the Megan branch and records the agreed preview, access, offer, and CTA behavior.
  CHECK: rg -n "private preview|Basic, Advanced, and Complete|50%|Discovery Call|access key" docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md
  EXPECT: /50%/
  EVIDENCE: 43:Exactly one of the three offers is selected at a time. The page shows what that offer includes, the base amount, priced optional inclusions if configured, the total, the 50% deposit, and the remain

- [x] G2: The spec makes browser capture limits and the unconnected payment state explicit.
  CHECK: rg -n "cannot prevent|payment provider|disabled" docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md
  EXPECT: /cannot prevent/
  EVIDENCE: 45:`Book a Discovery Call` uses the existing `/booking/` route. A `Reserve My Slot` area displays the calculated 50% deposit but its payment control is disabled and explicitly says checkout is being c

- [x] G3: Only design-stage files changed in the Megan worktree.
  CHECK: git status --short
  EXPECT: /docs\/superpowers\/specs\/2026-10-17-meghan-manual-proposals-design.md/
  EVIDENCE: ?? GATES.md | ?? docs/superpowers/specs/2026-10-17-meghan-manual-proposals-design.md

- [x] G4: The spec has no placeholders or conflicting descriptions of what works before checkout is connected.
  EVIDENCE: Placeholder scan returned no matches; spec lines 7, 45, and 51 consistently describe the deposit control as unavailable until a provider is connected.
