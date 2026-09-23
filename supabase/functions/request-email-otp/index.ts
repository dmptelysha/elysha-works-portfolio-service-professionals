/// <reference lib="deno.ns" />

import {
  deriveOtpDigest,
  deriveOtpGroupingDigest,
  encryptMakeOtpEnvelope,
  generateSixDigitOtp,
  type MakeOtpEnvelope,
  normalizeOtpEmail,
  signOtpEnvelope,
} from "../_shared/email-otp.ts";
import { getEmailOtpEnv } from "../_shared/env.ts";
import {
  assertExactKeys,
  jsonResponse,
  PublicHttpError,
  readJsonObject,
  safeErrorResponse,
  validateBrowserRequest,
} from "../_shared/http.ts";
import {
  createRequestClient,
  createServiceClient,
} from "../_shared/supabase.ts";

export interface TurnstileVerification {
  success: boolean;
  action: string;
  hostname: string;
  errorCodes: string[];
}

export interface RecordedOtpChallenge {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  resultCode: string;
}

export interface RecordOtpChallengeInput {
  challengeId: string;
  ownerUserId: string;
  email: string;
  emailDigest: string;
  otpDigest: string;
  requestIpDigest: string;
  makeDeliveryId: string;
  now: string;
}

export interface RequestEmailOtpDependencies {
  otpPepper: string;
  otpGroupingSecret: string;
  turnstileExpectedHostname: string;
  makeWebhookSecret: string;
  makeEncryptionKey: Uint8Array;
  now: () => Date;
  randomUuid: () => string;
  generateOtp: () => string;
  loadAnonymousUser: (
    request: Request,
  ) => Promise<{ id: string; isAnonymous: boolean }>;
  getClientAddress: (request: Request) => string | null;
  verifyTurnstile: (
    token: string,
    clientAddress: string,
  ) => Promise<TurnstileVerification>;
  recordChallenge: (
    input: RecordOtpChallengeInput,
  ) => Promise<RecordedOtpChallenge>;
  deliverToMake: (
    envelope: MakeOtpEnvelope,
  ) => Promise<{ accepted: boolean; deliveryId: string }>;
  markDelivery: (
    challengeId: string,
    ownerUserId: string,
    deliveryId: string,
    delivered: boolean,
  ) => Promise<string>;
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error &&
    (error.message.includes("otp_cooldown") ||
      error.message.includes("otp_rate_limited"));
}

async function invalidatePendingDelivery(
  dependencies: RequestEmailOtpDependencies,
  challengeId: string,
  ownerUserId: string,
  deliveryId: string,
): Promise<never> {
  await dependencies.markDelivery(
    challengeId,
    ownerUserId,
    deliveryId,
    false,
  ).catch(() => undefined);
  throw new PublicHttpError(502, "otp_delivery_failed");
}

export function createRequestEmailOtpHandler(
  dependencies: RequestEmailOtpDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    try {
      const options = validateBrowserRequest(request);
      if (options) return options;
      if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
        throw new PublicHttpError(401, "authentication_required");
      }
      const body = await readJsonObject(request, 8192);
      assertExactKeys(body, ["email", "purpose", "turnstileToken"]);
      if (
        typeof body.email !== "string" ||
        body.purpose !== "qualified_quiz" ||
        typeof body.turnstileToken !== "string" ||
        body.turnstileToken.length < 10 || body.turnstileToken.length > 4096
      ) {
        throw new PublicHttpError(400, "invalid_request");
      }

      let email: string;
      try {
        email = normalizeOtpEmail(body.email);
      } catch {
        throw new PublicHttpError(400, "invalid_request");
      }
      const user = await dependencies.loadAnonymousUser(request);
      if (!user.isAnonymous) {
        throw new PublicHttpError(403, "anonymous_session_required");
      }
      const clientAddress = dependencies.getClientAddress(request)?.trim();
      if (
        !clientAddress || clientAddress.length > 64 ||
        clientAddress.includes(",")
      ) {
        throw new PublicHttpError(503, "security_check_unavailable");
      }
      const turnstile = await dependencies.verifyTurnstile(
        body.turnstileToken,
        clientAddress,
      );
      if (
        !turnstile.success || turnstile.action !== "email_otp_request" ||
        turnstile.hostname.toLowerCase() !==
          dependencies.turnstileExpectedHostname
      ) {
        throw new PublicHttpError(400, "security_check_failed");
      }

      const challengeId = dependencies.randomUuid();
      const deliveryId = dependencies.randomUuid();
      const nonce = dependencies.randomUuid();
      const otp = dependencies.generateOtp();
      const createdAt = dependencies.now().toISOString();
      const [otpDigest, emailDigest, requestIpDigest] = await Promise.all([
        deriveOtpDigest({
          challengeId,
          ownerUserId: user.id,
          email,
          purpose: "qualified_quiz",
          otp,
        }, dependencies.otpPepper),
        deriveOtpGroupingDigest(
          "email-rate-v1",
          email,
          dependencies.otpGroupingSecret,
        ),
        deriveOtpGroupingDigest(
          "ip-rate-v1",
          clientAddress,
          dependencies.otpGroupingSecret,
        ),
      ]);

      let recorded: RecordedOtpChallenge;
      try {
        recorded = await dependencies.recordChallenge({
          challengeId,
          ownerUserId: user.id,
          email,
          emailDigest,
          otpDigest,
          requestIpDigest,
          makeDeliveryId: deliveryId,
          now: createdAt,
        });
      } catch (error) {
        if (isRateLimitError(error)) {
          throw new PublicHttpError(429, "otp_request_limited");
        }
        throw error;
      }
      if (
        recorded.challengeId !== challengeId ||
        recorded.resultCode !== "pending_delivery"
      ) {
        throw new Error("challenge persistence mismatch");
      }

      const encrypted = await encryptMakeOtpEnvelope({
        deliveryId,
        to: email,
        otp,
        expiresInMinutes: 10,
        templateVersion: "elysha_otp_v1",
      }, dependencies.makeEncryptionKey);
      const unsigned: Omit<MakeOtpEnvelope, "signature"> = {
        deliveryId,
        timestamp: createdAt,
        nonce,
        keyVersion: "otp-transport-v1",
        ...encrypted,
      };
      const envelope: MakeOtpEnvelope = {
        ...unsigned,
        signature: await signOtpEnvelope(
          unsigned,
          dependencies.makeWebhookSecret,
        ),
      };

      let acknowledgement: { accepted: boolean; deliveryId: string };
      try {
        acknowledgement = await dependencies.deliverToMake(envelope);
      } catch {
        return await invalidatePendingDelivery(
          dependencies,
          challengeId,
          user.id,
          deliveryId,
        );
      }
      if (
        acknowledgement.accepted !== true ||
        acknowledgement.deliveryId !== deliveryId
      ) {
        return await invalidatePendingDelivery(
          dependencies,
          challengeId,
          user.id,
          deliveryId,
        );
      }
      const transition = await dependencies.markDelivery(
        challengeId,
        user.id,
        deliveryId,
        true,
      );
      if (transition !== "active") {
        throw new PublicHttpError(502, "otp_delivery_failed");
      }
      return jsonResponse(
        {
          challengeId,
          expiresAt: new Date(recorded.expiresAt).toISOString(),
          resendAvailableAt: new Date(recorded.resendAvailableAt).toISOString(),
        },
        200,
        origin,
      );
    } catch (error) {
      return safeErrorResponse(error, origin, "otp_request_failed");
    }
  };
}

function defaultDependencies(): RequestEmailOtpDependencies {
  const environment = getEmailOtpEnv();
  const service = createServiceClient();
  return {
    ...environment,
    now: () => new Date(),
    randomUuid: () => crypto.randomUUID(),
    generateOtp: () => generateSixDigitOtp(),
    loadAnonymousUser: async (request) => {
      const client = createRequestClient(request);
      const result = await client.auth.getUser();
      if (result.error || !result.data.user) {
        throw new PublicHttpError(401, "authentication_required");
      }
      return {
        id: result.data.user.id,
        isAnonymous: result.data.user.is_anonymous === true,
      };
    },
    // Supabase's edge gateway records this Cloudflare-provided address header.
    // Production preflight must prove that it is overwritten at the gateway.
    getClientAddress: (request) => request.headers.get("cf-connecting-ip"),
    verifyTurnstile: async (token, clientAddress) => {
      const body = new URLSearchParams({
        secret: environment.turnstileSecretKey,
        response: token,
        remoteip: clientAddress,
      });
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error("turnstile unavailable");
      const data = await response.json() as Record<string, unknown>;
      return {
        success: data.success === true,
        action: typeof data.action === "string" ? data.action : "",
        hostname: typeof data.hostname === "string" ? data.hostname : "",
        errorCodes: Array.isArray(data["error-codes"])
          ? data["error-codes"].filter((value): value is string =>
            typeof value === "string"
          )
          : [],
      };
    },
    recordChallenge: async (input) => {
      const result = await service.rpc("record_email_otp_challenge", {
        p_challenge_id: input.challengeId,
        p_owner_user_id: input.ownerUserId,
        p_email: input.email,
        p_email_digest: `\\x${input.emailDigest}`,
        p_otp_digest: `\\x${input.otpDigest}`,
        p_request_ip_digest: `\\x${input.requestIpDigest}`,
        p_make_delivery_id: input.makeDeliveryId,
        p_now: input.now,
      });
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || !row) {
        throw new Error(
          result.error?.message ?? "challenge persistence failed",
        );
      }
      return {
        challengeId: row.challenge_id,
        expiresAt: row.expires_at,
        resendAvailableAt: row.resend_available_at,
        resultCode: row.result_code,
      };
    },
    deliverToMake: async (envelope) => {
      const response = await fetch(environment.makeWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Make delivery failed");
      const data = await response.json() as Record<string, unknown>;
      return {
        accepted: data.accepted === true,
        deliveryId: typeof data.deliveryId === "string" ? data.deliveryId : "",
      };
    },
    markDelivery: async (challengeId, ownerUserId, deliveryId, delivered) => {
      const result = await service.rpc("mark_email_otp_delivery", {
        p_challenge_id: challengeId,
        p_owner_user_id: ownerUserId,
        p_make_delivery_id: deliveryId,
        p_delivered: delivered,
        p_at: new Date().toISOString(),
      });
      if (result.error || typeof result.data !== "string") {
        throw new Error("delivery transition failed");
      }
      return result.data;
    },
  };
}

if (import.meta.main) {
  Deno.serve(createRequestEmailOtpHandler(defaultDependencies()));
}
