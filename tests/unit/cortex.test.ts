import { describe, expect, it } from "vitest";

import { calculateRecommendation, validateAnswers } from "@/features/quiz/cortex";
import type { AudienceKey, CortexInput, QuizAnswers } from "@/features/quiz/types";

function assessment(
  audienceKey: AudienceKey,
  answers: Record<string, string | string[]>,
  countryCode = "US",
): CortexInput {
  return {
    audienceKey,
    answers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? value : [value]])) as QuizAnswers,
    location: {
      businessCountry: countryCode === "PH" ? "Philippines" : "United States",
      countryCode,
      displayCurrency: countryCode === "PH" ? "PHP" : "USD",
      currencySymbol: countryCode === "PH" ? "₱" : "$",
      fxRate: countryCode === "PH" ? 58 : 1,
      fxRateTimestamp: "2026-09-23T00:00:00.000Z",
    },
  } as CortexInput;
}

const universal = {
  q5_demand_health: "demand_steady_some_dropoff",
  q9_timeline: "timeline_within_30_days",
  q10_platform: "platform_recommend",
};

const coachCourse = assessment("coaches_educators", {
  q1_business_model: "coach_model_course",
  q2_goal: "coach_goal_sell_offers",
  q3_current_journey: "coach_journey_weak_funnel",
  q4_bottlenecks: ["coach_blocker_payment", "coach_blocker_follow_up"],
  ...universal,
  q6_customer_requirements: ["coach_customer_learn_offer", "coach_customer_pay_enroll", "coach_customer_follow_up", "coach_customer_course_access"],
  q7_post_conversion: ["coach_after_confirmation", "coach_after_welcome", "coach_after_course"],
  q8_scope: ["coach_scope_subscriptions"],
  q11_addons: ["coach_addon_none"],
});

describe("business systems assessment validation", () => {
  it("preserves the viewer currency when its live conversion rate is unavailable", () => {
    const result = calculateRecommendation({
      ...coachCourse,
      location: {
        businessCountry: "Philippines",
        countryCode: "PH",
        displayCurrency: "PHP",
        currencySymbol: "₱",
        fxRate: null,
        fxRateTimestamp: null,
      },
    });

    expect(result.location).toMatchObject({ displayCurrency: "PHP", currencySymbol: "₱", fxRate: null });
    expect(result.displayPriceLocal).toBeNull();
  });

  it("requires every diagnostic question and accepts complete answers", () => {
    expect(validateAnswers(coachCourse)).toEqual({ valid: true, missingQuestionKeys: [] });
    expect(validateAnswers({ ...coachCourse, answers: { q1_business_model: coachCourse.answers.q1_business_model } })).toEqual({
      valid: false,
      missingQuestionKeys: [
        "q2_goal", "q3_current_journey", "q4_bottlenecks", "q5_demand_health",
        "q6_customer_requirements", "q7_post_conversion", "q8_scope", "q9_timeline",
        "q10_platform", "q11_addons",
      ],
    });
  });

  it("rejects more than two primary bottlenecks", () => {
    expect(() => calculateRecommendation({
      ...coachCourse,
      answers: { ...coachCourse.answers, q4_bottlenecks: ["coach_blocker_payment", "coach_blocker_follow_up", "coach_blocker_onboarding"] },
    })).toThrow(/up to 2/i);
  });
});

describe("approved platform and package scenarios", () => {
  it("A: recommends Systeme.io for a focused course, checkout, follow-up, and course-access journey", () => {
    const result = calculateRecommendation(coachCourse);
    expect(result.recommendedPlatform).toBe("systeme_io");
    expect(["platform_launch", "platform_growth"]).toContain(result.recommendedOfferKey);
    expect(result.recommendedPages).toEqual(expect.arrayContaining(["Program / Sales Page", "Enrollment / Checkout", "Course / Resources"]));
  });

  it("B: recommends HighLevel Advanced for application, booking, CRM, reminders, and onboarding", () => {
    const result = calculateRecommendation(assessment("coaches_educators", {
      q1_business_model: "coach_model_one_to_one",
      q2_goal: "coach_goal_book_calls",
      q3_current_journey: "coach_journey_social_dm",
      q4_bottlenecks: ["coach_blocker_conversion", "coach_blocker_follow_up"],
      ...universal,
      q6_customer_requirements: ["coach_customer_apply", "coach_customer_book", "coach_customer_follow_up", "coach_customer_onboarding"],
      q7_post_conversion: ["coach_after_welcome", "coach_after_intake", "coach_after_scheduling"],
      q8_scope: ["coach_scope_integrations"],
      q11_addons: ["coach_addon_application", "coach_addon_booking"],
    }));
    expect(result.recommendedPlatform).toBe("gohighlevel");
    expect(result.recommendedOfferKey).toBe("platform_growth");
  });

  it("C: recommends HighLevel Complete for multi-staff service delivery without specialized permissions", () => {
    const result = calculateRecommendation(assessment("service_businesses", {
      q1_business_model: "service_model_multiple",
      q2_goal: "service_goal_scale",
      q3_current_journey: "service_journey_disconnected",
      q4_bottlenecks: ["service_blocker_booking", "service_blocker_admin"],
      ...universal,
      q6_customer_requirements: ["service_customer_qualify", "service_customer_book", "service_customer_pay", "service_customer_reminders", "service_customer_intake"],
      q7_post_conversion: ["service_after_payment", "service_after_reminders", "service_after_assignment", "service_after_status"],
      q8_scope: ["service_scope_multiple_services", "service_scope_team", "service_scope_assignment", "service_scope_payments", "service_scope_pipelines"],
      q11_addons: ["service_addon_staff", "service_addon_intake"],
    }));
    expect(result.recommendedPlatform).toBe("gohighlevel");
    expect(result.recommendedOfferKey).toBe("platform_scale");
  });

  it("D: recommends Complete Custom Scope for production, approvals, roles, and inventory", () => {
    const result = calculateRecommendation(assessment("custom_order_businesses", {
      q1_business_model: "order_model_made_to_order",
      q2_goal: "order_goal_operations",
      q3_current_journey: "order_journey_disconnected",
      q4_bottlenecks: ["order_blocker_approvals", "order_blocker_inventory"],
      ...universal,
      q6_customer_requirements: ["order_customer_customize", "order_customer_quote", "order_customer_deposit", "order_customer_approve", "order_customer_updates", "order_customer_track"],
      q7_post_conversion: ["order_after_quote", "order_after_deposit", "order_after_proof", "order_after_approval", "order_after_production", "order_after_inventory"],
      q8_scope: ["order_scope_options", "order_scope_dynamic_pricing", "order_scope_proof", "order_scope_revisions", "order_scope_production", "order_scope_inventory", "order_scope_employees", "order_scope_permissions"],
      q11_addons: ["order_addon_production", "order_addon_inventory", "order_addon_roles"],
    }));
    expect(result.recommendedPlatform).toBe("custom_app");
    expect(result.recommendedOfferKey).toBe("custom_complete");
    expect(result.basePriceUsd).toBe(10000);
  });

  it("E: keeps a Philippine manual GCash QR flow simple and explicitly manual", () => {
    const result = calculateRecommendation(assessment("service_businesses", {
      q1_business_model: "service_model_project",
      q2_goal: "service_goal_inquiries",
      q3_current_journey: "service_journey_website_manual",
      q4_bottlenecks: ["service_blocker_payment"],
      ...universal,
      q6_customer_requirements: ["service_customer_inquiry", "service_customer_pay"],
      q7_post_conversion: ["service_after_payment"],
      q8_scope: ["service_scope_payments"],
      q11_addons: ["service_addon_payment"],
    }, "PH"));
    expect(result.recommendedPaymentOptions.join(" ")).toMatch(/GCash.*manual payment verification/i);
    expect(result.recommendedPaymentOptions.join(" ")).not.toMatch(/Xendit/i);
  });

  it("F: recommends Xendit when a Philippine custom workflow requires automatic local confirmation", () => {
    const result = calculateRecommendation(assessment("custom_order_businesses", {
      q1_business_model: "order_model_made_to_order",
      q2_goal: "order_goal_completion",
      q3_current_journey: "order_journey_online_manual_custom",
      q4_bottlenecks: ["order_blocker_payment"],
      ...universal,
      q6_customer_requirements: ["order_customer_deposit", "order_customer_updates"],
      q7_post_conversion: ["order_after_deposit", "order_after_balance", "order_after_updates"],
      q8_scope: ["order_scope_balances", "order_scope_integrations"],
      q11_addons: ["order_addon_payment", "order_addon_integrations"],
    }, "PH"));
    expect(result.recommendedPaymentOptions.join(" ")).toMatch(/Xendit/i);
    expect(result.requiredIntegrations).toContain("Automated local payment confirmation");
  });

  it("G: overrides Systeme.io when inventory, dynamic pricing, permissions, and dashboards are required", () => {
    const result = calculateRecommendation(assessment("custom_order_businesses", {
      q1_business_model: "order_model_several",
      q2_goal: "order_goal_scale",
      q3_current_journey: "order_journey_disconnected",
      q4_bottlenecks: ["order_blocker_production", "order_blocker_inventory"],
      ...universal,
      q10_platform: "platform_systeme",
      q6_customer_requirements: ["order_customer_customize", "order_customer_track"],
      q7_post_conversion: ["order_after_production", "order_after_inventory"],
      q8_scope: ["order_scope_dynamic_pricing", "order_scope_inventory", "order_scope_permissions", "order_scope_reports"],
      q11_addons: ["order_addon_inventory", "order_addon_production"],
    }));
    expect(result.recommendedPlatform).toBe("custom_app");
    expect(result.alternativePlatformReasons.systeme_io).toMatch(/cannot safely support/i);
  });

  it("H: does not let a Custom App preference inflate a simple service booking journey", () => {
    const result = calculateRecommendation(assessment("service_businesses", {
      q1_business_model: "service_model_appointment",
      q2_goal: "service_goal_bookings",
      q3_current_journey: "service_journey_social_phone",
      q4_bottlenecks: ["service_blocker_booking"],
      ...universal,
      q10_platform: "platform_custom_app",
      q6_customer_requirements: ["service_customer_learn", "service_customer_book", "service_customer_reminders"],
      q7_post_conversion: ["service_after_reminders"],
      q8_scope: ["service_scope_appointment_types"],
      q11_addons: ["service_addon_none"],
    }));
    expect(result.recommendedPlatform).toBe("gohighlevel");
    expect(result.recommendedOfferKey).toBe("platform_launch");
    expect(result.alternativePlatformReasons.custom_app).toMatch(/more custom infrastructure than this journey needs/i);
  });

  it("keeps timeline and demand health diagnostic-only", () => {
    const ready = calculateRecommendation(coachCourse);
    const later = calculateRecommendation({
      ...coachCourse,
      answers: { ...coachCourse.answers, q5_demand_health: ["demand_early_awareness"], q9_timeline: ["timeline_researching"] },
    });
    expect(later.recommendedPlatform).toBe(ready.recommendedPlatform);
    expect(later.recommendedOfferKey).toBe(ready.recommendedOfferKey);
    expect(later.basePriceUsd).toBe(ready.basePriceUsd);
    expect(later.diagnosisSummary).toMatch(/traffic|awareness/i);
  });

  it("is deterministic for identical stored answers and location metadata", () => {
    expect(calculateRecommendation(coachCourse)).toEqual(calculateRecommendation(coachCourse));
  });
});
