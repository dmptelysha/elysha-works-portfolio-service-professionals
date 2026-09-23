import { buildPointABSummary } from "./point-a-point-b.ts";
import { buildRoadmapTiers, resolveRoadmapSelection } from "./roadmap-options.ts";
import type {
  CortexResult,
  ClientIdentity,
  ProposalContentViewModel,
  ProposalDraftViewModel,
  ProposalViewModel,
  QuizAnswers,
  RoadmapSelection,
} from "./types.ts";

function buildContent(
  contact: ClientIdentity,
  answers: QuizAnswers,
  result: CortexResult,
  selection: RoadmapSelection,
): ProposalContentViewModel {
  const firstName = contact.firstName.trim();
  const businessName = contact.businessName.trim();
  if (!firstName || !businessName) {
    throw new Error("Valid client identity is required");
  }

  resolveRoadmapSelection(result, selection);
  const pointAB = buildPointABSummary(businessName, result.audienceKey, answers);
  const ownership = Object.freeze([
    Object.freeze({ item: "Strategy and system architecture", elyshaWorks: "Included", client: "Provides business information" }),
    Object.freeze({ item: "Design and build", elyshaWorks: "Included", client: "Reviews and approves" }),
    Object.freeze({ item: "Domain", elyshaWorks: "Connects and configures", client: "Purchases and owns" }),
    Object.freeze({ item: "Platform or hosting account", elyshaWorks: "Configures the selected system", client: "Pays for and owns the account" }),
    Object.freeze({ item: "Payment account", elyshaWorks: "Connects within the package limit", client: "Owns, verifies, and receives funds" }),
    Object.freeze({ item: "Business email", elyshaWorks: "Configures where required", client: "Owns the mailbox service" }),
    Object.freeze({ item: "Third-party fees", elyshaWorks: "No undisclosed markup", client: "Pays each provider directly" }),
    Object.freeze({ item: "Final approved system", elyshaWorks: "Builds, tests, and hands over", client: "Owns after full payment" }),
  ]);
  return Object.freeze({
    audienceKey: result.audienceKey,
    client: Object.freeze({ firstName, businessName }),
    ...pointAB,
    problem: Object.freeze({
      primary: result.primaryBottleneck,
      secondary: result.secondaryBottleneck,
      summary: result.problemSummary,
    }),
    missingSystem: result.solutionSummary,
    customerJourney: Object.freeze([...result.recommendedCustomerJourney]),
    platform: Object.freeze({
      recommended: result.recommendedPlatform,
      reasons: Object.freeze([...result.platformReasons]),
      alternatives: Object.freeze({ ...result.alternativePlatformReasons }),
    }),
    package: Object.freeze({
      offerName: result.recommendedOfferName,
      reasons: Object.freeze([...result.packageReasons]),
    }),
    pages: Object.freeze([...result.recommendedPages]),
    automations: Object.freeze([...result.recommendedAutomations]),
    payment: Object.freeze({
      options: Object.freeze([...result.recommendedPaymentOptions]),
      includedSetupCount: result.includedPaymentSetupCount,
    }),
    domainAndEmail: Object.freeze({
      domainOwnership: "The client purchases and owns the business domain.",
      domainSetup: "Elysha Works connects and configures the domain for the selected system.",
      businessEmail: "The client owns the professional mailbox; Elysha Works configures it for confirmations and automated messages where required.",
    }),
    investment: Object.freeze({
      basePriceUsd: result.basePriceUsd,
      estimatedTotalUsd: result.estimatedProjectInvestmentUsd,
      currency: result.displayCurrency,
      symbol: result.currencySymbol,
      localTotal: result.displayPriceLocal,
      fxRate: result.fxRate,
      fxRateTimestamp: result.fxRateTimestamp,
    }),
    includedScope: Object.freeze([...result.recommendedOfferIncludedFeatures]),
    optionalEnhancements: Object.freeze([...result.optionalEnhancements]),
    ongoingCosts: Object.freeze([...result.thirdPartyCosts]),
    clientRequirements: Object.freeze([...result.clientRequirements]),
    ownership,
    paymentSchedule: Object.freeze({
      depositPercent: 50 as const,
      balancePercent: 50 as const,
      depositAmount: result.projectDepositLocal,
      balanceAmount: result.projectBalanceLocal,
    }),
    pathToPointB: Object.freeze({
      today: result.pointASummary,
      withSystem: result.solutionSummary,
      target: result.pointBSummary,
    }),
    disclaimer: "This is a preliminary recommended roadmap based on the information provided in the assessment. Final scope is confirmed during the discovery call after we review your existing tools, content, data, integrations, and special requirements.",
    recommendation: Object.freeze({
      title: result.recommendedSolutionTitle,
      reason: result.recommendationReason,
      buildRoute: result.recommendedBuildRoute,
      platform: result.recommendedPlatform,
      offerKey: result.recommendedOfferKey,
      offerName: result.recommendedOfferName,
      basePriceUsd: result.basePriceUsd,
      includedFeatures: Object.freeze([...result.recommendedOfferIncludedFeatures]),
      estimatedProjectInvestmentUsd: result.estimatedProjectInvestmentUsd,
    }),
    selection: Object.freeze({ ...selection }),
    tiers: Object.freeze([...buildRoadmapTiers(result)]),
  });
}

export function buildProposalDraft(
  contact: ClientIdentity,
  answers: QuizAnswers,
  result: CortexResult,
  selection: RoadmapSelection,
): ProposalDraftViewModel {
  return Object.freeze({ ...buildContent(contact, answers, result, selection), expiresAt: null });
}

export function buildProposalViewModel(
  contact: ClientIdentity,
  answers: QuizAnswers,
  result: CortexResult,
  selection: RoadmapSelection,
  expiresAt: string,
): ProposalViewModel {
  const parsedExpiry = Date.parse(expiresAt);
  if (!Number.isFinite(parsedExpiry)) throw new Error("A valid proposal expiration timestamp is required");
  return Object.freeze({
    ...buildContent(contact, answers, result, selection),
    expiresAt: new Date(parsedExpiry).toISOString(),
  });
}
