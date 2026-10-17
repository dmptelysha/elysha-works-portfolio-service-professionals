import { describe, expect, it } from "vitest";

import {
  calculateManualQuote,
  validateManualDraft,
  type ManualProposalDraft,
  type ManualProposalView,
} from "@/features/manual-proposal/model";

const draft = {
  clientName: "Meghan",
  businessName: "The Emotional Anchor",
  pointA: { heading: "Today", summary: "A concept in progress", evidence: ["Offline design"] },
  pointB: { heading: "Next", summary: "A clear online path", evidence: ["One focused page"] },
  recommendation: { title: "A considered launch", reason: "Confirm the scope together." },
  offers: [
    { key: "basic", label: "Basic", priceCents: 150000, included: ["Sales page"] },
    { key: "advanced", label: "Advanced", priceCents: 250000, included: ["Sales page", "Booking"] },
    { key: "complete", label: "Complete", priceCents: 400000, included: ["Sales page", "Booking", "Automation"] },
  ],
  inclusions: [{ key: "extra", label: "Extra", priceCents: 101 }],
  bookingPath: "/booking/",
  currency: "USD",
  expiresAt: "2026-12-01T00:00:00.000Z",
  captureManifestPath: ".tmp/manual-proposals/meghan/manifest.json",
} satisfies ManualProposalDraft;

const view: ManualProposalView = {
  ...draft,
  reference: "11111111-1111-4111-8111-111111111111",
  previewCapturedAt: "2026-10-17T00:00:00.000Z",
  previewSourceHash: "a".repeat(64),
};

describe("manual proposal model", () => {
  it("accepts exactly three distinct offers, safe booking, USD, and capture input", () => {
    expect(validateManualDraft(draft)).toEqual(draft);
  });

  it.each([
    ["missing tier", { ...draft, offers: draft.offers.slice(0, 2) }],
    ["duplicate tier", { ...draft, offers: [draft.offers[0], draft.offers[0], draft.offers[2]] }],
    ["negative cents", { ...draft, offers: [{ ...draft.offers[0], priceCents: -1 }, ...draft.offers.slice(1)] }],
    ["fractional cents", { ...draft, offers: [{ ...draft.offers[0], priceCents: 1.5 }, ...draft.offers.slice(1)] }],
    ["duplicate inclusion", { ...draft, inclusions: [draft.inclusions[0], draft.inclusions[0]] }],
    ["external booking", { ...draft, bookingPath: "https://other.example/booking" }],
    ["other currency", { ...draft, currency: "PHP" }],
    ["invalid expiry", { ...draft, expiresAt: "tomorrow" }],
    ["missing capture", { ...draft, captureManifestPath: "" }],
  ])("rejects %s", (_name, value) => {
    expect(() => validateManualDraft(value)).toThrow();
  });

  it("calculates an odd-cent deposit from the selected offer and additions", () => {
    expect(calculateManualQuote(view, "basic", ["extra"])).toEqual({
      baseCents: 150000,
      additionsCents: 101,
      totalCents: 150101,
      depositCents: 75051,
      balanceCents: 75050,
    });
  });

  it("rejects unknown and duplicate selections", () => {
    expect(() => calculateManualQuote(view, "unknown" as never, [])).toThrow();
    expect(() => calculateManualQuote(view, "basic", ["missing"])).toThrow();
    expect(() => calculateManualQuote(view, "basic", ["extra", "extra"])).toThrow();
  });
});
