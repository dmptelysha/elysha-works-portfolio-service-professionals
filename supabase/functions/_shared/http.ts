import { corsHeaders, isAllowedOrigin } from "./cors.ts";

export class PublicHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "PublicHttpError";
  }
}

export async function readJsonObject(
  request: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new PublicHttpError(415, "invalid_request");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PublicHttpError(413, "invalid_request");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new PublicHttpError(413, "invalid_request");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PublicHttpError(400, "invalid_request");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PublicHttpError(400, "invalid_request");
  }
  return parsed as Record<string, unknown>;
}

export function assertExactKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new PublicHttpError(400, "invalid_request");
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function optionsResponse(origin: string | null): Response {
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, null);
  }
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
  });
}

export function validateBrowserRequest(request: Request, method = "POST") {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    throw new PublicHttpError(403, "origin_not_allowed");
  }
  if (request.method === "OPTIONS") return optionsResponse(origin);
  if (request.method !== method) {
    throw new PublicHttpError(405, "method_not_allowed");
  }
  return null;
}

export function safeErrorResponse(
  error: unknown,
  origin: string | null,
  fallback = "request_failed",
): Response {
  if (error instanceof PublicHttpError) {
    return jsonResponse({ error: error.code }, error.status, origin);
  }
  return jsonResponse({ error: fallback }, 500, origin);
}
