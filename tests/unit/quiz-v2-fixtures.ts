import type { AudienceKey, CortexInput, QuizAnswers } from "@/features/quiz/types";

const answersByAudience: Record<AudienceKey, Record<string, string | string[]>> = {
  coaches_educators: {
    q1_business_model: "coach_model_course",
    q2_goal: "coach_goal_enroll_students",
    q3_current_journey: "coach_journey_unclear_website",
    q4_bottlenecks: ["coach_blocker_conversion", "coach_blocker_follow_up"],
    q5_demand_health: "demand_steady_some_dropoff",
    q6_customer_requirements: ["coach_customer_pay_enroll", "coach_customer_course_access"],
    q7_post_conversion: ["coach_after_welcome", "coach_after_course"],
    q8_scope: ["coach_scope_multiple_offers"],
    q9_timeline: "timeline_within_30_days",
    q10_platform: "platform_recommend",
    q11_addons: ["coach_addon_course"],
  },
  service_businesses: {
    q1_business_model: "service_model_consultation",
    q2_goal: "service_goal_bookings",
    q3_current_journey: "service_journey_booking_manual",
    q4_bottlenecks: ["service_blocker_booking", "service_blocker_admin"],
    q5_demand_health: "demand_steady_some_dropoff",
    q6_customer_requirements: ["service_customer_book", "service_customer_reminders"],
    q7_post_conversion: ["service_after_intake", "service_after_reminders"],
    q8_scope: ["service_scope_multiple_services"],
    q9_timeline: "timeline_ready_now",
    q10_platform: "platform_recommend",
    q11_addons: ["service_addon_booking"],
  },
  custom_order_businesses: {
    q1_business_model: "order_model_made_to_order",
    q2_goal: "order_goal_operations",
    q3_current_journey: "order_journey_disconnected",
    q4_bottlenecks: ["order_blocker_production", "order_blocker_updates"],
    q5_demand_health: "demand_inconsistent",
    q6_customer_requirements: ["order_customer_customize", "order_customer_updates"],
    q7_post_conversion: ["order_after_production", "order_after_updates"],
    q8_scope: ["order_scope_inventory", "order_scope_permissions"],
    q9_timeline: "timeline_ready_now",
    q10_platform: "platform_recommend",
    q11_addons: ["order_addon_inventory"],
  },
};

export function quizV2Input(
  audienceKey: AudienceKey,
  overrides: Record<string, string | string[]> = {},
): CortexInput {
  const values = { ...answersByAudience[audienceKey], ...overrides };
  return {
    audienceKey,
    answers: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, Array.isArray(value) ? value : [value]]),
    ) as QuizAnswers,
  };
}

export const quizV2Answers = (audienceKey: AudienceKey) => quizV2Input(audienceKey).answers;
