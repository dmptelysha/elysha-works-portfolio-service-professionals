import { RelatedWorkCards } from "./RelatedWorkCards";
import { RoadmapComparison } from "./RoadmapComparison";
import { RoadmapSelectionSummary } from "./RoadmapSelectionSummary";
import type {
  CortexResult,
  ProposalDraftViewModel,
  ProposalViewModel,
  ReadinessLevel,
  RoadmapSelection,
  SolutionType,
} from "./types";

interface QuizResultProps {
  result: CortexResult;
  proposal?: ProposalDraftViewModel | ProposalViewModel;
  selection: RoadmapSelection;
  onSelect: (selection: RoadmapSelection) => void;
  onStartOver: () => void;
  onRetryProposal: () => Promise<void>;
  issuing: boolean;
  issueError: string | null;
  persistenceAvailable: boolean;
}

const solutionNames: Record<SolutionType, string> = {
  website: "Website",
  funnel: "Funnel",
  automation: "Automation",
  crm: "CRM",
  custom_app: "Custom app",
};

const readinessNames: Record<ReadinessLevel, string> = {
  ready_now: "Ready now",
  within_30_days: "Within 30 days",
  planning_1_2_months: "Planning within 1–2 months",
  researching: "Researching for later",
};

const platformNames = {
  systeme_io: "Systeme.io",
  gohighlevel: "HighLevel",
  custom_app: "Custom App",
} as const;

function ResultList({ items }: { items: readonly string[] }) {
  return items.length ? (
    <ul className="result-simple-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>
  ) : <p>No additional item is required in the recommended first version.</p>;
}

export function QuizResult({
  result,
  proposal,
  selection,
  onSelect,
  onStartOver,
  onRetryProposal,
  issuing,
  issueError,
  persistenceAvailable,
}: QuizResultProps) {
  if (proposal) {
    const completeTier = proposal.tiers.find((tier) => tier.tierKey === "complete");
    const completeVariant = completeTier?.variants.find(
      (variant) => variant.platform === selection.platform && variant.feasibility.available,
    ) ?? completeTier?.variants.find((variant) => variant.feasibility.available);

    return (
      <article className="quiz-result" aria-labelledby="result-title">
        <header className="result-hero result-hero--client">
          <p className="quiz-kicker">Your personalized roadmap</p>
          <h1 id="result-title">Hi {proposal.client.firstName}, here&apos;s the roadmap for {proposal.client.businessName}.</h1>
          <p>{proposal.recommendation.title}</p>
          <strong className="result-confidence result-confidence--standard">Server-ready recommendation</strong>
          <span>Review your path and compare the three working options. Your protected proposal is prepared and emailed automatically.</span>
        </header>

        <div className="result-grid">
          <div className="result-point-row result-card--wide" data-testid="point-a-b-row">
            <section className="result-card" aria-labelledby="point-a-title">
              <p className="result-number">01 · Point A</p>
              <h2 id="point-a-title">{proposal.pointA.heading}</h2>
              <p>{proposal.pointA.summary}</p>
              <ul className="result-simple-list">{proposal.pointA.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>

            <section className="result-card result-card--gold" aria-labelledby="point-b-title">
              <p className="result-number">02 · Point B</p>
              <h2 id="point-b-title">{proposal.pointB.heading}</h2>
              <p>{proposal.pointB.summary}</p>
              <ul className="result-simple-list">{proposal.pointB.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          </div>

          <section className="result-card result-card--wide" aria-labelledby="recommended-path-title">
            <p className="result-number">03 · Recommended path</p>
            <h2 id="recommended-path-title">{proposal.recommendation.title}</h2>
            <p>{proposal.recommendation.reason}</p>
            <strong className="result-price">
              {proposal.recommendation.offerName}: ${proposal.recommendation.basePriceUsd.toLocaleString("en-US")}
            </strong>
          </section>

          <section className="result-card" aria-labelledby="problem-title">
            <p className="result-number">04 · Core problem</p>
            <h2 id="problem-title">What is slowing the business down</h2>
            <p>{proposal.problem.summary}</p>
            <strong>{proposal.problem.primary}</strong>
            {proposal.problem.secondary ? <p>{proposal.problem.secondary}</p> : null}
          </section>

          <section className="result-card result-card--gold" aria-labelledby="missing-system-title">
            <p className="result-number">05 · Missing system</p>
            <h2 id="missing-system-title">The operational gap to close</h2>
            <p>{proposal.missingSystem}</p>
          </section>

          <section className="result-card result-card--wide" aria-labelledby="journey-title">
            <p className="result-number">06 · Customer journey</p>
            <h2 id="journey-title">The recommended path from first visit to delivery</h2>
            <ol className="result-journey">{proposal.customerJourney.map((item) => <li key={item}>{item}</li>)}</ol>
          </section>

          <section className="result-card" aria-labelledby="platform-title">
            <p className="result-number">07 · Platform</p>
            <h2 id="platform-title">Why {platformNames[proposal.platform.recommended]}</h2>
            <ResultList items={proposal.platform.reasons} />
            <details className="result-details">
              <summary>Why not the other platforms?</summary>
              {Object.entries(proposal.platform.alternatives).map(([platform, reason]) => (
                <p key={platform}><strong>{platformNames[platform as keyof typeof platformNames]}:</strong> {reason}</p>
              ))}
            </details>
          </section>

          <section className="result-card" aria-labelledby="package-title">
            <p className="result-number">08 · Recommended package</p>
            <h2 id="package-title">{proposal.package.offerName}</h2>
            <ResultList items={proposal.package.reasons} />
          </section>

          <div className="result-card result-card--wide result-card--comparison">
            <RoadmapComparison result={result} selection={selection} onSelect={onSelect} />
          </div>

          <div className="result-card result-card--wide result-card--selection">
            <RoadmapSelectionSummary result={result} selection={selection} />
          </div>

          <section className="result-card" aria-labelledby="pages-title">
            <p className="result-number">09 · Pages and screens</p>
            <h2 id="pages-title">What the system includes</h2>
            <ResultList items={proposal.pages} />
          </section>

          <section className="result-card" aria-labelledby="automations-title">
            <p className="result-number">10 · Automations</p>
            <h2 id="automations-title">What happens without manual chasing</h2>
            <ResultList items={proposal.automations} />
          </section>

          <section className="result-card" aria-labelledby="payments-title">
            <p className="result-number">11 · Payment options</p>
            <h2 id="payments-title">Recommended collection setup</h2>
            <ResultList items={proposal.payment.options} />
            <p>{proposal.payment.includedSetupCount} payment setup{proposal.payment.includedSetupCount === 1 ? "" : "s"} included in this package.</p>
          </section>

          <section className="result-card" aria-labelledby="domain-title">
            <p className="result-number">12 · Domain and email</p>
            <h2 id="domain-title">Accounts stay under your ownership</h2>
            <ResultList items={[proposal.domainAndEmail.domainOwnership, proposal.domainAndEmail.domainSetup, proposal.domainAndEmail.businessEmail]} />
          </section>

          <section className="result-card result-card--gold" aria-labelledby="investment-title">
            <p className="result-number">13 · Investment</p>
            <h2 id="investment-title">Project investment</h2>
            <strong className="result-price">${proposal.investment.finalTotalUsd.toLocaleString("en-US")} USD</strong>
            {proposal.investment.finalTotalLocal !== null && proposal.investment.localCurrency !== "USD" ? (
              <p>Approximately {proposal.investment.localSymbol}{proposal.investment.finalTotalLocal.toLocaleString("en-US")} {proposal.investment.localCurrency}. USD remains the source price; conversion is indicative.</p>
            ) : <p>Displayed in the approved USD source currency.</p>}
          </section>

          <section className="result-card" aria-labelledby="scope-title">
            <p className="result-number">14 · Included scope</p>
            <h2 id="scope-title">Included in the recommended package</h2>
            <ResultList items={proposal.includedScope} />
          </section>

          <section className="result-card result-card--wide" aria-labelledby="complete-advantage-title">
            <p className="result-number">15 · Optional enhancements</p>
            <h2 id="complete-advantage-title">How Complete can exceed the requirement</h2>
            <p>{completeTier?.promise}</p>
            <ResultList items={proposal.optionalEnhancements} />
            {completeVariant ? (
              <ul className="result-simple-list">
                {completeVariant.offer.includedFeatures.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            ) : null}
          </section>

          <section className="result-card" aria-labelledby="costs-title">
            <p className="result-number">16 · Ongoing costs</p>
            <h2 id="costs-title">Third-party accounts paid directly by you</h2>
            <ResultList items={proposal.ongoingCosts} />
          </section>

          <section className="result-card" aria-labelledby="requirements-title">
            <p className="result-number">17 · What we need from you</p>
            <h2 id="requirements-title">Client requirements</h2>
            <ResultList items={proposal.clientRequirements} />
          </section>

          <section className="result-card result-card--wide" aria-labelledby="ownership-title">
            <p className="result-number">18 · Responsibilities and ownership</p>
            <h2 id="ownership-title">Who handles what</h2>
            <div className="result-table-wrap">
              <table className="result-table">
                <thead><tr><th>Item</th><th>Elysha Works</th><th>Client</th></tr></thead>
                <tbody>{proposal.ownership.map((row) => (
                  <tr key={row.item}><th scope="row">{row.item}</th><td>{row.elyshaWorks}</td><td>{row.client}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="result-card" aria-labelledby="schedule-title">
            <p className="result-number">19 · Project payment</p>
            <h2 id="schedule-title">50% to begin, 50% before launch</h2>
            <p>The deposit reserves the project and starts the approved scope. The balance is due after review and before final handover or launch.</p>
          </section>

          <section className="result-card result-card--gold" aria-labelledby="path-title">
            <p className="result-number">20 · Path to Point B</p>
            <h2 id="path-title">How the recommended system closes the gap</h2>
            <dl className="snapshot-list">
              <div><dt>Today</dt><dd>{proposal.pathToPointB.today}</dd></div>
              <div><dt>With the system</dt><dd>{proposal.pathToPointB.withSystem}</dd></div>
              <div><dt>Target</dt><dd>{proposal.pathToPointB.target}</dd></div>
            </dl>
          </section>

          <section className="result-card result-card--wide" aria-labelledby="work-title">
            <p className="result-number">21 · Related work</p>
            <h2 id="work-title">Related work</h2>
            <RelatedWorkCards audienceKey={result.audienceKey} />
          </section>

          <section className="result-card result-card--next result-card--wide" aria-labelledby="next-title">
            <p className="result-number">Next step · Discovery call</p>
            <h2 id="next-title">Turn the roadmap into a practical scope</h2>
            <p>Discuss the recommendation, confirm the final scope, and decide whether the next step is a fit.</p>
            <a className="quiz-primary" href="/booking/">Book a Discovery Call <span aria-hidden="true">→</span></a>
            <p className="result-disclaimer">{proposal.disclaimer}</p>
          </section>
        </div>

        <footer className="result-control">
          <div>
            <p className="result-number">Proposal access</p>
            <h2>{proposal.expiresAt
              ? "Proposal sent · Available for 72 hours"
              : issueError
                ? "Your roadmap is ready; email delivery needs attention"
                : "Preparing and emailing your proposal…"}</h2>
            <p>{proposal.expiresAt
              ? `Access expires at ${new Date(proposal.expiresAt).toLocaleString("en-US")}.`
              : issueError
                ? "The roadmap remains available here. Retry sending its protected access details."
                : "This happens automatically. Your exact 72-hour access period begins after the email is delivered."}</p>
            {issueError ? <p className="quiz-validation" role="alert">{issueError}</p> : null}
          </div>
          {!proposal.expiresAt && issueError ? (
            <button className="quiz-primary" disabled={issuing} onClick={() => void onRetryProposal()} type="button">
              {issuing ? "Sending email…" : "Retry sending email"} <span aria-hidden="true">→</span>
            </button>
          ) : null}
          <button className="quiz-back" onClick={onStartOver} type="button">Start a new assessment</button>
        </footer>
      </article>
    );
  }

  return (
    <article className="quiz-result" aria-labelledby="result-title">
      <header className="result-hero">
        <p className="quiz-kicker">Your personalized roadmap</p>
        <h1 id="result-title">Your Personalized Roadmap</h1>
        <p>{result.recommendedSolutionTitle}</p>
        <strong className={`result-confidence result-confidence--${result.confidenceLevel}`}>
          {result.confidenceLevel === "low" ? "Low-confidence recommendation" : "Qualified recommendation"}
        </strong>
        <span>Calculated locally · No contact details required</span>
      </header>

      <div className="result-grid">
        <section className="result-card result-card--wide" aria-labelledby="snapshot-title">
          <p className="result-number">01 · Business snapshot</p>
          <h2 id="snapshot-title">What your answers tell us</h2>
          <dl className="snapshot-list">
            <div><dt>Business type</dt><dd>{result.audienceLabel}</dd></div>
            <div><dt>Readiness</dt><dd>{readinessNames[result.readinessLevel]}</dd></div>
            <div><dt>Primary need</dt><dd>{solutionNames[result.primarySolutionType]}</dd></div>
          </dl>
        </section>

        <section className="result-card" aria-labelledby="blocker-title">
          <p className="result-number">02 · Growth blocker</p>
          <h2 id="blocker-title">What may be holding growth back</h2>
          <p>{result.diagnosisSummary}</p>
        </section>

        <section className="result-card result-card--gold" aria-labelledby="primary-title">
          <p className="result-number">03 · Recommended solution</p>
          <h2 id="primary-title">{result.recommendedSolutionTitle}</h2>
          <p>{solutionNames[result.primarySolutionType]} is the strongest primary component for the needs reflected in your answers.</p>
        </section>

        <section className="result-card" aria-labelledby="supporting-title">
          <p className="result-number">04 · Supporting components</p>
          <h2 id="supporting-title">What supports the primary system</h2>
          {result.supportingSolutionTypes.length ? (
            <ul className="result-simple-list">{result.supportingSolutionTypes.map((solution) => <li key={solution}>{solutionNames[solution]}</li>)}</ul>
          ) : <p>No separate supporting component is needed in the recommended first phase.</p>}
        </section>

        <section className="result-card" aria-labelledby="cortex-title">
          <p className="result-number">05 · Cortex recommendation</p>
          <h2 id="cortex-title">{result.recommendedOfferName}</h2>
          <p>{result.recommendationReason}</p>
          <strong className="result-price">Recommended starting build: ${result.basePriceUsd.toLocaleString("en-US")}{result.recommendedOfferKey === "custom_complete" ? "+" : ""}</strong>
        </section>

        <div className="result-card result-card--wide result-card--comparison">
          <RoadmapComparison result={result} selection={selection} onSelect={onSelect} />
        </div>

        <div className="result-card result-card--wide result-card--selection">
          <RoadmapSelectionSummary result={result} selection={selection} />
        </div>

        <section className="result-card" aria-labelledby="fit-title">
          <p className="result-number">08 · Why this fits</p>
          <h2 id="fit-title">A route shaped by your answers</h2>
          <p>{result.recommendationReason}</p>
          <p className="result-confidence-note">{result.confidenceMessage}</p>
          <ol className="decision-trace">
            {result.decisionTrace.map((entry) => (
              <li key={entry.ruleKey}><strong>{entry.ruleKey.replaceAll("_", " ")}: {entry.outcome.replaceAll("_", " ")}</strong><span>{entry.reason}</span></li>
            ))}
          </ol>
        </section>

        <section className="result-card" aria-labelledby="future-title">
          <p className="result-number">09 · Suggested next phase</p>
          <h2 id="future-title">What can come next</h2>
          {result.futurePhaseSuggestions.length ? (
            <ul className="result-simple-list">{result.futurePhaseSuggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
          ) : <p>Keep the first phase focused, then expand only when the business needs it.</p>}
        </section>

        <section className="result-card result-card--wide" aria-labelledby="work-title">
          <p className="result-number">10 · Relevant projects</p>
          <h2 id="work-title">Related work</h2>
          <RelatedWorkCards audienceKey={result.audienceKey} />
        </section>

        <section className="result-card result-card--next result-card--wide" aria-labelledby="next-title">
          <p className="result-number">11 · Book a strategy call</p>
          <h2 id="next-title">Turn the roadmap into a practical scope</h2>
          <p>Book only if you want to review the recommendation and decide whether the next step is a fit.</p>
          <a className="quiz-primary" href="/booking/">Book a Strategy Call <span aria-hidden="true">→</span></a>
        </section>
      </div>

      <footer className="result-control">
        <div>
          <p className="result-number">Your control</p>
          <h2>{persistenceAvailable ? "Your result stays on this device" : "Keep this result page open"}</h2>
          <p>{persistenceAvailable
            ? "No lead was created. Clearing browser data or switching devices may remove this saved roadmap."
            : "No lead was created, and this browser could not save the roadmap for recovery after a reload."}</p>
        </div>
        <button className="quiz-back" onClick={onStartOver} type="button">Start a new assessment</button>
      </footer>
    </article>
  );
}
