import { QUIZ_DEFINITIONS } from "./questions";
import { calculateProjectPriceQuote } from "./discounts";
import { defaultRoadmapSelection, resolveRoadmapSelection } from "./roadmap-options";
import type {
  AudienceKey,
  BusinessLocation,
  ClientIdentity,
  CortexResult,
  CustomEmailOtpChallenge,
  LeadContactInput,
  LeadIdentityInput,
  ProposalDraftViewModel,
  ProposalViewModel,
  ProjectPriceQuote,
  QuizAnswers,
  RoadmapSelection,
  SavedQuizAttempt,
  ValidatedDiscountCampaign,
} from "./types";

export type ProposalConfirmationStatus = "editing" | "confirming" | "issued" | "delivery_retry_required";

export type QuizScreen =
  | "audience"
  | "contact"
  | "verify_email"
  | "business_scope"
  | "location"
  | "intro"
  | "question"
  | "calculating"
  | "result"
  | "error";

export interface QuizState {
  screen: QuizScreen;
  audienceKey: AudienceKey | null;
  answers: QuizAnswers;
  currentQuestionIndex: number;
  result: CortexResult | null;
  roadmapSelection: RoadmapSelection | null;
  location: BusinessLocation | null;
  contact: LeadIdentityInput | null;
  otpChallenge: CustomEmailOtpChallenge | null;
  emailVerified: boolean;
  existingBusinessId: string | null;
  existingBusinessName: string | null;
  clientIdentity: ClientIdentity | null;
  proposal: ProposalDraftViewModel | ProposalViewModel | null;
  couponInput: string;
  appliedCampaign: ValidatedDiscountCampaign | null;
  priceQuote: ProjectPriceQuote | null;
  proposalConfirmationStatus: ProposalConfirmationStatus;
  couponMessage: string | null;
  errorMessage: string | null;
  validationMessage: string | null;
  resumeCandidate: SavedQuizAttempt | null;
}

export type QuizAction =
  | { type: "LOAD_RESUME"; attempt: SavedQuizAttempt }
  | { type: "RESUME" }
  | { type: "DISMISS_RESUME" }
  | { type: "START_OVER" }
  | { type: "SELECT_AUDIENCE"; audienceKey: AudienceKey }
  | { type: "OTP_REQUESTED"; contact: LeadIdentityInput; challenge: CustomEmailOtpChallenge }
  | { type: "OTP_VERIFIED"; grantExpiresAt: string }
  | { type: "OTP_RESET" }
  | { type: "CHANGE_EMAIL" }
  | { type: "BUSINESS_SCOPE_REQUIRED"; existingBusinessId: string; existingBusinessName: string; contact: LeadContactInput }
  | { type: "EDIT_BUSINESS" }
  | { type: "CONTACT_ACCEPTED"; contact: LeadContactInput }
  | { type: "SELECT_LOCATION"; location: BusinessLocation }
  | { type: "CONTINUE_INTRO" }
  | { type: "ANSWER_SINGLE"; questionKey: string; optionKey: string }
  | { type: "TOGGLE_MULTIPLE"; questionKey: string; optionKey: string }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "CALCULATION_SUCCESS"; result: CortexResult; proposal: ProposalDraftViewModel }
  | { type: "SET_COUPON_INPUT"; value: string }
  | { type: "COUPON_APPLIED"; proposal: ProposalDraftViewModel }
  | { type: "COUPON_REJECTED"; message: string }
  | { type: "REMOVE_COUPON" }
  | { type: "PROPOSAL_CONFIRMING" }
  | { type: "PROPOSAL_ISSUED"; proposal: ProposalViewModel; location?: BusinessLocation }
  | { type: "PROPOSAL_CONFIRMATION_FAILED"; message: string }
  | { type: "PROPOSAL_DELIVERY_RETRY_REQUIRED"; message: string }
  | { type: "REFRESH_LOCATION_QUOTE"; location: BusinessLocation }
  | { type: "SELECT_ROADMAP"; selection: RoadmapSelection }
  | { type: "CALCULATION_FAILURE"; message: string }
  | { type: "RETRY_CALCULATION" };

export function createInitialQuizState(): QuizState {
  return {
    screen: "audience",
    audienceKey: null,
    answers: {},
    currentQuestionIndex: 0,
    result: null,
    roadmapSelection: null,
    location: null,
    contact: null,
    otpChallenge: null,
    emailVerified: false,
    existingBusinessId: null,
    existingBusinessName: null,
    clientIdentity: null,
    proposal: null,
    couponInput: "",
    appliedCampaign: null,
    priceQuote: null,
    proposalConfirmationStatus: "editing",
    couponMessage: null,
    errorMessage: null,
    validationMessage: null,
    resumeCandidate: null,
  };
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case "LOAD_RESUME":
      return { ...state, resumeCandidate: action.attempt };
    case "DISMISS_RESUME":
      return { ...state, resumeCandidate: null };
    case "RESUME": {
      const attempt = state.resumeCandidate;
      if (!attempt || !attempt.audienceKey) return state;
      return {
        ...state,
        screen: "contact",
        audienceKey: attempt.audienceKey,
        answers: attempt.answers,
        currentQuestionIndex: attempt.currentQuestionIndex,
        result: attempt.result,
        roadmapSelection: attempt.roadmapSelection,
        location: attempt.location,
        contact: null,
        otpChallenge: null,
        emailVerified: false,
        existingBusinessId: null,
        existingBusinessName: null,
        clientIdentity: null,
        proposal: null,
        couponInput: "",
        appliedCampaign: null,
        priceQuote: null,
        proposalConfirmationStatus: "editing",
        couponMessage: null,
        errorMessage: null,
        validationMessage: null,
        resumeCandidate: null,
      };
    }
    case "START_OVER":
      return createInitialQuizState();
    case "SELECT_AUDIENCE":
      return {
        ...createInitialQuizState(),
        screen: "contact",
        audienceKey: action.audienceKey,
      };
    case "OTP_REQUESTED": {
      if (!state.audienceKey || !["contact", "verify_email"].includes(state.screen)) return state;
      const contact = {
        ...action.contact,
        firstName: action.contact.firstName.trim(),
        lastName: action.contact.lastName.trim(),
        businessName: action.contact.businessName.trim(),
        email: action.contact.email.trim().toLowerCase(),
      };
      if (!contact.firstName || !contact.lastName || !contact.businessName || !contact.email) return state;
      if (
        action.challenge.email !== contact.email ||
        !action.challenge.id || !Number.isFinite(Date.parse(action.challenge.expiresAt)) ||
        !Number.isFinite(Date.parse(action.challenge.resendAvailableAt)) ||
        (action.challenge.verified &&
          (!action.challenge.grantExpiresAt || !Number.isFinite(Date.parse(action.challenge.grantExpiresAt))))
      ) return state;
      return {
        ...state,
        screen: "verify_email",
        contact,
        otpChallenge: action.challenge,
        emailVerified: action.challenge.verified,
        existingBusinessId: null,
        existingBusinessName: null,
      };
    }
    case "OTP_VERIFIED":
      if (state.screen !== "verify_email" || !state.contact || !state.otpChallenge) return state;
      if (!Number.isFinite(Date.parse(action.grantExpiresAt))) return state;
      return {
        ...state,
        emailVerified: true,
        otpChallenge: {
          ...state.otpChallenge,
          verified: true,
          grantExpiresAt: action.grantExpiresAt,
        },
      };
    case "OTP_RESET":
    case "CHANGE_EMAIL":
      if (!["verify_email", "business_scope"].includes(state.screen)) return state;
      return {
        ...state,
        screen: "contact",
        contact: null,
        otpChallenge: null,
        emailVerified: false,
        existingBusinessId: null,
        existingBusinessName: null,
      };
    case "BUSINESS_SCOPE_REQUIRED":
      if (!state.emailVerified || !state.contact) return state;
      return {
        ...state,
        screen: "business_scope",
        contact: action.contact,
        existingBusinessId: action.existingBusinessId,
        existingBusinessName: action.existingBusinessName,
      };
    case "EDIT_BUSINESS":
      if (
        !["business_scope", "contact"].includes(state.screen) ||
        !state.emailVerified || !state.contact || !state.existingBusinessId
      ) return state;
      return {
        ...state,
        screen: "contact",
        contact: { ...state.contact, businessName: "" },
      };
    case "CONTACT_ACCEPTED": {
      if (!state.audienceKey || !state.emailVerified || !["verify_email", "business_scope"].includes(state.screen)) return state;
      const firstName = action.contact.firstName.trim();
      const lastName = action.contact.lastName.trim();
      const businessName = action.contact.businessName.trim();
      const email = action.contact.email.trim().toLowerCase();
      if (!firstName || !lastName || !businessName || !email || !action.contact.consent) return state;
      return {
        ...state,
        screen: "location",
        contact: null,
        otpChallenge: null,
        clientIdentity: { firstName, businessName },
        existingBusinessId: null,
        existingBusinessName: null,
      };
    }
    case "SELECT_LOCATION":
      if (state.screen !== "location") return state;
      return { ...state, screen: "intro", location: action.location };
    case "CONTINUE_INTRO":
      if (!state.audienceKey || !state.clientIdentity || !state.location) return state;
      return { ...state, screen: "question" };
    case "ANSWER_SINGLE":
      return {
        ...state,
        answers: { ...state.answers, [action.questionKey]: [action.optionKey] },
        validationMessage: null,
      };
    case "TOGGLE_MULTIPLE": {
      const existing = state.answers[action.questionKey] ?? [];
      const question = state.audienceKey
        ? QUIZ_DEFINITIONS[state.audienceKey].questions.find((item) => item.key === action.questionKey)
        : undefined;
      const adding = !existing.includes(action.optionKey);
      if (adding && question?.maxSelections && existing.length >= question.maxSelections) {
        return { ...state, validationMessage: `Choose up to ${question.maxSelections} options.` };
      }
      const selected = existing.includes(action.optionKey)
        ? existing.filter((key) => key !== action.optionKey)
        : [...existing, action.optionKey];
      return {
        ...state,
        answers: { ...state.answers, [action.questionKey]: selected },
        validationMessage: null,
      };
    }
    case "NEXT": {
      if (!state.audienceKey || state.screen !== "question") return state;
      const questions = QUIZ_DEFINITIONS[state.audienceKey].questions;
      const question = questions[state.currentQuestionIndex];
      if (!question || !(state.answers[question.key]?.length > 0)) {
        return { ...state, validationMessage: "Please choose an answer before continuing." };
      }
      if (state.currentQuestionIndex >= questions.length - 1) {
        return { ...state, screen: "calculating", validationMessage: null };
      }
      return {
        ...state,
        currentQuestionIndex: state.currentQuestionIndex + 1,
        validationMessage: null,
      };
    }
    case "BACK":
      if (state.screen !== "question") return state;
      return state.currentQuestionIndex > 0
        ? { ...state, currentQuestionIndex: state.currentQuestionIndex - 1, validationMessage: null }
        : { ...state, screen: "intro", validationMessage: null };
    case "CALCULATION_SUCCESS":
      return {
        ...state,
        screen: "result",
        result: action.result,
        proposal: action.proposal,
        roadmapSelection: defaultRoadmapSelection(action.result),
        couponInput: action.proposal.investment.campaign?.code ?? "",
        appliedCampaign: action.proposal.investment.campaign,
        priceQuote: action.proposal.investment,
        proposalConfirmationStatus: "editing",
        couponMessage: null,
        errorMessage: null,
      };
    case "SET_COUPON_INPUT":
      if (state.proposalConfirmationStatus !== "editing") return state;
      return { ...state, couponInput: action.value, couponMessage: null };
    case "COUPON_APPLIED":
      if (state.proposalConfirmationStatus !== "editing") return state;
      return {
        ...state,
        proposal: action.proposal,
        roadmapSelection: action.proposal.selection,
        appliedCampaign: action.proposal.investment.campaign,
        priceQuote: action.proposal.investment,
        couponInput: action.proposal.investment.campaign?.code ?? state.couponInput,
        couponMessage: action.proposal.investment.campaign
          ? `${action.proposal.investment.campaign.percentage}% discount applied.`
          : null,
      };
    case "COUPON_REJECTED":
      if (state.proposalConfirmationStatus !== "editing") return state;
      return { ...state, couponMessage: action.message };
    case "REMOVE_COUPON": {
      if (state.proposalConfirmationStatus !== "editing" || !state.result || !state.roadmapSelection) return state;
      const variant = resolveRoadmapSelection(state.result, state.roadmapSelection);
      const location = state.location ?? state.result.location;
      return {
        ...state,
        couponInput: "",
        appliedCampaign: null,
        couponMessage: "Coupon removed.",
        priceQuote: calculateProjectPriceQuote({
          originalTotalUsd: variant.estimatedProjectInvestmentUsd,
          location,
        }),
      };
    }
    case "PROPOSAL_CONFIRMING":
      if (state.proposalConfirmationStatus !== "editing") return state;
      return { ...state, proposalConfirmationStatus: "confirming", couponMessage: null };
    case "PROPOSAL_ISSUED":
      if (state.screen !== "result") return state;
      return {
        ...state,
        proposal: action.proposal,
        location: action.location ?? state.location,
        roadmapSelection: action.proposal.selection,
        appliedCampaign: action.proposal.investment.campaign,
        priceQuote: action.proposal.investment,
        couponInput: action.proposal.investment.campaign?.code ?? "",
        proposalConfirmationStatus: "issued",
        couponMessage: "Proposal confirmed.",
      };
    case "PROPOSAL_CONFIRMATION_FAILED":
      if (state.proposalConfirmationStatus !== "confirming") return state;
      return { ...state, proposalConfirmationStatus: "editing", couponMessage: action.message };
    case "PROPOSAL_DELIVERY_RETRY_REQUIRED":
      if (state.proposalConfirmationStatus !== "confirming") return state;
      return { ...state, proposalConfirmationStatus: "delivery_retry_required", couponMessage: action.message };
    case "REFRESH_LOCATION_QUOTE": {
      if (!state.result || !state.roadmapSelection || state.proposalConfirmationStatus === "issued") return state;
      const variant = resolveRoadmapSelection(state.result, state.roadmapSelection);
      return {
        ...state,
        location: action.location,
        priceQuote: calculateProjectPriceQuote({
          originalTotalUsd: variant.estimatedProjectInvestmentUsd,
          location: action.location,
          campaign: state.appliedCampaign,
        }),
      };
    }
    case "SELECT_ROADMAP":
      if (!state.result || state.proposalConfirmationStatus !== "editing") return state;
      try {
        const variant = resolveRoadmapSelection(state.result, action.selection);
        return {
          ...state,
          roadmapSelection: action.selection,
          priceQuote: calculateProjectPriceQuote({
            originalTotalUsd: variant.estimatedProjectInvestmentUsd,
            location: state.location ?? state.result.location,
            campaign: state.appliedCampaign,
          }),
          couponMessage: null,
        };
      } catch {
        return state;
      }
    case "CALCULATION_FAILURE":
      return {
        ...state,
        screen: "error",
        errorMessage: action.message,
      };
    case "RETRY_CALCULATION":
      return { ...state, screen: "calculating", errorMessage: null };
    default:
      return state;
  }
}
