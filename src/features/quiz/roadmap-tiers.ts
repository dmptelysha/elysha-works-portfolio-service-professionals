import { PACKAGE_BY_KEY } from "./catalog";
import type { PlatformKey, PublicTierKey } from "./types";

export const PUBLIC_TIER_DEFINITIONS = [
  {
    tierKey: "basic",
    label: "Basic",
    promise: "A complete working version of your primary journey.",
    offerKeys: {
      systeme_io: "platform_launch",
      gohighlevel: "platform_launch",
      custom_app: "custom_starter",
    },
  },
  {
    tierKey: "advanced",
    label: "Advanced",
    promise: "A connected journey with qualification, automation, and visibility.",
    offerKeys: {
      systeme_io: "platform_growth",
      gohighlevel: "platform_growth",
      custom_app: "custom_foundation",
    },
  },
  {
    tierKey: "complete",
    label: "Complete",
    promise: "The broadest standard implementation for connected growth and operations.",
    offerKeys: {
      systeme_io: "platform_scale",
      gohighlevel: "platform_scale",
      custom_app: "custom_growth",
    },
  },
] as const;

export function offerKeyForTierPlatform(tierKey: PublicTierKey, platform: PlatformKey) {
  const definition = PUBLIC_TIER_DEFINITIONS.find((item) => item.tierKey === tierKey);
  if (!definition) throw new Error(`Unknown public tier: ${tierKey}`);
  const offerKey = definition.offerKeys[platform];
  const offer = PACKAGE_BY_KEY.get(offerKey);
  if (!offer || !offer.supportedPlatforms.includes(platform)) {
    throw new Error(`No approved offer for ${tierKey}/${platform}`);
  }
  return offerKey;
}
