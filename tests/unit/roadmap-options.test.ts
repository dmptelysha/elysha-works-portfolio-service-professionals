import { describe, expect, it } from "vitest";

import { calculateRecommendation } from "@/features/quiz/cortex";
import { buildRoadmapTiers, defaultRoadmapSelection, resolveRoadmapSelection } from "@/features/quiz/roadmap-options";
import type { CortexInput, QuizAnswers } from "@/features/quiz/types";

const input = (audienceKey: CortexInput["audienceKey"], answers: Record<string, string | string[]>): CortexInput => ({
  audienceKey,
  answers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? value : [value]])) as QuizAnswers,
});

const coachProgram = input("coaches_educators", {
  q1_goal: "coach_goal_enroll_students",
  q2_setup: "coach_setup_unclear_website",
  q3_blocker: "coach_blocker_questions_no_booking",
  q4_capabilities: ["coach_capability_enrollment_payment", "coach_capability_email_follow_up", "coach_capability_student_onboarding"],
  q5_complexity: "coach_complexity_program_delivery",
  q6_readiness: "readiness_within_30_days",
  q7_platform: "platform_recommend",
  q8_support: ["support_client_assets"],
});

const inventoryBusiness = input("custom_order_businesses", {
  q1_goal: "order_goal_organize_operations",
  q2_setup: "order_setup_disconnected_tools",
  q3_blocker: "order_blocker_production_updates",
  q4_capabilities: ["order_capability_inventory", "order_capability_dashboard", "order_capability_updates"],
  q5_complexity: "order_complexity_roles_inventory",
  q6_readiness: "readiness_ready_now",
  q7_platform: "platform_custom_app",
  q8_support: ["support_inventory", "support_order_management"],
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
