import type {
  BusinessLocation,
  ProjectPriceQuote,
  ValidatedDiscountCampaign,
} from "./types.ts";

const FX_MAX_AGE_MS = 15 * 60 * 1000;

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;

function isValidCampaign(campaign: ValidatedDiscountCampaign): boolean {
  return (
    campaign.campaignKey === "pinoyako"
    && campaign.code === "PINOYAKO"
    && campaign.percentage === 50
  ) || (
    campaign.campaignKey === "earlybirdworks"
    && campaign.code === "EARLYBIRDWORKS"
    && campaign.percentage === 15
  );
}

interface QuoteInput {
  originalTotalUsd: number;
  location: BusinessLocation;
  campaign?: ValidatedDiscountCampaign | null;
}

export function normalizeCouponCode(value: string): string {
  return value.trim().toUpperCase();
}

export function calculateProjectPriceQuote({
  originalTotalUsd,
  location,
  campaign = null,
}: QuoteInput): ProjectPriceQuote {
  if (!Number.isFinite(originalTotalUsd) || originalTotalUsd < 0) {
    throw new Error("Invalid original total");
  }

  if (campaign && !isValidCampaign(campaign)) {
    throw new Error("Invalid discount campaign");
  }

  const originalCents = toCents(originalTotalUsd);
  if (!Number.isSafeInteger(originalCents)) {
    throw new Error("Invalid original total");
  }
  const discountCents = campaign
    ? Math.round((originalCents * campaign.percentage) / 100)
    : 0;
  const finalTotalUsd = fromCents(originalCents - discountCents);
  const hasValidFxRate = typeof location.fxRate === "number"
    && Number.isFinite(location.fxRate)
    && location.fxRate > 0;

  return Object.freeze({
    originalTotalUsd: fromCents(originalCents),
    discountAmountUsd: fromCents(discountCents),
    finalTotalUsd,
    localCurrency: location.displayCurrency,
    localSymbol: location.currencySymbol,
    finalTotalLocal: hasValidFxRate
      ? Math.round(finalTotalUsd * location.fxRate!)
      : null,
    fxRate: hasValidFxRate ? location.fxRate : null,
    fxRateTimestamp: hasValidFxRate ? location.fxRateTimestamp : null,
    campaign: campaign ? Object.freeze({ ...campaign }) : null,
  });
}

export function isCurrencyQuoteFresh(
  timestamp: string | null,
  now: Date,
  maxAgeMs = FX_MAX_AGE_MS,
): boolean {
  if (!timestamp || !Number.isFinite(now.getTime()) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return false;
  }

  const quotedAt = Date.parse(timestamp);
  if (!Number.isFinite(quotedAt)) return false;

  const ageMs = now.getTime() - quotedAt;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}
