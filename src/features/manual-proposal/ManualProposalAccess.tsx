"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

import {
  defaultManualProposalService,
  isManualProposalReference,
  type ManualProposalService,
  type VerifiedManualProposal,
} from "./service";

const unavailable = "We could not verify this proposal. Check the link and access code, or ask Elysha for a new one.";

export function ManualProposalAccess({
  service = defaultManualProposalService,
}: { service?: ManualProposalService } = {}) {
  const [reference, setReference] = useState("");
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState<VerifiedManualProposal | null>(null);

  useEffect(() => {
    setReference(new URLSearchParams(window.location.search).get("ref") ?? "");
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (!unlocked) return;
      for (const url of Object.values(unlocked.previewBlobs)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [unlocked]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isManualProposalReference(reference) || code.length !== 12 || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await service.verify(reference, code.toUpperCase());
      setUnlocked(result);
      setCode("");
    } catch {
      setError(unavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-proposal-shell">
      <header className="manual-proposal-header">
        <a href="/" aria-label="Elysha Works home">
          <Image src="/assets/insight-system/elysha-works-logo.png" alt="Elysha Works" width={220} height={29} unoptimized />
        </a>
        <span>Private proposal</span>
      </header>
      {!unlocked ? (
        <main className="manual-proposal-lock">
          <section aria-labelledby="manual-proposal-lock-title">
            <p className="manual-proposal-eyebrow">Prepared for your review</p>
            <h1 id="manual-proposal-lock-title">Open your private proposal</h1>
            <p>Enter the access code Elysha sent separately from your link.</p>
            <form onSubmit={submit}>
              <label htmlFor="manual-proposal-code">Access code</label>
              <input
                id="manual-proposal-code"
                name="accessCode"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\s/gu, "").toUpperCase())}
              />
              <button type="submit" disabled={!ready || !isManualProposalReference(reference) || code.length !== 12 || busy}>
                {busy ? "Opening…" : "Open proposal"}
              </button>
              {error || (ready && !isManualProposalReference(reference))
                ? <p role="alert">{unavailable}</p>
                : null}
            </form>
          </section>
        </main>
      ) : (
        <main className="manual-proposal-open">
          <h1>Proposal unlocked</h1>
          <p>{unlocked.proposal.clientName}, your proposal for {unlocked.proposal.businessName} is ready.</p>
          {Object.entries(unlocked.previewBlobs).filter(([, url]) => !url).map(([mode]) => (
            <p key={mode}>{mode[0].toUpperCase() + mode.slice(1)} preview unavailable.</p>
          ))}
          <a href={unlocked.proposal.bookingPath}>Book a Discovery Call</a>
        </main>
      )}
    </div>
  );
}
