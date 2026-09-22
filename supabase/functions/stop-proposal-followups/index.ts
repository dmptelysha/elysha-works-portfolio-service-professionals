/// <reference lib="deno.ns" />

import { verifyStopToken } from "../_shared/crypto.ts";
import { getProposalEnv } from "../_shared/env.ts";
import {
  jsonResponse,
  PublicHttpError,
  safeErrorResponse,
} from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

export interface StopFollowupDependencies {
  signingSecret: string;
  now: () => Date;
  stop: (leadId: string, stoppedAt: string) => Promise<void>;
}

export function createStopFollowupHandler(
  dependencies: StopFollowupDependencies,
) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "GET") {
        throw new PublicHttpError(405, "method_not_allowed");
      }
      const token = new URL(request.url).searchParams.get("token");
      if (!token) throw new PublicHttpError(404, "link_unavailable");
      const payload = await verifyStopToken(
        token,
        dependencies.signingSecret,
        Math.floor(dependencies.now().getTime() / 1000),
      );
      if (!payload) throw new PublicHttpError(404, "link_unavailable");
      await dependencies.stop(payload.leadId, dependencies.now().toISOString());
      return jsonResponse({ followupsStopped: true }, 200, null);
    } catch (error) {
      return safeErrorResponse(error, null, "link_unavailable");
    }
  };
}

function defaultDependencies(): StopFollowupDependencies {
  const service = createServiceClient();
  return {
    signingSecret: getProposalEnv().stopSigningSecret,
    now: () => new Date(),
    stop: async (leadId, stoppedAt) => {
      const result = await service.rpc("stop_proposal_followups", {
        p_lead_id: leadId,
        p_stopped_at: stoppedAt,
      });
      if (result.error) throw new Error("stop request failed");
    },
  };
}

if (import.meta.main) {
  Deno.serve(createStopFollowupHandler(defaultDependencies()));
}
