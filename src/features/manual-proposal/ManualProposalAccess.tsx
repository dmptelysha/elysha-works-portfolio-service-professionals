"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ManualProposalDocument } from "./ManualProposalDocument";
import {
  defaultManualProposalService,
  isManualProposalReference,
  type ManualProposalService,
  type PreviewBlobs,
  type VerifiedManualProposal,
} from "./service";

const unavailable = "We could not verify this proposal. Check the link and access code, or ask Elysha for a new one.";
const subscribeReference = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const browserReference = () => new URLSearchParams(window.location.search).get("ref") ?? "";
const serverReference = () => null;

export function ManualProposalAccess({
  service = defaultManualProposalService,
}: { service?: ManualProposalService } = {}) {
  const reference = useSyncExternalStore(subscribeReference, browserReference, serverReference);
  return <ManualProposalSession key={reference ?? "pending"} reference={reference} service={service} />;
}

function revokePreviews(blobs: PreviewBlobs) {
  for (const url of Object.values(blobs)) if (url) URL.revokeObjectURL(url);
}

function ManualProposalSession({ reference, service }: { reference: string | null; service: ManualProposalService }) {
  const ready = reference !== null;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState<VerifiedManualProposal | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const active = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const ownedUrls = useRef(new Set<string>());

  useEffect(() => {
    active.current = true;
    const urls = ownedUrls.current;
    return () => {
      active.current = false;
      abort.current?.abort();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reference || !isManualProposalReference(reference) || code.length !== 12 || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await service.verify(reference, code.toUpperCase());
      if (!active.current || browserReference() !== reference || result.proposal.reference !== reference) {
        revokePreviews(result.previewBlobs);
        return;
      }
      for (const url of Object.values(result.previewBlobs)) if (url) ownedUrls.current.add(url);
      setUnlocked(result);
      setCode("");
      if (result.loadPreviews) {
        setPreviewLoading(true);
        const controller = new AbortController();
        abort.current = controller;
        void result.loadPreviews((mode, url) => {
          if (!active.current || browserReference() !== reference) {
            if (url) URL.revokeObjectURL(url);
            return;
          }
          if (url) ownedUrls.current.add(url);
          setUnlocked((current) => current?.proposal.reference === reference
            ? { ...current, previewBlobs: { ...current.previewBlobs, [mode]: url } }
            : current);
        }, controller.signal).catch(() => {
          // A failed image fetch leaves its mode unavailable without hiding the proposal.
        }).finally(() => {
          if (active.current && browserReference() === reference) setPreviewLoading(false);
        });
      }
    } catch {
      if (active.current && browserReference() === reference) setError(unavailable);
    } finally {
      if (active.current && browserReference() === reference) setBusy(false);
    }
  }

  return (
    <div className="manual-proposal-shell">
      <header className="manual-proposal-header">
        <Link href="/" aria-label="Elysha Works home" className="manual-proposal-brand">
          <span aria-hidden="true">&lt;</span><b>Elysha Works</b><span aria-hidden="true">/&gt;</span>
        </Link>
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
                disabled={!ready}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\s/gu, "").toUpperCase())}
              />
              <button type="submit" disabled={!ready || !isManualProposalReference(reference ?? "") || code.length !== 12 || busy}>
                {busy ? "Opening…" : "Open proposal"}
              </button>
              {error || (ready && !isManualProposalReference(reference ?? ""))
                ? <p role="alert">{unavailable}</p>
                : null}
            </form>
          </section>
        </main>
      ) : <ManualProposalDocument proposal={unlocked.proposal} previewBlobs={unlocked.previewBlobs} previewLoading={previewLoading} />}
    </div>
  );
}
