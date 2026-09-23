"use client";

import { type FormEvent, useState } from "react";

import { InlineEmailVerification } from "./InlineEmailVerification";
import type { CustomEmailOtpChallenge, LeadContactInput } from "./types";

interface LeadContactStepProps {
  challenge?: CustomEmailOtpChallenge | null;
  emailVerified?: boolean;
  initialContact?: LeadContactInput | null;
  onRequestCode: (contact: LeadContactInput) => Promise<void>;
  onVerifyCode: (code: string) => Promise<void>;
  onResendCode: () => Promise<void>;
  onChangeEmail: () => void;
  onContinue: (contact: LeadContactInput) => Promise<void>;
  securityError?: boolean;
  securityReady?: boolean;
  setupBusy?: boolean;
  setupError?: string | null;
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LeadContactStep({
  challenge = null,
  emailVerified = false,
  initialContact = null,
  onRequestCode,
  onVerifyCode,
  onResendCode,
  onChangeEmail,
  onContinue,
  securityError = false,
  securityReady = true,
  setupBusy = false,
  setupError = null,
}: LeadContactStepProps) {
  const [firstName, setFirstName] = useState(initialContact?.firstName ?? "");
  const [lastName, setLastName] = useState(initialContact?.lastName ?? "");
  const [businessName, setBusinessName] = useState(initialContact?.businessName ?? "");
  const [email, setEmail] = useState(initialContact?.email ?? "");
  const [consent, setConsent] = useState(initialContact?.consent ?? false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const detailsValid = Boolean(
    firstName.trim() && lastName.trim() && businessName.trim() && EMAIL_PATTERN.test(normalizedEmail),
  );
  const verificationReady = detailsValid && consent;
  const canContinue = verificationReady && emailVerified && Boolean(challenge) && !continuing && !setupBusy;

  const contact = (): LeadContactInput => ({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    businessName: businessName.trim(),
    email: normalizedEmail,
    consent: true,
  });

  const handleContinue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue) return;
    setContinuing(true);
    setError(null);
    try {
      await onContinue(contact());
    } catch {
      setError("Your email is verified, but we could not prepare the secure assessment. Please try again.");
    } finally {
      setContinuing(false);
    }
  };

  const resetEmail = () => {
    setEmail("");
    setError(null);
    onChangeEmail();
  };

  return (
    <section className="quiz-stage quiz-contact" aria-labelledby="quiz-contact-title">
      <p className="quiz-kicker">Your roadmap identity</p>
      <h1 id="quiz-contact-title">Where should we send your proposal?</h1>
      <p className="quiz-lede">
        We’ll securely store your personalized proposal for 72 hours. Please book a discovery call within that window so we can discuss your roadmap, answer your questions, and decide the best next step for your business.
      </p>
      <form className="quiz-contact-form" onSubmit={handleContinue} noValidate>
        <label>
          <span>First name</span>
          <input autoComplete="given-name" name="firstName" required value={firstName} onChange={(event) => {
            setFirstName(event.target.value);
            setError(null);
          }} />
        </label>
        <label>
          <span>Last name</span>
          <input autoComplete="family-name" name="lastName" required value={lastName} onChange={(event) => {
            setLastName(event.target.value);
            setError(null);
          }} />
        </label>
        <label>
          <span>Business name</span>
          <input autoComplete="organization" name="businessName" required value={businessName} onChange={(event) => {
            setBusinessName(event.target.value);
            setError(null);
          }} />
        </label>

        <InlineEmailVerification
          challenge={challenge}
          email={email}
          onChangeEmail={resetEmail}
          onEmailChange={setEmail}
          onRequest={() => onRequestCode(contact())}
          onResend={onResendCode}
          onVerify={onVerifyCode}
          requestEnabled={verificationReady}
          securityError={securityError}
          securityReady={securityReady}
          verified={emailVerified}
        />

        <label className="quiz-consent">
          <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
          <span>I agree to receive the initial proposal and up to three follow-ups unless I book a discovery call.</span>
        </label>
        {error || setupError ? <p className="quiz-validation" role="alert">{error ?? setupError}</p> : null}
        <button className="quiz-primary" disabled={!canContinue} type="submit">
          {continuing || setupBusy ? "Preparing assessment…" : "Continue to Assessment"}
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}
