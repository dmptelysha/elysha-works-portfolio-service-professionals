import { buildPointABSummary } from "./point-a-point-b.ts";
import { buildRoadmapTiers, resolveRoadmapSelection } from "./roadmap-options.ts";
import type {
  CortexResult,
  LeadContactInput,
  ProposalContentViewModel,
  ProposalDraftViewModel,
  ProposalViewModel,
  QuizAnswers,
  RoadmapSelection,
} from "./types.ts";

function buildContent(
  contact: LeadContactInput,
  answers: QuizAnswers,
  result: CortexResult,
  selection: RoadmapSelection,
): ProposalContentViewModel {
  const firstName = contact.firstName.trim();
  const businessName = contact.businessName.trim();
  if (!firstName || !businessName || !contact.consent) {
    throw new Error("Valid contact identity and consent are required");
  }

  resolveRoadmapSelection(result, selection);
  const pointAB = buildPointABSummary(businessName, result.audienceKey, answers);
  return Object.freeze({
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
  contact: LeadContactInput,
  answers: QuizAnswers,
  result: CortexResult,
  selection: RoadmapSelection,
): ProposalDraftViewModel {
  return Object.freeze({ ...buildContent(contact, answers, result, selection), expiresAt: null });
}

export function buildProposalViewModel(
  contact: LeadContactInput,
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
