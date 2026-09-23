import { PACKAGE_BY_KEY } from "./catalog.ts";
import { resolveOfferPricing } from "./pricing.ts";
import { QUIZ_DEFINITIONS } from "./questions.ts";
import {
  answerKeys,
  buildAssessmentProfile,
  buildAutomations,
  buildClientRequirements,
  buildPages,
  buildPaymentGuidance,
  buildPlatformReasons,
  buildThirdPartyCosts,
  normalizeLocation,
  paymentSetupLimit,
} from "./roadmap-builders.ts";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  ROADMAP_VERSION,
  type BuildRoute,
  type CortexInput,
  type CortexResult,
  type DiagnosticScores,
  type DecisionTraceEntry,
  type ExplanationTraceEntry,
  type PlatformKey,
  type PlatformScores,
  type QuizOption,
  type ReadinessLevel,
  type SignalTag,
  type SolutionScores,
  type SolutionType,
  type ValidationResult,
} from "./types.ts";

interface SignalWeight {
  diagnostic: [number, number, number];
  solution: [number, number, number, number, number];
  platform: [number, number, number];
}

const SIGNAL_WEIGHTS: Record<SignalTag, SignalWeight> = {
  credibility: { diagnostic: [2, 0, 0], solution: [3, 1, 0, 0, 0], platform: [1, 1, 0] },
  lead_generation: { diagnostic: [3, 0, 0], solution: [1, 3, 0, 1, 0], platform: [2, 2, 0] },
  booking: { diagnostic: [2, 1, 0], solution: [0, 3, 2, 1, 0], platform: [1, 3, 0] },
  enrollment: { diagnostic: [2, 1, 1], solution: [0, 3, 2, 1, 0], platform: [3, 1, 0] },
  checkout: { diagnostic: [2, 1, 1], solution: [0, 3, 2, 0, 0], platform: [3, 1, 0] },
  follow_up: { diagnostic: [1, 3, 0], solution: [0, 1, 3, 2, 0], platform: [2, 3, 0] },
  pipeline: { diagnostic: [0, 1, 1], solution: [0, 0, 1, 3, 0], platform: [0, 3, 1] },
  onboarding: { diagnostic: [0, 2, 1], solution: [0, 0, 2, 1, 1], platform: [2, 2, 1] },
  course_delivery: { diagnostic: [0, 1, 2], solution: [1, 0, 1, 0, 2], platform: [3, 0, 2] },
  disconnected_tools: { diagnostic: [0, 3, 2], solution: [0, 0, 3, 2, 1], platform: [1, 2, 2] },
  multiple_offers: { diagnostic: [1, 1, 2], solution: [0, 2, 1, 1, 0], platform: [2, 2, 1] },
  portal: { diagnostic: [0, 1, 3], solution: [0, 0, 1, 1, 3], platform: [1, 1, 3] },
  dashboard: { diagnostic: [0, 1, 3], solution: [0, 0, 1, 2, 3], platform: [0, 1, 3] },
  custom_orders: { diagnostic: [1, 2, 2], solution: [0, 2, 1, 1, 3], platform: [1, 1, 3] },
  approvals: { diagnostic: [0, 2, 3], solution: [0, 0, 1, 2, 3], platform: [0, 1, 3] },
  inventory: { diagnostic: [0, 2, 3], solution: [0, 0, 1, 1, 3], platform: [0, 0, 3] },
  multiple_roles: { diagnostic: [0, 1, 3], solution: [0, 0, 1, 2, 3], platform: [0, 1, 3] },
  integration: { diagnostic: [0, 1, 2], solution: [0, 0, 1, 0, 1], platform: [1, 1, 1] },
  order_tracking: { diagnostic: [0, 2, 3], solution: [0, 0, 2, 3, 3], platform: [0, 2, 3] },
  migration: { diagnostic: [0, 0, 1], solution: [0, 0, 0, 0, 0], platform: [0, 0, 0] },
  simple_scope: { diagnostic: [0, 0, 0], solution: [0, 0, 0, 0, 0], platform: [0, 0, 0] },
  no_system_effect: { diagnostic: [0, 0, 0], solution: [0, 0, 0, 0, 0], platform: [0, 0, 0] },
};

const SOLUTIONS: readonly SolutionType[] = ["website", "funnel", "automation", "crm", "custom_app"];
const GENUINE_CUSTOM_SIGNALS = new Set<SignalTag>([
  "portal",
  "dashboard",
  "custom_orders",
  "approvals",
  "inventory",
  "multiple_roles",
  "order_tracking",
]);

export const SCORING_RULES = Object.freeze({
  engineVersion: CORTEX_VERSION,
  questionSetVersion: QUESTION_SET_VERSION,
  catalogVersion: CATALOG_VERSION,
  perQuestionDimensionCap: 3,
  qualifyingSolutionScore: 4,
  signalWeights: SIGNAL_WEIGHTS,
  solutionOrder: SOLUTIONS,
  tieBreaks: Object.freeze({
    websiteVsFunnel: "Prefer credibility-led website for simple scope; otherwise conversion signals prefer funnel.",
    automationVsCrm: "Pipeline or dashboard signals prefer CRM; otherwise prefer automation.",
    platform: "Higher fit score wins; enrollment/course/checkout favors Systeme.io and booking/pipeline/follow-up favors HighLevel.",
  }),
  feasibilityConstraints: Object.freeze({
    customOnlySignals: [...GENUINE_CUSTOM_SIGNALS],
    hardCustomSignals: ["inventory", "multiple_roles"],
    pairedCustomSignals: ["portal", "dashboard"],
  }),
  offerThresholds: Object.freeze({
    platformGrowthComplexity: 5,
    platformScaleComplexity: 10,
    customFoundationComplexity: 5,
    customGrowthComplexity: 9,
    customCompleteComplexity: 13,
  }),
  addonDisposition: Object.freeze({
    included: "Included by offer capability or remaining integration allowance.",
    priced: "Approved add-on not already included in the selected offer.",
    scopeReview: "Unsupported, variable, recurring, or complex work requiring confirmation.",
  }),
});

const emptyDiagnostic = (): DiagnosticScores => ({ acquisitionNeed: 0, automationNeed: 0, systemComplexity: 0 });
const emptySolutions = (): SolutionScores => ({ website: 0, funnel: 0, automation: 0, crm: 0, customApp: 0 });
const emptyPlatforms = (): PlatformScores => ({ systeme: 0, ghl: 0, customBuild: 0 });
const cloneScores = (diagnostic: DiagnosticScores, solutions: SolutionScores, platforms: PlatformScores) => ({
  diagnostic: { ...diagnostic },
  solutions: { ...solutions },
  platforms: { ...platforms },
});

export function validateAnswers(input: CortexInput): ValidationResult {
  const definition = QUIZ_DEFINITIONS[input.audienceKey];
  if (!definition) return { valid: false, missingQuestionKeys: [] };
  const missingQuestionKeys = definition.questions
    .filter((question) => question.required && !(input.answers[question.key]?.length > 0))
    .map((question) => question.key);
  return { valid: missingQuestionKeys.length === 0, missingQuestionKeys };
}

function assertAndNormalize(input: CortexInput) {
  const definition = QUIZ_DEFINITIONS[input.audienceKey];
  if (!definition) throw new Error(`Unknown audience key: ${input.audienceKey}`);
  const validation = validateAnswers(input);
  if (!validation.valid) {
    throw new Error(`Missing required answers: ${validation.missingQuestionKeys.join(", ")}`);
  }

  const normalized = new Map<string, QuizOption[]>();
  for (const question of definition.questions) {
    const selectedKeys = [...new Set(input.answers[question.key] ?? [])];
    if (question.selection === "single" && selectedKeys.length !== 1) {
      throw new Error(`Question ${question.key} requires exactly one option`);
    }
    if (question.maxSelections && selectedKeys.length > question.maxSelections) {
      throw new Error(`Question ${question.key} allows up to ${question.maxSelections} selections`);
    }
    const allowed = new Map(question.options.map((item) => [item.key, item]));
    normalized.set(
      question.key,
      selectedKeys.map((key) => {
        const selected = allowed.get(key);
        if (!selected) throw new Error(`Unknown option key "${key}" for ${question.key}`);
        return selected;
      }),
    );
  }
  return { definition, normalized };
}

function addCapped(target: number[], additions: number[]) {
  additions.forEach((value, index) => {
    target[index] += Math.min(3, value);
  });
}

function aggregate(input: CortexInput) {
  const { definition, normalized } = assertAndNormalize(input);
  const diagnostic = emptyDiagnostic();
  const solutions = emptySolutions();
  const platforms = emptyPlatforms();
  const flags = new Set<SignalTag>();
  const trace: ExplanationTraceEntry[] = [];
  let readiness: ReadinessLevel = "researching";

  for (const question of definition.questions) {
    const selected = normalized.get(question.key) ?? [];
    const before = cloneScores(diagnostic, solutions, platforms);
    const signals = selected.flatMap((item) => item.signals);
    signals.forEach((signal) => flags.add(signal));

    if (["q1_business_model", "q2_goal", "q3_current_journey", "q4_bottlenecks", "q6_customer_requirements", "q7_post_conversion", "q8_scope"].includes(question.key)) {
      const diagnosticDelta = [0, 0, 0];
      const solutionDelta = [0, 0, 0, 0, 0];
      const platformDelta = [0, 0, 0];
      for (const signal of signals) {
        const weight = SIGNAL_WEIGHTS[signal];
        weight.diagnostic.forEach((value, index) => (diagnosticDelta[index] += value));
        weight.solution.forEach((value, index) => (solutionDelta[index] += value));
        weight.platform.forEach((value, index) => (platformDelta[index] += value));
      }
      const diagnosticTarget = [diagnostic.acquisitionNeed, diagnostic.automationNeed, diagnostic.systemComplexity];
      const solutionTarget = [solutions.website, solutions.funnel, solutions.automation, solutions.crm, solutions.customApp];
      const platformTarget = [platforms.systeme, platforms.ghl, platforms.customBuild];
      addCapped(diagnosticTarget, diagnosticDelta);
      addCapped(solutionTarget, solutionDelta);
      addCapped(platformTarget, platformDelta);
      [diagnostic.acquisitionNeed, diagnostic.automationNeed, diagnostic.systemComplexity] = diagnosticTarget;
      [solutions.website, solutions.funnel, solutions.automation, solutions.crm, solutions.customApp] = solutionTarget;
      [platforms.systeme, platforms.ghl, platforms.customBuild] = platformTarget;
    }

    if (question.key === "q9_timeline") readiness = selected[0].readiness ?? "researching";
    if (question.key === "q10_platform") {
      const preference = selected[0].platformPreference;
      if (preference === "systeme_io") platforms.systeme += 2;
      if (preference === "gohighlevel") platforms.ghl += 2;
      if (preference === "custom_app") platforms.customBuild += 2;
    }

    trace.push({
      questionKey: question.key,
      optionKeys: selected.map((item) => item.key),
      signals: [...new Set(signals)],
      before,
      after: cloneScores(diagnostic, solutions, platforms),
      flags: [...new Set(signals.filter((signal) => GENUINE_CUSTOM_SIGNALS.has(signal)))],
    });
  }

  return { definition, normalized, diagnostic, solutions, platforms, flags, trace, readiness };
}

function solutionValue(scores: SolutionScores, solution: SolutionType) {
  return solution === "custom_app" ? scores.customApp : scores[solution];
}

function choosePrimarySolution(scores: SolutionScores, flags: Set<SignalTag>) {
  let ranked = SOLUTIONS.map((key) => ({ key, score: solutionValue(scores, key) })).sort(
    (left, right) => right.score - left.score || SOLUTIONS.indexOf(left.key) - SOLUTIONS.indexOf(right.key),
  );
  const top = ranked[0];
  if (top.score < 4) return top.key;

  if (flags.has("simple_scope") && flags.has("credibility") && scores.website >= 4 && scores.funnel - scores.website <= 2) {
    return "website";
  }

  const website = scores.website;
  const funnel = scores.funnel;
  if (Math.abs(website - funnel) <= 1 && Math.max(website, funnel) >= top.score - 1) {
    const conversionSignals = ["booking", "enrollment", "checkout", "lead_generation"] as const;
    const favorsFunnel = conversionSignals.some((signal) => flags.has(signal));
    const favorsWebsite = flags.has("credibility") && !flags.has("booking") && !flags.has("enrollment") && !flags.has("checkout");
    const winner: SolutionType = favorsWebsite ? "website" : favorsFunnel ? "funnel" : website >= funnel ? "website" : "funnel";
    ranked = [{ key: winner, score: solutionValue(scores, winner) }, ...ranked.filter((item) => item.key !== winner)];
  }

  const automation = scores.automation;
  const crm = scores.crm;
  if (Math.abs(automation - crm) <= 1 && Math.max(automation, crm) >= ranked[0].score - 1) {
    const winner: SolutionType = flags.has("pipeline") || flags.has("dashboard") ? "crm" : "automation";
    ranked = [{ key: winner, score: solutionValue(scores, winner) }, ...ranked.filter((item) => item.key !== winner)];
  }
  return ranked[0].key;
}

function customRequirementReasons(input: CortexInput): string[] {
  const keys = answerKeys(input.answers);
  const reasons: string[] = [];
  if (["order_scope_inventory", "order_after_inventory", "order_blocker_inventory", "order_addon_inventory"].some((key) => keys.has(key))) {
    reasons.push("Inventory or raw-material tracking requires persistent operational records.");
  }
  if (["order_scope_dynamic_pricing", "order_addon_pricing", "order_scope_delivery_calculation", "order_addon_delivery_fee"].some((key) => keys.has(key))) {
    reasons.push("Dynamic pricing or delivery calculations require custom business rules.");
  }
  if (["order_scope_permissions", "order_addon_roles", "service_scope_compliance"].some((key) => keys.has(key))) {
    reasons.push("Specialized staff permissions require purpose-built access controls.");
  }
  if (
    keys.has("order_scope_production") &&
    ["order_scope_proof", "order_scope_revisions", "order_after_approval", "order_after_revisions"].some((key) => keys.has(key))
  ) {
    reasons.push("Connected proof, revision, approval, and production states require a specialized operational workflow.");
  }
  return reasons;
}

function chooseRoute(input: CortexInput): BuildRoute {
  return customRequirementReasons(input).length ? "custom" : "platform";
}

function choosePlatform(input: CortexInput, route: BuildRoute, platforms: PlatformScores, flags: Set<SignalTag>): PlatformKey {
  if (route === "custom") return "custom_app";
  const keys = answerKeys(input.answers);
  const preferred = keys.has("platform_systeme") ? "systeme_io" : keys.has("platform_highlevel") ? "gohighlevel" : null;
  const highLevelJourney = input.audienceKey === "service_businesses" || (
    keys.has("coach_customer_apply") && keys.has("coach_customer_book") &&
    (keys.has("coach_customer_follow_up") || keys.has("coach_after_intake"))
  );
  if (highLevelJourney) return "gohighlevel";
  if (input.audienceKey === "coaches_educators") return preferred ?? "systeme_io";
  if (input.audienceKey === "custom_order_businesses") return preferred ?? "gohighlevel";
  if (preferred) return preferred;
  if (platforms.systeme > platforms.ghl) return "systeme_io";
  if (platforms.ghl > platforms.systeme) return "gohighlevel";
  const systemeSignals = ["enrollment", "course_delivery", "checkout"] as const;
  const ghlSignals = ["booking", "pipeline", "follow_up"] as const;
  const systemeFit = systemeSignals.filter((signal) => flags.has(signal)).length;
  const ghlFit = ghlSignals.filter((signal) => flags.has(signal)).length;
  return systemeFit > ghlFit ? "systeme_io" : "gohighlevel";
}

function chooseOffer(
  input: CortexInput,
  route: BuildRoute,
  pages: readonly string[],
  automations: readonly string[],
  flags: Set<SignalTag>,
) {
  const keys = answerKeys(input.answers);
  if (route === "platform") {
    const complete = pages.length > 8 || automations.length > 7 || flags.has("multiple_offers") ||
      ["service_scope_team", "service_scope_assignment", "service_scope_pipelines"].filter((key) => keys.has(key)).length >= 2;
    if (complete) return "platform_scale";
    const advanced = pages.length > 5 || automations.length > 3 ||
      (["pipeline", "onboarding", "enrollment"] as const).some((signal) => flags.has(signal)) ||
      keys.has("coach_customer_apply") || keys.has("service_customer_qualify");
    if (advanced) return "platform_growth";
    return "platform_launch";
  }
  const hardCount = customRequirementReasons(input).length;
  const completeArchitecture = hardCount >= 3 || (
    keys.has("order_scope_inventory") && keys.has("order_scope_production") && keys.has("order_scope_permissions")
  );
  if (completeArchitecture || pages.length > 15) return "custom_complete";
  if (pages.length > 10 || flags.has("portal") || flags.has("dashboard") || flags.has("multiple_roles")) return "custom_growth";
  if (pages.length > 6 || flags.has("approvals") || flags.has("order_tracking")) return "custom_foundation";
  return "custom_starter";
}

function solutionTitle(primary: SolutionType, input: CortexInput, flags: Set<SignalTag>) {
  if (primary === "custom_app") {
    return input.audienceKey === "custom_order_businesses" ? "Custom Order Management App" : "Custom Operations System";
  }
  if (primary === "website") return "Conversion Website";
  if (
    input.audienceKey === "service_businesses" &&
    flags.has("booking") &&
    flags.has("pipeline") &&
    flags.has("follow_up")
  ) {
    return "Lead-to-Client System";
  }
  if (primary === "funnel") {
    if (flags.has("enrollment")) return "Enrollment Funnel";
    if (input.audienceKey === "service_businesses") return "Lead-to-Client System";
    if (input.audienceKey === "custom_order_businesses") return "Custom Order Journey";
    return "Lead Generation Funnel";
  }
  if (primary === "crm") return "CRM and Pipeline System";
  return "Follow-Up Automation System";
}

export function calculateRecommendation(input: CortexInput): CortexResult {
  const aggregated = aggregate(input);
  const route = chooseRoute(input);
  let primary = choosePrimarySolution(aggregated.solutions, aggregated.flags);
  const highestSolutionScore = Math.max(
    ...SOLUTIONS.map((solution) => solutionValue(aggregated.solutions, solution)),
  );
  const lowConfidence = highestSolutionScore < 4;
  if (lowConfidence) {
    const q1Scores = aggregated.trace.find((entry) => entry.questionKey === "q2_goal")?.after.solutions;
    if (q1Scores) primary = choosePrimarySolution(q1Scores, aggregated.flags);
  }
  const scoredPrimary = primary;
  if (route === "custom") primary = "custom_app";
  const customRouteOverrodePrimary = route === "custom" && scoredPrimary !== "custom_app";
  const platform = choosePlatform(input, route, aggregated.platforms, aggregated.flags);
  const recommendedPages = buildPages(input.audienceKey, input.answers);
  const recommendedAutomations = buildAutomations(input.audienceKey, input.answers);
  const offerKey = chooseOffer(input, route, recommendedPages, recommendedAutomations, aggregated.flags);
  const offer = PACKAGE_BY_KEY.get(offerKey);
  if (!offer) throw new Error(`Unknown offer key ${offerKey}`);
  const selectedSupportOptionKeys = aggregated.normalized.get("q11_addons")?.map((option) => option.key) ?? [];
  const pricing = resolveOfferPricing(offerKey, selectedSupportOptionKeys);
  const primaryScore = solutionValue(aggregated.solutions, primary);
  const supportingSolutionTypes = SOLUTIONS.filter(
    (solution) =>
      solution !== primary &&
      solutionValue(aggregated.solutions, solution) >= 4 &&
      Math.abs(primaryScore - solutionValue(aggregated.solutions, solution)) <= 2,
  );
  const selectedSignalLabels = [...aggregated.flags].filter((signal) => !["simple_scope", "no_system_effect"].includes(signal));
  const location = normalizeLocation(input.location);
  const assessmentProfile = buildAssessmentProfile(input.audienceKey, input.answers, aggregated.readiness);
  const hardCustomReasons = customRequirementReasons(input);
  const payment = buildPaymentGuidance(input.audienceKey, input.answers, location, platform);
  const platformExplanation = buildPlatformReasons(input.audienceKey, input.answers, platform, hardCustomReasons);
  const totalUsd = offer.basePriceUsd + pricing.addonTotalUsd;
  const displayPriceLocal = location.fxRate ? Math.round(totalUsd * location.fxRate) : null;
  const demandCaution = (input.answers.q5_demand_health ?? []).includes("demand_early_awareness")
    ? " Traffic and awareness are still developing, so the system should improve conversion without being presented as a substitute for consistent visibility."
    : "";
  const primaryBottleneck = assessmentProfile.primaryBottlenecks[0] ?? "The current customer journey relies on avoidable manual steps.";
  const secondaryBottleneck = assessmentProfile.primaryBottlenecks[1] ?? null;
  const packageReasons = [
    `${recommendedPages.length} planned customer-facing pages or application screens`,
    `${recommendedAutomations.length} relevant confirmations, reminders, or follow-up workflows`,
    route === "custom" ? "Specialized operational requirements that need a purpose-built application" : "A connected customer journey supported by the selected platform",
  ];
  const decisionTrace: DecisionTraceEntry[] = [
    {
      ruleKey: "primary_solution",
      outcome: primary,
      reason: customRouteOverrodePrimary
        ? `The score-based primary was ${scoredPrimary.replace("_", " ")}, but an approved custom-route guardrail requires custom app as the primary solution.`
        : lowConfidence
        ? "No solution reached the qualifying score of 4, so the primary recommendation follows the Q1 goal signal and is marked low confidence."
        : `The highest qualifying solution score and the approved tie-break rules selected ${primary.replace("_", " ")}.`,
    },
    {
      ruleKey: "build_route",
      outcome: route,
      reason: route === "custom"
        ? "Approved custom-operation or critical-complexity signals require a custom route."
        : "No approved rule required a custom build, so the recommendation stays on the platform route.",
    },
    {
      ruleKey: "platform",
      outcome: platform,
      reason: route === "custom"
        ? "A custom application is required by the selected build route."
        : "Platform-fit scores and the approved audience tie-break selected this platform.",
    },
    {
      ruleKey: "base_offer",
      outcome: offerKey,
      reason: `The ${route} route, system-complexity score of ${aggregated.diagnostic.systemComplexity}, and capability guardrails selected this offer.`,
    },
    {
      ruleKey: "pricing",
      outcome: String(offer.basePriceUsd + pricing.addonTotalUsd),
      reason: "The estimate uses the approved base price plus only selected add-ons not already included in the offer; scope-review items remain unpriced.",
    },
  ];

  return {
    cortexVersion: CORTEX_VERSION,
    questionSetVersion: QUESTION_SET_VERSION,
    catalogVersion: CATALOG_VERSION,
    audienceKey: input.audienceKey,
    audienceLabel: aggregated.definition.resultLabel,
    recommendedBuildRoute: route,
    recommendedPlatform: platform,
    recommendedOfferKey: offerKey,
    recommendedOfferName: offer.name,
    recommendedOfferDescription: offer.description,
    recommendedOfferIncludedFeatures: [...offer.includedFeatures],
    primarySolutionType: primary,
    supportingSolutionTypes,
    recommendedSolutionTitle: solutionTitle(primary, input, aggregated.flags),
    diagnosisSummary: `Your answers point to ${selectedSignalLabels.slice(0, 3).join(", ").replaceAll("_", " ") || "a focused first step"} as the clearest priorities.${demandCaution}`,
    recommendationReason: `${offer.name} matches the required workflow and current system complexity without using readiness to reduce the scope.`,
    technicalConstraintSignals: [...aggregated.flags].filter((signal) => GENUINE_CUSTOM_SIGNALS.has(signal)),
    selectedSupportOptionKeys,
    includedCapabilities: pricing.includedCapabilities,
    selectedAddons: pricing.selectedAddons,
    selectedSupportItems: pricing.selectedSupportItems,
    pricedAddons: pricing.pricedAddons,
    scopeReviewItems: pricing.scopeReviewItems,
    futurePhaseSuggestions: supportingSolutionTypes.map((solution) => `Consider ${solution.replace("_", " ")} support in a later approved phase.`),
    scores: { ...aggregated.diagnostic, ...aggregated.solutions, ...aggregated.platforms },
    readinessLevel: aggregated.readiness,
    basePriceUsd: offer.basePriceUsd,
    addonTotalUsd: pricing.addonTotalUsd,
    adjustmentTotalUsd: 0,
    estimatedProjectInvestmentUsd: totalUsd,
    estimatedRecurringCosts: pricing.estimatedRecurringCosts,
    explanationTrace: aggregated.trace,
    decisionTrace,
    confidenceLevel: lowConfidence ? "low" : "standard",
    confidenceMessage: lowConfidence
      ? "Low-confidence planning recommendation: no solution reached the qualifying score, so this direction follows your primary goal and should be confirmed in a strategy call."
      : "The recommendation met the approved qualifying-score and route rules.",
    roadmapVersion: ROADMAP_VERSION,
    location,
    assessmentProfile,
    pointASummary: `${assessmentProfile.currentJourney} ${assessmentProfile.demandHealth}`,
    problemSummary: secondaryBottleneck
      ? `${primaryBottleneck} A second issue is that ${secondaryBottleneck.charAt(0).toLowerCase()}${secondaryBottleneck.slice(1)}`
      : primaryBottleneck,
    solutionSummary: `The business needs a connected ${recommendedPages.join(" → ")} journey supported by ${recommendedAutomations.length ? "the relevant confirmations and follow-up" : "a clear handoff between each step"}.`,
    pointBSummary: assessmentProfile.desiredOutcome,
    primaryBottleneck,
    secondaryBottleneck,
    recommendedCustomerJourney: recommendedPages,
    recommendedPages,
    recommendedAutomations,
    recommendedPaymentOptions: payment.options,
    includedPaymentSetupCount: paymentSetupLimit(offerKey),
    requiredIntegrations: payment.integrations,
    optionalEnhancements: assessmentProfile.requestedAddons.map((item) => `${item} — optional; final inclusion or price is confirmed during discovery.`),
    clientRequirements: buildClientRequirements(input.audienceKey, input.answers),
    thirdPartyCosts: buildThirdPartyCosts(platform, input.answers),
    platformReasons: platformExplanation.reasons,
    alternativePlatformReasons: platformExplanation.alternatives,
    packageReasons,
    displayCurrency: location.displayCurrency,
    currencySymbol: location.currencySymbol,
    displayPriceLocal,
    fxRate: location.fxRate,
    fxRateTimestamp: location.fxRateTimestamp,
    projectDepositLocal: displayPriceLocal === null ? null : Math.round(displayPriceLocal / 2),
    projectBalanceLocal: displayPriceLocal === null ? null : Math.round(displayPriceLocal / 2),
  };
}
