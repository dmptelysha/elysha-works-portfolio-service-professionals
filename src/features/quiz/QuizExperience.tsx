"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";

import { SITE_CONTENT } from "@/data/site-content";

import { AudienceSelector } from "./AudienceSelector";
import { calculateRecommendation } from "./cortex";
import { LeadContactStep } from "./LeadContactStep";
import {
  QUIZ_STORAGE_VERSION,
  QUIZ_TTL_MS,
  clearQuizAttempt,
  loadQuizAttempt,
  saveQuizAttempt,
} from "./persistence";
import { QUIZ_DEFINITIONS } from "./questions";
import { buildProposalDraft } from "./proposal-view";
import { createInitialQuizState, quizReducer } from "./reducer";
import { QuizQuestion } from "./QuizQuestion";
import { QuizResult } from "./QuizResult";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type AudienceKey,
  type LeadContactInput,
  type SavedQuizAttempt,
} from "./types";

function getBrowserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface QuizExperienceProps {
  onSubmitContact?: (contact: LeadContactInput) => Promise<void>;
}

const acceptContactLocally = async () => {};

export function QuizExperience({ onSubmitContact = acceptContactLocally }: QuizExperienceProps = {}) {
  const [state, dispatch] = useReducer(quizReducer, undefined, createInitialQuizState);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const createdAtRef = useRef(new Date().toISOString());
  const resumeDialogRef = useRef<HTMLElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const resumeReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const storage = getBrowserStorage();
    const loaded = storage ? loadQuizAttempt(storage) : { status: "unavailable" as const };
    if (loaded.status === "valid") {
      createdAtRef.current = loaded.attempt.createdAt;
      dispatch({ type: "LOAD_RESUME", attempt: loaded.attempt });
      if (loaded.attempt.status === "completed") dispatch({ type: "RESUME" });
    }
    const hydrationTimer = window.setTimeout(() => {
      if (loaded.status === "unavailable") setPersistenceAvailable(false);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!state.resumeCandidate) return;
    resumeReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resumeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "DISMISS_RESUME" });
        return;
      }
      if (event.key !== "Tab" || !resumeDialogRef.current) return;
      const focusable = [...resumeDialogRef.current.querySelectorAll<HTMLElement>("button, a[href]")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      resumeReturnFocusRef.current?.focus();
    };
  }, [state.resumeCandidate]);

  useEffect(() => {
    if (!hydrated || !state.audienceKey || !state.clientIdentity || state.resumeCandidate) return;
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
      roadmapSelection: state.roadmapSelection,
      createdAt: createdAtRef.current,
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + QUIZ_TTL_MS).toISOString(),
    };
    const storage = getBrowserStorage();
    if (!storage || !saveQuizAttempt(storage, attempt)) {
      const failureTimer = window.setTimeout(() => setPersistenceAvailable(false), 0);
      return () => window.clearTimeout(failureTimer);
    }
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
    const storage = getBrowserStorage();
    if (!storage || !clearQuizAttempt(storage)) setPersistenceAvailable(false);
    createdAtRef.current = new Date().toISOString();
    dispatch({ type: "START_OVER" });
  };

  const chooseAudience = (audienceKey: AudienceKey) => {
    createdAtRef.current = new Date().toISOString();
    dispatch({ type: "SELECT_AUDIENCE", audienceKey });
  };

  const definition = state.audienceKey ? QUIZ_DEFINITIONS[state.audienceKey] : null;
  const question = definition?.questions[state.currentQuestionIndex];
  const proposal = state.result && state.roadmapSelection && state.clientIdentity
    ? buildProposalDraft(state.clientIdentity, state.answers, state.result, state.roadmapSelection)
    : undefined;

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

        {hydrated && state.screen === "contact" ? (
          <LeadContactStep onSubmit={async (contact) => {
            await onSubmitContact(contact);
            dispatch({ type: "CONTACT_ACCEPTED", contact });
          }} />
        ) : null}

        {hydrated && state.screen === "intro" && definition ? (
          <section className="quiz-stage quiz-intro" aria-labelledby="quiz-intro-title">
            <p className="quiz-kicker">{definition.label}</p>
            <h1 id="quiz-intro-title">Your roadmap starts with context.</h1>
            <p className="quiz-lede">
              Eight focused questions will help identify the clearest system, platform route, and planning investment for your business.
            </p>
            <div className="quiz-intro-notes">
              <span>About 2 minutes</span>
              <span>Personalized to your business</span>
              <span>{persistenceAvailable ? "Saved on this device for 3 days" : "Recovery is unavailable in this browser"}</span>
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
            <div className="quiz-error-actions">
              <button className="quiz-primary" onClick={() => dispatch({ type: "RETRY_CALCULATION" })} type="button">Retry calculation</button>
              <button className="quiz-secondary" onClick={startOver} type="button">Start over</button>
            </div>
          </section>
        ) : null}

        {hydrated && state.screen === "result" && state.result ? (
          <QuizResult
            result={state.result}
            proposal={proposal}
            selection={state.roadmapSelection!}
            onSelect={(selection) => dispatch({ type: "SELECT_ROADMAP", selection })}
            onStartOver={startOver}
            persistenceAvailable={persistenceAvailable}
          />
        ) : null}
      </main>

      {hydrated && !persistenceAvailable ? (
        <p className="quiz-storage-notice" role="status">
          Device recovery is unavailable. Keep this page open until you finish or save the result another way.
        </p>
      ) : null}

      <footer className="quiz-footer">
        <Link href="/" prefetch={false}>Back to portfolio</Link>
        <span>Contact-qualified assessment · 3-day recovery</span>
        <nav aria-label="Quiz footer">
          {SITE_CONTENT.footer.legal.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
        </nav>
      </footer>

      {state.resumeCandidate ? (
        <div className="resume-backdrop">
          <section ref={resumeDialogRef} className="resume-dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title">
            <p className="quiz-kicker">Saved on this device</p>
            <h2 id="resume-title">Continue your roadmap?</h2>
            <p>We found an unfinished assessment from the last 3 days.</p>
            <div className="resume-actions">
              <button ref={resumeButtonRef} className="quiz-primary" onClick={() => dispatch({ type: "RESUME" })} type="button">Resume</button>
              <button className="quiz-secondary" onClick={startOver} type="button">Start over</button>
              <button className="quiz-back" onClick={() => dispatch({ type: "DISMISS_RESUME" })} type="button">Not now</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
