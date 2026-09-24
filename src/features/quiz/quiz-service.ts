import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizeCouponCode } from "./discounts";
import { PROPOSAL_SNAPSHOT_VERSION } from "./types";

import type {
  AudienceKey,
  BusinessLocation,
  CustomEmailOtpChallenge,
  CustomEmailOtpVerification,
  LeadContactInput,
  LeadContactSubmissionResult,
  ProposalDraftViewModel,
  ProposalViewModel,
  QuizAnswers,
  RoadmapSelection,
} from "./types";

export interface OwnedQuizContext {
  ownerUserId: string;
  visitorId: string;
  portfolioSessionId: string;
  quizSessionId: string;
  questionSetId: string;
  questionSetVersion: number;
  audienceKey: AudienceKey;
}

export interface QuizProgressInput {
  answers: QuizAnswers;
  currentStep: number;
  lastCompletedStep: number;
  location?: BusinessLocation | null;
}

export interface QuizService {
  getCurrencyQuote: typeof getCurrencyQuote;
  requestEmailOtp: typeof requestCustomEmailOtp;
  verifyEmailOtp: typeof verifyCustomEmailOtp;
  createOwnedQuizContext: typeof createOwnedQuizContext;
  submitLeadContact: typeof submitCustomVerifiedLeadContact;
  saveOwnedQuizProgress: typeof saveOwnedQuizProgress;
  previewProposal: typeof previewProposal;
  issueProposal: typeof issueProposal;
}

export async function getCurrencyQuote(
  country: { name: string; code: string; currency: string; symbol: string },
  client?: SupabaseClient,
): Promise<BusinessLocation> {
  const response = await clientOrDefault(client).functions.invoke("currency-quote", {
    body: { countryCode: country.code, countryName: country.name, currency: country.currency, symbol: country.symbol },
  });
  const data = response.data as Record<string, unknown> | null;
  if (
    response.error || !data ||
    typeof data.businessCountry !== "string" || typeof data.countryCode !== "string" ||
    typeof data.displayCurrency !== "string" || typeof data.currencySymbol !== "string" ||
    typeof data.fxRate !== "number" || !Number.isFinite(data.fxRate) || data.fxRate <= 0 ||
    typeof data.fxRateTimestamp !== "string" || !Number.isFinite(Date.parse(data.fxRateTimestamp))
  ) throw safeServiceError();
  return data as unknown as BusinessLocation;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTACT_ERROR = "We could not save your details. Please try again.";
const SERVICE_ERROR = "The assessment service is temporarily unavailable. Please try again.";
const OTP_ERROR = "We could not verify that code. Check it or request a new one.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProposalServiceErrorCode =
  | "coupon_invalid"
  | "coupon_ineligible"
  | "coupon_exhausted"
  | "coupon_already_redeemed"
  | "coupon_temporarily_unavailable"
  | "proposal_delivery_failed";

const PROPOSAL_ERROR_MESSAGES: Record<ProposalServiceErrorCode, string> = {
  coupon_invalid: "That coupon code is not valid.",
  coupon_ineligible: "This coupon is not available for the selected business location.",
  coupon_exhausted: "This coupon has reached its client limit.",
  coupon_already_redeemed: "This verified email has already used this coupon.",
  coupon_temporarily_unavailable: "Coupon validation is temporarily unavailable. Please try again.",
  proposal_delivery_failed: "Your roadmap is ready, but we could not send the proposal email. Please try again.",
};

export class ProposalServiceError extends Error {
  constructor(public readonly code: ProposalServiceErrorCode) {
    super(PROPOSAL_ERROR_MESSAGES[code]);
    this.name = "ProposalServiceError";
  }
}

export function isProposalServiceError(error: unknown, code?: ProposalServiceErrorCode): error is ProposalServiceError {
  return error instanceof ProposalServiceError && (!code || error.code === code);
}

export const EMAIL_OTP_MODE = "custom_make_otp" as const;

function clientOrDefault(client?: SupabaseClient): SupabaseClient {
  return client ?? getSupabaseBrowserClient();
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(SERVICE_ERROR);
  return value;
}

function safeServiceError(): Error {
  return new Error(SERVICE_ERROR);
}

function validCampaign(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const campaign = value as Record<string, unknown>;
  return (
    campaign.campaignKey === "pinoyako" && campaign.code === "PINOYAKO" && campaign.percentage === 50
  ) || (
    campaign.campaignKey === "earlybirdworks" && campaign.code === "EARLYBIRDWORKS" && campaign.percentage === 15
  );
}

function parseProposal<T extends ProposalDraftViewModel | ProposalViewModel>(value: unknown, mode: "draft" | "issued"): T {
  if (!value || typeof value !== "object") throw safeServiceError();
  const proposal = value as Record<string, unknown>;
  const quote = proposal.investment as Record<string, unknown> | null;
  const selection = proposal.selection as Record<string, unknown> | null;
  const fxTupleValid = quote && (
    quote.fxRate === null && quote.fxRateTimestamp === null && quote.finalTotalLocal === null
  ) || Boolean(quote &&
    typeof quote.fxRate === "number" && Number.isFinite(quote.fxRate) && quote.fxRate > 0 &&
    typeof quote.fxRateTimestamp === "string" && Number.isFinite(Date.parse(quote.fxRateTimestamp)) &&
    typeof quote.finalTotalLocal === "number" && Number.isFinite(quote.finalTotalLocal) && quote.finalTotalLocal >= 0
  );
  if (
    proposal.proposalSnapshotVersion !== PROPOSAL_SNAPSHOT_VERSION || !quote || !selection ||
    (mode === "draft"
      ? proposal.expiresAt !== null
      : typeof proposal.expiresAt !== "string" || !Number.isFinite(Date.parse(proposal.expiresAt))) ||
    !["basic", "advanced", "complete"].includes(String(selection.tierKey)) ||
    !["systeme_io", "gohighlevel", "custom_app"].includes(String(selection.platform)) ||
    typeof selection.offerKey !== "string" || !selection.offerKey ||
    !["originalTotalUsd", "discountAmountUsd", "finalTotalUsd"].every((key) => (
      typeof quote[key] === "number" && Number.isFinite(quote[key]) && Number(quote[key]) >= 0
    )) ||
    Math.round((Number(quote.discountAmountUsd) + Number(quote.finalTotalUsd)) * 100) !== Math.round(Number(quote.originalTotalUsd) * 100) ||
    typeof quote.localCurrency !== "string" || !/^[A-Z]{3}$/.test(quote.localCurrency) ||
    typeof quote.localSymbol !== "string" ||
    !fxTupleValid ||
    !validCampaign(quote.campaign)
  ) throw safeServiceError();
  const campaign = quote.campaign as { percentage?: number } | null;
  const expectedDiscount = campaign
    ? Math.round((Math.round(Number(quote.originalTotalUsd) * 100) * campaign.percentage!) / 100) / 100
    : 0;
  if (Math.round(Number(quote.discountAmountUsd) * 100) !== Math.round(expectedDiscount * 100)) throw safeServiceError();
  return value as T;
}

async function throwProposalFailure(response: { data: unknown; error: unknown }): Promise<never> {
  let code = response.data && typeof response.data === "object" && "error" in response.data
    ? (response.data as { error?: unknown }).error
    : undefined;
  const context = response.error && typeof response.error === "object" && "context" in response.error
    ? (response.error as { context?: unknown }).context
    : undefined;
  if (typeof code !== "string" && context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown };
      code = body.error;
    } catch {
      code = undefined;
    }
  }
  if (typeof code === "string" && code in PROPOSAL_ERROR_MESSAGES) {
    throw new ProposalServiceError(code as ProposalServiceErrorCode);
  }
  throw safeServiceError();
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new Error(OTP_ERROR);
  return normalized;
}

export async function requestCustomEmailOtp(
  email: string,
  turnstileToken: string,
  visitorId: string,
  client?: SupabaseClient,
): Promise<CustomEmailOtpChallenge> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = turnstileToken.trim();
  const normalizedVisitorId = requireUuid(visitorId);
  const response = await clientOrDefault(client).functions.invoke("request-email-otp", {
    body: {
      email: normalizedEmail,
      purpose: "qualified_quiz",
      turnstileToken: normalizedToken,
      visitorId: normalizedVisitorId,
    },
  });
  const data = response.data as Record<string, unknown> | null;
  if (
    response.error || !data ||
    typeof data.challengeId !== "string" || !UUID_PATTERN.test(data.challengeId) ||
    typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt)) ||
    typeof data.resendAvailableAt !== "string" || !Number.isFinite(Date.parse(data.resendAvailableAt)) ||
    Date.parse(data.resendAvailableAt) > Date.parse(data.expiresAt) ||
    (data.verified !== undefined && typeof data.verified !== "boolean")
  ) throw new Error(OTP_ERROR);
  const verified = data.verified === true;
  const grantExpiresAt = verified && typeof data.grantExpiresAt === "string" &&
      Number.isFinite(Date.parse(data.grantExpiresAt))
    ? new Date(data.grantExpiresAt).toISOString()
    : null;
  if (verified && !grantExpiresAt) throw new Error(OTP_ERROR);
  return {
    id: data.challengeId,
    email: normalizedEmail,
    expiresAt: new Date(data.expiresAt).toISOString(),
    resendAvailableAt: new Date(data.resendAvailableAt).toISOString(),
    verified,
    grantExpiresAt,
  };
}

export async function verifyCustomEmailOtp(
  challengeId: string,
  code: string,
  client?: SupabaseClient,
): Promise<CustomEmailOtpVerification> {
  const normalizedChallengeId = requireUuid(challengeId);
  if (!/^\d{6}$/.test(code)) throw new Error(OTP_ERROR);
  const response = await clientOrDefault(client).functions.invoke("verify-email-otp", {
    body: { challengeId: normalizedChallengeId, code },
  });
  const data = response.data as Record<string, unknown> | null;
  if (
    response.error || !data || data.verified !== true ||
    typeof data.grantExpiresAt !== "string" ||
    !Number.isFinite(Date.parse(data.grantExpiresAt))
  ) throw new Error(OTP_ERROR);
  return {
    verified: true,
    grantExpiresAt: new Date(data.grantExpiresAt).toISOString(),
  };
}

export async function ensureAnonymousSession(client?: SupabaseClient, captchaToken?: string): Promise<Session> {
  const supabase = clientOrDefault(client);
  const current = await supabase.auth.getSession();
  if (current.error) throw safeServiceError();
  if (current.data.session) {
    requireUuid(current.data.session.user.id);
    return current.data.session;
  }

  const created = await supabase.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  );
  if (created.error || !created.data.session) throw safeServiceError();
  requireUuid(created.data.session.user.id);
  return created.data.session;
}

export async function createOwnedQuizContext(
  audienceKey: AudienceKey,
  options: { client?: SupabaseClient; landingPath?: string; captchaToken?: string } = {},
): Promise<OwnedQuizContext> {
  const supabase = clientOrDefault(options.client);
  const session = await ensureAnonymousSession(supabase, options.captchaToken);
  const ownerUserId = requireUuid(session.user.id);
  const landingPath = options.landingPath?.startsWith("/") ? options.landingPath : "/quiz/";

  const definitionResult = await supabase
    .from("quiz_definitions")
    .select("id, version, audience_key")
    .eq("audience_key", audienceKey)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (definitionResult.error || !definitionResult.data) throw safeServiceError();
  const questionSetId = requireUuid(definitionResult.data.id);
  const questionSetVersion = definitionResult.data.version;
  if (!Number.isInteger(questionSetVersion) || questionSetVersion < 1 || definitionResult.data.audience_key !== audienceKey) {
    throw safeServiceError();
  }

  const existingVisitorResult = await supabase
    .from("site_visitors")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (existingVisitorResult.error) throw safeServiceError();

  let visitorId: string;
  if (existingVisitorResult.data) {
    visitorId = requireUuid(existingVisitorResult.data.id);
  } else {
    const visitorResult = await supabase
      .from("site_visitors")
      .insert({ owner_user_id: ownerUserId, landing_path: landingPath })
      .select("id")
      .single();
    if (isUniqueViolation(visitorResult.error)) {
      const racedVisitorResult = await supabase
        .from("site_visitors")
        .select("id")
        .eq("owner_user_id", ownerUserId)
        .single();
      if (racedVisitorResult.error || !racedVisitorResult.data) throw safeServiceError();
      visitorId = requireUuid(racedVisitorResult.data.id);
    } else {
      if (visitorResult.error || !visitorResult.data) throw safeServiceError();
      visitorId = requireUuid(visitorResult.data.id);
    }
  }

  const portfolioResult = await supabase
    .from("portfolio_sessions")
    .insert({
      visitor_id: visitorId,
      owner_user_id: ownerUserId,
      landing_path: landingPath,
      audience_key: audienceKey,
    })
    .select("id")
    .single();
  if (portfolioResult.error || !portfolioResult.data) throw safeServiceError();
  const portfolioSessionId = requireUuid(portfolioResult.data.id);

  const quizResult = await supabase
    .from("quiz_sessions")
    .insert({
      visitor_id: visitorId,
      owner_user_id: ownerUserId,
      portfolio_session_id: portfolioSessionId,
      question_set_id: questionSetId,
      audience_key: audienceKey,
      question_set_version: questionSetVersion,
      current_step: 0,
      last_completed_step: 0,
      answers: {},
    })
    .select("id")
    .single();
  if (quizResult.error || !quizResult.data) throw safeServiceError();
  const quizSessionId = requireUuid(quizResult.data.id);

  return {
    ownerUserId,
    visitorId,
    portfolioSessionId,
    quizSessionId,
    questionSetId,
    questionSetVersion,
    audienceKey,
  };
}

export async function submitCustomVerifiedLeadContact(
  context: OwnedQuizContext,
  challengeId: string,
  contact: LeadContactInput,
  client?: SupabaseClient,
): Promise<LeadContactSubmissionResult> {
  const supabase = clientOrDefault(client);
  const response = await supabase.rpc("begin_custom_verified_qualified_quiz_v2", {
    p_visitor_id: requireUuid(context.visitorId),
    p_portfolio_session_id: requireUuid(context.portfolioSessionId),
    p_quiz_session_id: requireUuid(context.quizSessionId),
    p_challenge_id: requireUuid(challengeId),
    p_audience_key: context.audienceKey,
    p_first_name: contact.firstName.trim(),
    p_last_name: contact.lastName.trim(),
    p_business_name: contact.businessName.trim(),
    p_consent: contact.consent === true,
    p_consent_version: "proposal_followup_v1",
    p_business_scope: contact.businessScope ?? null,
    p_selected_business_id: contact.selectedBusinessId ? requireUuid(contact.selectedBusinessId) : null,
  });
  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (response.error || !row || typeof row !== "object") throw new Error(CONTACT_ERROR);
  const record = row as Record<string, unknown>;
  const quizSessionId = requireUuid(record.quiz_session_id);
  if (record.submission_status === "different_business_name_required") {
    return { status: "different_business_name_required", quizSessionId };
  }
  if (record.submission_status === "business_scope_required") {
    if (
      typeof record.existing_business_name !== "string" || !record.existing_business_name.trim() ||
      typeof record.existing_business_id !== "string"
    ) {
      throw new Error(CONTACT_ERROR);
    }
    return {
      status: "business_scope_required",
      quizSessionId,
      existingBusinessId: requireUuid(record.existing_business_id),
      existingBusinessName: record.existing_business_name.trim(),
    };
  }
  if (record.submission_status !== "accepted") throw new Error(CONTACT_ERROR);
  return { status: "accepted", leadId: requireUuid(record.lead_id), quizSessionId };
}

export async function saveOwnedQuizProgress(
  context: OwnedQuizContext,
  progress: QuizProgressInput,
  client?: SupabaseClient,
): Promise<void> {
  if (!Number.isInteger(progress.currentStep) || !Number.isInteger(progress.lastCompletedStep)
    || progress.currentStep < 0 || progress.lastCompletedStep < 0
    || progress.lastCompletedStep > progress.currentStep
    || JSON.stringify(progress.answers).length > 60_000) throw safeServiceError();
  const response = await clientOrDefault(client)
    .from("quiz_sessions")
    .update({
      answers: progress.answers,
      current_step: progress.currentStep,
      last_completed_step: progress.lastCompletedStep,
      ...(progress.location ? {
        business_country: progress.location.businessCountry,
        country_code: progress.location.countryCode,
        display_currency: progress.location.displayCurrency,
        currency_symbol: progress.location.currencySymbol,
        fx_rate: progress.location.fxRate,
        fx_rate_timestamp: progress.location.fxRateTimestamp,
      } : {}),
    })
    .eq("id", requireUuid(context.quizSessionId))
    .eq("owner_user_id", requireUuid(context.ownerUserId));
  if (response.error) throw safeServiceError();
}

export async function previewProposal(
  context: OwnedQuizContext,
  selection?: RoadmapSelection,
  couponCode?: string,
  client?: SupabaseClient,
): Promise<ProposalDraftViewModel> {
  const normalizedCoupon = couponCode ? normalizeCouponCode(couponCode) : "";
  const response = await clientOrDefault(client).functions.invoke("finalize-proposal", {
    body: {
      operation: "preview",
      quizSessionId: requireUuid(context.quizSessionId),
      ...(selection ? { selection: { tierKey: selection.tierKey, platform: selection.platform } } : {}),
      ...(normalizedCoupon ? { couponCode: normalizedCoupon } : {}),
    },
  });
  if (response.error || !response.data?.proposal) return throwProposalFailure(response);
  return parseProposal<ProposalDraftViewModel>(response.data.proposal, "draft");
}

export async function issueProposal(
  context: OwnedQuizContext,
  selection: RoadmapSelection,
  couponCode?: string,
  client?: SupabaseClient,
): Promise<{ proposal: ProposalViewModel; proposalReference: string }> {
  const normalizedCoupon = couponCode ? normalizeCouponCode(couponCode) : "";
  const response = await clientOrDefault(client).functions.invoke("finalize-proposal", {
    body: {
      operation: "issue",
      quizSessionId: requireUuid(context.quizSessionId),
      selection: { tierKey: selection.tierKey, platform: selection.platform },
      ...(normalizedCoupon ? { couponCode: normalizedCoupon } : {}),
    },
  });
  if (response.error || !response.data?.proposal) return throwProposalFailure(response);
  const data = response.data as { proposal: unknown; proposalReference?: unknown };
  if (typeof data.proposalReference !== "string" || !UUID_PATTERN.test(data.proposalReference)) throw safeServiceError();
  return { proposal: parseProposal<ProposalViewModel>(data.proposal, "issued"), proposalReference: data.proposalReference };
}

export const defaultQuizService: QuizService = {
  getCurrencyQuote,
  requestEmailOtp: requestCustomEmailOtp,
  verifyEmailOtp: verifyCustomEmailOtp,
  createOwnedQuizContext,
  submitLeadContact: submitCustomVerifiedLeadContact,
  saveOwnedQuizProgress,
  previewProposal,
  issueProposal,
};
