/// <reference lib="deno.ns" />

import { constantTimeEqualHex, hmacSha256Hex } from "../_shared/crypto.ts";
import { getProposalEnv } from "../_shared/env.ts";
import {
  assertExactKeys,
  jsonResponse,
  readJsonObject,
  safeErrorResponse,
  validateBrowserRequest,
} from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACCESS_KEY_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/u;

export interface ProposalAccessState {
  proposalStatus: string;
  proposalExpiresAt: string | null;
  proposalAccessKeyHash: string;
  proposalFailedAttempts: number;
  proposalLockedUntil: string | null;
  selectedRoadmapSnapshot: Record<string, unknown> | null;
}

export interface VerifyProposalDependencies {
  pepper: string;
  now: () => Date;
  lookup: (reference: string) => Promise<ProposalAccessState | null>;
  recordAttempt: (reference: string, granted: boolean) => Promise<void>;
}

function unavailable(origin: string | null) {
  return jsonResponse({ error: "proposal_unavailable" }, 404, origin);
}

export function createVerifyProposalHandler(
  dependencies: VerifyProposalDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    try {
      const options = validateBrowserRequest(request);
      if (options) return options;
      const body = await readJsonObject(request, 2048);
      assertExactKeys(body, ["reference", "accessKey"]);
      if (
        typeof body.reference !== "string" ||
        !UUID_PATTERN.test(body.reference) ||
        typeof body.accessKey !== "string" ||
        !ACCESS_KEY_PATTERN.test(body.accessKey.toUpperCase())
      ) {
        return unavailable(origin);
      }

      const state = await dependencies.lookup(body.reference);
      const now = dependencies.now();
      if (
        !state || state.proposalStatus !== "active" ||
        !state.proposalExpiresAt ||
        new Date(state.proposalExpiresAt).getTime() <= now.getTime() ||
        (state.proposalLockedUntil &&
          new Date(state.proposalLockedUntil).getTime() > now.getTime()) ||
        !state.selectedRoadmapSnapshot
      ) return unavailable(origin);

      const suppliedHash = await hmacSha256Hex(
        body.accessKey.toUpperCase(),
        dependencies.pepper,
      );
      const granted = constantTimeEqualHex(
        suppliedHash,
        state.proposalAccessKeyHash,
      );
      await dependencies.recordAttempt(body.reference, granted);
      if (!granted) return unavailable(origin);

      return jsonResponse(
        {
          proposal: {
            ...state.selectedRoadmapSnapshot,
            expiresAt: new Date(state.proposalExpiresAt).toISOString(),
          },
        },
        200,
        origin,
      );
    } catch (error) {
      return safeErrorResponse(error, origin, "proposal_unavailable");
    }
  };
}

function defaultDependencies(): VerifyProposalDependencies {
  const service = createServiceClient();
  return {
    pepper: getProposalEnv().keyPepper,
    now: () => new Date(),
    lookup: async (reference) => {
      const result = await service.rpc("verify_proposal_access_state", {
        p_proposal_reference: reference,
      });
      if (result.error) throw new Error("proposal lookup failed");
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row) return null;
      return {
        proposalStatus: row.proposal_status,
        proposalExpiresAt: row.proposal_expires_at,
        proposalAccessKeyHash: row.proposal_access_key_hash,
        proposalFailedAttempts: row.proposal_failed_attempts,
        proposalLockedUntil: row.proposal_locked_until,
        selectedRoadmapSnapshot: row.selected_roadmap_snapshot,
      };
    },
    recordAttempt: async (reference, granted) => {
      const result = await service.rpc("record_proposal_access_attempt", {
        p_proposal_reference: reference,
        p_access_granted: granted,
        p_attempted_at: new Date().toISOString(),
      });
      if (result.error) throw new Error("proposal attempt recording failed");
    },
  };
}

if (import.meta.main) {
  Deno.serve(createVerifyProposalHandler(defaultDependencies()));
}
