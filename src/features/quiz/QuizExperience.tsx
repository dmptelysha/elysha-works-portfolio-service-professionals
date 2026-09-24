"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Turnstile } from "@marsidev/react-turnstile";

import { SITE_CONTENT } from "@/data/site-content";

import { AudienceSelector } from "./AudienceSelector";
import { BusinessLocationStep } from "./BusinessLocationStep";
import { calculateRecommendation } from "./cortex";
import { isCurrencyQuoteFresh } from "./discounts";
import { fallbackLocation, type CountryOption } from "./countries";
import { LeadContactStep } from "./LeadContactStep";
import {
  QUIZ_STORAGE_VERSION,
  QUIZ_TTL_MS,
  clearQuizAttempt,
  loadQuizAttempt,
  saveQuizAttempt,
} from "./persistence";
import { QUIZ_DEFINITIONS } from "./questions";
import {
  defaultQuizService,
  isProposalServiceError,
  type OwnedQuizContext,
  type QuizService,
} from "./quiz-service";
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

function maskDeliveryEmail(email: string | null) {
  if (!email) return "the verified email you provided";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "the verified email you provided";
  return `${local.slice(0, 1).toLowerCase()}***@${domain.toLowerCase()}`;
}

interface QuizExperienceProps {
  service?: QuizService;
  now?: () => Date;
}

export function QuizExperience({ service = defaultQuizService, now = () => new Date() }: QuizExperienceProps = {}) {
  const [state, dispatch] = useReducer(quizReducer, undefined, createInitialQuizState);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [proposalDialog, setProposalDialog] = useState<"sending" | "success" | "error" | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [securityAction, setSecurityAction] = useState<
    "anonymous_quiz_start" | "email_otp_request"
  >("anonymous_quiz_start");
  const [contextReady, setContextReady] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const createdAtRef = useRef(new Date().toISOString());
  const ownedContextRef = useRef<OwnedQuizContext | null>(null);
  const contextPromiseRef = useRef<Promise<OwnedQuizContext> | null>(null);
  const emailVerifiedRef = useRef(false);
  const proposalDialogRef = useRef<HTMLElement>(null);
  const proposalDialogButtonRef = useRef<HTMLButtonElement>(null);
  const resumeDialogRef = useRef<HTMLElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const resumeReturnFocusRef = useRef<HTMLElement | null>(null);

  const ensureOwnedContext = useCallback((audienceKey: AudienceKey) => {
    if (ownedContextRef.current?.audienceKey === audienceKey) return Promise.resolve(ownedContextRef.current);
    if (!contextPromiseRef.current) {
      contextPromiseRef.current = service.createOwnedQuizContext(audienceKey, {
        landingPath: "/quiz/",
        captchaToken: captchaToken ?? undefined,
      })
        .then((context) => {
          ownedContextRef.current = context;
          return context;
        })
        .catch((error) => {
          contextPromiseRef.current = null;
          throw error;
        });
    }
    return contextPromiseRef.current;
  }, [captchaToken, service]);

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
      location: state.location,
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
    if (!hydrated || state.screen !== "question" || !state.audienceKey || !ownedContextRef.current) return;
    const question = QUIZ_DEFINITIONS[state.audienceKey].questions[state.currentQuestionIndex];
    const answered = Boolean(question && state.answers[question.key]?.length);
    const timer = window.setTimeout(() => {
      const context = ownedContextRef.current;
      if (!context) return;
      void service.saveOwnedQuizProgress(context, {
        answers: state.answers,
        currentStep: state.currentQuestionIndex + 1,
        lastCompletedStep: answered ? state.currentQuestionIndex + 1 : state.currentQuestionIndex,
        location: state.location,
      }).then(() => setSyncMessage(null)).catch(() => {
        setSyncMessage("Cloud save is delayed. Your 3-day device copy is still available.");
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [hydrated, service, state.answers, state.audienceKey, state.currentQuestionIndex, state.location, state.screen]);

  useEffect(() => {
    if (state.screen !== "calculating" || !state.audienceKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const context = await ensureOwnedContext(state.audienceKey!);
        let proposalLocation = state.location;
        if (proposalLocation && proposalLocation.displayCurrency !== "USD") {
          try {
            proposalLocation = await service.getCurrencyQuote({
              name: proposalLocation.businessCountry,
              code: proposalLocation.countryCode,
              currency: proposalLocation.displayCurrency,
              symbol: proposalLocation.currencySymbol,
            });
          } catch {
            proposalLocation = {
              ...proposalLocation,
              fxRate: null,
              fxRateTimestamp: null,
            };
          }
          await service.saveOwnedQuizProgress(context, {
            answers: state.answers,
            currentStep: QUIZ_DEFINITIONS[state.audienceKey!].questions.length,
            lastCompletedStep: QUIZ_DEFINITIONS[state.audienceKey!].questions.length,
            location: proposalLocation,
          });
        }
        const result = calculateRecommendation({
          audienceKey: state.audienceKey!,
          answers: state.answers,
          location: proposalLocation ?? undefined,
        });
        const proposal = await service.previewProposal(context);
        if (!cancelled) dispatch({ type: "CALCULATION_SUCCESS", result, proposal });
      } catch {
        if (!cancelled) dispatch({
          type: "CALCULATION_FAILURE",
          message: "We could not calculate your roadmap. Your answers are still saved on this device.",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [ensureOwnedContext, service, state.answers, state.audienceKey, state.location, state.screen]);

  const startOver = () => {
    const storage = getBrowserStorage();
    if (!storage || !clearQuizAttempt(storage)) setPersistenceAvailable(false);
    createdAtRef.current = new Date().toISOString();
    ownedContextRef.current = null;
    contextPromiseRef.current = null;
    setSyncMessage(null);
    setIssueError(null);
    setProposalDialog(null);
    emailVerifiedRef.current = false;
    setDeliveryEmail(null);
    setSetupError(null);
    setSetupBusy(false);
    setSecurityAction("anonymous_quiz_start");
    setContextReady(false);
    setLocationError(null);
    dispatch({ type: "START_OVER" });
  };

  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const productionCaptchaMissing = process.env.NODE_ENV === "production" && !captchaSiteKey;
  const captchaReady = productionCaptchaMissing ? false : !captchaSiteKey || Boolean(captchaToken);

  const bootstrapOwnedContext = useCallback(async (audienceKey: AudienceKey, token?: string) => {
    if (ownedContextRef.current?.audienceKey === audienceKey) {
      setContextReady(true);
      return;
    }
    if (contextPromiseRef.current) {
      try {
        await contextPromiseRef.current;
        setContextReady(true);
      } catch {
        setContextReady(false);
      }
      return;
    }
    setSetupBusy(true);
    setSyncMessage(null);
    try {
      const pendingContext = service.createOwnedQuizContext(audienceKey, {
        landingPath: "/quiz/",
        captchaToken: token,
      });
      contextPromiseRef.current = pendingContext;
      const context = await pendingContext;
      ownedContextRef.current = context;
      contextPromiseRef.current = Promise.resolve(context);
      setContextReady(true);
      setSecurityAction("email_otp_request");
      setCaptchaToken(null);
      setCaptchaAttempt((attempt) => attempt + 1);
    } catch {
      contextPromiseRef.current = null;
      setContextReady(false);
      setSyncMessage("We could not start the secure assessment. Check your connection and try again.");
    } finally {
      setSetupBusy(false);
    }
  }, [service]);

  const emailSecurityReady = contextReady && captchaReady;

  useEffect(() => {
    if (
      !hydrated || !state.audienceKey || contextReady || ownedContextRef.current
      || securityAction !== "anonymous_quiz_start" || !captchaReady
      || !["contact", "verify_email"].includes(state.screen)
    ) return;
    void bootstrapOwnedContext(state.audienceKey, captchaToken ?? undefined);
  }, [bootstrapOwnedContext, captchaReady, captchaToken, contextReady, hydrated, securityAction, state.audienceKey, state.screen]);

  const chooseAudience = (audienceKey: AudienceKey) => {
    createdAtRef.current = new Date().toISOString();
    ownedContextRef.current = null;
    contextPromiseRef.current = null;
    setSyncMessage(null);
    setIssueError(null);
    setProposalDialog(null);
    emailVerifiedRef.current = false;
    setDeliveryEmail(null);
    setSetupError(null);
    setContextReady(false);
    setLocationError(null);
    dispatch({ type: "SELECT_AUDIENCE", audienceKey });
    if (captchaReady) void bootstrapOwnedContext(audienceKey, captchaToken ?? undefined);
  };

  const definition = state.audienceKey ? QUIZ_DEFINITIONS[state.audienceKey] : null;
  const question = definition?.questions[state.currentQuestionIndex];
  const selectLocation = async (country: CountryOption) => {
    setLocationBusy(true);
    setLocationError(null);
    try {
      const location = await service.getCurrencyQuote(country);
      if (state.audienceKey) {
        const context = await ensureOwnedContext(state.audienceKey);
        await service.saveOwnedQuizProgress(context, { answers: state.answers, currentStep: 0, lastCompletedStep: 0, location });
      }
      dispatch({ type: "SELECT_LOCATION", location });
    } catch {
      dispatch({ type: "SELECT_LOCATION", location: fallbackLocation(country) });
      setLocationError(`Live ${country.currency} conversion is unavailable. Retry from the investment section before confirming.`);
    } finally {
      setLocationBusy(false);
    }
  };
  const finishVerifiedSetup = async (
    businessScope?: "same_business" | "another_business",
    submittedContact?: LeadContactInput,
  ) => {
    const currentContact = submittedContact ?? state.contact;
    if (!state.audienceKey || !currentContact) return;
    setSetupBusy(true);
    setSetupError(null);
    try {
      const context = await ensureOwnedContext(state.audienceKey);
      if (!currentContact.consent || !state.otpChallenge || !emailVerifiedRef.current) {
        throw new Error("verified challenge required");
      }
      const contact: LeadContactInput = businessScope
        ? {
          ...currentContact,
          businessName: businessScope === "same_business" && state.existingBusinessName
            ? state.existingBusinessName
            : currentContact.businessName,
          consent: true,
          businessScope,
          ...(businessScope === "same_business" && state.existingBusinessId
            ? { selectedBusinessId: state.existingBusinessId }
            : {}),
        }
        : { ...currentContact, consent: true };
      const result = await service.submitLeadContact(context, state.otpChallenge.id, contact);
      if (result.status === "different_business_name_required") {
        dispatch({ type: "EDIT_BUSINESS" });
        setSetupError("Enter a different business name to continue with this verified email.");
      } else if (result.status === "business_scope_required") {
        dispatch({
          type: "BUSINESS_SCOPE_REQUIRED",
          contact,
          existingBusinessId: result.existingBusinessId,
          existingBusinessName: result.existingBusinessName,
        });
      } else {
        const startFresh = businessScope === "another_business";
        if (startFresh) {
          const storage = getBrowserStorage();
          if (!storage || !clearQuizAttempt(storage)) setPersistenceAvailable(false);
          createdAtRef.current = new Date().toISOString();
        }
        dispatch({ type: "CONTACT_ACCEPTED", contact, startFresh });
      }
    } catch {
      setSetupError("Your email is verified, but we could not prepare the secure assessment. Please retry setup.");
    } finally {
      setSetupBusy(false);
    }
  };

  const verifyAndStart = async (token: string) => {
    if (!state.otpChallenge) return;
    if (!emailVerifiedRef.current) {
      const verification = await service.verifyEmailOtp(state.otpChallenge.id, token);
      emailVerifiedRef.current = true;
      dispatch({ type: "OTP_VERIFIED", grantExpiresAt: verification.grantExpiresAt });
    }
  };
  const flushProgress = async () => {
    if (!state.audienceKey) return;
    const question = QUIZ_DEFINITIONS[state.audienceKey].questions[state.currentQuestionIndex];
    const answered = Boolean(question && state.answers[question.key]?.length);
    if (!answered) {
      dispatch({ type: "NEXT" });
      return;
    }
    try {
      const context = await ensureOwnedContext(state.audienceKey);
      await service.saveOwnedQuizProgress(context, {
        answers: state.answers,
        currentStep: state.currentQuestionIndex + 1,
        lastCompletedStep: state.currentQuestionIndex + 1,
        location: state.location,
      });
      setSyncMessage(null);
      dispatch({ type: "NEXT" });
    } catch {
      setSyncMessage("We could not save this answer securely. Please try Continue again.");
    }
  };

  const refreshQuote = useCallback(async (force = false) => {
    if (!state.audienceKey || !state.location) return state.location;
    if (state.location.displayCurrency === "USD") {
      return { ...state.location, fxRate: 1 };
    }
    if (!force && isCurrencyQuoteFresh(state.location.fxRateTimestamp, now())) return state.location;
    const context = await ensureOwnedContext(state.audienceKey);
    try {
      const location = await service.getCurrencyQuote({
        name: state.location.businessCountry,
        code: state.location.countryCode,
        currency: state.location.displayCurrency,
        symbol: state.location.currencySymbol,
      });
      await service.saveOwnedQuizProgress(context, {
        answers: state.answers,
        currentStep: QUIZ_DEFINITIONS[state.audienceKey].questions.length,
        lastCompletedStep: QUIZ_DEFINITIONS[state.audienceKey].questions.length,
        location,
      });
      dispatch({ type: "REFRESH_LOCATION_QUOTE", location });
      return location;
    } catch {
      const location = { ...state.location, fxRate: null, fxRateTimestamp: null };
      dispatch({ type: "REFRESH_LOCATION_QUOTE", location });
      setIssueError(`Live ${state.location.displayCurrency} conversion is unavailable. Retry before confirming your proposal.`);
      return null;
    }
  }, [ensureOwnedContext, now, service, state.answers, state.audienceKey, state.location]);

  const applyCoupon = useCallback(async () => {
    if (!state.audienceKey || !state.roadmapSelection || issuing || state.proposalConfirmationStatus !== "editing") return;
    setIssuing(true);
    setIssueError(null);
    try {
      const context = await ensureOwnedContext(state.audienceKey);
      const location = await refreshQuote(true);
      if (!location) {
        throw new Error(`Live ${state.location?.displayCurrency ?? "local-currency"} conversion is unavailable. Retry before applying your coupon.`);
      }
      const proposal = await service.previewProposal(context, state.roadmapSelection, state.couponInput);
      dispatch({ type: "COUPON_APPLIED", proposal });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Coupon validation is temporarily unavailable. Please try again.";
      dispatch({ type: "COUPON_REJECTED", message });
    } finally {
      setIssuing(false);
    }
  }, [ensureOwnedContext, issuing, refreshQuote, service, state.audienceKey, state.couponInput, state.location, state.proposalConfirmationStatus, state.roadmapSelection]);

  const issueSelectedProposal = useCallback(async () => {
    if (!state.audienceKey || !state.roadmapSelection || issuing) return;
    const retryingDelivery = state.proposalConfirmationStatus === "delivery_retry_required";
    if (!retryingDelivery && state.proposalConfirmationStatus !== "editing") return;
    dispatch({ type: "PROPOSAL_CONFIRMING" });
    setIssuing(true);
    setIssueError(null);
    setProposalDialog("sending");
    try {
      const context = await ensureOwnedContext(state.audienceKey);
      const location = retryingDelivery ? state.location : await refreshQuote();
      if (!retryingDelivery && !location) {
        throw new Error(`Live ${state.location?.displayCurrency ?? "local-currency"} conversion is unavailable. Retry before confirming your proposal.`);
      }
      const issued = await service.issueProposal(context, state.roadmapSelection, state.appliedCampaign?.code);
      dispatch({ type: "PROPOSAL_ISSUED", proposal: issued.proposal, ...(location ? { location } : {}) });
      setProposalDialog("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The assessment service is temporarily unavailable. Please try again.";
      setIssueError(message);
      if (isProposalServiceError(error, "proposal_delivery_failed")) {
        dispatch({ type: "PROPOSAL_DELIVERY_RETRY_REQUIRED", message });
        setProposalDialog("error");
      } else if (isProposalServiceError(error) && [
        "coupon_invalid",
        "coupon_ineligible",
        "coupon_exhausted",
        "coupon_already_redeemed",
      ].includes(error.code)) {
        dispatch({ type: "COUPON_INVALIDATED", message });
        setProposalDialog(null);
      } else {
        dispatch({ type: "PROPOSAL_CONFIRMATION_FAILED", message });
        setProposalDialog(null);
      }
    } finally {
      setIssuing(false);
    }
  }, [ensureOwnedContext, issuing, refreshQuote, service, state.appliedCampaign, state.audienceKey, state.location, state.proposalConfirmationStatus, state.roadmapSelection]);

  useEffect(() => {
    if (!proposalDialog) return;
    (proposalDialogButtonRef.current ?? proposalDialogRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && proposalDialog !== "sending") {
        event.preventDefault();
        setProposalDialog(null);
        return;
      }
      if (event.key !== "Tab" || !proposalDialogRef.current) return;
      const focusable = [...proposalDialogRef.current.querySelectorAll<HTMLElement>("button, a[href]")]
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
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [proposalDialog]);

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

        {hydrated && state.screen === "audience" ? (
          <AudienceSelector onSelect={chooseAudience} />
        ) : null}

        {hydrated && ["contact", "verify_email"].includes(state.screen) ? (
          <LeadContactStep
            challenge={state.otpChallenge}
            emailVerified={state.emailVerified}
            initialContact={state.contact}
            onChangeEmail={() => {
              emailVerifiedRef.current = false;
              setSetupError(null);
              dispatch({ type: "OTP_RESET" });
            }}
            onContinue={(contact) => finishVerifiedSetup(
              state.existingBusinessId ? "another_business" : undefined,
              contact,
            )}
            onRequestCode={async (contact) => {
              setDeliveryEmail(contact.email.trim().toLowerCase());
              try {
                const context = ownedContextRef.current;
                if (!context) throw new Error("The secure assessment is not ready yet.");
                const challenge = await service.requestEmailOtp(contact.email, captchaToken ?? "", context.visitorId);
                emailVerifiedRef.current = challenge.verified;
                dispatch({ type: "OTP_REQUESTED", contact, challenge });
              } finally {
                setCaptchaToken(null);
                setCaptchaAttempt((attempt) => attempt + 1);
              }
            }}
            onResendCode={async () => {
              if (!state.otpChallenge || !state.contact) return;
              try {
                const context = ownedContextRef.current;
                if (!context) throw new Error("The secure assessment is not ready yet.");
                const challenge = await service.requestEmailOtp(state.otpChallenge.email, captchaToken ?? "", context.visitorId);
                emailVerifiedRef.current = challenge.verified;
                dispatch({ type: "OTP_REQUESTED", contact: state.contact, challenge });
              } finally {
                setCaptchaToken(null);
                setCaptchaAttempt((attempt) => attempt + 1);
              }
            }}
            onVerifyCode={verifyAndStart}
            securityError={captchaError}
            securityReady={emailSecurityReady}
            setupBusy={setupBusy}
            setupError={setupError}
          />
        ) : null}

        {hydrated && state.screen === "business_scope" && state.contact && state.existingBusinessId && state.existingBusinessName ? (
          <section className="quiz-stage quiz-business-scope" aria-labelledby="quiz-business-scope-title">
            <p className="quiz-kicker">Verified identity</p>
            <h1 id="quiz-business-scope-title">Hi {state.contact.firstName}, is this assessment for {state.existingBusinessName}?</h1>
            <p className="quiz-lede">Choose how this assessment should be organized under your verified email.</p>
            {setupError ? <p className="quiz-validation" role="alert">{setupError}</p> : null}
            <div className="quiz-business-scope-actions">
              <button className="quiz-primary" disabled={setupBusy} onClick={() => void finishVerifiedSetup("same_business")} type="button">Same business</button>
              <button className="quiz-secondary" disabled={setupBusy} onClick={() => {
                const enteredName = state.contact?.businessName.trim().toLocaleLowerCase();
                const existingName = state.existingBusinessName?.trim().toLocaleLowerCase();
                if (!enteredName || enteredName === existingName) {
                  dispatch({ type: "EDIT_BUSINESS" });
                  return;
                }
                void finishVerifiedSetup("another_business");
              }} type="button">Another business</button>
              <button className="quiz-back" disabled={setupBusy} onClick={() => {
                dispatch({ type: "EDIT_BUSINESS" });
              }} type="button">Change business details</button>
            </div>
          </section>
        ) : null}

        {hydrated && state.screen === "location" ? (
          <BusinessLocationStep busy={locationBusy} error={locationError} onContinue={selectLocation} />
        ) : null}

        {hydrated && state.screen === "intro" && definition && state.clientIdentity ? (
          <section className="quiz-stage quiz-intro" aria-labelledby="quiz-intro-title">
            <p className="quiz-kicker">{definition.label}</p>
            <h1 id="quiz-intro-title">Hi {state.clientIdentity.firstName}, let&apos;s start your assessment.</h1>
            <p className="quiz-lede">
              Eleven focused questions will identify the clearest system, platform route, and planning investment for your business.
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
            onContinue={() => void flushProgress()}
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

        {hydrated && state.screen === "result" && state.result && state.roadmapSelection && state.priceQuote ? (
          <QuizResult
            result={state.result}
            proposal={state.proposal ?? undefined}
            selection={state.roadmapSelection}
            onSelect={(selection) => dispatch({ type: "SELECT_ROADMAP", selection })}
            onStartOver={startOver}
            onRetryProposal={issueSelectedProposal}
            onApplyCoupon={applyCoupon}
            onCouponInput={(value) => dispatch({ type: "SET_COUPON_INPUT", value })}
            onRemoveCoupon={() => dispatch({ type: "REMOVE_COUPON" })}
            onRetryConversion={() => refreshQuote(true).then(() => undefined)}
            onConfirmProposal={issueSelectedProposal}
            priceQuote={state.priceQuote}
            couponInput={state.couponInput}
            couponMessage={state.couponMessage}
            countryCode={state.location?.countryCode ?? state.result.location.countryCode}
            proposalLocked={["confirming", "issued", "delivery_retry_required"].includes(state.proposalConfirmationStatus)}
            deliveryRetryRequired={state.proposalConfirmationStatus === "delivery_retry_required"}
            issuing={issuing}
            issueError={issueError}
            persistenceAvailable={persistenceAvailable}
          />
        ) : null}
      </main>

      {hydrated && captchaSiteKey ? (
        <div className="quiz-security-runtime" aria-live="polite" hidden={Boolean(captchaToken)}>
          <Turnstile
            key={captchaAttempt}
            siteKey={captchaSiteKey}
            onSuccess={(token) => {
              setCaptchaToken(token);
              setCaptchaError(false);
              if (securityAction === "anonymous_quiz_start" && state.audienceKey && !contextReady) {
                void bootstrapOwnedContext(state.audienceKey, token);
              }
            }}
            onExpire={() => setCaptchaToken(null)}
            onError={() => {
              setCaptchaToken(null);
              setCaptchaError(true);
            }}
            onTimeout={() => {
              setCaptchaToken(null);
              setCaptchaError(true);
            }}
            onUnsupported={() => {
              setCaptchaToken(null);
              setCaptchaError(true);
            }}
            options={{
              action: securityAction,
              appearance: "always",
              retry: "never",
              refreshExpired: "auto",
              theme: "dark",
            }}
          />
          {captchaError ? (
            <button
              className="quiz-security-retry"
              onClick={() => {
                setCaptchaError(false);
                setCaptchaToken(null);
                setCaptchaAttempt((attempt) => attempt + 1);
              }}
              type="button"
            >
              Retry security check
            </button>
          ) : null}
        </div>
      ) : productionCaptchaMissing ? (
        <p className="quiz-security-runtime" role="status">Secure assessment setup is temporarily unavailable.</p>
      ) : null}

      {hydrated && !persistenceAvailable ? (
        <p className="quiz-storage-notice" role="status">
          Device recovery is unavailable. Keep this page open until you finish or save the result another way.
        </p>
      ) : null}
      {hydrated && syncMessage ? <p className="quiz-storage-notice" role="status">{syncMessage}</p> : null}

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

      {proposalDialog ? (
        <div className="resume-backdrop">
          <section
            ref={proposalDialogRef}
            className="resume-dialog proposal-delivery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-delivery-title"
            aria-busy={proposalDialog === "sending"}
            tabIndex={-1}
          >
            <p className="quiz-kicker">{proposalDialog === "success" ? "Proposal delivered" : "Email delivery"}</p>
            <h2 id="proposal-delivery-title">
              {proposalDialog === "sending"
                ? "Preparing and sending your proposal..."
                : proposalDialog === "success"
                ? "Success! Your proposal is ready."
                : "Your roadmap is ready, but the email was not sent."}
            </h2>
            <p>
              {proposalDialog === "sending"
                ? "Keep this page open while we confirm delivery. Your 72-hour access window starts only after the email is accepted."
                : proposalDialog === "success"
                ? `We sent the protected proposal and access details to ${maskDeliveryEmail(deliveryEmail)}. It will remain available for 72 hours.`
                : "Your roadmap remains available here. Retry sending the protected proposal and access details."}
            </p>
            <div className="resume-actions">
              {proposalDialog === "sending" ? (
                <span className="proposal-delivery-progress" aria-hidden="true" />
              ) : proposalDialog === "error" ? (
                <button
                  ref={proposalDialogButtonRef}
                  className="quiz-primary"
                  disabled={issuing}
                  onClick={() => void issueSelectedProposal()}
                  type="button"
                >
                  {issuing ? "Sending email…" : "Retry sending email"}
                </button>
              ) : (
                <>
                  <button
                    ref={proposalDialogButtonRef}
                    className="quiz-primary"
                    onClick={() => setProposalDialog(null)}
                    type="button"
                  >
                    View My Roadmap
                  </button>
                  <a className="quiz-secondary" href="/booking/">Book a Discovery Call</a>
                </>
              )}
              {proposalDialog === "error" ? (
                <button className="quiz-secondary" onClick={() => setProposalDialog(null)} type="button">
                  Continue viewing roadmap
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
