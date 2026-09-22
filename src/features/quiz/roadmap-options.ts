import { PACKAGE_BY_KEY } from "./catalog";
import { resolveOfferPricing } from "./pricing";
import { offerKeyForTierPlatform, PUBLIC_TIER_DEFINITIONS } from "./roadmap-tiers";
import type {
  CortexResult,
  PlatformKey,
  PublicTierKey,
  RoadmapSelection,
  RoadmapTier,
  RoadmapVariant,
  SignalTag,
} from "./types";

const PLATFORMS: readonly PlatformKey[] = ["systeme_io", "gohighlevel", "custom_app"];

const constraintLabels: Partial<Record<SignalTag, string>> = {
  portal: "a specialized portal",
  dashboard: "custom operational dashboards",
  custom_orders: "custom-order workflows",
  approvals: "multi-stage approvals",
  inventory: "inventory or production tracking",
  multiple_roles: "permission-based operational roles",
  order_tracking: "specialized order tracking",
};

function tierForOffer(offerKey: string): PublicTierKey {
  if (["platform_launch", "custom_starter"].includes(offerKey)) return "basic";
  if (["platform_growth", "custom_foundation"].includes(offerKey)) return "advanced";
  if (["platform_scale", "custom_growth", "custom_complete"].includes(offerKey)) return "complete";
  throw new Error(`Unknown recommended offer ${offerKey}`);
}

function unavailableReason(result: CortexResult) {
  const labels = [...new Set(result.technicalConstraintSignals.map((signal) => constraintLabels[signal]).filter(Boolean))];
  const requirements = labels.length ? labels.join(" and ") : "the required specialized workflow";
  return `This option cannot reliably support ${requirements}. Choose Custom App to keep those requirements.`;
}

function offerKeyForResult(result: CortexResult, tierKey: PublicTierKey, platform: PlatformKey) {
  if (tierKey === "complete" && platform === "custom_app" && result.recommendedOfferKey === "custom_complete") {
    return "custom_complete";
  }
  return offerKeyForTierPlatform(tierKey, platform);
}

export function buildRoadmapTiers(result: CortexResult): readonly RoadmapTier[] {
  const recommendedTier = tierForOffer(result.recommendedOfferKey);
  const blocksPlatforms = result.recommendedBuildRoute === "custom" && result.technicalConstraintSignals.length > 0;
  const reason = blocksPlatforms ? unavailableReason(result) : null;

  return PUBLIC_TIER_DEFINITIONS.map((definition) => {
    const variants: RoadmapVariant[] = PLATFORMS.map((platform) => {
      const offerKey = offerKeyForResult(result, definition.tierKey, platform);
      const offer = PACKAGE_BY_KEY.get(offerKey);
      if (!offer) throw new Error(`Unknown offer key ${offerKey}`);
      const pricing = resolveOfferPricing(offerKey, result.selectedSupportOptionKeys);
      const feasibility = blocksPlatforms && platform !== "custom_app"
        ? { available: false as const, reason: reason! }
        : { available: true as const };
      return {
        platform,
        offer,
        feasibility,
        includedCapabilities: pricing.includedCapabilities,
        selectedSupportItems: pricing.selectedSupportItems,
        pricedAddons: pricing.pricedAddons,
        scopeReviewItems: pricing.scopeReviewItems,
        addonTotalUsd: pricing.addonTotalUsd,
        estimatedProjectInvestmentUsd: offer.basePriceUsd + pricing.addonTotalUsd,
        estimatedRecurringCosts: pricing.estimatedRecurringCosts,
      };
    });
    return {
      tierKey: definition.tierKey,
      label: definition.label,
      promise: definition.promise,
      recommended: definition.tierKey === recommendedTier,
      variants,
    };
  });
}

export function defaultRoadmapSelection(result: CortexResult): RoadmapSelection {
  return {
    tierKey: tierForOffer(result.recommendedOfferKey),
    platform: result.recommendedPlatform,
    offerKey: result.recommendedOfferKey,
  };
}

export function resolveRoadmapSelection(result: CortexResult, selection: RoadmapSelection) {
  const tier = buildRoadmapTiers(result).find((item) => item.tierKey === selection.tierKey);
  const variant = tier?.variants.find((item) => item.platform === selection.platform);
  if (!tier || !variant) throw new Error("Unknown roadmap selection");
  if (!variant.feasibility.available) throw new Error(variant.feasibility.reason);
  if (variant.offer.offerKey !== selection.offerKey) throw new Error("Selected offer does not match the approved tier and platform mapping");
  return Object.freeze({
    originalRecommendation: Object.freeze({
      tierKey: tierForOffer(result.recommendedOfferKey),
      platform: result.recommendedPlatform,
      offerKey: result.recommendedOfferKey,
    }),
    selection: Object.freeze({ ...selection }),
    offer: variant.offer,
    includedCapabilities: variant.includedCapabilities,
    selectedSupportItems: variant.selectedSupportItems,
    pricedAddons: variant.pricedAddons,
    scopeReviewItems: variant.scopeReviewItems,
    basePriceUsd: variant.offer.basePriceUsd,
    addonTotalUsd: variant.addonTotalUsd,
    estimatedProjectInvestmentUsd: variant.estimatedProjectInvestmentUsd,
    estimatedRecurringCosts: variant.estimatedRecurringCosts,
  });
}
