import { QUIZ_DEFINITIONS } from "./questions";
import type {
  AudienceKey,
  CortexResult,
  QuizAnswers,
  SavedQuizAttempt,
} from "./types";

export type QuizScreen =
  | "audience"
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
  | { type: "CONTINUE_INTRO" }
  | { type: "ANSWER_SINGLE"; questionKey: string; optionKey: string }
  | { type: "TOGGLE_MULTIPLE"; questionKey: string; optionKey: string }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "CALCULATION_SUCCESS"; result: CortexResult }
  | { type: "CALCULATION_FAILURE"; message: string }
  | { type: "RETRY_CALCULATION" };

export function createInitialQuizState(): QuizState {
  return {
    screen: "audience",
    audienceKey: null,
    answers: {},
    currentQuestionIndex: 0,
    result: null,
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
        screen: attempt.status === "completed" && attempt.result ? "result" : "question",
        audienceKey: attempt.audienceKey,
        answers: attempt.answers,
        currentQuestionIndex: attempt.currentQuestionIndex,
        result: attempt.result,
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
        screen: "intro",
        audienceKey: action.audienceKey,
      };
    case "CONTINUE_INTRO":
      if (!state.audienceKey) return state;
      return { ...state, screen: "question", currentQuestionIndex: 0 };
    case "ANSWER_SINGLE":
      return {
        ...state,
        answers: { ...state.answers, [action.questionKey]: [action.optionKey] },
        validationMessage: null,
      };
    case "TOGGLE_MULTIPLE": {
      const existing = state.answers[action.questionKey] ?? [];
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
        errorMessage: null,
      };
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
