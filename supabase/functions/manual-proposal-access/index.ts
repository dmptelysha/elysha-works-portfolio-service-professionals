/// <reference lib="deno.ns" />

import { hmacSha256Hex } from "../_shared/crypto.ts";
import { getManualProposalEnv } from "../_shared/env.ts";
import {
  assertExactKeys,
  jsonResponse,
  readJsonObject,
  safeErrorResponse,
  validateBrowserRequest,
} from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { validateManualDraft, type ManualProposalView } from "../_shared/manual-proposal-model.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACCESS_KEY_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const VIEWPORTS = ["desktop", "tablet", "mobile"] as const;
type Viewport = typeof VIEWPORTS[number];

export interface VerifiedManualRow {
  snapshot: unknown;
  paths: Record<Viewport, string>;
  expiresAt: string;
}
export interface ManualAccessDependencies {
  pepper: string;
  now: () => Date;
  verify: (reference: string, candidateHash: string, attemptedAt: string) => Promise<VerifiedManualRow | null>;
  sign: (path: string, expiresInSeconds: number) => Promise<string | null>;
}

function unavailable(origin: string | null) {
  return jsonResponse({ error: "proposal_unavailable" }, 404, origin);
}

function displayView(snapshot: unknown, reference: string, expiresAt: string): ManualProposalView {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Invalid manual proposal snapshot");
  }
  const source = snapshot as Record<string, unknown>;
  const draft = validateManualDraft({
    ...source,
    expiresAt,
    captureManifestPath: ".tmp/manual-proposals/verified/manifest.json",
  });
  const { captureManifestPath: _ignored, ...display } = draft;
  if (typeof source.previewCapturedAt !== "string" ||
      Number.isNaN(Date.parse(source.previewCapturedAt)) ||
      typeof source.previewSourceHash !== "string" ||
      !HASH_PATTERN.test(source.previewSourceHash)) {
    throw new Error("Invalid preview metadata");
  }
  return {
    ...display,
    reference,
    previewCapturedAt: source.previewCapturedAt,
    previewSourceHash: source.previewSourceHash,
  };
}

export function createManualProposalAccessHandler(dependencies: ManualAccessDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    try {
      const options = validateBrowserRequest(request);
      if (options) return options;
      const body = await readJsonObject(request, 2048);
      assertExactKeys(body, ["reference", "accessKey"]);
      if (typeof body.reference !== "string" || !UUID_PATTERN.test(body.reference) ||
          typeof body.accessKey !== "string") return unavailable(origin);
      const code = body.accessKey.trim().toUpperCase();
      if (!ACCESS_KEY_PATTERN.test(code)) return unavailable(origin);

      const hash = await hmacSha256Hex("manual-proposal:" + code, dependencies.pepper);
      const row = await dependencies.verify(body.reference, hash, dependencies.now().toISOString());
      if (!row) return unavailable(origin);
      const proposal = displayView(row.snapshot, body.reference, row.expiresAt);
      const previewUrls = {} as Record<Viewport, string | null>;
      await Promise.all(VIEWPORTS.map(async (viewport) => {
        const path = row.paths?.[viewport];
        if (typeof path !== "string" || !/^manual\/[A-Za-z0-9/_-]+[.]png$/u.test(path)) {
          previewUrls[viewport] = null;
          return;
        }
        try {
          previewUrls[viewport] = await dependencies.sign(path, 120);
        } catch {
          previewUrls[viewport] = null;
        }
      }));
      return jsonResponse({ proposal, previewUrls }, 200, origin);
    } catch (error) {
      return safeErrorResponse(error, origin, "proposal_unavailable");
    }
  };
}

function defaultDependencies(): ManualAccessDependencies {
  const service = createServiceClient();
  return {
    pepper: getManualProposalEnv().keyPepper,
    now: () => new Date(),
    verify: async (reference, hash, attemptedAt) => {
      const result = await service.rpc("verify_manual_proposal_access", {
        p_reference: reference,
        p_candidate_hash: hash,
        p_attempted_at: attemptedAt,
      });
      if (result.error) throw new Error("manual proposal verification failed");
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row) return null;
      return {
        snapshot: row.proposal_snapshot,
        paths: row.preview_paths,
        expiresAt: row.proposal_expires_at,
      };
    },
    sign: async (path, expiresInSeconds) => {
      const result = await service.storage.from("manual-proposal-previews").createSignedUrl(path, expiresInSeconds);
      return result.error ? null : result.data.signedUrl;
    },
  };
}

if (import.meta.main) {
  Deno.serve(createManualProposalAccessHandler(defaultDependencies()));
}
