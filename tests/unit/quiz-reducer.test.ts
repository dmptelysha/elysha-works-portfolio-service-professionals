import { describe, expect, it } from "vitest";

import { createInitialQuizState, quizReducer, type QuizState } from "@/features/quiz/reducer";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type CortexResult,
  type ProposalDraftViewModel,
  type SavedQuizAttempt,
} from "@/features/quiz/types";

const result = {
  audienceKey: "coaches_educators",
  recommendedSolutionTitle: "Enrollment Funnel",
  recommendedOfferKey: "platform_growth",
  recommendedPlatform: "systeme_io",
  recommendedBuildRoute: "platform",
  technicalConstraintSignals: [],
  selectedSupportOptionKeys: [],
  location: {
    businessCountry: "Philippines", countryCode: "PH", displayCurrency: "PHP", currencySymbol: "₱",
    fxRate: 58, fxRateTimestamp: "2026-09-23T00:00:00.000Z",
  },
} as unknown as CortexResult;
const proposal = {
  expiresAt: null,
  selection: { tierKey: "advanced", platform: "systeme_io", offerKey: "platform_growth" },
  investment: {
    basePriceUsd: 2500, originalTotalUsd: 2500, discountAmountUsd: 0, finalTotalUsd: 2500,
    localCurrency: "PHP", localSymbol: "₱", finalTotalLocal: 145000, fxRate: 58,
    fxRateTimestamp: "2026-09-23T00:00:00.000Z", campaign: null,
  },
} as unknown as ProposalDraftViewModel;
const saved = {
  storageVersion: 4,
  cortexVersion: CORTEX_VERSION,
  questionSetVersion: QUESTION_SET_VERSION,
  catalogVersion: CATALOG_VERSION,
  status: "in_progress",
  audienceKey: "coaches_educators",
  answers: { q1_business_model: ["coach_model_course"] },
  currentQuestionIndex: 1,
  result: null,
  roadmapSelection: null,
  location: null,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
  expiresAt: "2026-10-22T00:00:00.000Z",
} satisfies SavedQuizAttempt;

const verifiedContact = { firstName: "Mara", lastName: "Santos", businessName: "Mara Consulting", email: "mara@example.com", consent: true as const };
const challenge = {
  id: "70000000-0000-4000-8000-000000000001",
  email: "mara@example.com",
  expiresAt: "2026-09-23T00:10:00.000Z",
  resendAvailableAt: "2026-09-23T00:01:00.000Z",
  verified: false,
  grantExpiresAt: null,
};
const location = {
  businessCountry: "Philippines",
  countryCode: "PH",
  displayCurrency: "PHP",
  currencySymbol: "₱",
  fxRate: 58,
  fxRateTimestamp: "2026-09-23T00:00:00.000Z",
} as const;

function acceptVerifiedContact(state: QuizState, contact = verifiedContact) {
  state = quizReducer(state, {
    type: "OTP_REQUESTED",
    contact,
    challenge: { ...challenge, email: contact.email },
  });
  state = quizReducer(state, { type: "OTP_VERIFIED", grantExpiresAt: "2026-09-23T00:20:00.000Z" });
  state = quizReducer(state, { type: "CONTACT_ACCEPTED", contact });
  return quizReducer(state, { type: "SELECT_LOCATION", location });
}

describe("quiz reducer", () => {
  it("stores an OTP identity before proposal consent is granted", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "service_businesses" });
    state = quizReducer(state, {
      type: "OTP_REQUESTED",
      contact: { ...verifiedContact, consent: false },
      challenge,
    });
    expect(state.screen).toBe("verify_email");
    expect(state.contact?.consent).toBe(false);
  });

  it("requires accepted contact details between audience and intro", () => {
    let state = createInitialQuizState();
    state = quizReducer(state, { type: "SELECT_AUDIENCE", audienceKey: "coaches_educators" });
    expect(state.screen).toBe("contact");
    const contact = { firstName: "Mara", lastName: "Santos", businessName: "Mara Consulting", email: "mara@example.com", consent: true as const };
    state = quizReducer(state, {
      type: "OTP_REQUESTED",
      contact,
      challenge,
    });
    expect(state.screen).toBe("verify_email");
    expect(state.clientIdentity).toBeNull();
    state = quizReducer(state, { type: "OTP_VERIFIED", grantExpiresAt: "2026-09-23T00:20:00.000Z" });
    expect(state.screen).toBe("verify_email");
    expect(state.emailVerified).toBe(true);
    state = quizReducer(state, { type: "CONTACT_ACCEPTED", contact });
    expect(state.screen).toBe("location");
    expect(state.clientIdentity).toEqual({ firstName: "Mara", businessName: "Mara Consulting" });
    state = quizReducer(state, { type: "SELECT_LOCATION", location });
    expect(state.screen).toBe("intro");
    state = quizReducer(state, { type: "CONTINUE_INTRO" });
    expect(state.screen).toBe("question");
    expect(state.currentQuestionIndex).toBe(0);
  });

  it("returns to editable contact without keeping a verification challenge", () => {
    const contact = { firstName: "Mara", lastName: "Santos", businessName: "Mara Consulting", email: "mara@example.com", consent: true as const };
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "service_businesses" });
    state = quizReducer(state, {
      type: "OTP_REQUESTED",
      contact,
      challenge: { ...challenge, email: contact.email },
    });
    state = quizReducer(state, { type: "OTP_RESET" });
    expect(state.screen).toBe("contact");
    expect(state.otpChallenge).toBeNull();
    expect(state.emailVerified).toBe(false);
  });

  it("replaces a pending challenge on resend and clears all OTP state on start over", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "service_businesses" });
    state = quizReducer(state, { type: "OTP_REQUESTED", contact: verifiedContact, challenge });
    const replacement = {
      ...challenge,
      id: "70000000-0000-4000-8000-000000000002",
      expiresAt: "2026-09-23T00:12:00.000Z",
    };
    state = quizReducer(state, { type: "OTP_REQUESTED", contact: verifiedContact, challenge: replacement });
    expect(state.otpChallenge).toEqual(replacement);
    state = quizReducer(state, { type: "START_OVER" });
    expect(state.otpChallenge).toBeNull();
    expect(state.contact).toBeNull();
  });

  it("supports single and multi-select answers, Next, Back, and editing", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "coaches_educators" });
    state = acceptVerifiedContact(state, { firstName: "Ely", lastName: "Santos", businessName: "Ely Works", email: "ely@example.com", consent: true });
    state = quizReducer(state, { type: "CONTINUE_INTRO" });
    state = quizReducer(state, { type: "ANSWER_SINGLE", questionKey: "q1_business_model", optionKey: "coach_model_course" });
    state = quizReducer(state, { type: "NEXT" });
    expect(state.currentQuestionIndex).toBe(1);
    state = { ...state, currentQuestionIndex: 3 };
    state = quizReducer(state, { type: "TOGGLE_MULTIPLE", questionKey: "q4_bottlenecks", optionKey: "coach_blocker_conversion" });
    state = quizReducer(state, { type: "TOGGLE_MULTIPLE", questionKey: "q4_bottlenecks", optionKey: "coach_blocker_follow_up" });
    expect(state.answers.q4_bottlenecks).toEqual(["coach_blocker_conversion", "coach_blocker_follow_up"]);
    state = quizReducer(state, { type: "BACK" });
    expect(state.currentQuestionIndex).toBe(2);
    state = quizReducer(state, { type: "ANSWER_SINGLE", questionKey: "q3_current_journey", optionKey: "coach_journey_social_dm" });
    expect(state.answers.q3_current_journey).toEqual(["coach_journey_social_dm"]);
  });

  it("does not advance without a valid current answer", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "service_businesses" });
    state = acceptVerifiedContact(state);
    state = quizReducer(state, { type: "CONTINUE_INTRO" });
    state = quizReducer(state, { type: "NEXT" });
    expect(state.currentQuestionIndex).toBe(0);
    expect(state.validationMessage).toMatch(/choose an answer/i);
  });

  it("enforces the approved maximum on multi-select questions", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "coaches_educators" });
    state = acceptVerifiedContact(state);
    state = quizReducer(state, { type: "CONTINUE_INTRO" });
    state = { ...state, currentQuestionIndex: 3 };
    state = quizReducer(state, { type: "TOGGLE_MULTIPLE", questionKey: "q4_bottlenecks", optionKey: "coach_blocker_conversion" });
    state = quizReducer(state, { type: "TOGGLE_MULTIPLE", questionKey: "q4_bottlenecks", optionKey: "coach_blocker_follow_up" });
    state = quizReducer(state, { type: "TOGGLE_MULTIPLE", questionKey: "q4_bottlenecks", optionKey: "coach_blocker_payment" });

    expect(state.answers.q4_bottlenecks).toEqual(["coach_blocker_conversion", "coach_blocker_follow_up"]);
    expect(state.validationMessage).toMatch(/up to 2/i);
  });

  it("loads, resumes, dismisses, and restarts a saved attempt", () => {
    let state = quizReducer(createInitialQuizState(), { type: "LOAD_RESUME", attempt: saved });
    expect(state.resumeCandidate).toBe(saved);
    state = quizReducer(state, { type: "DISMISS_RESUME" });
    expect(state.resumeCandidate).toBeNull();
    state = quizReducer(state, { type: "LOAD_RESUME", attempt: saved });
    state = quizReducer(state, { type: "RESUME" });
    expect(state.screen).toBe("contact");
    expect(state.currentQuestionIndex).toBe(1);
    expect(state.answers.q1_business_model).toEqual(["coach_model_course"]);
    state = quizReducer(state, { type: "START_OVER" });
    expect(state).toEqual(createInitialQuizState());
  });

  it("requires contact re-entry when restoring a completed local snapshot", () => {
    const completed = { ...saved, status: "completed", result } as SavedQuizAttempt;
    let state = quizReducer(createInitialQuizState(), { type: "LOAD_RESUME", attempt: completed });
    state = quizReducer(state, { type: "RESUME" });
    expect(state.screen).toBe("contact");
    expect(state.result).toBe(result);
  });

  it("preserves answers through calculation failure and retry", () => {
    let state: QuizState = {
      ...createInitialQuizState(),
      screen: "calculating" as const,
      audienceKey: "coaches_educators" as const,
      answers: { q1_business_model: ["coach_model_one_to_one"] },
    };
    state = quizReducer(state, { type: "CALCULATION_FAILURE", message: "Try again" });
    expect(state.screen).toBe("error");
    expect(state.answers.q1_business_model).toEqual(["coach_model_one_to_one"]);
    state = quizReducer(state, { type: "RETRY_CALCULATION" });
    expect(state.screen).toBe("calculating");
    state = quizReducer(state, { type: "CALCULATION_SUCCESS", result, proposal });
    expect(state.screen).toBe("result");
    expect(state.result).toBe(result);
    expect(state.roadmapSelection).toEqual({ tierKey: "advanced", platform: "systeme_io", offerKey: "platform_growth" });
    state = quizReducer(state, {
      type: "SELECT_ROADMAP",
      selection: { tierKey: "basic", platform: "custom_app", offerKey: "custom_starter" },
    });
    expect(state.roadmapSelection).toEqual({ tierKey: "basic", platform: "custom_app", offerKey: "custom_starter" });
    state = quizReducer(state, { type: "START_OVER" });
    expect(state.roadmapSelection).toBeNull();
  });

  it("recalculates a validated discount when the roadmap changes and locks after confirmation", () => {
    const discounted = {
      ...proposal,
      investment: {
        ...proposal.investment,
        discountAmountUsd: 1250,
        finalTotalUsd: 1250,
        finalTotalLocal: 72500,
        campaign: { campaignKey: "pinoyako", code: "PINOYAKO", percentage: 50 } as const,
      },
    } as ProposalDraftViewModel;
    let state = quizReducer({ ...createInitialQuizState(), screen: "calculating" }, {
      type: "CALCULATION_SUCCESS", result, proposal,
    });
    state = quizReducer(state, { type: "SET_COUPON_INPUT", value: " pinoyako " });
    expect(state.couponInput).toBe(" pinoyako ");
    state = quizReducer(state, { type: "COUPON_APPLIED", proposal: discounted });
    expect(state.appliedCampaign?.code).toBe("PINOYAKO");
    state = quizReducer(state, {
      type: "SELECT_ROADMAP",
      selection: { tierKey: "basic", platform: "systeme_io", offerKey: "platform_launch" },
    });
    expect(state.priceQuote).toMatchObject({ originalTotalUsd: 1500, finalTotalUsd: 750, finalTotalLocal: 43500 });
    state = quizReducer(state, { type: "PROPOSAL_CONFIRMING" });
    expect(state.proposalConfirmationStatus).toBe("confirming");
    const duplicate = quizReducer(state, { type: "PROPOSAL_CONFIRMING" });
    expect(duplicate).toBe(state);
    state = quizReducer(state, { type: "PROPOSAL_CONFIRMATION_FAILED", message: "Try again" });
    expect(state.proposalConfirmationStatus).toBe("editing");
  });

  it("locks a delivery retry and clears all coupon state on reset", () => {
    let state = quizReducer({ ...createInitialQuizState(), screen: "calculating" }, {
      type: "CALCULATION_SUCCESS", result, proposal,
    });
    state = quizReducer(state, { type: "PROPOSAL_CONFIRMING" });
    state = quizReducer(state, { type: "PROPOSAL_DELIVERY_RETRY_REQUIRED", message: "Retry delivery" });
    const locked = quizReducer(state, {
      type: "SELECT_ROADMAP",
      selection: { tierKey: "basic", platform: "custom_app", offerKey: "custom_starter" },
    });
    expect(locked).toBe(state);
    expect(quizReducer(state, { type: "START_OVER" })).toEqual(createInitialQuizState());
  });
});
