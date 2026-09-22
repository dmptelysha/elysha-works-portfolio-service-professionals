/// <reference lib="deno.ns" />

import { constantTimeEqualHex, hmacSha256Hex } from "../_shared/crypto.ts";
import { getMakeAutomationSecret } from "../_shared/env.ts";
import {
  assertExactKeys,
  jsonResponse,
  PublicHttpError,
  readJsonObject,
  safeErrorResponse,
} from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface FollowupDependencies {
  automationSecret: string;
  now: () => Date;
  claim: (now: string, limit: number) => Promise<unknown[]>;
  revalidate: (leadId: string, claimId: string) => Promise<boolean>;
  acknowledge: (
    leadId: string,
    claimId: string,
    delivered: boolean,
    acknowledgedAt: string,
  ) => Promise<unknown>;
}

async function secretsMatch(supplied: string | null, expected: string) {
  if (!supplied) return false;
  const [actualDigest, expectedDigest] = await Promise.all([
    hmacSha256Hex(supplied, expected),
    hmacSha256Hex(expected, expected),
  ]);
  return constantTimeEqualHex(actualDigest, expectedDigest);
}

export function createFollowupHandler(dependencies: FollowupDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST") {
        throw new PublicHttpError(405, "method_not_allowed");
      }
      if (
        !await secretsMatch(
          request.headers.get("x-make-automation-secret"),
          dependencies.automationSecret,
        )
      ) {
        throw new PublicHttpError(401, "unauthorized");
      }
      const body = await readJsonObject(request, 4096);
      const operation = body.operation;
      if (operation === "claim") {
        assertExactKeys(body, ["operation", "limit"]);
        const limit = body.limit === undefined ? 10 : body.limit;
        if (
          !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 50
        ) throw new PublicHttpError(400, "invalid_request");
        const work = await dependencies.claim(
          dependencies.now().toISOString(),
          Number(limit),
        );
        return jsonResponse({ work }, 200, null);
      }
      if (operation === "revalidate") {
        assertExactKeys(body, ["operation", "leadId", "claimId"]);
        if (
          typeof body.leadId !== "string" || !UUID_PATTERN.test(body.leadId) ||
          typeof body.claimId !== "string" || !UUID_PATTERN.test(body.claimId)
        ) throw new PublicHttpError(400, "invalid_request");
        return jsonResponse(
          {
            eligible: await dependencies.revalidate(body.leadId, body.claimId),
          },
          200,
          null,
        );
      }
      if (operation === "acknowledge") {
        assertExactKeys(body, ["operation", "leadId", "claimId", "delivered"]);
        if (
          typeof body.leadId !== "string" || !UUID_PATTERN.test(body.leadId) ||
          typeof body.claimId !== "string" ||
          !UUID_PATTERN.test(body.claimId) ||
          typeof body.delivered !== "boolean"
        ) throw new PublicHttpError(400, "invalid_request");
        const state = await dependencies.acknowledge(
          body.leadId,
          body.claimId,
          body.delivered,
          dependencies.now().toISOString(),
        );
        return jsonResponse({ state }, 200, null);
      }
      throw new PublicHttpError(400, "invalid_request");
    } catch (error) {
      return safeErrorResponse(error, null, "followup_request_failed");
    }
  };
}

function defaultDependencies(): FollowupDependencies {
  const service = createServiceClient();
  return {
    automationSecret: getMakeAutomationSecret(),
    now: () => new Date(),
    claim: async (now, limit) => {
      const result = await service.rpc("claim_due_proposal_work", {
        p_now: now,
        p_limit: limit,
      });
      if (result.error) throw new Error("work claim failed");
      return result.data ?? [];
    },
    revalidate: async (leadId, claimId) => {
      const result = await service.rpc("revalidate_proposal_work", {
        p_lead_id: leadId,
        p_claim_id: claimId,
      });
      if (result.error) throw new Error("work revalidation failed");
      return result.data === true;
    },
    acknowledge: async (leadId, claimId, delivered, acknowledgedAt) => {
      const result = await service.rpc("acknowledge_proposal_work", {
        p_lead_id: leadId,
        p_claim_id: claimId,
        p_delivered: delivered,
        p_acknowledged_at: acknowledgedAt,
      });
      if (result.error) throw new Error("work acknowledgement failed");
      return Array.isArray(result.data) ? result.data[0] : result.data;
    },
  };
}

if (import.meta.main) Deno.serve(createFollowupHandler(defaultDependencies()));
