import { ADDON_BY_KEY, PACKAGE_BY_KEY } from "./catalog";
import { QUIZ_DEFINITIONS } from "./questions";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
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
} from "./types";

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

    if (["q1_goal", "q2_setup", "q3_blocker", "q4_capabilities", "q5_complexity", "q8_support"].includes(question.key)) {
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

    if (question.key === "q6_readiness") readiness = selected[0].readiness ?? "researching";
    if (question.key === "q7_platform") {
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

function chooseRoute(scores: SolutionScores, platforms: PlatformScores, flags: Set<SignalTag>): BuildRoute {
  if (flags.has("inventory") || flags.has("multiple_roles")) return "custom";
  const hasCustomSignal = [...flags].some((signal) => GENUINE_CUSTOM_SIGNALS.has(signal));
  if (!hasCustomSignal) return "platform";
  if (flags.has("portal") && flags.has("dashboard")) return "custom";
  const highestSolution = Math.max(scores.website, scores.funnel, scores.automation, scores.crm, scores.customApp);
  const customLeadsPlatforms = platforms.customBuild >= Math.max(platforms.systeme, platforms.ghl) + 2;
  return scores.customApp >= highestSolution || customLeadsPlatforms ? "custom" : "platform";
}

function choosePlatform(route: BuildRoute, platforms: PlatformScores, flags: Set<SignalTag>): PlatformKey {
  if (route === "custom") return "custom_app";
  if (platforms.systeme > platforms.ghl) return "systeme_io";
  if (platforms.ghl > platforms.systeme) return "gohighlevel";
  const systemeSignals = ["enrollment", "course_delivery", "checkout"] as const;
  const ghlSignals = ["booking", "pipeline", "follow_up"] as const;
  const systemeFit = systemeSignals.filter((signal) => flags.has(signal)).length;
  const ghlFit = ghlSignals.filter((signal) => flags.has(signal)).length;
  return systemeFit > ghlFit ? "systeme_io" : "gohighlevel";
}

function chooseOffer(route: BuildRoute, complexity: number, flags: Set<SignalTag>) {
  if (route === "platform") {
    if (complexity >= 10 || flags.has("multiple_offers")) return "platform_scale";
    if (complexity >= 5 || flags.has("pipeline") || flags.has("onboarding") || flags.has("enrollment")) return "platform_growth";
    return "platform_launch";
  }
  if (flags.has("inventory") || flags.has("multiple_roles") || complexity >= 13) return "custom_complete";
  if (flags.has("portal") || flags.has("dashboard") || complexity >= 9) return "custom_growth";
  if (complexity >= 5) return "custom_foundation";
  return "custom_starter";
}

function isIncluded(addonKey: string, offerKey: string) {
  const offer = PACKAGE_BY_KEY.get(offerKey);
  const addon = ADDON_BY_KEY.get(addonKey);
  if (!offer || !addon) return false;
  if (addon.includedInOfferKeys.includes(offerKey)) return true;
  if (addonKey === "advanced_booking_setup") return offer.includedCapabilityKeys.some((key) => key.includes("booking"));
  if (addonKey === "additional_email_automation") return offer.includedCapabilityKeys.some((key) => key.includes("email") || key.includes("nurture"));
  if (addonKey === "additional_crm_pipeline") return offer.includedCapabilityKeys.some((key) => key.includes("pipeline"));
  if (addonKey === "advanced_onboarding_workflow") return offer.includedCapabilityKeys.some((key) => key.includes("onboarding"));
  if (addonKey === "custom_order_management_module") return offer.offerKey === "custom_complete";
  if (addonKey === "inventory_production_module") return offer.offerKey === "custom_complete";
  return false;
}

function resolvePricing(
  route: BuildRoute,
  offerKey: string,
  q8Options: readonly QuizOption[],
) {
  const offer = PACKAGE_BY_KEY.get(offerKey);
  if (!offer) throw new Error(`Unknown offer key ${offerKey}`);
  const selectedAddons: string[] = [];
  const includedCapabilities: string[] = [];
  const pricedAddons: CortexResult["pricedAddons"][number][] = [];
  const scopeReviewItems: CortexResult["scopeReviewItems"][number][] = [];
  let integrationAllowance = offer.integrationAllowance;

  for (const selected of q8Options) {
    let addonKey = selected.addonKey;
    if (selected.key === "support_portal") {
      addonKey = route === "custom" ? "basic_custom_portal_module" : "platform_membership_course_area";
    }
    if (!addonKey) continue;
    selectedAddons.push(addonKey);
    const addon = ADDON_BY_KEY.get(addonKey);
    if (!addon) throw new Error(`Unknown add-on key ${addonKey}`);

    if (addonKey === "standard_third_party_integration" && integrationAllowance > 0) {
      integrationAllowance -= 1;
      includedCapabilities.push(addonKey);
    } else if (isIncluded(addonKey, offerKey)) {
      includedCapabilities.push(addonKey);
    } else if (addon.requiresScopeReview) {
      scopeReviewItems.push({
        key: addonKey,
        label: addon.name,
        startingPriceUsd: addon.startingPriceUsd,
        reason: addon.description,
      });
    } else {
      pricedAddons.push({
        addonKey,
        name: addon.name,
        priceUsd: addon.startingPriceUsd,
        startingAt: addon.pricingUnit.toLowerCase().includes("starting"),
      });
    }

    if (selected.key === "support_follow_up") {
      scopeReviewItems.push({
        key: "sms_automation_setup",
        label: "SMS automation confirmation",
        reason: "SMS workflow scope and provider usage must be confirmed separately.",
      });
    }
  }

  const addonTotalUsd = pricedAddons.reduce((total, addon) => total + addon.priceUsd, 0);
  return {
    selectedAddons,
    includedCapabilities,
    pricedAddons,
    scopeReviewItems,
    addonTotalUsd,
    estimatedRecurringCosts: route === "platform"
      ? ["The selected platform subscription and any email or SMS usage are paid separately by the client."]
      : ["Third-party services, email delivery, SMS usage, and other recurring services are paid separately when required."],
  };
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
  const route = chooseRoute(aggregated.solutions, aggregated.platforms, aggregated.flags);
  let primary = choosePrimarySolution(aggregated.solutions, aggregated.flags);
  const highestSolutionScore = Math.max(
    ...SOLUTIONS.map((solution) => solutionValue(aggregated.solutions, solution)),
  );
  const lowConfidence = highestSolutionScore < 4;
  if (lowConfidence) {
    const q1Scores = aggregated.trace.find((entry) => entry.questionKey === "q1_goal")?.after.solutions;
    if (q1Scores) primary = choosePrimarySolution(q1Scores, aggregated.flags);
  }
  const scoredPrimary = primary;
  if (route === "custom") primary = "custom_app";
  const customRouteOverrodePrimary = route === "custom" && scoredPrimary !== "custom_app";
  const platform = choosePlatform(route, aggregated.platforms, aggregated.flags);
  const offerKey = chooseOffer(route, aggregated.diagnostic.systemComplexity, aggregated.flags);
  const offer = PACKAGE_BY_KEY.get(offerKey);
  if (!offer) throw new Error(`Unknown offer key ${offerKey}`);
  const q8Options = aggregated.normalized.get("q8_support") ?? [];
  const pricing = resolvePricing(route, offerKey, q8Options);
  const includedKeys = new Set(pricing.includedCapabilities);
  const pricedKeys = new Set(pricing.pricedAddons.map((item) => item.addonKey));
  const selectedSupportItems = pricing.selectedAddons.map((key) => {
    const addon = ADDON_BY_KEY.get(key);
    if (!addon) throw new Error(`Unknown selected support key ${key}`);
    return {
      key,
      label: addon.name,
      disposition: includedKeys.has(key)
        ? "included" as const
        : pricedKeys.has(key)
          ? "priced" as const
          : "scope_review" as const,
    };
  });
  const primaryScore = solutionValue(aggregated.solutions, primary);
  const supportingSolutionTypes = SOLUTIONS.filter(
    (solution) =>
      solution !== primary &&
      solutionValue(aggregated.solutions, solution) >= 4 &&
      Math.abs(primaryScore - solutionValue(aggregated.solutions, solution)) <= 2,
  );
  const selectedSignalLabels = [...aggregated.flags].filter((signal) => !["simple_scope", "no_system_effect"].includes(signal));
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
    diagnosisSummary: `Your answers point to ${selectedSignalLabels.slice(0, 3).join(", ").replaceAll("_", " ") || "a focused first step"} as the clearest priorities.`,
    recommendationReason: `${offer.name} matches the required workflow and current system complexity without using readiness to reduce the scope.`,
    includedCapabilities: pricing.includedCapabilities,
    selectedAddons: pricing.selectedAddons,
    selectedSupportItems,
    pricedAddons: pricing.pricedAddons,
    scopeReviewItems: pricing.scopeReviewItems,
    futurePhaseSuggestions: supportingSolutionTypes.map((solution) => `Consider ${solution.replace("_", " ")} support in a later approved phase.`),
    scores: { ...aggregated.diagnostic, ...aggregated.solutions, ...aggregated.platforms },
    readinessLevel: aggregated.readiness,
    basePriceUsd: offer.basePriceUsd,
    addonTotalUsd: pricing.addonTotalUsd,
    adjustmentTotalUsd: 0,
    estimatedProjectInvestmentUsd: offer.basePriceUsd + pricing.addonTotalUsd,
    estimatedRecurringCosts: pricing.estimatedRecurringCosts,
    explanationTrace: aggregated.trace,
    decisionTrace,
    confidenceLevel: lowConfidence ? "low" : "standard",
    confidenceMessage: lowConfidence
      ? "Low-confidence planning recommendation: no solution reached the qualifying score, so this direction follows your primary goal and should be confirmed in a strategy call."
      : "The recommendation met the approved qualifying-score and route rules.",
  };
}
