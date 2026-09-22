import { describe, expect, it } from "vitest";

import { createInitialQuizState, quizReducer, type QuizState } from "@/features/quiz/reducer";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type CortexResult,
  type SavedQuizAttempt,
} from "@/features/quiz/types";

const result = { recommendedSolutionTitle: "Enrollment Funnel" } as CortexResult;
const saved = {
  storageVersion: 1,
  cortexVersion: CORTEX_VERSION,
  questionSetVersion: QUESTION_SET_VERSION,
  catalogVersion: CATALOG_VERSION,
  status: "in_progress",
  audienceKey: "coaches_educators",
  answers: { q1_goal: ["coach_goal_enroll_students"] },
  currentQuestionIndex: 1,
  result: null,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
  expiresAt: "2026-10-22T00:00:00.000Z",
} satisfies SavedQuizAttempt;

describe("quiz reducer", () => {
  it("selects an audience and enters the first question from the intro", () => {
    let state = createInitialQuizState();
    state = quizReducer(state, { type: "SELECT_AUDIENCE", audienceKey: "coaches_educators" });
    expect(state.screen).toBe("intro");
    state = quizReducer(state, { type: "CONTINUE_INTRO" });
    expect(state.screen).toBe("question");
    expect(state.currentQuestionIndex).toBe(0);
  });

  it("supports single and multi-select answers, Next, Back, and editing", () => {
    let state = quizReducer(createInitialQuizState(), { type: "SELECT_AUDIENCE", audienceKey: "coaches_educators" });
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
    expect(state.screen).toBe("question");
    expect(state.currentQuestionIndex).toBe(1);
    expect(state.answers.q1_goal).toEqual(["coach_goal_enroll_students"]);
    state = quizReducer(state, { type: "START_OVER" });
    expect(state).toEqual(createInitialQuizState());
  });

  it("restores a completed snapshot directly to the result", () => {
    const completed = { ...saved, status: "completed", result } as SavedQuizAttempt;
    let state = quizReducer(createInitialQuizState(), { type: "LOAD_RESUME", attempt: completed });
    state = quizReducer(state, { type: "RESUME" });
    expect(state.screen).toBe("result");
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
    state = quizReducer(state, { type: "CALCULATION_SUCCESS", result });
    expect(state.screen).toBe("result");
    expect(state.result).toBe(result);
  });
});
