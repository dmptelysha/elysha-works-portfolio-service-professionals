"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

interface EmailOtpStepProps {
  email: string;
  resendAvailableAt: string;
  onVerify: (token: string) => Promise<void>;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
  now?: () => number;
}

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "your email";
  if (local.length <= 2) return `${local.slice(0, 1)}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(4, local.length - 2))}${local.at(-1)}@${domain}`;
}

export function EmailOtpStep({
  email,
  resendAvailableAt,
  onVerify,
  onResend,
  onChangeEmail,
  now = Date.now,
}: EmailOtpStepProps) {
  const [token, setToken] = useState("");
  const [clock, setClock] = useState(() => now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resendAt = useMemo(() => Date.parse(resendAvailableAt), [resendAvailableAt]);
  const secondsRemaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = window.setInterval(() => setClock(now()), 1000);
    return () => window.clearInterval(timer);
  }, [now, secondsRemaining]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || token.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(token);
    } catch {
      setError("We could not verify that code. Check it or request a new one.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || secondsRemaining > 0) return;
    setBusy(true);
    setError(null);
    try {
      await onResend();
      setToken("");
      setClock(now());
    } catch {
      setError("We could not send a new code right now. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="quiz-stage quiz-otp" aria-labelledby="quiz-otp-title">
      <p className="quiz-kicker">Verify your email</p>
      <h1 id="quiz-otp-title">Check your email.</h1>
      <p className="quiz-lede">We sent it to <strong>{maskEmail(email)}</strong>. Verification protects your proposal from mistyped or automated submissions.</p>
      <form className="quiz-otp-form" onSubmit={submit} noValidate>
        <label htmlFor="quiz-email-code">Verification code</label>
        <input
          id="quiz-email-code"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]{6}"
          value={token}
          onChange={(event) => {
            setToken(event.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
        />
        {error ? <p className="quiz-validation" role="alert">{error}</p> : null}
        <button className="quiz-primary" disabled={busy || token.length !== 6} type="submit">
          {busy ? "Verifying…" : "Verify Email"}
        </button>
        <div className="quiz-otp-actions">
          <button disabled={busy || secondsRemaining > 0} onClick={() => void resend()} type="button">
            {secondsRemaining > 0 ? `Resend in ${secondsRemaining}s` : "Resend code"}
          </button>
          <button disabled={busy} onClick={onChangeEmail} type="button">Change email</button>
        </div>
      </form>
    </section>
  );
}
