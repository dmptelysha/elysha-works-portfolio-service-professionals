const encoder = new TextEncoder();
const ACCESS_KEY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return new Uint8Array(
    value.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)),
  );
}

function base64UrlEncode(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/u,
    "",
  );
}

function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
      "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

async function hmacBytes(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

export async function hmacSha256Hex(
  value: string,
  secret: string,
): Promise<string> {
  return bytesToHex(await hmacBytes(value, secret));
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  const length = Math.max(leftBytes?.length ?? 0, rightBytes?.length ?? 0, 1);
  let difference = (leftBytes?.length ?? 0) ^ (rightBytes?.length ?? 0);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes?.[index] ?? 0) ^ (rightBytes?.[index] ?? 0);
  }
  return difference === 0 && leftBytes !== null && rightBytes !== null;
}

export async function deriveAccessKey(
  quizSessionId: string,
  pepper: string,
): Promise<string> {
  const digest = await hmacBytes(`proposal-access:${quizSessionId}`, pepper);
  return [...digest.slice(0, 10)].map((byte) =>
    ACCESS_KEY_ALPHABET[byte % ACCESS_KEY_ALPHABET.length]
  ).join("");
}

export interface StopTokenPayload {
  leadId: string;
  expiresAtEpochSeconds: number;
}

export async function signStopToken(
  payload: StopTokenPayload,
  secret: string,
): Promise<string> {
  const encoded = base64UrlEncode(
    JSON.stringify({
      lead_id: payload.leadId,
      exp: payload.expiresAtEpochSeconds,
    }),
  );
  return `${encoded}.${await hmacSha256Hex(encoded, secret)}`;
}

export async function verifyStopToken(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): Promise<{ leadId: string; expiresAtEpochSeconds: number } | null> {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expectedSignature = await hmacSha256Hex(encoded, secret);
  if (!constantTimeEqualHex(suppliedSignature, expectedSignature)) return null;
  const decoded = base64UrlDecode(encoded);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as { lead_id?: unknown; exp?: unknown };
    if (
      typeof payload.lead_id !== "string" || typeof payload.exp !== "number" ||
      payload.exp <= nowEpochSeconds
    ) return null;
    return { leadId: payload.lead_id, expiresAtEpochSeconds: payload.exp };
  } catch {
    return null;
  }
}
