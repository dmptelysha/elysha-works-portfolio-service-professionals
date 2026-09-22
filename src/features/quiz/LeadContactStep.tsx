"use client";

import { type FormEvent, useState } from "react";

import type { LeadContactInput } from "./types";

interface LeadContactStepProps {
  onSubmit: (contact: LeadContactInput) => Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LeadContactStep({ onSubmit }: LeadContactStepProps) {
  const [firstName, setFirstName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = Boolean(
    firstName.trim() && businessName.trim() && EMAIL_PATTERN.test(normalizedEmail) && consent && !submitting,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        businessName: businessName.trim(),
        email: normalizedEmail,
        consent: true,
      });
    } catch {
      setError("We could not save your details. Please try again; your entries are still here.");
      setSubmitting(false);
    }
  };

  return (
    <section className="quiz-stage quiz-contact" aria-labelledby="quiz-contact-title">
      <p className="quiz-kicker">Your roadmap identity</p>
      <h1 id="quiz-contact-title">Where should we send your 3-day proposal?</h1>
      <p className="quiz-lede">
        We use these details to personalize your result and send your protected proposal access after you finish.
      </p>
      <form className="quiz-contact-form" onSubmit={handleSubmit} noValidate>
        <label>
          <span>First name</span>
          <input autoComplete="given-name" name="firstName" required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          <span>Business name</span>
          <input autoComplete="organization" name="businessName" required value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
        </label>
        <label className="quiz-contact-email">
          <span>Email</span>
          <input autoComplete="email" name="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="quiz-consent">
          <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
          <span>I agree to receive the initial proposal and up to three follow-ups unless I book a discovery call.</span>
        </label>
        {error ? <p className="quiz-validation" role="alert">{error}</p> : null}
        {submitting ? <p className="quiz-contact-status" role="status">Saving your detailsâ€¦</p> : null}
        <button className="quiz-primary" disabled={!canSubmit} type="submit">
          Continue to Assessment <span aria-hidden="true">â†’</span>
        </button>
      </form>
    </section>
  );
}
