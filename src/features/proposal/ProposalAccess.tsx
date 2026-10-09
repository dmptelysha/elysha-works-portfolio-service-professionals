"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import type { PlatformKey, ProjectPriceQuote, ProposalViewModel, RoadmapVariant } from "@/features/quiz/types";
import { RelatedWorkCards } from "@/features/quiz/RelatedWorkCards";
import {
  convertUsdToViewerAmount,
  finalViewerAmount,
  formatLocalAmount,
  formatViewerAmount,
} from "@/features/quiz/viewer-currency";

import { defaultProposalService, isProposalReference, type ProposalService } from "./proposal-service";

const CACHE_PREFIX = "elysha-works:proposal:";
const platformNames: Record<PlatformKey, string> = {
  systeme_io: "Systeme.io",
  gohighlevel: "HighLevel",
  custom_app: "Custom App",
};

interface ProposalAccessProps {
  service?: ProposalService;
  now?: () => Date;
  reference?: string;
}

const systemNow = () => new Date();

function cacheKey(reference: string) {
  return `${CACHE_PREFIX}${reference}`;
}

function readCachedProposal(reference: string, now: Date): ProposalViewModel | null {
  try {
    const value = window.sessionStorage.getItem(cacheKey(reference));
    if (!value) return null;
    const proposal = JSON.parse(value) as ProposalViewModel;
    if (!proposal?.expiresAt || Date.parse(proposal.expiresAt) <= now.getTime()) {
      window.sessionStorage.removeItem(cacheKey(reference));
      return null;
    }
    return proposal;
  } catch {
    return null;
  }
}

function preferredVariant(proposal: ProposalViewModel, variants: readonly RoadmapVariant[]) {
  return variants.find((variant) => variant.platform === proposal.selection.platform && variant.feasibility.available)
    ?? variants.find((variant) => variant.feasibility.available)
    ?? variants[0];
}

interface LegacyProposalInvestment {
  estimatedTotalUsd: number;
  currency: string;
  symbol: string;
  localTotal: number | null;
  fxRate: number | null;
  fxRateTimestamp: string | null;
}

function readProposalInvestment(proposal: ProposalViewModel): ProjectPriceQuote {
  const investment = proposal.investment as ProposalViewModel["investment"] | LegacyProposalInvestment;
  if ("finalTotalUsd" in investment) return investment;
  return {
    originalTotalUsd: investment.estimatedTotalUsd,
    discountAmountUsd: 0,
    finalTotalUsd: investment.estimatedTotalUsd,
    localCurrency: investment.currency,
    localSymbol: investment.symbol,
    finalTotalLocal: investment.localTotal,
    fxRate: investment.fxRate,
    fxRateTimestamp: investment.fxRateTimestamp,
    campaign: null,
  };
}

function ProposalDocument({ proposal }: { proposal: ProposalViewModel }) {
  const investment = readProposalInvestment(proposal);
  const originalAmount = convertUsdToViewerAmount(investment.originalTotalUsd, investment);
  const finalAmount = finalViewerAmount(investment);
  const original = originalAmount === null ? null : formatLocalAmount(originalAmount, investment);
  const final = finalAmount === null ? null : formatLocalAmount(finalAmount, investment);
  const savings = originalAmount !== null && finalAmount !== null
    ? formatLocalAmount(Math.max(0, originalAmount - finalAmount), investment)
    : null;
  const expiry = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(proposal.expiresAt));

  return (
    <main className="proposal-main" id="proposal-content">
      <article className="proposal-document" aria-labelledby="proposal-title">
        <header className="proposal-hero">
          <p className="proposal-kicker">Private 3-day strategy roadmap</p>
          <h1 id="proposal-title">{proposal.client.firstName}&apos;s roadmap for {proposal.client.businessName}</h1>
          <p>{proposal.recommendation.title}</p>
          <span>Available until {expiry} (Philippine time)</span>
        </header>

        <div className="proposal-point-row" data-testid="point-a-b-row">
          <section className="proposal-panel" aria-labelledby="proposal-point-a">
            <p className="proposal-number">01 · Point A</p>
            <h2 id="proposal-point-a">{proposal.pointA.heading}</h2>
            <p>{proposal.pointA.summary}</p>
            <ul>{proposal.pointA.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="proposal-panel proposal-panel--gold" aria-labelledby="proposal-point-b">
            <p className="proposal-number">02 · Point B</p>
            <h2 id="proposal-point-b">{proposal.pointB.heading}</h2>
            <p>{proposal.pointB.summary}</p>
            <ul>{proposal.pointB.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>

        <section className="proposal-panel" aria-labelledby="proposal-recommendation">
          <p className="proposal-number">03 · Recommended solution</p>
          <h2 id="proposal-recommendation">{proposal.recommendation.title}</h2>
          <p>{proposal.recommendation.reason}</p>
          <div className="proposal-investment">
            <span>{proposal.recommendation.offerName}</span>
            {investment.campaign && original && final && savings ? (
              <div className="proposal-discount-price">
                <del>{original}</del>
                <strong>{final}</strong>
                <span>You save {savings} · {investment.campaign.percentage}% off</span>
              </div>
            ) : final ? <strong>{final}</strong> : <strong>{investment.localCurrency} conversion unavailable</strong>}
            {investment.fxRateTimestamp && final && investment.localCurrency !== "USD" ? (
              <small>
                Rate checked {new Date(investment.fxRateTimestamp).toLocaleString("en-PH")}
              </small>
            ) : null}
          </div>
        </section>

        <section className="proposal-comparison" aria-labelledby="proposal-options">
          <header>
            <p className="proposal-number">04 · Package comparison</p>
            <h2 id="proposal-options">Three ways to move from Point A to Point B</h2>
            <p>Each tier is a working solution. The higher tiers add depth, automation, and room to scale.</p>
          </header>
          <div className="proposal-tier-grid">
            {proposal.tiers.map((tier) => {
              const variant = preferredVariant(proposal, tier.variants);
              const selected = tier.tierKey === proposal.selection.tierKey;
              return (
                <article className={`proposal-tier${selected ? " proposal-tier--selected" : ""}`} key={tier.tierKey}>
                  <div className="proposal-tier-title">
                    <h3>{tier.label}</h3>
                    {selected ? <span>Selected</span> : null}
                  </div>
                  <p>{tier.promise}</p>
                  <strong>{platformNames[variant.platform]}</strong>
                  <div className="proposal-tier-price">
                    <small>Estimated investment</small>
                    <b>{formatViewerAmount(variant.estimatedProjectInvestmentUsd, investment) ?? `${investment.localCurrency} conversion unavailable`}</b>
                  </div>
                  <ul>{variant.offer.includedFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  {!variant.feasibility.available ? <p className="proposal-unavailable">This route requires a different platform to deliver the approved capability.</p> : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="proposal-related" aria-labelledby="proposal-related-work">
          <p className="proposal-number">05 · Related work</p>
          <h2 id="proposal-related-work">See the thinking in practice.</h2>
          <RelatedWorkCards audienceKey={proposal.audienceKey} />
        </section>

        <section className="proposal-next" aria-labelledby="proposal-next-step">
          <p className="proposal-number">06 · Next step</p>
          <h2 id="proposal-next-step">Let&apos;s turn the roadmap into a practical scope.</h2>
          <p>Book a discovery call to review the recommendation, confirm the details, and decide whether working together is the right fit.</p>
          <a className="proposal-primary" href="/booking/">Book a Discovery Call <span aria-hidden="true">→</span></a>
        </section>
      </article>
    </main>
  );
}

export function ProposalAccess({ service = defaultProposalService, now = systemNow, reference }: ProposalAccessProps = {}) {
  const [proposalReference, setProposalReference] = useState(reference ?? "");
  const [accessKey, setAccessKey] = useState("");
  const [proposal, setProposal] = useState<ProposalViewModel | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventProtectedShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const commandKey = event.ctrlKey || event.metaKey;
      const browserShortcut = commandKey && ["s", "p", "u"].includes(key);
      const developerShortcut = commandKey && event.shiftKey && ["i", "j", "c"].includes(key);

      if (key === "f12" || key === "printscreen" || browserShortcut || developerShortcut) {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", preventContextMenu, true);
    document.addEventListener("keydown", preventProtectedShortcut, true);
    return () => {
      document.removeEventListener("contextmenu", preventContextMenu, true);
      document.removeEventListener("keydown", preventProtectedShortcut, true);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const resolvedReference = reference ?? new URLSearchParams(window.location.search).get("ref") ?? "";
      setProposalReference(resolvedReference);
      if (isProposalReference(resolvedReference)) setProposal(readCachedProposal(resolvedReference, now()));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [now, reference]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isProposalReference(proposalReference) || accessKey.length !== 10 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const verified = await service.verify(proposalReference, accessKey.toUpperCase());
      if (Date.parse(verified.expiresAt) <= now().getTime()) throw new Error("proposal_unavailable");
      window.sessionStorage.setItem(cacheKey(proposalReference), JSON.stringify(verified));
      setAccessKey("");
      setProposal(verified);
    } catch {
      setError("We could not verify this proposal. Check the reference and access key, then try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="proposal-shell">
      <header className="proposal-header">
        <Link className="proposal-brand" href="/" aria-label="Elysha Works home" prefetch={false}>
          <span aria-hidden="true">&lt;</span><b>Elysha Works</b><span aria-hidden="true">/&gt;</span>
        </Link>
        <span>Private client roadmap</span>
      </header>

      {ready && proposal ? <ProposalDocument proposal={proposal} /> : (
        <main className="proposal-lock">
          <section aria-labelledby="proposal-access-title">
            <p className="proposal-kicker">Protected proposal</p>
            <h1 id="proposal-access-title">Open your private roadmap.</h1>
            <p>Enter the separate 10-character access key from your Elysha Works email.</p>
            <form onSubmit={submit}>
              <label htmlFor="proposal-key">Proposal access key</label>
              <input
                id="proposal-key"
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={10}
                onChange={(event) => setAccessKey(event.target.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, ""))}
                placeholder="XXXXXXXXXX"
                spellCheck={false}
                value={accessKey}
              />
              <button className="proposal-primary" disabled={accessKey.length !== 10 || loading || !isProposalReference(proposalReference)} type="submit">
                {loading ? "Verifying…" : "View My Proposal"}
              </button>
              {error ? <p className="proposal-error" role="alert">{error}</p> : null}
              {!isProposalReference(proposalReference) ? <p className="proposal-error" role="alert">We could not verify this proposal. Check the link in your email.</p> : null}
            </form>
          </section>
        </main>
      )}
    </div>
  );
}
