import { describe, expect, it } from "vitest";

import { resolveOfferPricing } from "@/features/quiz/pricing";

describe("roadmap pricing", () => {
  it("partitions platform support without double charging", () => {
    const pricing = resolveOfferPricing("platform_launch", ["support_booking", "support_portal"]);
    expect(pricing.selectedSupportItems).toHaveLength(2);
    expect(pricing.selectedSupportItems.find((item) => item.key === "advanced_booking_setup")?.disposition)
      .toBe("included");
    expect(pricing.pricedAddons.map((item) => item.addonKey)).toContain("platform_membership_course_area");
    expect(pricing.addonTotalUsd).toBeGreaterThanOrEqual(0);
  });

  it("uses custom package inclusions for portal and dashboard support", () => {
    const pricing = resolveOfferPricing("custom_growth", ["support_portal", "support_dashboard"]);
    expect(pricing.includedCapabilities).toEqual(expect.arrayContaining([
      "basic_custom_portal_module",
      "custom_dashboard_reporting_module",
    ]));
    expect(pricing.pricedAddons).toEqual([]);
    expect(pricing.selectedSupportItems.map((item) => item.disposition)).toEqual(["included", "included"]);
  });

  it("rejects unknown offers and support keys", () => {
    expect(() => resolveOfferPricing("missing", [])).toThrow(/unknown offer/i);
    expect(() => resolveOfferPricing("platform_launch", ["made_up_support"])).toThrow(/unknown support/i);
  });
});
