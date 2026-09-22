import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import type {
  AudienceKey,
  LeadContactInput,
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
}

export interface QuizService {
  createOwnedQuizContext: typeof createOwnedQuizContext;
  submitLeadContact: typeof submitLeadContact;
  saveOwnedQuizProgress: typeof saveOwnedQuizProgress;
  previewProposal: typeof previewProposal;
  issueProposal: typeof issueProposal;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTACT_ERROR = "We could not save your details. Please try again.";
const SERVICE_ERROR = "The assessment service is temporarily unavailable. Please try again.";

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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
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

export async function submitLeadContact(
  context: OwnedQuizContext,
  contact: LeadContactInput,
  client?: SupabaseClient,
): Promise<{ leadId: string; quizSessionId: string }> {
  const supabase = clientOrDefault(client);
  const response = await supabase.rpc("begin_qualified_quiz", {
    p_visitor_id: requireUuid(context.visitorId),
    p_portfolio_session_id: requireUuid(context.portfolioSessionId),
    p_quiz_session_id: requireUuid(context.quizSessionId),
    p_audience_key: context.audienceKey,
    p_first_name: contact.firstName.trim(),
    p_business_name: contact.businessName.trim(),
    p_email: contact.email.trim().toLowerCase(),
    p_consent: contact.consent === true,
    p_consent_version: "proposal_followup_v1",
  });
  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (response.error || !row || typeof row !== "object") throw new Error(CONTACT_ERROR);
  const record = row as Record<string, unknown>;
  return { leadId: requireUuid(record.lead_id), quizSessionId: requireUuid(record.quiz_session_id) };
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
    })
    .eq("id", requireUuid(context.quizSessionId))
    .eq("owner_user_id", requireUuid(context.ownerUserId));
  if (response.error) throw safeServiceError();
}

export async function previewProposal(
  context: OwnedQuizContext,
  client?: SupabaseClient,
): Promise<ProposalDraftViewModel> {
  const response = await clientOrDefault(client).functions.invoke("finalize-proposal", {
    body: { operation: "preview", quizSessionId: requireUuid(context.quizSessionId) },
  });
  if (response.error || !response.data?.proposal) throw safeServiceError();
  return response.data.proposal as ProposalDraftViewModel;
}

export async function issueProposal(
  context: OwnedQuizContext,
  selection: RoadmapSelection,
  client?: SupabaseClient,
): Promise<{ proposal: ProposalViewModel; proposalReference: string }> {
  const response = await clientOrDefault(client).functions.invoke("finalize-proposal", {
    body: {
      operation: "issue",
      quizSessionId: requireUuid(context.quizSessionId),
      selection: { tierKey: selection.tierKey, platform: selection.platform },
    },
  });
  if (response.error || !response.data?.proposal) throw safeServiceError();
  return response.data as { proposal: ProposalViewModel; proposalReference: string };
}

export const defaultQuizService: QuizService = {
  createOwnedQuizContext,
  submitLeadContact,
  saveOwnedQuizProgress,
  previewProposal,
  issueProposal,
};
