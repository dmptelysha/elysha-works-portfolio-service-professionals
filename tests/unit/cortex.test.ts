import { describe, expect, it } from "vitest";

import { calculateRecommendation, validateAnswers } from "@/features/quiz/cortex";
import type { AudienceKey, CortexInput, QuizAnswers } from "@/features/quiz/types";

const complete = (
  audienceKey: AudienceKey,
  answers: Record<string, string | string[]>,
): CortexInput => ({
  audienceKey,
  answers: Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? value : [value]]),
  ) as QuizAnswers,
});

const coachProgram = complete("coaches_educators", {
  q1_goal: "coach_goal_enroll_students",
  q2_setup: "coach_setup_unclear_website",
  q3_blocker: "coach_blocker_questions_no_booking",
  q4_capabilities: [
    "coach_capability_enrollment_payment",
    "coach_capability_email_follow_up",
    "coach_capability_student_onboarding",
  ],
  q5_complexity: "coach_complexity_program_delivery",
  q6_readiness: "readiness_within_30_days",
  q7_platform: "platform_recommend",
  q8_support: ["support_client_assets"],
});

const serviceBooking = complete("service_businesses", {
  q1_goal: "service_goal_book_appointments",
  q2_setup: "service_setup_disconnected_booking",
  q3_blocker: "service_blocker_manual_intake_follow_up",
  q4_capabilities: [
    "service_capability_booking",
    "service_capability_reminders",
    "service_capability_crm",
  ],
  q5_complexity: "service_complexity_multiple_services",
  q6_readiness: "readiness_ready_now",
  q7_platform: "platform_recommend",
  q8_support: ["support_client_assets"],
});

describe("cortex-local-v0.1 validation and aggregation", () => {
  it("validates complete answers and reports missing required questions", () => {
    expect(validateAnswers(coachProgram)).toEqual({ valid: true, missingQuestionKeys: [] });
    expect(validateAnswers({ ...coachProgram, answers: { q1_goal: coachProgram.answers.q1_goal } })).toEqual({
      valid: false,
      missingQuestionKeys: [
        "q2_setup",
        "q3_blocker",
        "q4_capabilities",
        "q5_complexity",
        "q6_readiness",
        "q7_platform",
        "q8_support",
      ],
    });
  });

  it("rejects unknown option keys instead of silently scoring them", () => {
    expect(() =>
      calculateRecommendation({
        ...coachProgram,
        answers: { ...coachProgram.answers, q1_goal: ["unknown_option"] },
      }),
    ).toThrow(/unknown option key/i);
  });

  it("caps each dimension per question at three while preserving critical flags", () => {
    const input = complete("custom_order_businesses", {
      q1_goal: "order_goal_organize_operations",
      q2_setup: "order_setup_disconnected_tools",
      q3_blocker: "order_blocker_production_updates",
      q4_capabilities: [
        "order_capability_catalog",
        "order_capability_customization",
        "order_capability_request",
        "order_capability_checkout",
        "order_capability_updates",
        "order_capability_dashboard",
        "order_capability_crm",
        "order_capability_inventory",
      ],
      q5_complexity: "order_complexity_roles_inventory",
      q6_readiness: "readiness_ready_now",
      q7_platform: "platform_recommend",
      q8_support: ["support_inventory", "support_dashboard", "support_order_management"],
    });
    const result = calculateRecommendation(input);
    const q4 = result.explanationTrace.find((entry) => entry.questionKey === "q4_capabilities");

    expect(q4).toBeDefined();
    if (!q4) throw new Error("Missing Q4 explanation trace");
    for (const key of Object.keys(q4.after.diagnostic) as (keyof typeof q4.after.diagnostic)[]) {
      expect(q4.after.diagnostic[key] - q4.before.diagnostic[key]).toBeLessThanOrEqual(3);
    }
    for (const key of Object.keys(q4.after.solutions) as (keyof typeof q4.after.solutions)[]) {
      expect(q4.after.solutions[key] - q4.before.solutions[key]).toBeLessThanOrEqual(3);
    }
    for (const key of Object.keys(q4.after.platforms) as (keyof typeof q4.after.platforms)[]) {
      expect(q4.after.platforms[key] - q4.before.platforms[key]).toBeLessThanOrEqual(3);
    }
    expect(q4.flags).toContain("inventory");
    expect(result.scores.customApp).toBeLessThanOrEqual(18);
  });
});

describe("cortex-local-v0.1 locked outcomes", () => {
  it("routes a program enrollment journey to Systeme.io Platform Growth", () => {
    const result = calculateRecommendation(coachProgram);
    expect(result.primarySolutionType).toBe("funnel");
    expect(result.recommendedSolutionTitle).toBe("Enrollment Funnel");
    expect(result.recommendedPlatform).toBe("systeme_io");
    expect(result.recommendedOfferKey).toBe("platform_growth");
    expect(result.recommendedOfferName).toBe("Growth System");
    expect(result.recommendedOfferIncludedFeatures.length).toBeGreaterThan(0);
    expect(result.audienceLabel).toBe("Book and Enroll");
    expect(result.readinessLevel).toBe("within_30_days");
    expect(result.basePriceUsd).toBe(2500);
  });

  it("routes a service booking journey to a GoHighLevel lead-to-client system", () => {
    const result = calculateRecommendation(serviceBooking);
    expect(result.recommendedSolutionTitle).toBe("Lead-to-Client System");
    expect(result.recommendedPlatform).toBe("gohighlevel");
    expect(["platform_growth", "platform_scale"]).toContain(result.recommendedOfferKey);
  });

  it("uses Website for a credibility-led website/funnel tie", () => {
    const result = calculateRecommendation(
      complete("service_businesses", {
        q1_goal: "service_goal_qualified_inquiries",
        q2_setup: "service_setup_basic_website_manual",
        q3_blocker: "service_blocker_unclear_offer",
        q4_capabilities: ["service_capability_website"],
        q5_complexity: "service_complexity_one_service",
        q6_readiness: "readiness_ready_now",
        q7_platform: "platform_recommend",
        q8_support: ["support_client_assets"],
      }),
    );
    expect(result.primarySolutionType).toBe("website");
    expect(result.recommendedSolutionTitle).toBe("Conversion Website");
    expect(result.recommendedOfferKey).toBe("platform_launch");
  });

  it("uses Custom Growth for a portal, dashboard, and connected workflows", () => {
    const result = calculateRecommendation(
      complete("service_businesses", {
        q1_goal: "service_goal_book_appointments",
        q2_setup: "service_setup_social_calls_dm",
        q3_blocker: "service_blocker_tracking_status",
        q4_capabilities: ["service_capability_portal_dashboard", "service_capability_crm", "service_capability_onboarding"],
        q5_complexity: "service_complexity_multiple_services",
        q6_readiness: "readiness_within_1_2_months",
        q7_platform: "platform_recommend",
        q8_support: ["support_dashboard", "support_portal"],
      }),
    );
    expect(result.primarySolutionType).toBe("custom_app");
    expect(result.recommendedSolutionTitle).toBe("Custom Operations System");
    expect(result.recommendedOfferKey).toBe("custom_growth");
  });

  it("uses Complete Custom System for roles, inventory, approvals, and production", () => {
    const result = calculateRecommendation(
      complete("custom_order_businesses", {
        q1_goal: "order_goal_organize_operations",
        q2_setup: "order_setup_disconnected_tools",
        q3_blocker: "order_blocker_production_updates",
        q4_capabilities: ["order_capability_inventory", "order_capability_dashboard", "order_capability_updates"],
        q5_complexity: "order_complexity_roles_inventory",
        q6_readiness: "readiness_ready_now",
        q7_platform: "platform_custom_app",
        q8_support: ["support_inventory", "support_order_management"],
      }),
    );
    expect(result.recommendedSolutionTitle).toBe("Custom Order Management App");
    expect(result.recommendedBuildRoute).toBe("custom");
    expect(result.recommendedOfferKey).toBe("custom_complete");
    expect(result.basePriceUsd).toBe(10000);
  });

  it("does not let a Custom App preference force a custom route", () => {
    const input = {
      ...coachProgram,
      answers: { ...coachProgram.answers, q7_platform: ["platform_custom_app"] },
    };
    const result = calculateRecommendation(input);
    expect(result.recommendedBuildRoute).toBe("platform");
    expect(result.recommendedOfferKey).toBe("platform_growth");
  });

  it("keeps researching readiness without lowering the appropriate package", () => {
    const normal = calculateRecommendation(serviceBooking);
    const researching = calculateRecommendation({
      ...serviceBooking,
      answers: { ...serviceBooking.answers, q6_readiness: ["readiness_researching"] },
    });
    expect(researching.readinessLevel).toBe("researching");
    expect(researching.recommendedOfferKey).toBe(normal.recommendedOfferKey);
  });
});

describe("cortex-local-v0.1 pricing", () => {
  it("partitions selected support exactly once and consumes package inclusions", () => {
    const result = calculateRecommendation({
      ...coachProgram,
      answers: {
        ...coachProgram.answers,
        q8_support: [
          "support_conversion_copywriting",
          "support_checkout",
          "support_integration",
          "support_migration",
        ],
      },
    });
    const included = new Set(result.includedCapabilities);
    const priced = new Set(result.pricedAddons.map((item) => item.addonKey));
    const review = new Set(result.scopeReviewItems.map((item) => item.key));

    expect(priced.has("conversion_copywriting")).toBe(true);
    expect(included.has("checkout_payment_integration")).toBe(true);
    expect(included.has("standard_third_party_integration")).toBe(true);
    expect(review.has("content_data_migration")).toBe(true);
    for (const key of result.selectedAddons) {
      expect(Number(included.has(key)) + Number(priced.has(key)) + Number(review.has(key))).toBe(1);
    }
    expect(result.adjustmentTotalUsd).toBe(0);
    expect(result.estimatedProjectInvestmentUsd).toBe(
      result.basePriceUsd + result.addonTotalUsd,
    );
  });

  it("discloses SMS and recurring platform costs without silently pricing SMS", () => {
    const result = calculateRecommendation({
      ...serviceBooking,
      answers: { ...serviceBooking.answers, q8_support: ["support_follow_up"] },
    });
    expect(result.estimatedRecurringCosts.join(" ")).toMatch(/subscription/i);
    expect(result.scopeReviewItems.map((item) => item.key)).toContain("sms_automation_setup");
    expect(result.pricedAddons.map((item) => item.addonKey)).not.toContain("sms_automation_setup");
  });

  it("is deterministic for identical inputs", () => {
    const first = calculateRecommendation(coachProgram);
    const second = calculateRecommendation(coachProgram);
    expect(first).toEqual(second);
  });
});
