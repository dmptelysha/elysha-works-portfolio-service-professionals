"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";

import { AudienceSelector } from "./AudienceSelector";
import { calculateRecommendation } from "./cortex";
import {
  QUIZ_STORAGE_VERSION,
  QUIZ_TTL_MS,
  clearQuizAttempt,
  loadQuizAttempt,
  saveQuizAttempt,
} from "./persistence";
import { QUIZ_DEFINITIONS } from "./questions";
import { createInitialQuizState, quizReducer } from "./reducer";
import { QuizQuestion } from "./QuizQuestion";
import { QuizResult } from "./QuizResult";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type AudienceKey,
  type SavedQuizAttempt,
} from "./types";

export function QuizExperience() {
  const [state, dispatch] = useReducer(quizReducer, undefined, createInitialQuizState);
  const [hydrated, setHydrated] = useState(false);
  const createdAtRef = useRef(new Date().toISOString());

  useEffect(() => {
    const loaded = loadQuizAttempt(window.localStorage);
    if (loaded.status === "valid") {
      createdAtRef.current = loaded.attempt.createdAt;
      dispatch({ type: "LOAD_RESUME", attempt: loaded.attempt });
      if (loaded.attempt.status === "completed") dispatch({ type: "RESUME" });
    }
    const hydrationTimer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated || !state.audienceKey || state.resumeCandidate) return;
    const now = new Date();
    const attempt: SavedQuizAttempt = {
      storageVersion: QUIZ_STORAGE_VERSION,
      cortexVersion: CORTEX_VERSION,
      questionSetVersion: QUESTION_SET_VERSION,
      catalogVersion: CATALOG_VERSION,
      status: state.screen === "result" && state.result ? "completed" : "in_progress",
      audienceKey: state.audienceKey,
      answers: state.answers,
      currentQuestionIndex: state.currentQuestionIndex,
      result: state.result,
      createdAt: createdAtRef.current,
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + QUIZ_TTL_MS).toISOString(),
    };
    saveQuizAttempt(window.localStorage, attempt);
  }, [hydrated, state]);

  useEffect(() => {
    if (state.screen !== "calculating" || !state.audienceKey) return;
    try {
      const result = calculateRecommendation({ audienceKey: state.audienceKey, answers: state.answers });
      dispatch({ type: "CALCULATION_SUCCESS", result });
    } catch {
      dispatch({
        type: "CALCULATION_FAILURE",
        message: "We could not calculate your roadmap. Your answers are still saved on this device.",
      });
    }
  }, [state.answers, state.audienceKey, state.screen]);

  const startOver = () => {
    clearQuizAttempt(window.localStorage);
    createdAtRef.current = new Date().toISOString();
    dispatch({ type: "START_OVER" });
  };

  const chooseAudience = (audienceKey: AudienceKey) => {
    createdAtRef.current = new Date().toISOString();
    dispatch({ type: "SELECT_AUDIENCE", audienceKey });
  };

  const definition = state.audienceKey ? QUIZ_DEFINITIONS[state.audienceKey] : null;
  const question = definition?.questions[state.currentQuestionIndex];

  return (
    <div className="quiz-page-shell">
      <header className="quiz-header">
        <Link className="quiz-brand" href="/" aria-label="Elysha Works home" prefetch={false}>
          <span aria-hidden="true">&lt;</span><b>Elysha Works</b><span aria-hidden="true">/&gt;</span>
        </Link>
        <Link className="quiz-exit" href="/" prefetch={false}>Exit assessment</Link>
      </header>

      <main className="quiz-main">
        {!hydrated ? <div className="quiz-loading" aria-live="polite">Preparing your roadmap…</div> : null}

        {hydrated && state.screen === "audience" ? <AudienceSelector onSelect={chooseAudience} /> : null}

        {hydrated && state.screen === "intro" && definition ? (
          <section className="quiz-stage quiz-intro" aria-labelledby="quiz-intro-title">
            <p className="quiz-kicker">{definition.label}</p>
            <h1 id="quiz-intro-title">Your roadmap starts with context.</h1>
            <p className="quiz-lede">
              Eight focused questions will help identify the clearest system, platform route, and planning investment for your business.
            </p>
            <div className="quiz-intro-notes">
              <span>About 2 minutes</span>
              <span>No contact details required</span>
              <span>Saved on this device for 30 days</span>
            </div>
            <button className="quiz-primary" onClick={() => dispatch({ type: "CONTINUE_INTRO" })} type="button">
              Start My Assessment <span aria-hidden="true">→</span>
            </button>
          </section>
        ) : null}

        {hydrated && state.screen === "question" && definition && question ? (
          <QuizQuestion
            question={question}
            questionIndex={state.currentQuestionIndex}
            questionCount={definition.questions.length}
            selected={state.answers[question.key] ?? []}
            validationMessage={state.validationMessage}
            onSelect={(optionKey) => dispatch({
              type: question.selection === "single" ? "ANSWER_SINGLE" : "TOGGLE_MULTIPLE",
              questionKey: question.key,
              optionKey,
            })}
            onBack={() => dispatch({ type: "BACK" })}
            onContinue={() => dispatch({ type: "NEXT" })}
          />
        ) : null}

        {hydrated && state.screen === "calculating" ? (
          <section className="quiz-stage quiz-calculating" aria-live="polite">
            <span className="calculation-orbit" aria-hidden="true" />
            <p className="quiz-kicker">Cortex local analysis</p>
            <h1>Building your roadmap…</h1>
            <p>Your answers are being compared with the approved routes, packages, and scope rules.</p>
          </section>
        ) : null}

        {hydrated && state.screen === "error" ? (
          <section className="quiz-stage quiz-error" role="alert">
            <p className="quiz-kicker">Your answers are safe</p>
            <h1>Let’s try that calculation again.</h1>
            <p>{state.errorMessage}</p>
            <button className="quiz-primary" onClick={() => dispatch({ type: "RETRY_CALCULATION" })} type="button">Retry calculation</button>
          </section>
        ) : null}

        {hydrated && state.screen === "result" && state.result ? (
          <QuizResult result={state.result} onStartOver={startOver} />
        ) : null}
      </main>

      {state.resumeCandidate ? (
        <div className="resume-backdrop">
          <section className="resume-dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title">
            <p className="quiz-kicker">Saved on this device</p>
            <h2 id="resume-title">Continue your roadmap?</h2>
            <p>We found an unfinished assessment from the last 30 days.</p>
            <div className="resume-actions">
              <button className="quiz-primary" onClick={() => dispatch({ type: "RESUME" })} type="button">Resume</button>
              <button className="quiz-secondary" onClick={startOver} type="button">Start over</button>
              <button className="quiz-back" onClick={() => dispatch({ type: "DISMISS_RESUME" })} type="button">Not now</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
