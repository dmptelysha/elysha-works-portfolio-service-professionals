import { bytesToBase64Url, hmacSha256Hex } from "./crypto.ts";

const encoder = new TextEncoder();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export type OtpPurpose = "qualified_quiz";
export type OtpGroupingDomain = "email-rate-v1" | "ip-rate-v1";
export type RandomFill = (buffer: Uint8Array) => Uint8Array | void;

export interface OtpDigestInput {
  challengeId: string;
  ownerUserId: string;
  email: string;
  purpose: OtpPurpose;
  otp: string;
}

export interface MakeOtpPayload {
  deliveryId: string;
  to: string;
  otp: string;
  expiresInMinutes: number;
  templateVersion: "elysha_otp_v1";
}

export interface EncryptedMakeOtpPayload {
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface MakeOtpEnvelope extends EncryptedMakeOtpPayload {
  deliveryId: string;
  timestamp: string;
  nonce: string;
  keyVersion: "otp-transport-v1";
  signature: string;
}

function requireLongSecret(secret: string, name: string): void {
  if (secret.length < 32) throw new Error(`invalid_${name}`);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export function generateSixDigitOtp(
  fill: RandomFill = (buffer) => crypto.getRandomValues(buffer),
): string {
  const digits: number[] = [];
  while (digits.length < 6) {
    const bytes = new Uint8Array(12);
    fill(bytes);
    for (const value of bytes) {
      if (value < 250) digits.push(value % 10);
      if (digits.length === 6) break;
    }
  }
  return digits.join("");
}

export function normalizeOtpEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length < 3 || normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    throw new Error("invalid_email");
  }
  return normalized;
}

export async function deriveOtpDigest(
  input: OtpDigestInput,
  pepper: string,
): Promise<string> {
  requireLongSecret(pepper, "otp_pepper");
  if (
    !UUID_PATTERN.test(input.challengeId) ||
    !UUID_PATTERN.test(input.ownerUserId)
  ) {
    throw new Error("invalid_otp_context");
  }
  if (!/^\d{6}$/u.test(input.otp)) throw new Error("invalid_otp");
  const email = normalizeOtpEmail(input.email);
  const message = [
    "otp-v1",
    input.challengeId.toLowerCase(),
    input.ownerUserId.toLowerCase(),
    email,
    input.purpose.toUpperCase(),
    input.otp,
  ].join("\n");
  return await hmacSha256Hex(message, pepper);
}

export async function deriveOtpGroupingDigest(
  domain: OtpGroupingDomain,
  value: string,
  secret: string,
): Promise<string> {
  requireLongSecret(secret, "otp_grouping_secret");
  if (!value || value.includes("\n")) throw new Error("invalid_grouping_value");
  return await hmacSha256Hex(`${domain}\n${value}`, secret);
}

export async function encryptMakeOtpEnvelope(
  payload: MakeOtpPayload,
  keyBytes: Uint8Array,
  suppliedIv?: Uint8Array,
): Promise<EncryptedMakeOtpPayload> {
  if (keyBytes.byteLength !== 32) {
    throw new Error("invalid_make_otp_encryption_key");
  }
  if (
    !UUID_PATTERN.test(payload.deliveryId) ||
    !/^\d{6}$/u.test(payload.otp) ||
    payload.expiresInMinutes !== 10 ||
    payload.templateVersion !== "elysha_otp_v1"
  ) {
    throw new Error("invalid_make_otp_payload");
  }
  const canonicalPayload: MakeOtpPayload = {
    deliveryId: payload.deliveryId.toLowerCase(),
    to: normalizeOtpEmail(payload.to),
    otp: payload.otp,
    expiresInMinutes: payload.expiresInMinutes,
    templateVersion: payload.templateVersion,
  };
  const iv = suppliedIv
    ? Uint8Array.from(suppliedIv)
    : crypto.getRandomValues(new Uint8Array(12));
  if (iv.byteLength !== 12) throw new Error("invalid_make_otp_iv");
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      encoder.encode(JSON.stringify(canonicalPayload)),
    ),
  );
  const tagOffset = encrypted.byteLength - 16;
  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(encrypted.slice(0, tagOffset)),
    tag: bytesToBase64Url(encrypted.slice(tagOffset)),
  };
}

export function otpEnvelopeSigningInput(
  envelope: Omit<MakeOtpEnvelope, "signature">,
): string {
  const fields = [
    envelope.timestamp,
    envelope.nonce,
    envelope.deliveryId,
    envelope.keyVersion,
    envelope.iv,
    envelope.ciphertext,
    envelope.tag,
  ];
  if (
    envelope.keyVersion !== "otp-transport-v1" ||
    !UUID_PATTERN.test(envelope.deliveryId) ||
    !UUID_PATTERN.test(envelope.nonce) ||
    Number.isNaN(Date.parse(envelope.timestamp)) ||
    fields.some((field) => field.includes("\n")) ||
    ![envelope.iv, envelope.ciphertext, envelope.tag].every((field) =>
      BASE64URL_PATTERN.test(field)
    )
  ) {
    throw new Error("invalid_otp_envelope");
  }
  return ["elysha-otp-envelope-v1", ...fields].join("\n");
}

export async function signOtpEnvelope(
  envelope: Omit<MakeOtpEnvelope, "signature">,
  secret: string,
): Promise<string> {
  requireLongSecret(secret, "make_otp_webhook_secret");
  return await hmacSha256Hex(otpEnvelopeSigningInput(envelope), secret);
}
