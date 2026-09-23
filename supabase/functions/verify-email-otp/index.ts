/// <reference lib="deno.ns" />

import { deriveOtpDigest } from "../_shared/email-otp.ts";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface OtpChallengeContext {
  email: string;
  purpose: "qualified_quiz";
  resultCode: string;
}

export interface VerifyOtpDigestInput {
  challengeId: string;
  ownerUserId: string;
  candidateDigest: string;
  now: string;
}

export interface VerifyOtpDigestResult {
  verified: boolean;
  grantExpiresAt: string | null;
  resultCode: string;
}

export interface VerifyEmailOtpDependencies {
  otpPepper: string;
  now: () => Date;
  loadAnonymousUser: (
    request: Request,
  ) => Promise<{ id: string; isAnonymous: boolean }>;
  getChallengeContext: (
    challengeId: string,
    ownerUserId: string,
  ) => Promise<OtpChallengeContext | null>;
  verifyDigest: (
    input: VerifyOtpDigestInput,
  ) => Promise<VerifyOtpDigestResult>;
}

export function createVerifyEmailOtpHandler(
  dependencies: VerifyEmailOtpDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    try {
      const options = validateBrowserRequest(request);
      if (options) return options;
      if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
        throw new PublicHttpError(401, "authentication_required");
      }
      const user = await dependencies.loadAnonymousUser(request);
      if (!user.isAnonymous) {
        throw new PublicHttpError(403, "anonymous_session_required");
      }
      const body = await readJsonObject(request, 4096);
      assertExactKeys(body, ["challengeId", "code"]);
      if (
        typeof body.challengeId !== "string" ||
        !UUID_PATTERN.test(body.challengeId) ||
        typeof body.code !== "string" || !/^\d{6}$/u.test(body.code)
      ) {
        throw new PublicHttpError(400, "invalid_request");
      }

      const context = await dependencies.getChallengeContext(
        body.challengeId,
        user.id,
      );
      if (
        !context || context.resultCode !== "ok" ||
        context.purpose !== "qualified_quiz"
      ) {
        throw new PublicHttpError(400, "verification_failed");
      }
      const candidateDigest = await deriveOtpDigest({
        challengeId: body.challengeId,
        ownerUserId: user.id,
        email: context.email,
        purpose: context.purpose,
        otp: body.code,
      }, dependencies.otpPepper);
      const result = await dependencies.verifyDigest({
        challengeId: body.challengeId,
        ownerUserId: user.id,
        candidateDigest,
        now: dependencies.now().toISOString(),
      });
      if (
        result.verified !== true || result.resultCode !== "verified" ||
        !result.grantExpiresAt
      ) {
        throw new PublicHttpError(400, "verification_failed");
      }
      return jsonResponse(
        {
          verified: true,
          grantExpiresAt: new Date(result.grantExpiresAt).toISOString(),
        },
        200,
        origin,
      );
    } catch (error) {
      return safeErrorResponse(error, origin, "verification_unavailable");
    }
  };
}

function defaultDependencies(): VerifyEmailOtpDependencies {
  const environment = getEmailOtpEnv();
  const service = createServiceClient();
  return {
    otpPepper: environment.otpPepper,
    now: () => new Date(),
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
    getChallengeContext: async (challengeId, ownerUserId) => {
      const result = await service.rpc("get_email_otp_challenge_context", {
        p_challenge_id: challengeId,
        p_owner_user_id: ownerUserId,
      });
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error) throw new Error("challenge lookup failed");
      if (!row) return null;
      if (
        row.purpose !== "qualified_quiz" || row.result_code !== "ok" ||
        typeof row.email !== "string"
      ) return null;
      return {
        email: row.email,
        purpose: "qualified_quiz",
        resultCode: "ok",
      };
    },
    verifyDigest: async (input) => {
      const result = await service.rpc("verify_email_otp_digest", {
        p_challenge_id: input.challengeId,
        p_owner_user_id: input.ownerUserId,
        p_candidate_digest: `\\x${input.candidateDigest}`,
        p_now: input.now,
      });
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || !row) {
        throw new Error("challenge verification failed");
      }
      return {
        verified: row.verified === true,
        grantExpiresAt: typeof row.grant_expires_at === "string"
          ? row.grant_expires_at
          : null,
        resultCode: typeof row.result_code === "string"
          ? row.result_code
          : "invalid",
      };
    },
  };
}

if (import.meta.main) {
  Deno.serve(createVerifyEmailOtpHandler(defaultDependencies()));
}
