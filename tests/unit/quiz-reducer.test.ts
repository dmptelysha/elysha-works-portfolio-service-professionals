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
  recommendedSolutionTitle: "Enrollment Funnel",
  recommendedOfferKey: "platform_growth",
  recommendedPlatform: "systeme_io",
  recommendedBuildRoute: "platform",
  technicalConstraintSignals: [],
  selectedSupportOptionKeys: [],
} as unknown as CortexResult;
const proposal = { expiresAt: null } as unknown as ProposalDraftViewModel;
const saved = {
  storageVersion: 3,
  cortexVersion: CORTEX_VERSION,
  questionSetVersion: QUESTION_SET_VERSION,
  catalogVersion: CATALOG_VERSION,
  status: "in_progress",
  audienceKey: "coaches_educators",
  answers: { q1_goal: ["coach_goal_enroll_students"] },
  currentQuestionIndex: 1,
  result: null,
  roadmapSelection: null,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
  expiresAt: "2026-10-22T00:00:00.000Z",
} satisfies SavedQuizAttempt;

const verifiedContact = { firstName: "Mara", lastName: "Santos", businessName: "Mara Consulting", email: "mara@example.com", consent: true as const };

function acceptVerifiedContact(state: QuizState, contact = verifiedContact) {
  state = quizReducer(state, {
    type: "OTP_REQUESTED",
    contact,
    challenge: { email: contact.email, requestedAt: "2026-09-23T00:00:00.000Z", resendAvailableAt: "2026-09-23T00:01:00.000Z" },
  });
  state = quizReducer(state, { type: "OTP_VERIFIED" });
  return quizReducer(state, { type: "CONTACT_ACCEPTED", contact });
}

describe("quiz reducer", () => {
  it("requires accepted contact details between audience and intro", () => {
    let state = createInitialQuizState();
    state = quizReducer(state, { type: "SELECT_AUDIENCE", audienceKey: "coaches_educators" });
    expect(state.screen).toBe("contact");
    const contact = { firstName: "Mara", lastName: "Santos", businessName: "Mara Consulting", email: "mara@example.com", consent: true as const };
    state = quizReducer(state, {
      type: "OTP_REQUESTED",
      contact,
      challenge: {
        email: "mara@example.com",
        requestedAt: "2026-09-23T00:00:00.000Z",
        resendAvailableAt: "2026-09-23T00:01:00.000Z",
      },
    });
    expect(state.screen).toBe("verify_email");
    expect(state.clientIdentity).toBeNull();
    state = quizReducer(state, { type: "OTP_VERIFIED" });
    expect(state.screen).toBe("verify_email");
    expect(state.emailVerified).toBe(true);
    state = quizReducer(state, { type: "CONTACT_ACCEPTED", contact });
    expect(state.screen).toBe("intro");
    expect(state.clientIdentity).toEqual({ firstName: "Mara", businessName: "Mara Consulting" });
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
      challenge: { email: contact.email, requestedAt: "2026-09-23T00:00:00.000Z", resendAvailableAt: "2026-09-23T00:01:00.000Z" },
    });
    state = quizReducer(state, { type: "CHANGE_EMAIL" });
    expect(state.screen).toBe("contact");
    expect(state.otpChallenge).toBeNull();
    expect(state.emailVerified).toBe(false);
  });

  it("supports single and multi-select answers, Next, Back, and editing", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "coaches_educators" });
    state = acceptVerifiedContact(state, { firstName: "Ely", lastName: "Santos", businessName: "Ely Works", email: "ely@example.com", consent: true });
    state = quizReducer(state, { type: "CONTINUE_INTRO" });
    state = quizReducer(state, { type: "ANSWER_SINGLE", questionKey: "q1_goal", optionKey: "coach_goal_book_calls" });
    state = quizReducer(state, { type: "NEXT" });
    expect(state.currentQuestionIndex).toBe(1);
    state = { ...state, currentQuestionIndex: 3 };
    state = quizReducer(state, { type: "TOGGLE_MULTIPLE", questionKey: "q4_capabilities", optionKey: "coach_capability_booking" });
    state = quizReducer(state, { type: "TOGGLE_MULTIPLE", questionKey: "q4_capabilities", optionKey: "coach_capability_email_follow_up" });
    expect(state.answers.q4_capabilities).toEqual(["coach_capability_booking", "coach_capability_email_follow_up"]);
    state = quizReducer(state, { type: "BACK" });
    expect(state.currentQuestionIndex).toBe(2);
    state = quizReducer(state, { type: "ANSWER_SINGLE", questionKey: "q3_blocker", optionKey: "coach_blocker_manual_follow_up" });
    expect(state.answers.q3_blocker).toEqual(["coach_blocker_manual_follow_up"]);
  });

  it("does not advance without a valid current answer", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "service_businesses" });
    state = acceptVerifiedContact(state);
    state = quizReducer(state, { type: "CONTINUE_INTRO" });
    state = quizReducer(state, { type: "NEXT" });
    expect(state.currentQuestionIndex).toBe(0);
    expect(state.validationMessage).toMatch(/choose an answer/i);
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
    expect(state.answers.q1_goal).toEqual(["coach_goal_enroll_students"]);
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
      answers: { q1_goal: ["coach_goal_book_calls"] },
    };
    state = quizReducer(state, { type: "CALCULATION_FAILURE", message: "Try again" });
    expect(state.screen).toBe("error");
    expect(state.answers.q1_goal).toEqual(["coach_goal_book_calls"]);
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
});
