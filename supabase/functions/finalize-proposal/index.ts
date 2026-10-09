/// <reference lib="deno.ns" />

import {
  ADDON_CATALOG,
  PACKAGE_CATALOG,
} from "../_shared/quiz-engine/catalog.ts";
import { calculateRecommendation } from "../_shared/quiz-engine/cortex.ts";
import {
  calculateProjectPriceQuote,
  isCurrencyQuoteFresh,
  normalizeCouponCode,
} from "../_shared/quiz-engine/discounts.ts";
import { buildProposalDraft } from "../_shared/quiz-engine/proposal-view.ts";
import {
  buildRoadmapTiers,
  defaultRoadmapSelection,
  resolveRoadmapSelection,
} from "../_shared/quiz-engine/roadmap-options.ts";
import type {
  AudienceKey,
  BusinessLocation,
  PlatformKey,
  PublicTierKey,
  ProposalDraftViewModel,
  ProjectPriceQuote,
  QuizAnswers,
  RoadmapSelection,
  ValidatedDiscountCampaign,
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
  location: BusinessLocation | null;
}

export interface FinalizeProposalDependencies {
  keyPepper: string;
  couponRedemptionSecret: string;
  stopSigningSecret: string;
  publicBaseUrl: string;
  supabaseUrl: string;
  now: () => Date;
  loadOwnedQuiz: (
    request: Request,
    quizSessionId: string,
  ) => Promise<OwnedProposalInput>;
  assertApprovedConfiguration: (questionSetId: string) => Promise<void>;
  previewDiscount: (input: {
    quizSessionId: string;
    couponCode: string;
    redeemerDigest: string;
    at: string;
  }) => Promise<ValidatedDiscountCampaign>;
  reserveDiscount: (input: {
    quizSessionId: string;
    couponCode: string;
    redeemerDigest: string;
    originalTotalUsd: number;
    discountAmountUsd: number;
    finalTotalUsd: number;
    at: string;
  }) => Promise<{
    redemptionId: string;
    campaign: ValidatedDiscountCampaign;
  }>;
  releaseDiscount: (input: {
    quizSessionId: string;
    redemptionId: string;
    at: string;
  }) => Promise<void>;
  finalize: (input: {
    quizSessionId: string;
    selection: RoadmapSelection;
    resultSnapshot: Record<string, unknown>;
    proposalSnapshot: Record<string, unknown>;
    proposalReference: string;
    accessKeyHash: string;
    redemptionId: string | null;
  }) => Promise<void>;
  deliver: (payload: InitialProposalDelivery) => Promise<void>;
  markDelivered: (
    quizSessionId: string,
    proposalReference: string,
    redemptionId: string | null,
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

const COUPON_FAILURE_STATUS = {
  coupon_invalid: 400,
  coupon_ineligible: 403,
  coupon_exhausted: 409,
  coupon_already_redeemed: 409,
  coupon_temporarily_unavailable: 503,
} as const;

type CouponFailureCode = keyof typeof COUPON_FAILURE_STATUS;

function requestedCouponCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 64) {
    throw new PublicHttpError(400, "invalid_request");
  }
  const normalized = normalizeCouponCode(value);
  if (!normalized) throw new PublicHttpError(400, "coupon_invalid");
  return normalized;
}

function validatedCampaign(value: unknown): ValidatedDiscountCampaign {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid campaign response");
  }
  const campaign = value as Record<string, unknown>;
  if (
    campaign.campaignKey === "pinoyako" && campaign.code === "PINOYAKO" &&
    campaign.percentage === 50
  ) return campaign as unknown as ValidatedDiscountCampaign;
  if (
    campaign.campaignKey === "earlybirdworks" &&
    campaign.code === "EARLYBIRDWORKS" && campaign.percentage === 15
  ) return campaign as unknown as ValidatedDiscountCampaign;
  throw new Error("invalid campaign response");
}

function initializedProposal(value: Record<string, unknown>): ProposalDraftViewModel {
  const selection = value.selection as Record<string, unknown> | null;
  const investment = value.investment as Record<string, unknown> | null;
  if (
    value.proposalSnapshotVersion !== "proposal-snapshot-2026.09-v2" ||
    value.expiresAt !== null || !selection || !investment ||
    !TIERS.includes(selection.tierKey as PublicTierKey) ||
    !PLATFORMS.includes(selection.platform as PlatformKey) ||
    typeof selection.offerKey !== "string" || !selection.offerKey ||
    !["originalTotalUsd", "discountAmountUsd", "finalTotalUsd"].every((key) => (
      typeof investment[key] === "number" && Number.isFinite(investment[key]) && Number(investment[key]) >= 0
    ))
  ) throw new PublicHttpError(409, "proposal_unavailable");
  const campaign = investment.campaign === null ? null : validatedCampaign(investment.campaign);
  const expectedDiscount = campaign
    ? Math.round((Math.round(Number(investment.originalTotalUsd) * 100) * campaign.percentage) / 100) / 100
    : 0;
  if (
    Math.round((Number(investment.discountAmountUsd) + Number(investment.finalTotalUsd)) * 100) !==
      Math.round(Number(investment.originalTotalUsd) * 100) ||
    Math.round(Number(investment.discountAmountUsd) * 100) !== Math.round(expectedDiscount * 100)
  ) throw new PublicHttpError(409, "proposal_unavailable");
  return value as unknown as ProposalDraftViewModel;
}

function couponFailure(error: unknown): never {
  if (error instanceof PublicHttpError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  const code = (Object.keys(COUPON_FAILURE_STATUS) as CouponFailureCode[])
    .find((candidate) => message.includes(candidate));
  if (code) throw new PublicHttpError(COUPON_FAILURE_STATUS[code], code);
  throw error;
}

async function couponDigest(email: string, secret: string) {
  return await hmacSha256Hex(
    `proposal-coupon:${email.trim().toLowerCase()}`,
    secret,
  );
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
      assertExactKeys(body, ["operation", "quizSessionId", "selection", "couponCode"]);
      if (
        (body.operation !== "preview" && body.operation !== "issue") ||
        typeof body.quizSessionId !== "string" ||
        !UUID_PATTERN.test(body.quizSessionId)
      ) {
        throw new PublicHttpError(400, "invalid_request");
      }
      const couponCode = requestedCouponCode(body.couponCode);
      const requestedSelection = body.selection === undefined
        ? null
        : validSelection(body.selection);
      if (
        (body.operation === "issue" && !requestedSelection) ||
        (body.selection !== undefined && !requestedSelection)
      ) {
        throw new PublicHttpError(400, "invalid_request");
      }

      const owned = await dependencies.loadOwnedQuiz(
        request,
        body.quizSessionId,
      );
      await dependencies.assertApprovedConfiguration(owned.questionSetId);
      const requestNow = dependencies.now();
      const authoritativeLocation = owned.location && isCurrencyQuoteFresh(
          owned.location.fxRateTimestamp,
          requestNow,
        )
        ? owned.location
        : owned.location
        ? { ...owned.location, fxRate: null, fxRateTimestamp: null }
        : undefined;
      const result = calculateRecommendation({
        audienceKey: owned.audienceKey,
        answers: owned.answers,
        location: authoritativeLocation,
      });

      if (body.operation === "preview") {
        const selection = requestedSelection
          ? selectedRoadmap(result, requestedSelection)
          : defaultRoadmapSelection(result);
        const selected = resolveRoadmapSelection(result, selection);
        let campaign: ValidatedDiscountCampaign | null = null;
        if (couponCode) {
          try {
            campaign = validatedCampaign(await dependencies.previewDiscount({
              quizSessionId: owned.quizSessionId,
              couponCode,
              redeemerDigest: await couponDigest(
                owned.email,
                dependencies.couponRedemptionSecret,
              ),
              at: dependencies.now().toISOString(),
            }));
          } catch (error) {
            couponFailure(error);
          }
        }
        const proposal = buildProposalDraft(
          { firstName: owned.firstName, businessName: owned.businessName },
          owned.answers,
          result,
          selection,
          calculateProjectPriceQuote({
            originalTotalUsd: selected.estimatedProjectInvestmentUsd,
            location: authoritativeLocation ?? result.location,
            campaign,
          }),
        );
        return jsonResponse({ proposal }, 200, origin);
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

      const storedDraft = owned.proposalReference && owned.selectedRoadmapSnapshot
        ? initializedProposal(owned.selectedRoadmapSnapshot)
        : null;
      if (storedDraft && (
        requestedSelection!.tierKey !== storedDraft.selection.tierKey ||
        requestedSelection!.platform !== storedDraft.selection.platform ||
        couponCode !== (storedDraft.investment.campaign?.code ?? null)
      )) throw new PublicHttpError(409, "proposal_unavailable");

      const selection = storedDraft?.selection ?? selectedRoadmap(result, requestedSelection!);
      const selected = resolveRoadmapSelection(result, selection);
      let campaign: ValidatedDiscountCampaign | null = storedDraft?.investment.campaign ?? null;
      let redemptionId: string | null = null;
      let redeemerDigest: string | null = null;
      if (couponCode) {
        redeemerDigest = await couponDigest(
          owned.email,
          dependencies.couponRedemptionSecret,
        );
        try {
          const previewedCampaign = validatedCampaign(await dependencies.previewDiscount({
            quizSessionId: owned.quizSessionId,
            couponCode,
            redeemerDigest,
            at: dependencies.now().toISOString(),
          }));
          if (campaign && (
            previewedCampaign.campaignKey !== campaign.campaignKey ||
            previewedCampaign.code !== campaign.code ||
            previewedCampaign.percentage !== campaign.percentage
          )) throw new Error("invalid campaign retry");
          campaign = previewedCampaign;
        } catch (error) {
          couponFailure(error);
        }
      }
      let priceQuote: ProjectPriceQuote = storedDraft?.investment ?? calculateProjectPriceQuote({
        originalTotalUsd: selected.estimatedProjectInvestmentUsd,
        location: authoritativeLocation ?? result.location,
        campaign,
      });
      if (couponCode && campaign && redeemerDigest) {
        try {
          const reservation = await dependencies.reserveDiscount({
            quizSessionId: owned.quizSessionId,
            couponCode,
            redeemerDigest,
            originalTotalUsd: priceQuote.originalTotalUsd,
            discountAmountUsd: priceQuote.discountAmountUsd,
            finalTotalUsd: priceQuote.finalTotalUsd,
            at: dependencies.now().toISOString(),
          });
          const reservedCampaign = validatedCampaign(reservation.campaign);
          if (
            reservedCampaign.campaignKey !== campaign.campaignKey ||
            reservedCampaign.code !== campaign.code ||
            reservedCampaign.percentage !== campaign.percentage ||
            !UUID_PATTERN.test(reservation.redemptionId)
          ) throw new Error("invalid campaign reservation");
          redemptionId = reservation.redemptionId;
          campaign = reservedCampaign;
          if (!storedDraft) {
            priceQuote = calculateProjectPriceQuote({
              originalTotalUsd: selected.estimatedProjectInvestmentUsd,
              location: authoritativeLocation ?? result.location,
              campaign,
            });
          }
        } catch (error) {
          couponFailure(error);
        }
      }
      const proposalDraft = storedDraft ?? buildProposalDraft(
        { firstName: owned.firstName, businessName: owned.businessName },
        owned.answers,
        result,
        selection,
        priceQuote,
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
      if (!storedDraft) {
        try {
          await dependencies.finalize({
            quizSessionId: owned.quizSessionId,
            selection,
            resultSnapshot: result as unknown as Record<string, unknown>,
            proposalSnapshot: proposalDraft as unknown as Record<string, unknown>,
            proposalReference,
            accessKeyHash,
            redemptionId,
          });
        } catch (error) {
          if (redemptionId) {
            await dependencies.releaseDiscount({
              quizSessionId: owned.quizSessionId,
              redemptionId,
              at: dependencies.now().toISOString(),
            }).catch(() => undefined);
          }
          throw error;
        }
      }

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
          price: proposalDraft.investment,
        },
      };

      try {
        await dependencies.deliver(payload);
      } catch {
        if (redemptionId) {
          await dependencies.releaseDiscount({
            quizSessionId: owned.quizSessionId,
            redemptionId,
            at: dependencies.now().toISOString(),
          }).catch(() => undefined);
        }
        await dependencies.recordEvent(
          "proposal_email_failed",
          owned.quizSessionId,
          owned.leadId,
          {
            reason_code: "delivery_rejected",
            tier_key: selection.tierKey,
            platform: selection.platform,
            offer_key: selection.offerKey,
            campaign_key: campaign?.campaignKey ?? null,
            discount_percent: campaign?.percentage ?? null,
            original_total_usd: priceQuote.originalTotalUsd,
            final_total_usd: priceQuote.finalTotalUsd,
          },
        ).catch(() => undefined);
        throw new PublicHttpError(502, "proposal_delivery_failed");
      }

      let confirmedExpiry: string;
      try {
        confirmedExpiry = await dependencies.markDelivered(
          owned.quizSessionId,
          proposalReference,
          redemptionId,
          deliveredAt.toISOString(),
        );
      } catch {
        await dependencies.recordEvent(
          "proposal_delivery_acknowledgement_failed",
          owned.quizSessionId,
          owned.leadId,
          { tier_key: selection.tierKey, platform: selection.platform },
        ).catch(() => undefined);
        throw new PublicHttpError(502, "proposal_delivery_failed");
      }
      await dependencies.recordEvent(
        "proposal_email_sent",
        owned.quizSessionId,
        owned.leadId,
        {
          delivery_status: "sent",
          tier_key: selection.tierKey,
          platform: selection.platform,
          offer_key: selection.offerKey,
          campaign_key: campaign?.campaignKey ?? null,
          discount_percent: campaign?.percentage ?? null,
          original_total_usd: priceQuote.originalTotalUsd,
          final_total_usd: priceQuote.finalTotalUsd,
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
          "id,owner_user_id,question_set_id,lead_id,audience_key,answers,status,business_country,country_code,display_currency,currency_symbol,fx_rate,fx_rate_timestamp",
        )
        .eq("id", quizSessionId).single();
      if (
        quiz.error || !quiz.data ||
        quiz.data.owner_user_id !== auth.data.user.id || !quiz.data.lead_id
      ) {
        throw new PublicHttpError(404, "quiz_unavailable");
      }
      const [lead, proposal] = await Promise.all([
        service.from("leads").select("id,first_name,business_name,email,email_verified_at").eq(
          "id",
          quiz.data.lead_id,
        ).single(),
        service.from("quiz_sessions").select(
          "proposal_status,proposal_reference,proposal_expires_at,selected_roadmap_snapshot",
        )
          .eq("id", quizSessionId).single(),
      ]);
      if (
        lead.error || !lead.data || !lead.data.email_verified_at ||
        proposal.error || !proposal.data ||
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
        location: quiz.data.business_country && quiz.data.country_code && quiz.data.display_currency && quiz.data.currency_symbol
          ? {
            businessCountry: quiz.data.business_country,
            countryCode: quiz.data.country_code,
            displayCurrency: quiz.data.display_currency,
            currencySymbol: quiz.data.currency_symbol,
            fxRate: quiz.data.fx_rate === null ? null : Number(quiz.data.fx_rate),
            fxRateTimestamp: quiz.data.fx_rate_timestamp,
          }
          : null,
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
        scoring.engine_version !== "business-systems-cortex-2026.09-v2" ||
        scoring.catalog_version !== "business-systems-catalog-2026.09-v2"
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
    previewDiscount: async (input) => {
      const result = await service.rpc("preview_proposal_discount", {
        p_quiz_session_id: input.quizSessionId,
        p_coupon_code: input.couponCode,
        p_redeemer_digest: input.redeemerDigest,
        p_at: input.at,
      });
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || !row) {
        throw new Error(result.error?.message ?? "coupon_temporarily_unavailable");
      }
      return validatedCampaign({
        campaignKey: row.campaign_key,
        code: row.code,
        percentage: Number(row.discount_percent),
      });
    },
    reserveDiscount: async (input) => {
      const result = await service.rpc("reserve_proposal_discount", {
        p_quiz_session_id: input.quizSessionId,
        p_coupon_code: input.couponCode,
        p_redeemer_digest: input.redeemerDigest,
        p_original_total_usd: input.originalTotalUsd,
        p_discount_amount_usd: input.discountAmountUsd,
        p_final_total_usd: input.finalTotalUsd,
        p_at: input.at,
      });
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || !row?.redemption_id) {
        throw new Error(result.error?.message ?? "coupon_temporarily_unavailable");
      }
      return {
        redemptionId: row.redemption_id,
        campaign: validatedCampaign({
          campaignKey: row.campaign_key,
          code: row.code,
          percentage: Number(row.discount_percent),
        }),
      };
    },
    releaseDiscount: async (input) => {
      const result = await service.rpc("release_proposal_discount", {
        p_quiz_session_id: input.quizSessionId,
        p_redemption_id: input.redemptionId,
        p_at: input.at,
      });
      if (result.error) throw new Error("coupon release failed");
    },
    finalize: async (input) => {
      const result = await service.rpc("finalize_quiz_proposal_v2", {
        p_quiz_session_id: input.quizSessionId,
        p_selected_tier_key: input.selection.tierKey,
        p_selected_platform: input.selection.platform,
        p_selected_offer_key: input.selection.offerKey,
        p_result_snapshot: input.resultSnapshot,
        p_selected_roadmap_snapshot: input.proposalSnapshot,
        p_proposal_reference: input.proposalReference,
        p_proposal_access_key_hash: input.accessKeyHash,
        p_redemption_id: input.redemptionId,
      });
      if (result.error) throw new Error("proposal persistence failed");
    },
    deliver: (payload) => deliverInitialProposal(payload),
    markDelivered: async (quizSessionId, proposalReference, redemptionId, deliveredAt) => {
      const result = await service.rpc("mark_proposal_delivered_v2", {
        p_quiz_session_id: quizSessionId,
        p_proposal_reference: proposalReference,
        p_redemption_id: redemptionId,
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
