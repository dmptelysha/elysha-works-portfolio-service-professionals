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
  return Object.freeze({
    audienceKey: result.audienceKey,
    client: Object.freeze({ firstName, businessName }),
    ...pointAB,
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
