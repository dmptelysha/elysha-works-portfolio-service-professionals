import type { BusinessLocation, ProjectPriceQuote } from "./types";

export interface ViewerCurrency {
  localCurrency: string;
  localSymbol: string;
  fxRate: number | null;
}

export function viewerCurrencyFromLocation(location: BusinessLocation): ViewerCurrency {
  return {
    localCurrency: location.displayCurrency,
    localSymbol: location.currencySymbol,
    fxRate: location.fxRate,
  };
}

export function convertUsdToViewerAmount(amountUsd: number, currency: ViewerCurrency): number | null {
  if (currency.localCurrency === "USD") return amountUsd;
  if (currency.fxRate === null || !Number.isFinite(currency.fxRate) || currency.fxRate <= 0) return null;
  return Math.round(amountUsd * currency.fxRate);
}

export function formatLocalAmount(amount: number, currency: ViewerCurrency): string {
  const hasFraction = !Number.isInteger(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency.localCurrency === "USD" && hasFraction ? 2 : 0,
    maximumFractionDigits: currency.localCurrency === "USD" ? 2 : 0,
  }).format(amount);
  return `${currency.localSymbol}${formatted} ${currency.localCurrency}`;
}

export function formatViewerAmount(amountUsd: number, currency: ViewerCurrency): string | null {
  const amount = convertUsdToViewerAmount(amountUsd, currency);
  return amount === null ? null : formatLocalAmount(amount, currency);
}

export function finalViewerAmount(quote: ProjectPriceQuote): number | null {
  if (quote.localCurrency === "USD") return quote.finalTotalUsd;
  return quote.finalTotalLocal;
}
