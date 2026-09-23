import { ADDON_BY_KEY, PACKAGE_BY_KEY } from "./catalog.ts";
import { QUIZ_DEFINITIONS } from "./questions.ts";
import type { PricedAddon, ScopeReviewItem, SelectedSupportItem } from "./types.ts";

const LEGACY_SUPPORT_ADDON_KEYS: Readonly<Record<string, string | null>> = {
  support_conversion_copywriting: "conversion_copywriting",
  support_image_sourcing: "image_sourcing_selection",
  support_image_editing: "image_editing_optimization",
  support_brand_direction: "mini_brand_direction",
  support_additional_pages: "additional_page_step",
  support_booking: "advanced_booking_setup",
  support_checkout: "checkout_payment_integration",
  support_follow_up: "additional_email_automation",
  support_crm: "additional_crm_pipeline",
  support_onboarding: "advanced_onboarding_workflow",
  support_portal: null,
  support_order_management: "custom_order_management_module",
  support_dashboard: "custom_dashboard_reporting_module",
  support_inventory: "inventory_production_module",
  support_integration: "standard_third_party_integration",
  support_migration: "content_data_migration",
  support_client_assets: null,
};

const SUPPORT_ADDON_KEYS: Readonly<Record<string, string | null>> = Object.freeze({
  ...LEGACY_SUPPORT_ADDON_KEYS,
  ...Object.fromEntries(
    Object.values(QUIZ_DEFINITIONS).flatMap((definition) =>
      definition.questions.flatMap((question) =>
        question.options.map((item) => [item.key, item.addonKey ?? null] as const),
      ),
    ),
  ),
});

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

export function resolveOfferPricing(offerKey: string, selectedSupportOptionKeys: readonly string[]) {
  const offer = PACKAGE_BY_KEY.get(offerKey);
  if (!offer) throw new Error(`Unknown offer key ${offerKey}`);

  const selectedAddons: string[] = [];
  const includedCapabilities: string[] = [];
  const pricedAddons: PricedAddon[] = [];
  const scopeReviewItems: ScopeReviewItem[] = [];
  const selectedSupportItems: SelectedSupportItem[] = [];
  let integrationAllowance = offer.integrationAllowance;

  for (const optionKey of [...new Set(selectedSupportOptionKeys)]) {
    if (!(optionKey in SUPPORT_ADDON_KEYS)) throw new Error(`Unknown support option ${optionKey}`);
    let addonKey = SUPPORT_ADDON_KEYS[optionKey];
    if (optionKey === "support_portal") {
      addonKey = offer.buildRoute === "custom" ? "basic_custom_portal_module" : "platform_membership_course_area";
    }
    if (!addonKey) continue;
    const addon = ADDON_BY_KEY.get(addonKey);
    if (!addon) throw new Error(`Unknown add-on key ${addonKey}`);
    selectedAddons.push(addonKey);

    let disposition: SelectedSupportItem["disposition"];
    if (!addon.allowedBuildRoutes.includes(offer.buildRoute)) {
      disposition = "scope_review";
      scopeReviewItems.push({
        key: addonKey,
        label: addon.name,
        reason: `${addon.name} requires the Custom App route and cannot be reduced to an unsupported platform workflow.`,
      });
    } else if (addonKey === "standard_third_party_integration" && integrationAllowance > 0) {
      integrationAllowance -= 1;
      disposition = "included";
      includedCapabilities.push(addonKey);
    } else if (isIncluded(addonKey, offerKey)) {
      disposition = "included";
      includedCapabilities.push(addonKey);
    } else if (addon.requiresScopeReview) {
      disposition = "scope_review";
      scopeReviewItems.push({ key: addonKey, label: addon.name, startingPriceUsd: addon.startingPriceUsd, reason: addon.description });
    } else {
      disposition = "priced";
      pricedAddons.push({
        addonKey,
        name: addon.name,
        priceUsd: addon.startingPriceUsd,
        startingAt: addon.pricingUnit.toLowerCase().includes("starting"),
      });
    }
    selectedSupportItems.push({ key: addonKey, label: addon.name, disposition });

    if (optionKey === "support_follow_up") {
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
    selectedSupportItems,
    pricedAddons,
    scopeReviewItems,
    addonTotalUsd,
    estimatedRecurringCosts: offer.buildRoute === "platform"
      ? ["The selected platform subscription and any email or SMS usage are paid separately by the client."]
      : ["Third-party services, email delivery, SMS usage, and other recurring services are paid separately when required."],
  } as const;
}
