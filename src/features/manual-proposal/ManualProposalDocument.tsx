"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

import { calculateManualQuote, type ManualProposalView, type TierKey } from "./model";
import { ManualProposalPreviewDialog } from "./ManualProposalPreviewDialog";
import type { PreviewBlobs, PreviewMode } from "./service";

const PREVIEW_MODES: readonly PreviewMode[] = ["desktop", "tablet", "mobile"];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function ManualProposalDocument({
  proposal,
  previewBlobs,
  previewLoading = false,
}: {
  proposal: ManualProposalView;
  previewBlobs: PreviewBlobs;
  previewLoading?: boolean;
}) {
  const [tier, setTier] = useState<TierKey>("basic");
  const [included, setIncluded] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const quote = calculateManualQuote(proposal, tier, included);
  const selected = proposal.offers.find((offer) => offer.key === tier)!;

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventDrag = (event: DragEvent) => {
      if ((event.target as HTMLElement)?.closest?.(".manual-proposal-main, .manual-preview-dialog")) {
        event.preventDefault();
      }
    };
    const preventShortcut = (event: globalThis.KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      if (key === "f12" || key === "printscreen" ||
          (command && ["s", "p", "u"].includes(key)) ||
          (command && event.shiftKey && ["i", "j", "c"].includes(key))) {
        event.preventDefault();
      }
    };
    document.addEventListener("contextmenu", preventContextMenu, true);
    document.addEventListener("dragstart", preventDrag, true);
    document.addEventListener("keydown", preventShortcut, true);
    return () => {
      document.removeEventListener("contextmenu", preventContextMenu, true);
      document.removeEventListener("dragstart", preventDrag, true);
      document.removeEventListener("keydown", preventShortcut, true);
    };
  }, []);

  const expiration = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeZone: "Asia/Manila",
  }).format(new Date(proposal.expiresAt));
  const inlinePreview = previewBlobs[previewMode];

  function onPreviewKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: PreviewMode) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = PREVIEW_MODES.indexOf(current);
    const next = PREVIEW_MODES[(index + (event.key === "ArrowRight" ? 1 : -1) + PREVIEW_MODES.length) % PREVIEW_MODES.length];
    setPreviewMode(next);
    document.getElementById("manual-preview-tab-" + next)?.focus();
  }

  return (
    <main className="manual-proposal-main">
      <h2 className="manual-proposal-sr-only">Proposal unlocked</h2>
      <article>
        <section className="manual-proposal-hero" aria-labelledby="manual-proposal-title">
          <div className="manual-proposal-hero-copy">
            <p className="manual-proposal-eyebrow">A private proposal from Elysha Works</p>
            <h1 id="manual-proposal-title">{proposal.clientName}, a clear way forward for {proposal.businessName}.</h1>
            <p>{proposal.recommendation.title}</p>
            <span>Available for review until {expiration} (Philippine time)</span>
          </div>
        </section>

        <section className="manual-proposal-concept" aria-labelledby="manual-concept-title" data-testid="manual-preview-panel">
          <div className="manual-proposal-concept-heading">
            <div>
              <p className="manual-proposal-eyebrow">01 · Your page concept</p>
              <h2 id="manual-concept-title">Take a look at the design.</h2>
              <p>Preview the page here, then minimize it to focus on the offer.</p>
            </div>
            <div className="manual-proposal-concept-actions">
              <button type="button" aria-controls="manual-inline-preview" aria-expanded={previewExpanded} onClick={() => setPreviewExpanded((current) => !current)}>
                {previewExpanded ? "Minimize preview" : "Show preview"}
              </button>
              <a href="#manual-offers-title" onClick={() => setPreviewExpanded(false)}>See the offers <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          {previewExpanded ? (
            <div id="manual-inline-preview" className="manual-proposal-inline-preview">
              <div className="manual-proposal-inline-toolbar">
                <div role="tablist" aria-label="Preview size" className="manual-proposal-inline-tabs">
                  {PREVIEW_MODES.map((mode) => (
                    <button key={mode} id={"manual-preview-tab-" + mode} type="button" role="tab" aria-selected={previewMode === mode} tabIndex={previewMode === mode ? 0 : -1} onClick={() => setPreviewMode(mode)} onKeyDown={(event) => onPreviewKeyDown(event, mode)}>
                      {mode[0].toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
                <button type="button" className="manual-proposal-full-preview" onClick={() => setPreviewOpen(true)}>View the concept <span aria-hidden="true">↗</span></button>
              </div>
              <div className="manual-proposal-inline-frame" role="tabpanel" aria-label={previewMode[0].toUpperCase() + previewMode.slice(1) + " preview"}>
                {inlinePreview ? <img className={"manual-proposal-inline-image manual-proposal-inline-image--" + previewMode} src={inlinePreview} alt={previewMode[0].toUpperCase() + previewMode.slice(1) + " concept"} draggable={false} onDragStart={(event) => event.preventDefault()} />
                  : <p className="manual-proposal-preview-status">{previewLoading ? "Preview loading…" : previewMode[0].toUpperCase() + previewMode.slice(1) + " preview unavailable."}</p>}
              </div>
              <p className="manual-proposal-concept-note">Concept preview for {proposal.clientName}. Service details, claims, and booking paths need confirmation before publication.</p>
            </div>
          ) : null}
        </section>

        <section className="manual-proposal-offers" aria-labelledby="manual-offers-title">
          <div className="manual-proposal-section-heading">
            <p className="manual-proposal-eyebrow">02 · Choose the scope</p>
            <h2 id="manual-offers-title">Three ways to bring it to life.</h2>
            <p>Compare the three options, select a scope, and review the total below.</p>
          </div>
          <fieldset className="manual-proposal-offer-grid">
            <legend className="manual-proposal-sr-only">Project offers</legend>
            {proposal.offers.map((offer) => (
              <label key={offer.key} className={"manual-proposal-offer" + (tier === offer.key ? " manual-proposal-offer--selected" : "")}>
                <input
                  type="radio"
                  name="manual-offer"
                  aria-label={offer.label}
                  checked={tier === offer.key}
                  onChange={() => setTier(offer.key)}
                />
                <span className="manual-proposal-offer-top">
                  <span className="manual-proposal-offer-title">{offer.label}</span>
                  <span className="manual-proposal-offer-check" aria-hidden="true">{tier === offer.key ? "✓" : ""}</span>
                </span>
                <strong>{money(offer.priceCents)}</strong>
                <span className="manual-proposal-offer-includes">Included in this scope</span>
                <ul>{offer.included.map((item) => <li key={item}>{item}</li>)}</ul>
              </label>
            ))}
          </fieldset>
        </section>

        {proposal.inclusions.length > 0 ? (
          <section className="manual-proposal-inclusions" aria-labelledby="manual-inclusions-title">
            <div>
              <p className="manual-proposal-eyebrow">Optional inclusions</p>
              <h2 id="manual-inclusions-title">Shape the scope around you.</h2>
            </div>
            <div className="manual-proposal-inclusion-list">
              {proposal.inclusions.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    checked={included.includes(item.key)}
                    onChange={(event) => setIncluded((current) => event.target.checked
                      ? [...current, item.key]
                      : current.filter((key) => key !== item.key))}
                  />
                  <span>{item.label}</span>
                  <strong>+{money(item.priceCents)}</strong>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section className="manual-proposal-next" aria-labelledby="manual-next-title">
          <div>
            <p className="manual-proposal-eyebrow">Your selected investment</p>
            <h2 id="manual-next-title">A practical next step.</h2>
            <p>Selected scope: <strong>{selected.label}</strong></p>
            <dl className="manual-proposal-totals">
              <div><dt>Base offer</dt><dd>{money(quote.baseCents)}</dd></div>
              <div><dt>Optional inclusions</dt><dd>{money(quote.additionsCents)}</dd></div>
              <div className="manual-proposal-total"><dt>Total</dt><dd data-testid="selected-total">{money(quote.totalCents)}</dd></div>
              <div><dt>50% deposit</dt><dd data-testid="selected-deposit">{money(quote.depositCents)}</dd></div>
              <div><dt>Remaining balance</dt><dd data-testid="selected-balance">{money(quote.balanceCents)}</dd></div>
            </dl>
          </div>
          <div className="manual-proposal-action-panel">
            <h3>Let&apos;s talk through the plan.</h3>
            <p>A discovery call is the next step to confirm the scope, content, and launch details together.</p>
            <a href={proposal.bookingPath} className="manual-proposal-primary">Book a Discovery Call <span aria-hidden="true">↗</span></a>
            <div className="manual-proposal-reserve">
              <p>50% down payment: <strong>{money(quote.depositCents)}</strong></p>
              <button type="button" disabled>Reserve My Slot</button>
              <p>Checkout is being connected. No payment is taken and no slot is held yet.</p>
            </div>
          </div>
        </section>

        <div className="manual-proposal-strategy">
          <section aria-labelledby="manual-point-a">
            <p className="manual-proposal-eyebrow">Where things stand</p>
            <h2 id="manual-point-a">{proposal.pointA.heading}</h2>
            <p>{proposal.pointA.summary}</p>
            <ul>{proposal.pointA.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section aria-labelledby="manual-point-b">
            <p className="manual-proposal-eyebrow">Where we can go</p>
            <h2 id="manual-point-b">{proposal.pointB.heading}</h2>
            <p>{proposal.pointB.summary}</p>
            <ul>{proposal.pointB.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>

        <section className="manual-proposal-recommendation" aria-labelledby="manual-recommendation">
          <p className="manual-proposal-eyebrow">The thinking behind the offer</p>
          <h2 id="manual-recommendation">{proposal.recommendation.title}</h2>
          <p>{proposal.recommendation.reason}</p>
        </section>
      </article>
      <footer className="manual-proposal-footer"><span>Elysha Works</span><span>Prepared privately for {proposal.clientName}</span></footer>
      {previewOpen ? <ManualProposalPreviewDialog previewBlobs={previewBlobs} previewLoading={previewLoading} clientName={proposal.clientName} onClose={() => setPreviewOpen(false)} /> : null}
    </main>
  );
}
