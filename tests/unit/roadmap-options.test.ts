import { describe, expect, it } from "vitest";

import { calculateRecommendation } from "@/features/quiz/cortex";
import { buildRoadmapTiers, defaultRoadmapSelection, resolveRoadmapSelection } from "@/features/quiz/roadmap-options";
import { quizV2Input } from "./quiz-v2-fixtures";

const coachProgram = quizV2Input("coaches_educators");

const inventoryBusiness = quizV2Input("custom_order_businesses", {
  q7_post_conversion: ["order_after_approval", "order_after_revisions", "order_after_production", "order_after_inventory"],
  q8_scope: ["order_scope_inventory", "order_scope_production", "order_scope_permissions", "order_scope_dynamic_pricing"],
});

describe("roadmap options", () => {
  it("builds nine choices and defaults to the Cortex recommendation", () => {
    const result = calculateRecommendation(coachProgram);
    const tiers = buildRoadmapTiers(result);
    expect(tiers).toHaveLength(3);
    expect(tiers.flatMap((tier) => tier.variants)).toHaveLength(9);
    expect(defaultRoadmapSelection(result).offerKey).toBe(result.recommendedOfferKey);
  });

  it("disables unsupported platforms and retains the Complete Custom scope review", () => {
    const result = calculateRecommendation(inventoryBusiness);
    const complete = buildRoadmapTiers(result).find((tier) => tier.tierKey === "complete")!;
    const systeme = complete.variants.find((item) => item.platform === "systeme_io")!;
    const highlevel = complete.variants.find((item) => item.platform === "gohighlevel")!;
    expect(systeme.feasibility.available).toBe(false);
    expect(highlevel.feasibility.available).toBe(false);
    expect(systeme.feasibility).toEqual(highlevel.feasibility);
    expect(defaultRoadmapSelection(result).offerKey).toBe("custom_complete");
    expect(() => resolveRoadmapSelection(result, { tierKey: "complete", platform: "systeme_io", offerKey: "platform_scale" }))
      .toThrow(/cannot reliably support/i);
  });

  it("recalculates the selected offer from catalog-controlled prices", () => {
    const result = calculateRecommendation(coachProgram);
    const selected = resolveRoadmapSelection(result, { tierKey: "basic", platform: "custom_app", offerKey: "custom_starter" });
    expect(selected.selection.offerKey).toBe("custom_starter");
    expect(selected.offer.name).toBe("Custom Starter");
    expect(selected.basePriceUsd).toBe(3000);
    expect(selected.originalRecommendation.offerKey).toBe(result.recommendedOfferKey);
  });
});
