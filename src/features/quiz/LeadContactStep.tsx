"use client";

import { type FormEvent, useState } from "react";

import type { LeadContactInput } from "./types";

interface LeadContactStepProps {
  onSubmit: (contact: LeadContactInput) => Promise<unknown>;
  securityError?: boolean;
  securityReady?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LeadContactStep({ onSubmit, securityError = false, securityReady = true }: LeadContactStepProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = Boolean(
    firstName.trim() && lastName.trim() && businessName.trim()
      && EMAIL_PATTERN.test(normalizedEmail) && consent && securityReady && !submitting,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        businessName: businessName.trim(),
        email: normalizedEmail,
        consent: true,
      });
    } catch {
      setError("We could not send a verification code. Please try again; your entries are still here.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="quiz-stage quiz-contact" aria-labelledby="quiz-contact-title">
      <p className="quiz-kicker">Your roadmap identity</p>
      <h1 id="quiz-contact-title">Where should we send your proposal?</h1>
      <p className="quiz-lede">
        We’ll securely store your personalized proposal for 72 hours. Please book a discovery call within that window so we can discuss your roadmap, answer your questions, and decide the best next step for your business.
      </p>
      <form className="quiz-contact-form" onSubmit={handleSubmit} noValidate>
        <label>
          <span>First name</span>
          <input autoComplete="given-name" name="firstName" required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          <span>Last name</span>
          <input autoComplete="family-name" name="lastName" required value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
        <label>
          <span>Business name</span>
          <input autoComplete="organization" name="businessName" required value={businessName} onChange={(event) => {
            setBusinessName(event.target.value);
            setError(null);
          }} />
        </label>
        <label className="quiz-contact-email">
          <span>Email</span>
          <input autoComplete="email" name="email" required type="email" value={email} onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }} />
        </label>
        <label className="quiz-consent">
          <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
          <span>I agree to receive the initial proposal and up to three follow-ups unless I book a discovery call.</span>
        </label>
        {error ? <p className="quiz-validation" role="alert">{error}</p> : null}
        {!securityReady ? (
          <p className="quiz-contact-status" role="status">
            {securityError ? "Security verification is paused. Use Retry security check below." : "Preparing the secure assessment…"}
          </p>
        ) : null}
        {submitting ? <p className="quiz-contact-status" role="status">Sending verification code…</p> : null}
        <button className="quiz-primary" disabled={!canSubmit} type="submit">
          Send Verification Code <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}
