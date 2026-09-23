import { QUIZ_DEFINITIONS } from "./questions.ts";
import type {
  AssessmentProfile,
  AudienceKey,
  BusinessLocation,
  PlatformKey,
  PublicTierKey,
  QuizAnswers,
  ReadinessLevel,
} from "./types.ts";

export const DEFAULT_LOCATION: BusinessLocation = Object.freeze({
  businessCountry: "Not specified",
  countryCode: "US",
  displayCurrency: "USD",
  currencySymbol: "$",
  fxRate: 1,
  fxRateTimestamp: null,
});

export function normalizeLocation(location?: BusinessLocation): BusinessLocation {
  if (!location) return DEFAULT_LOCATION;
  const countryCode = location.countryCode.trim().toUpperCase();
  const currency = location.displayCurrency.trim().toUpperCase();
  const validRate = typeof location.fxRate === "number" && Number.isFinite(location.fxRate) && location.fxRate > 0;
  if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z]{3}$/.test(currency)) return DEFAULT_LOCATION;
  return Object.freeze({
    businessCountry: location.businessCountry.trim() || "Not specified",
    countryCode,
    displayCurrency: validRate ? currency : "USD",
    currencySymbol: validRate ? location.currencySymbol.trim() || currency : "$",
    fxRate: validRate ? location.fxRate : 1,
    fxRateTimestamp: validRate && location.fxRateTimestamp && Number.isFinite(Date.parse(location.fxRateTimestamp))
      ? new Date(location.fxRateTimestamp).toISOString()
      : null,
  });
}

function labelsFor(audienceKey: AudienceKey, answers: QuizAnswers, questionKey: string): string[] {
  const question = QUIZ_DEFINITIONS[audienceKey].questions.find((item) => item.key === questionKey);
  if (!question) return [];
  const labels = new Map(question.options.map((item) => [item.key, item.label]));
  return (answers[questionKey] ?? []).map((key) => labels.get(key)).filter((label): label is string => Boolean(label));
}

export function answerKeys(answers: QuizAnswers): Set<string> {
  return new Set(Object.values(answers).flat());
}

export function buildAssessmentProfile(
  audienceKey: AudienceKey,
  answers: QuizAnswers,
  readiness: ReadinessLevel,
): AssessmentProfile {
  return Object.freeze({
    businessModel: labelsFor(audienceKey, answers, "q1_business_model")[0] ?? "Business model not specified.",
    desiredOutcome: labelsFor(audienceKey, answers, "q2_goal")[0] ?? "Desired outcome not specified.",
    currentJourney: labelsFor(audienceKey, answers, "q3_current_journey")[0] ?? "Current journey not specified.",
    primaryBottlenecks: Object.freeze(labelsFor(audienceKey, answers, "q4_bottlenecks")),
    demandHealth: labelsFor(audienceKey, answers, "q5_demand_health")[0] ?? "Demand level not specified.",
    customerRequirements: Object.freeze(labelsFor(audienceKey, answers, "q6_customer_requirements")),
    postConversionRequirements: Object.freeze(labelsFor(audienceKey, answers, "q7_post_conversion")),
    scopeRequirements: Object.freeze(labelsFor(audienceKey, answers, "q8_scope")),
    timeline: labelsFor(audienceKey, answers, "q9_timeline")[0] ?? "Timeline not specified.",
    leadReadiness: readiness,
    platformPreference: labelsFor(audienceKey, answers, "q10_platform")[0] ?? "No platform preference.",
    requestedAddons: Object.freeze(labelsFor(audienceKey, answers, "q11_addons").filter((item) => !item.startsWith("No additional support"))),
  });
}

function pushUnique(target: string[], value: string, when = true) {
  if (when && !target.includes(value)) target.push(value);
}

export function buildPages(audienceKey: AudienceKey, answers: QuizAnswers): string[] {
  const keys = answerKeys(answers);
  const pages: string[] = [];
  if (audienceKey === "coaches_educators") {
    pushUnique(pages, "Program / Sales Page");
    pushUnique(pages, "Application Page", keys.has("coach_customer_apply") || keys.has("coach_addon_application"));
    pushUnique(pages, "Booking Page", keys.has("coach_customer_book") || keys.has("coach_after_scheduling"));
    pushUnique(pages, "Booking Confirmation", keys.has("coach_customer_book"));
    pushUnique(pages, "Enrollment / Checkout", keys.has("coach_customer_pay_enroll") || keys.has("coach_after_payment_plan"));
    pushUnique(pages, "Student Onboarding", keys.has("coach_customer_onboarding") || keys.has("coach_after_intake"));
    pushUnique(pages, "Course / Resources", keys.has("coach_customer_course_access") || keys.has("coach_after_course") || keys.has("coach_after_resources"));
    pushUnique(pages, "Student Portal", keys.has("coach_customer_portal") || keys.has("coach_after_progress") || keys.has("coach_scope_progress"));
    pushUnique(pages, "Membership / Community", keys.has("coach_customer_community") || keys.has("coach_after_community"));
  } else if (audienceKey === "service_businesses") {
    pushUnique(pages, "Service / Sales Page");
    pushUnique(pages, "Inquiry Form", keys.has("service_customer_inquiry"));
    pushUnique(pages, "Qualification Form", keys.has("service_customer_qualify"));
    pushUnique(pages, "Booking Page", keys.has("service_customer_book"));
    pushUnique(pages, "Booking Confirmation", keys.has("service_customer_book"));
    pushUnique(pages, "Deposit / Payment", keys.has("service_customer_pay") || keys.has("service_after_payment"));
    pushUnique(pages, "Client Intake", keys.has("service_customer_intake") || keys.has("service_after_intake"));
    pushUnique(pages, "Client Resources", keys.has("service_customer_resources") || keys.has("service_after_documents"));
    pushUnique(pages, "Client Portal", keys.has("service_customer_portal") || keys.has("service_after_portal"));
    pushUnique(pages, "Service Status", keys.has("service_after_status") || keys.has("service_customer_next_steps"));
    pushUnique(pages, "Rebooking", keys.has("service_after_rebooking"));
    pushUnique(pages, "Review / Feedback", keys.has("service_after_review"));
  } else {
    pushUnique(pages, "Product / Service Catalog");
    pushUnique(pages, "Customization", keys.has("order_customer_customize") || keys.has("order_after_details"));
    pushUnique(pages, "Reference Upload", keys.has("order_customer_upload") || keys.has("order_after_uploads"));
    pushUnique(pages, "Quote Request", keys.has("order_customer_quote") || keys.has("order_after_quote"));
    pushUnique(pages, "Order Request", keys.has("order_customer_request"));
    pushUnique(pages, "Deposit / Payment", keys.has("order_customer_deposit") || keys.has("order_customer_full_payment") || keys.has("order_after_deposit") || keys.has("order_after_balance"));
    pushUnique(pages, "Proof / Approval", keys.has("order_customer_approve") || keys.has("order_after_proof") || keys.has("order_after_approval"));
    pushUnique(pages, "Revision", keys.has("order_after_revisions"));
    pushUnique(pages, "Order Confirmation", keys.has("order_customer_request") || keys.has("order_customer_deposit"));
    pushUnique(pages, "Order Tracking", keys.has("order_customer_track") || keys.has("order_after_tracking") || keys.has("order_after_production"));
    pushUnique(pages, "Customer Portal", keys.has("order_customer_reorder") || keys.has("order_scope_portal"));
    pushUnique(pages, "Reorder", keys.has("order_customer_reorder") || keys.has("order_after_reorder"));
  }
  return pages;
}

export function buildAutomations(audienceKey: AudienceKey, answers: QuizAnswers): string[] {
  const keys = answerKeys(answers);
  const items: string[] = [];
  if (audienceKey === "coaches_educators") {
    pushUnique(items, "Application received confirmation", keys.has("coach_customer_apply"));
    pushUnique(items, "Booking confirmation and reminder", keys.has("coach_customer_book") || keys.has("coach_after_scheduling"));
    pushUnique(items, "Enrollment and payment confirmation", keys.has("coach_customer_pay_enroll") || keys.has("coach_after_payment_plan"));
    pushUnique(items, "Student welcome and onboarding", keys.has("coach_customer_onboarding") || keys.has("coach_after_welcome"));
    pushUnique(items, "Student engagement follow-up", keys.has("coach_goal_retention") || keys.has("coach_addon_reactivation"));
  } else if (audienceKey === "service_businesses") {
    pushUnique(items, "Inquiry acknowledgment", keys.has("service_customer_inquiry") || keys.has("service_customer_qualify"));
    pushUnique(items, "Booking confirmation and reminder", keys.has("service_customer_book") || keys.has("service_after_reminders"));
    pushUnique(items, "Deposit or payment confirmation", keys.has("service_customer_pay") || keys.has("service_after_payment"));
    pushUnique(items, "Client intake and welcome", keys.has("service_customer_intake") || keys.has("service_after_intake"));
    pushUnique(items, "Post-service follow-up", keys.has("service_after_follow_up"));
    pushUnique(items, "Review request", keys.has("service_after_review") || keys.has("service_addon_reviews"));
    pushUnique(items, "Rebooking reminder", keys.has("service_after_rebooking") || keys.has("service_addon_rebooking"));
  } else {
    pushUnique(items, "Order request acknowledgment", keys.has("order_customer_request") || keys.has("order_customer_quote"));
    pushUnique(items, "Quote ready notification", keys.has("order_after_quote"));
    pushUnique(items, "Deposit or payment confirmation", keys.has("order_customer_deposit") || keys.has("order_after_deposit"));
    pushUnique(items, "Proof approval notification", keys.has("order_customer_approve") || keys.has("order_after_approval"));
    pushUnique(items, "Production status update", keys.has("order_after_production") || keys.has("order_customer_updates"));
    pushUnique(items, "Balance request", keys.has("order_after_balance"));
    pushUnique(items, "Delivery or pickup notification", keys.has("order_after_delivery"));
  }
  return items;
}

export function tierForOfferKey(offerKey: string): PublicTierKey {
  if (["platform_launch", "custom_starter"].includes(offerKey)) return "basic";
  if (["platform_growth", "custom_foundation"].includes(offerKey)) return "advanced";
  return "complete";
}

export function paymentSetupLimit(offerKey: string): number {
  const tier = tierForOfferKey(offerKey);
  return tier === "basic" ? 1 : tier === "advanced" ? 2 : 3;
}

export function buildPaymentGuidance(
  audienceKey: AudienceKey,
  answers: QuizAnswers,
  location: BusinessLocation,
  platform: PlatformKey,
): { options: string[]; integrations: string[] } {
  const keys = answerKeys(answers);
  const needsPayment = [...keys].some((key) => /pay|payment|checkout|deposit|balance/.test(key));
  if (!needsPayment) return { options: [], integrations: [] };
  const options: string[] = [];
  const integrations: string[] = [];
  const wantsAutomatedLocal = location.countryCode === "PH" && audienceKey === "custom_order_businesses"
    && (keys.has("order_addon_integrations") || keys.has("order_scope_integrations"));
  if (wantsAutomatedLocal) {
    options.push("Xendit for automated GCash or Maya payment confirmation, subject to merchant approval and technical compatibility.");
    integrations.push("Automated local payment confirmation");
  } else if (location.countryCode === "PH") {
    options.push("GCash or Maya QR with clear payment instructions and manual payment verification.");
    options.push("Bank transfer instructions where appropriate.");
  } else {
    options.push(platform === "custom_app"
      ? "Stripe, PayPal, or another eligible provider connected to the custom payment workflow."
      : "A supported Stripe or PayPal connection, subject to provider availability in your country.");
  }
  return { options, integrations };
}

export function buildPlatformReasons(
  audienceKey: AudienceKey,
  answers: QuizAnswers,
  platform: PlatformKey,
  hardCustomReasons: readonly string[],
): { reasons: string[]; alternatives: Record<PlatformKey, string> } {
  const keys = answerKeys(answers);
  const reasons: string[] = [];
  if (platform === "systeme_io") {
    reasons.push("Your journey centers on an offer, enrollment or checkout, follow-up, and supported course or membership delivery.");
    reasons.push("The required customer path can be delivered without specialized operational software.");
  } else if (platform === "gohighlevel") {
    reasons.push("Your journey depends on qualification, booking, pipeline visibility, reminders, or ongoing follow-up.");
    reasons.push("The required stages can be handled through connected lead and client workflows without a custom application.");
  } else {
    reasons.push(...(hardCustomReasons.length ? hardCustomReasons : ["Your workflow needs persistent operational data, specialized states, or permissions beyond a standard funnel platform."]));
    reasons.push("A custom application keeps the workflow, business records, and role-based actions in one purpose-built system.");
  }
  const alternatives: Record<PlatformKey, string> = {
    systeme_io: platform === "systeme_io"
      ? "Recommended for this funnel, enrollment, checkout, and content-delivery journey."
      : hardCustomReasons.length
        ? "Systeme.io cannot safely support the required specialized operations, permissions, calculations, or production records."
        : "Not primary because the journey is more focused on pipeline and ongoing client operations than a course or funnel-centered system.",
    gohighlevel: platform === "gohighlevel"
      ? "Recommended for this qualification, booking, CRM, and follow-up journey."
      : hardCustomReasons.length
        ? "HighLevel cannot safely support the required specialized inventory, production, permission, or calculation workflow."
        : audienceKey === "coaches_educators"
          ? "Not primary because the journey is centered more on enrollment, checkout, and learning delivery than CRM operations."
          : "Not primary because the selected journey does not require its pipeline-centered workflow.",
    custom_app: platform === "custom_app"
      ? "Recommended because factual requirements go beyond supported platform workflows."
      : "A Custom App would add more custom infrastructure than this journey needs right now.",
  };
  if (keys.has("platform_custom_app") && platform !== "custom_app") {
    alternatives.custom_app = "You preferred a Custom App, but it would add more custom infrastructure than this journey needs; the factual requirements can be delivered more simply on the recommended platform.";
  }
  return { reasons, alternatives };
}

export function buildClientRequirements(audienceKey: AudienceKey, answers: QuizAnswers): string[] {
  const keys = answerKeys(answers);
  const items = ["Business and offer information", "Logo, brand colors, and approved visual assets", "Domain or domain-account access"];
  pushUnique(items, "Calendar availability and booking rules", [...keys].some((key) => key.includes("book") || key.includes("scheduling")));
  pushUnique(items, "Client-owned payment-provider or payment-account details", [...keys].some((key) => /pay|deposit|balance|checkout/.test(key)));
  pushUnique(items, "Course materials and student access rules", audienceKey === "coaches_educators" && [...keys].some((key) => /course|resource|student/.test(key)));
  pushUnique(items, "Service details, team availability, and staff responsibilities", audienceKey === "service_businesses");
  pushUnique(items, "Product photos, options, pricing, production stages, and delivery rules", audienceKey === "custom_order_businesses");
  pushUnique(items, "Existing records prepared for migration", [...keys].some((key) => key.includes("migration")));
  return items;
}

export function buildThirdPartyCosts(platform: PlatformKey, answers: QuizAnswers): string[] {
  const keys = answerKeys(answers);
  const items = [
    "Domain registration or renewal — paid directly to the provider.",
    "Professional business email service — paid directly to the provider if required.",
    `${platform === "systeme_io" ? "Systeme.io" : platform === "gohighlevel" ? "HighLevel" : "Production hosting and database"} subscription or usage — paid directly to the provider.`,
  ];
  pushUnique(items, "Payment-provider transaction fees — charged directly by the payment provider.", [...keys].some((key) => /pay|deposit|balance|checkout/.test(key)));
  pushUnique(items, "SMS, phone, WhatsApp, or additional email usage — charged only if those channels are used.", [...keys].some((key) => /reminder|follow_up|updates/.test(key)));
  pushUnique(items, "Premium third-party application or integration fees — paid directly to each provider.", [...keys].some((key) => key.includes("integration")));
  return items;
}
