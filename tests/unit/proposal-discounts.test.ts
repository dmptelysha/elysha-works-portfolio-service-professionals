import { describe, expect, it } from "vitest";

import {
  calculateProjectPriceQuote,
  isCurrencyQuoteFresh,
  normalizeCouponCode,
} from "@/features/quiz/discounts";
import type { BusinessLocation, ValidatedDiscountCampaign } from "@/features/quiz/types";

const ph = {
  businessCountry: "Philippines",
  countryCode: "PH",
  displayCurrency: "PHP",
  currencySymbol: "₱",
  fxRate: 58.125,
  fxRateTimestamp: "2026-09-24T00:00:00.000Z",
} satisfies BusinessLocation;

const pinoyako = {
  campaignKey: "pinoyako",
  code: "PINOYAKO",
  percentage: 50,
} satisfies ValidatedDiscountCampaign;

const earlyBird = {
  campaignKey: "earlybirdworks",
  code: "EARLYBIRDWORKS",
  percentage: 15,
} satisfies ValidatedDiscountCampaign;

describe("proposal discount quotes", () => {
  it("normalizes public coupon input without accepting extra text", () => {
    expect(normalizeCouponCode("  pinoyako ")).toBe("PINOYAKO");
    expect(normalizeCouponCode("pinoy ako")).toBe("PINOY AKO");
  });

  it("discounts the complete selected estimate before PHP conversion", () => {
    expect(calculateProjectPriceQuote({
      originalTotalUsd: 1750.25,
      location: ph,
      campaign: pinoyako,
    })).toMatchObject({
      originalTotalUsd: 1750.25,
      discountAmountUsd: 875.13,
      finalTotalUsd: 875.12,
      finalTotalLocal: 50866,
    });
  });

  it("calculates the international fifteen-percent discount in integer cents", () => {
    expect(calculateProjectPriceQuote({
      originalTotalUsd: 2500,
      location: { ...ph, businessCountry: "United States", countryCode: "US", displayCurrency: "USD", currencySymbol: "$", fxRate: 1 },
      campaign: earlyBird,
    })).toMatchObject({
      originalTotalUsd: 2500,
      discountAmountUsd: 375,
      finalTotalUsd: 2125,
      finalTotalLocal: 2125,
    });
  });

  it.each([
    [0.01, 0.01, 0],
    [0.03, 0.02, 0.01],
    [0.05, 0.03, 0.02],
  ])(
    "rounds a fifty-percent discount on $%s from original cents before subtraction",
    (originalTotalUsd, discountAmountUsd, finalTotalUsd) => {
      expect(calculateProjectPriceQuote({
        originalTotalUsd,
        location: { ...ph, fxRate: 1 },
        campaign: pinoyako,
      })).toMatchObject({ discountAmountUsd, finalTotalUsd });
    },
  );

  it("returns the unchanged total when no coupon is applied", () => {
    expect(calculateProjectPriceQuote({
      originalTotalUsd: 1500,
      location: ph,
    })).toMatchObject({
      originalTotalUsd: 1500,
      discountAmountUsd: 0,
      finalTotalUsd: 1500,
      finalTotalLocal: 87188,
      campaign: null,
    });
  });

  it("supports a zero total", () => {
    expect(calculateProjectPriceQuote({
      originalTotalUsd: 0,
      location: ph,
      campaign: pinoyako,
    })).toMatchObject({
      originalTotalUsd: 0,
      discountAmountUsd: 0,
      finalTotalUsd: 0,
      finalTotalLocal: 0,
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid original total of %s",
    (originalTotalUsd) => {
      expect(() => calculateProjectPriceQuote({ originalTotalUsd, location: ph })).toThrow("Invalid original total");
    },
  );

  it("rejects malformed campaign metadata received at runtime", () => {
    const malformed = {
      campaignKey: "pinoyako",
      code: "PINOYAKO",
      percentage: 100,
    } as unknown as ValidatedDiscountCampaign;

    expect(() => calculateProjectPriceQuote({
      originalTotalUsd: 1500,
      location: ph,
      campaign: malformed,
    })).toThrow("Invalid discount campaign");
  });

  it("does not fabricate a local price when FX is unavailable", () => {
    const quote = calculateProjectPriceQuote({
      originalTotalUsd: 1500,
      location: { ...ph, fxRate: null, fxRateTimestamp: null },
    });

    expect(quote).toMatchObject({
      finalTotalUsd: 1500,
      finalTotalLocal: null,
      fxRate: null,
      fxRateTimestamp: null,
    });
  });

  it("uses an exact fifteen-minute freshness boundary", () => {
    const now = new Date("2026-09-24T00:15:00.000Z");
    expect(isCurrencyQuoteFresh(ph.fxRateTimestamp, now)).toBe(true);
    expect(isCurrencyQuoteFresh(ph.fxRateTimestamp, new Date(now.getTime() + 1))).toBe(false);
    expect(isCurrencyQuoteFresh("2026-09-24T00:15:00.001Z", now)).toBe(false);
    expect(isCurrencyQuoteFresh(null, now)).toBe(false);
    expect(isCurrencyQuoteFresh("not-a-date", now)).toBe(false);
  });

  it("returns an immutable quote and campaign snapshot", () => {
    const mutableCampaign: ValidatedDiscountCampaign = { ...pinoyako };
    const quote = calculateProjectPriceQuote({ originalTotalUsd: 1500, location: ph, campaign: mutableCampaign });

    expect(Object.isFrozen(quote)).toBe(true);
    expect(Object.isFrozen(quote.campaign)).toBe(true);
    mutableCampaign.percentage = 15;
    expect(quote.campaign?.percentage).toBe(50);
  });
});
