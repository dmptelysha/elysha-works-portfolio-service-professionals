"use client";

import { useEffect, useMemo, useState } from "react";

import type { CustomEmailOtpChallenge } from "./types";

interface InlineEmailVerificationProps {
  email: string;
  challenge: CustomEmailOtpChallenge | null;
  verified: boolean;
  securityReady: boolean;
  securityError?: boolean;
  requestEnabled?: boolean;
  onEmailChange: (email: string) => void;
  onRequest: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
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

export function InlineEmailVerification({
  email,
  challenge,
  verified,
  securityReady,
  securityError = false,
  requestEnabled = true,
  onEmailChange,
  onRequest,
  onVerify,
  onResend,
  onChangeEmail,
  now = Date.now,
}: InlineEmailVerificationProps) {
  const [code, setCode] = useState("");
  const [clock, setClock] = useState(() => now());
  const [requestBusy, setRequestBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resendAt = useMemo(
    () => challenge ? Date.parse(challenge.resendAvailableAt) : 0,
    [challenge],
  );
  const secondsRemaining = challenge
    ? Math.max(0, Math.ceil((resendAt - clock) / 1000))
    : 0;

  useEffect(() => {
    if (!challenge || secondsRemaining <= 0) return;
    const timer = window.setInterval(() => setClock(now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge, now, secondsRemaining]);

  const requestCode = async () => {
    if (!requestEnabled || !securityReady || requestBusy || challenge) return;
    setRequestBusy(true);
    setError(null);
    try {
      await onRequest();
      setClock(now());
    } catch {
      setError("We could not send a verification code. Please try again; your entries are still here.");
    } finally {
      setRequestBusy(false);
    }
  };

  const verifyCode = async () => {
    if (verifyBusy || verified || code.length !== 6) return;
    setVerifyBusy(true);
    setError(null);
    try {
      await onVerify(code);
    } catch {
      setError("We could not verify that code. Check it or request a new one.");
    } finally {
      setVerifyBusy(false);
    }
  };

  const resendCode = async () => {
    if (!securityReady || verifyBusy || requestBusy || secondsRemaining > 0) return;
    setRequestBusy(true);
    setError(null);
    try {
      await onResend();
      setCode("");
      setClock(now());
    } catch {
      setError("We could not send a new code right now. Please try again shortly.");
    } finally {
      setRequestBusy(false);
    }
  };

  const changeEmail = () => {
    setCode("");
    setError(null);
    onChangeEmail();
  };

  return (
    <div className="quiz-inline-email">
      <div className="quiz-email-label">
        <label htmlFor="quiz-contact-email">Email</label>
        <span className="quiz-email-row">
          <input
            id="quiz-contact-email"
            autoComplete="email"
            name="email"
            readOnly={Boolean(challenge)}
            required
            type="email"
            value={email}
            onChange={(event) => {
              onEmailChange(event.target.value);
              setError(null);
            }}
          />
          {!challenge ? (
            <button
              className="quiz-email-verify"
              disabled={!requestEnabled || !securityReady || requestBusy}
              onClick={() => void requestCode()}
              type="button"
            >
              {requestBusy ? "Sending code…" : "Verify Email"}
            </button>
          ) : null}
        </span>
      </div>

      {!securityReady && !challenge ? (
        <p className="quiz-contact-status" role="status">
          {securityError ? "Security verification is paused. Use Retry security check below." : "Preparing email security…"}
        </p>
      ) : null}

      {challenge && !verified ? (
        <div className="quiz-inline-otp">
          <p className="quiz-inline-otp-copy">
            Enter the six-digit code sent to <strong>{maskEmail(email)}</strong>.
          </p>
          <label htmlFor="quiz-email-code">Verification code</label>
          <div className="quiz-code-row">
            <input
              id="quiz-email-code"
              aria-describedby="quiz-code-help"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void verifyCode();
                }
              }}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
            />
            <button className="quiz-email-verify" disabled={verifyBusy || code.length !== 6} onClick={() => void verifyCode()} type="button">
              {verifyBusy ? "Verifying…" : "Verify Code"}
            </button>
          </div>
          <p id="quiz-code-help" className="quiz-inline-otp-note">The code expires shortly and is used only to confirm this email.</p>
          <div className="quiz-otp-actions">
            <button disabled={!securityReady || requestBusy || verifyBusy || secondsRemaining > 0} onClick={() => void resendCode()} type="button">
              {secondsRemaining > 0 ? `Resend in ${secondsRemaining}s` : requestBusy ? "Sending…" : "Resend code"}
            </button>
            <button disabled={requestBusy || verifyBusy} onClick={changeEmail} type="button">Change email</button>
          </div>
          {!securityReady ? <p className="quiz-contact-status" role="status">Preparing security for a new code…</p> : null}
        </div>
      ) : null}

      {challenge && verified ? (
        <div className="quiz-email-verified" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <strong>Email verified</strong>
          <button onClick={changeEmail} type="button">Change email</button>
        </div>
      ) : null}

      {error ? <p className="quiz-validation" role="alert">{error}</p> : null}
      {requestBusy ? <p className="quiz-contact-status" aria-live="polite">Sending verification code…</p> : null}
    </div>
  );
}
