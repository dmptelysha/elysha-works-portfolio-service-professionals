export const ALLOWED_ORIGINS = [
  "https://elyshaworks.com",
  "https://www.elyshaworks.com",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
] as const;

export function isAllowedOrigin(origin: string | null): boolean {
  return origin === null ||
    ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number]);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-make-automation-secret, traceparent, tracestate, baggage",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
