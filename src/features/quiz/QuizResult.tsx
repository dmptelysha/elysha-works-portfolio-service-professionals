import { PROJECTS } from "@/data/projects";

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

export function QuizResult({ result, proposal, selection, onSelect, onStartOver, persistenceAvailable }: QuizResultProps) {
  const relevantProjects = PROJECTS.filter((project) => project.audienceKeys.includes(result.audienceKey)).slice(0, 2);

  if (proposal) {
    const completeTier = proposal.tiers.find((tier) => tier.tierKey === "complete");
    const completeVariant = completeTier?.variants.find(
      (variant) => variant.platform === selection.platform && variant.feasibility.available,
    ) ?? completeTier?.variants.find((variant) => variant.feasibility.available);

    return (
      <article className="quiz-result" aria-labelledby="result-title">
        <header className="result-hero">
          <p className="quiz-kicker">Your personalized roadmap</p>
          <h1 id="result-title">{proposal.client.firstName}’s roadmap for {proposal.client.businessName}</h1>
          <p>{proposal.recommendation.title}</p>
          <strong className="result-confidence result-confidence--standard">Server-ready recommendation</strong>
          <span>Review your path, compare the three working options, then create your protected 3-day proposal.</span>
        </header>

        <div className="result-grid">
          <section className="result-card result-card--wide" aria-labelledby="point-a-title">
            <p className="result-number">01 · Point A</p>
            <h2 id="point-a-title">{proposal.pointA.heading}</h2>
            <p>{proposal.pointA.summary}</p>
            <ul className="result-simple-list">{proposal.pointA.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="result-card result-card--wide result-card--gold" aria-labelledby="point-b-title">
            <p className="result-number">02 · Point B</p>
            <h2 id="point-b-title">{proposal.pointB.heading}</h2>
            <p>{proposal.pointB.summary}</p>
            <ul className="result-simple-list">{proposal.pointB.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="result-card result-card--wide" aria-labelledby="recommended-path-title">
            <p className="result-number">03 · Recommended path</p>
            <h2 id="recommended-path-title">{proposal.recommendation.title}</h2>
            <p>{proposal.recommendation.reason}</p>
            <strong className="result-price">
              {proposal.recommendation.offerName}: ${proposal.recommendation.basePriceUsd.toLocaleString("en-US")}
            </strong>
          </section>

          <div className="result-card result-card--wide result-card--comparison">
            <RoadmapComparison result={result} selection={selection} onSelect={onSelect} />
          </div>

          <div className="result-card result-card--wide result-card--selection">
            <RoadmapSelectionSummary result={result} selection={selection} />
          </div>

          <section className="result-card result-card--wide" aria-labelledby="complete-advantage-title">
            <p className="result-number">06 · Relevant expansion</p>
            <h2 id="complete-advantage-title">How Complete can exceed the requirement</h2>
            <p>{completeTier?.promise}</p>
            {completeVariant ? (
              <ul className="result-simple-list">
                {completeVariant.offer.includedFeatures.slice(0, 4).map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            ) : null}
          </section>

          <section className="result-card result-card--wide" aria-labelledby="work-title">
            <p className="result-number">07 · Relevant work</p>
            <h2 id="work-title">Related work</h2>
            <div className="result-projects">
              {relevantProjects.map((project) => (
                <article key={project.slug}><span>{project.kind}</span><h3>{project.title}</h3><p>{project.summary}</p></article>
              ))}
            </div>
          </section>

          <section className="result-card result-card--next result-card--wide" aria-labelledby="next-title">
            <p className="result-number">08 · Discovery call</p>
            <h2 id="next-title">Turn the roadmap into a practical scope</h2>
            <p>Discuss the recommendation, confirm the final scope, and decide whether the next step is a fit.</p>
            <a className="quiz-primary" href="/booking/">Book a Discovery Call <span aria-hidden="true">→</span></a>
          </section>
        </div>

        <footer className="result-control">
          <div>
            <p className="result-number">Proposal access</p>
            <h2>{proposal.expiresAt ? "Your protected proposal is active" : "Create your protected 3-day proposal"}</h2>
            <p>{proposal.expiresAt
              ? `Access expires at ${new Date(proposal.expiresAt).toLocaleString("en-US")}.`
              : "Your exact 72-hour expiration begins only after the initial proposal email is delivered."}</p>
          </div>
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
          <div className="result-projects">
            {relevantProjects.map((project) => (
              <article key={project.slug}><span>{project.kind}</span><h3>{project.title}</h3><p>{project.summary}</p></article>
            ))}
          </div>
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
