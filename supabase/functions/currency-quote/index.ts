/// <reference lib="deno.ns" />

import {
  assertExactKeys,
  jsonResponse,
  PublicHttpError,
  readJsonObject,
  safeErrorResponse,
  validateBrowserRequest,
} from "../_shared/http.ts";

const CODE = /^[A-Z]{2}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

export async function currencyQuoteHandler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  try {
    const options = validateBrowserRequest(request);
    if (options) return options;
    const body = await readJsonObject(request, 1024);
    assertExactKeys(body, ["countryCode", "countryName", "currency", "symbol"]);
    const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
    const businessCountry = typeof body.countryName === "string" ? body.countryName.trim() : "";
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    if (!CODE.test(countryCode) || !CURRENCY.test(currency) || !businessCountry || businessCountry.length > 80 || !symbol || symbol.length > 8) {
      throw new PublicHttpError(400, "invalid_request");
    }

    if (currency === "USD") {
      return jsonResponse({ businessCountry, countryCode, displayCurrency: "USD", currencySymbol: symbol, fxRate: 1, fxRateTimestamp: new Date().toISOString() }, 200, origin);
    }

    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json() as Record<string, unknown>;
    const rates = payload.rates as Record<string, unknown> | undefined;
    const rate = rates?.[currency];
    if (!response.ok || payload.result !== "success" || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("currency quote unavailable");
    }
    const timestamp = typeof payload.time_last_update_utc === "string" && Number.isFinite(Date.parse(payload.time_last_update_utc))
      ? new Date(payload.time_last_update_utc).toISOString()
      : new Date().toISOString();
    return jsonResponse({ businessCountry, countryCode, displayCurrency: currency, currencySymbol: symbol, fxRate: rate, fxRateTimestamp: timestamp }, 200, origin);
  } catch (error) {
    return safeErrorResponse(error, origin, "currency_quote_failed");
  }
}

if (import.meta.main) Deno.serve(currencyQuoteHandler);
