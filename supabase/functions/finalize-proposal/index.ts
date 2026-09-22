/// <reference lib="deno.ns" />

import {
  ADDON_CATALOG,
  PACKAGE_CATALOG,
} from "../_shared/quiz-engine/catalog.ts";
import { calculateRecommendation } from "../_shared/quiz-engine/cortex.ts";
import { buildProposalDraft } from "../_shared/quiz-engine/proposal-view.ts";
import {
  buildRoadmapTiers,
  defaultRoadmapSelection,
  resolveRoadmapSelection,
} from "../_shared/quiz-engine/roadmap-options.ts";
import type {
  AudienceKey,
  PlatformKey,
  PublicTierKey,
  QuizAnswers,
  RoadmapSelection,
} from "../_shared/quiz-engine/types.ts";
import {
  deriveAccessKey,
  hmacSha256Hex,
  signStopToken,
} from "../_shared/crypto.ts";
import { getProposalEnv, getSupabaseEnv } from "../_shared/env.ts";
import {
  assertExactKeys,
  jsonResponse,
  PublicHttpError,
  readJsonObject,
  safeErrorResponse,
  validateBrowserRequest,
} from "../_shared/http.ts";
import {
  deliverInitialProposal,
  type InitialProposalDelivery,
} from "../_shared/proposal-email.ts";
import {
  createRequestClient,
  createServiceClient,
} from "../_shared/supabase.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const AUDIENCES: readonly AudienceKey[] = [
  "coaches_educators",
  "service_businesses",
  "custom_order_businesses",
];
const TIERS: readonly PublicTierKey[] = ["basic", "advanced", "complete"];
const PLATFORMS: readonly PlatformKey[] = [
  "systeme_io",
  "gohighlevel",
  "custom_app",
];

export interface OwnedProposalInput {
  ownerUserId: string;
  quizSessionId: string;
  questionSetId: string;
  leadId: string;
  audienceKey: AudienceKey;
  answers: QuizAnswers;
  firstName: string;
  businessName: string;
  email: string;
  proposalStatus: string;
  proposalReference: string | null;
  proposalExpiresAt: string | null;
  selectedRoadmapSnapshot: Record<string, unknown> | null;
}

export interface FinalizeProposalDependencies {
  keyPepper: string;
  stopSigningSecret: string;
  publicBaseUrl: string;
  supabaseUrl: string;
  now: () => Date;
  loadOwnedQuiz: (
    request: Request,
    quizSessionId: string,
  ) => Promise<OwnedProposalInput>;
  assertApprovedConfiguration: (questionSetId: string) => Promise<void>;
  finalize: (input: {
    quizSessionId: string;
    selection: RoadmapSelection;
    resultSnapshot: Record<string, unknown>;
    proposalSnapshot: Record<string, unknown>;
    proposalReference: string;
    accessKeyHash: string;
  }) => Promise<void>;
  deliver: (payload: InitialProposalDelivery) => Promise<void>;
  markDelivered: (
    quizSessionId: string,
    proposalReference: string,
    deliveredAt: string,
  ) => Promise<string>;
  recordEvent: (
    eventName: string,
    quizSessionId: string,
    leadId: string,
    properties: Record<string, unknown>,
  ) => Promise<void>;
}

function validSelection(
  body: unknown,
): { tierKey: PublicTierKey; platform: PlatformKey } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const selection = body as Record<string, unknown>;
  if (
    Object.keys(selection).some((key) => !["tierKey", "platform"].includes(key))
  ) return null;
  if (
    !TIERS.includes(selection.tierKey as PublicTierKey) ||
    !PLATFORMS.includes(selection.platform as PlatformKey)
  ) return null;
  return {
    tierKey: selection.tierKey as PublicTierKey,
    platform: selection.platform as PlatformKey,
  };
}

function selectedRoadmap(
  result: ReturnType<typeof calculateRecommendation>,
  request: { tierKey: PublicTierKey; platform: PlatformKey },
): RoadmapSelection {
  const tier = buildRoadmapTiers(result).find((candidate) =>
    candidate.tierKey === request.tierKey
  );
  const variant = tier?.variants.find((candidate) =>
    candidate.platform === request.platform
  );
  if (!variant?.feasibility.available) {
    throw new PublicHttpError(400, "selection_unavailable");
  }
  const selection = {
    tierKey: request.tierKey,
    platform: request.platform,
    offerKey: variant.offer.offerKey,
  };
  resolveRoadmapSelection(result, selection);
  return selection;
}

export function createFinalizeProposalHandler(
  dependencies: FinalizeProposalDependencies,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    try {
      const options = validateBrowserRequest(request);
      if (options) return options;
      const body = await readJsonObject(request, 4096);
      assertExactKeys(body, ["operation", "quizSessionId", "selection"]);
      if (
        (body.operation !== "preview" && body.operation !== "issue") ||
        typeof body.quizSessionId !== "string" ||
        !UUID_PATTERN.test(body.quizSessionId)
      ) {
        throw new PublicHttpError(400, "invalid_request");
      }
      if (body.operation === "preview" && body.selection !== undefined) {
        throw new PublicHttpError(400, "invalid_request");
      }

      const owned = await dependencies.loadOwnedQuiz(
        request,
        body.quizSessionId,
      );
      await dependencies.assertApprovedConfiguration(owned.questionSetId);
      const result = calculateRecommendation({
        audienceKey: owned.audienceKey,
        answers: owned.answers,
      });

      if (body.operation === "preview") {
        const proposal = buildProposalDraft(
          { firstName: owned.firstName, businessName: owned.businessName },
          owned.answers,
          result,
          defaultRoadmapSelection(result),
        );
        return jsonResponse({ proposal }, 200, origin);
      }

      const requestedSelection = validSelection(body.selection);
      if (!requestedSelection) {
        throw new PublicHttpError(400, "invalid_request");
      }
      if (
        owned.proposalStatus === "active" && owned.proposalReference &&
        owned.proposalExpiresAt && owned.selectedRoadmapSnapshot
      ) {
        return jsonResponse(
          {
            proposalReference: owned.proposalReference,
            proposal: {
              ...owned.selectedRoadmapSnapshot,
              expiresAt: owned.proposalExpiresAt,
            },
            emailDelivery: "sent",
          },
          200,
          origin,
        );
      }
      if (owned.proposalStatus !== "not_issued") {
        throw new PublicHttpError(409, "proposal_unavailable");
      }

      const selection = selectedRoadmap(result, requestedSelection);
      const proposalDraft = buildProposalDraft(
        { firstName: owned.firstName, businessName: owned.businessName },
        owned.answers,
        result,
        selection,
      );
      const proposalReference = owned.proposalReference ?? crypto.randomUUID();
      const accessKey = await deriveAccessKey(
        owned.quizSessionId,
        dependencies.keyPepper,
      );
      const accessKeyHash = await hmacSha256Hex(
        accessKey,
        dependencies.keyPepper,
      );
      await dependencies.finalize({
        quizSessionId: owned.quizSessionId,
        selection,
        resultSnapshot: result as unknown as Record<string, unknown>,
        proposalSnapshot: proposalDraft as unknown as Record<string, unknown>,
        proposalReference,
        accessKeyHash,
      });

      const deliveredAt = dependencies.now();
      const expiresAt = new Date(deliveredAt.getTime() + 72 * 60 * 60 * 1000)
        .toISOString();
      const stopToken = await signStopToken({
        leadId: owned.leadId,
        expiresAtEpochSeconds: Math.floor(deliveredAt.getTime() / 1000) +
          96 * 60 * 60,
      }, dependencies.stopSigningSecret);
      const payload: InitialProposalDelivery = {
        operationId: proposalReference,
        recipient: {
          email: owned.email,
          firstName: owned.firstName,
          businessName: owned.businessName,
        },
        proposal: {
          reference: proposalReference,
          url: `${dependencies.publicBaseUrl}/proposal/?ref=${
            encodeURIComponent(proposalReference)
          }`,
          accessKey,
          expiresAt,
          discoveryCallUrl: `${dependencies.publicBaseUrl}/booking/`,
          stopUrl:
            `${dependencies.supabaseUrl}/functions/v1/stop-proposal-followups?token=${
              encodeURIComponent(stopToken)
            }`,
          pointA: proposalDraft.pointA.summary,
          pointB: proposalDraft.pointB.summary,
          recommendation: proposalDraft.recommendation.title,
          tierKey: selection.tierKey,
          platform: selection.platform,
          offerKey: selection.offerKey,
        },
      };

      try {
        await dependencies.deliver(payload);
      } catch {
        await dependencies.recordEvent(
          "proposal_email_failed",
          owned.quizSessionId,
          owned.leadId,
          {
            reason_code: "delivery_rejected",
            tier_key: selection.tierKey,
            platform: selection.platform,
            offer_key: selection.offerKey,
          },
        ).catch(() => undefined);
        throw new PublicHttpError(502, "proposal_delivery_failed");
      }

      const confirmedExpiry = await dependencies.markDelivered(
        owned.quizSessionId,
        proposalReference,
        deliveredAt.toISOString(),
      );
      await dependencies.recordEvent(
        "proposal_email_sent",
        owned.quizSessionId,
        owned.leadId,
        {
          delivery_status: "sent",
          tier_key: selection.tierKey,
          platform: selection.platform,
          offer_key: selection.offerKey,
        },
      ).catch(() => undefined);
      return jsonResponse(
        {
          proposalReference,
          proposal: { ...proposalDraft, expiresAt: confirmedExpiry },
          emailDelivery: "sent",
        },
        200,
        origin,
      );
    } catch (error) {
      return safeErrorResponse(error, origin, "proposal_finalization_failed");
    }
  };
}

function defaultDependencies(): FinalizeProposalDependencies {
  const service = createServiceClient();
  const proposalEnvironment = getProposalEnv();
  const supabaseEnvironment = getSupabaseEnv();
  return {
    ...proposalEnvironment,
    supabaseUrl: supabaseEnvironment.url,
    now: () => new Date(),
    loadOwnedQuiz: async (request, quizSessionId) => {
      const userClient = createRequestClient(request);
      const auth = await userClient.auth.getUser();
      if (auth.error || !auth.data.user) {
        throw new PublicHttpError(401, "authentication_required");
      }
      const quiz = await userClient.from("quiz_sessions")
        .select(
          "id,owner_user_id,question_set_id,lead_id,audience_key,answers,status",
        )
        .eq("id", quizSessionId).single();
      if (
        quiz.error || !quiz.data ||
        quiz.data.owner_user_id !== auth.data.user.id || !quiz.data.lead_id
      ) {
        throw new PublicHttpError(404, "quiz_unavailable");
      }
      const [lead, proposal] = await Promise.all([
        service.from("leads").select("id,first_name,business_name,email").eq(
          "id",
          quiz.data.lead_id,
        ).single(),
        service.from("quiz_sessions").select(
          "proposal_status,proposal_reference,proposal_expires_at,selected_roadmap_snapshot",
        )
          .eq("id", quizSessionId).single(),
      ]);
      if (
        lead.error || !lead.data || proposal.error || !proposal.data ||
        !AUDIENCES.includes(quiz.data.audience_key as AudienceKey)
      ) throw new PublicHttpError(404, "quiz_unavailable");
      return {
        ownerUserId: auth.data.user.id,
        quizSessionId,
        questionSetId: quiz.data.question_set_id,
        leadId: quiz.data.lead_id,
        audienceKey: quiz.data.audience_key as AudienceKey,
        answers: quiz.data.answers as QuizAnswers,
        firstName: lead.data.first_name,
        businessName: lead.data.business_name,
        email: lead.data.email,
        proposalStatus: proposal.data.proposal_status,
        proposalReference: proposal.data.proposal_reference,
        proposalExpiresAt: proposal.data.proposal_expires_at,
        selectedRoadmapSnapshot: proposal.data.selected_roadmap_snapshot,
      };
    },
    assertApprovedConfiguration: async (questionSetId) => {
      const [definition, packages, addons] = await Promise.all([
        service.from("quiz_definitions").select("id,active,scoring_rules").eq(
          "id",
          questionSetId,
        ).eq("active", true).single(),
        service.from("package_catalog").select(
          "offer_key,base_price_usd,build_route,supported_platforms",
        ).eq("active", true),
        service.from("addon_catalog").select(
          "addon_key,starting_price_usd,allowed_build_routes",
        ).eq("active", true),
      ]);
      if (
        definition.error || !definition.data || packages.error || addons.error
      ) throw new Error("configuration unavailable");
      const scoring = definition.data.scoring_rules as Record<string, unknown>;
      if (
        scoring.server_verified !== true ||
        scoring.engine_version !== "cortex-local-v0.1" ||
        scoring.catalog_version !== "portfolio-catalog-v0.1"
      ) throw new Error("configuration version mismatch");
      const packageRows = new Map(
        (packages.data ?? []).map((row) => [row.offer_key, row]),
      );
      const addonRows = new Map(
        (addons.data ?? []).map((row) => [row.addon_key, row]),
      );
      if (
        packageRows.size !== PACKAGE_CATALOG.length ||
        addonRows.size !== ADDON_CATALOG.length
      ) throw new Error("catalog mismatch");
      for (const item of PACKAGE_CATALOG) {
        const row = packageRows.get(item.offerKey);
        if (
          !row || Number(row.base_price_usd) !== item.basePriceUsd ||
          row.build_route !== item.buildRoute ||
          JSON.stringify(row.supported_platforms) !==
            JSON.stringify(item.supportedPlatforms)
        ) throw new Error("catalog mismatch");
      }
      for (const item of ADDON_CATALOG) {
        const row = addonRows.get(item.addonKey);
        if (
          !row || Number(row.starting_price_usd) !== item.startingPriceUsd ||
          JSON.stringify(row.allowed_build_routes) !==
            JSON.stringify(item.allowedBuildRoutes)
        ) throw new Error("catalog mismatch");
      }
    },
    finalize: async (input) => {
      const result = await service.rpc("finalize_quiz_proposal", {
        p_quiz_session_id: input.quizSessionId,
        p_selected_tier_key: input.selection.tierKey,
        p_selected_platform: input.selection.platform,
        p_selected_offer_key: input.selection.offerKey,
        p_result_snapshot: input.resultSnapshot,
        p_selected_roadmap_snapshot: input.proposalSnapshot,
        p_proposal_reference: input.proposalReference,
        p_proposal_access_key_hash: input.accessKeyHash,
      });
      if (result.error) throw new Error("proposal persistence failed");
    },
    deliver: (payload) => deliverInitialProposal(payload),
    markDelivered: async (quizSessionId, proposalReference, deliveredAt) => {
      const result = await service.rpc("mark_proposal_delivered", {
        p_quiz_session_id: quizSessionId,
        p_proposal_reference: proposalReference,
        p_delivered_at: deliveredAt,
      });
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || !row?.proposal_expires_at) {
        throw new Error("proposal activation failed");
      }
      return new Date(row.proposal_expires_at).toISOString();
    },
    recordEvent: async (eventName, quizSessionId, leadId, properties) => {
      const result = await service.rpc("record_trusted_proposal_event", {
        p_event_name: eventName,
        p_quiz_session_id: quizSessionId,
        p_lead_id: leadId,
        p_properties: properties,
      });
      if (result.error) throw new Error("event recording failed");
    },
  };
}

if (import.meta.main) {
  Deno.serve(createFinalizeProposalHandler(defaultDependencies()));
}
