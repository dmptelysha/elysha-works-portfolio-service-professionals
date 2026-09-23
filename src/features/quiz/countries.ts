import type { BusinessLocation } from "./types";

export interface CountryOption {
  name: string;
  code: string;
  currency: string;
  symbol: string;
}

export const COUNTRY_OPTIONS: readonly CountryOption[] = Object.freeze([
  { name: "Philippines", code: "PH", currency: "PHP", symbol: "₱" },
  { name: "United States", code: "US", currency: "USD", symbol: "$" },
  { name: "Australia", code: "AU", currency: "AUD", symbol: "A$" },
  { name: "Canada", code: "CA", currency: "CAD", symbol: "C$" },
  { name: "United Kingdom", code: "GB", currency: "GBP", symbol: "£" },
  { name: "Singapore", code: "SG", currency: "SGD", symbol: "S$" },
  { name: "New Zealand", code: "NZ", currency: "NZD", symbol: "NZ$" },
  { name: "United Arab Emirates", code: "AE", currency: "AED", symbol: "د.إ" },
  { name: "Saudi Arabia", code: "SA", currency: "SAR", symbol: "﷼" },
  { name: "India", code: "IN", currency: "INR", symbol: "₹" },
  { name: "Japan", code: "JP", currency: "JPY", symbol: "¥" },
  { name: "South Korea", code: "KR", currency: "KRW", symbol: "₩" },
  { name: "Indonesia", code: "ID", currency: "IDR", symbol: "Rp" },
  { name: "Malaysia", code: "MY", currency: "MYR", symbol: "RM" },
  { name: "Thailand", code: "TH", currency: "THB", symbol: "฿" },
  { name: "Vietnam", code: "VN", currency: "VND", symbol: "₫" },
  { name: "Germany", code: "DE", currency: "EUR", symbol: "€" },
  { name: "France", code: "FR", currency: "EUR", symbol: "€" },
  { name: "Spain", code: "ES", currency: "EUR", symbol: "€" },
  { name: "Italy", code: "IT", currency: "EUR", symbol: "€" },
  { name: "Netherlands", code: "NL", currency: "EUR", symbol: "€" },
  { name: "Ireland", code: "IE", currency: "EUR", symbol: "€" },
  { name: "Switzerland", code: "CH", currency: "CHF", symbol: "CHF" },
  { name: "Sweden", code: "SE", currency: "SEK", symbol: "kr" },
  { name: "Norway", code: "NO", currency: "NOK", symbol: "kr" },
  { name: "Denmark", code: "DK", currency: "DKK", symbol: "kr" },
  { name: "South Africa", code: "ZA", currency: "ZAR", symbol: "R" },
  { name: "Mexico", code: "MX", currency: "MXN", symbol: "MX$" },
  { name: "Brazil", code: "BR", currency: "BRL", symbol: "R$" },
  { name: "Other / show prices in USD", code: "ZZ", currency: "USD", symbol: "$" },
]);

export function fallbackLocation(country: CountryOption): BusinessLocation {
  return {
    businessCountry: country.name,
    countryCode: country.code,
    displayCurrency: "USD",
    currencySymbol: "$",
    fxRate: 1,
    fxRateTimestamp: null,
  };
}
