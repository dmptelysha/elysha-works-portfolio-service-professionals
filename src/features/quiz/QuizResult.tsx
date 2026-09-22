import { PROJECTS } from "@/data/projects";

import { ADDON_BY_KEY, PACKAGE_BY_KEY } from "./catalog";
import { QUIZ_DEFINITIONS } from "./questions";
import type { CortexResult, PlatformKey, ReadinessLevel, SolutionType } from "./types";

interface QuizResultProps {
  result: CortexResult;
  onStartOver: () => void;
}

const platformNames: Record<PlatformKey, string> = {
  systeme_io: "Systeme.io",
  gohighlevel: "GoHighLevel",
  custom_app: "Custom application",
};

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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function QuizResult({ result, onStartOver }: QuizResultProps) {
  const offer = PACKAGE_BY_KEY.get(result.recommendedOfferKey);
  if (!offer) throw new Error(`Unknown recommendation offer: ${result.recommendedOfferKey}`);

  const relevantProjects = PROJECTS.filter((project) => project.audienceKeys.includes(result.audienceKey)).slice(0, 2);
  const includedAddons = result.includedCapabilities
    .map((key) => ADDON_BY_KEY.get(key)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <article className="quiz-result" aria-labelledby="result-title">
      <header className="result-hero">
        <p className="quiz-kicker">Your personalized roadmap</p>
        <h1 id="result-title">Your Personalized Roadmap</h1>
        <p>{result.recommendedSolutionTitle}</p>
        <span>Calculated locally · No contact details required</span>
      </header>

      <div className="result-grid">
        <section className="result-card result-card--wide" aria-labelledby="snapshot-title">
          <p className="result-number">01 · Business snapshot</p>
          <h2 id="snapshot-title">What your answers tell us</h2>
          <dl className="snapshot-list">
            <div><dt>Business type</dt><dd>{QUIZ_DEFINITIONS[result.audienceKey].resultLabel}</dd></div>
            <div><dt>Readiness</dt><dd>{readinessNames[result.readinessLevel]}</dd></div>
            <div><dt>Primary need</dt><dd>{solutionNames[result.primarySolutionType]}</dd></div>
          </dl>
        </section>

        <section className="result-card" aria-labelledby="diagnosis-title">
          <p className="result-number">02 · Diagnosis</p>
          <h2 id="diagnosis-title">What may be holding growth back</h2>
          <p>{result.diagnosisSummary}</p>
        </section>

        <section className="result-card result-card--gold" aria-labelledby="system-title">
          <p className="result-number">03 · Recommended system</p>
          <h2 id="system-title">{offer.name}</h2>
          <p>{offer.description}</p>
          <strong>{result.recommendedSolutionTitle}</strong>
        </section>

        <section className="result-card" aria-labelledby="route-title">
          <p className="result-number">04 · Build route</p>
          <h2 id="route-title">{platformNames[result.recommendedPlatform]}</h2>
          <p>A {result.recommendedBuildRoute} route is the strongest fit for the workflow and complexity reflected in your answers.</p>
        </section>

        <section className="result-card result-card--wide" aria-labelledby="included-title">
          <p className="result-number">05 · Included foundation</p>
          <h2 id="included-title">What the recommended offer includes</h2>
          <ul className="result-check-list">
            {offer.includedFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            {includedAddons.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
        </section>

        <section className="result-card result-card--wide" aria-labelledby="investment-title">
          <p className="result-number">06 · Estimated project investment</p>
          <h2 id="investment-title">Estimated Project Investment</h2>
          <div className="investment-lines">
            <div><span>{offer.name}</span><strong>{money.format(result.basePriceUsd)}</strong></div>
            {result.pricedAddons.map((addon) => (
              <div key={addon.addonKey}><span>{addon.name}{addon.startingAt ? " (starting at)" : ""}</span><strong>{money.format(addon.priceUsd)}</strong></div>
            ))}
            <div className="investment-total"><span>Planning estimate</span><strong>{money.format(result.estimatedProjectInvestmentUsd)}</strong></div>
          </div>
          {result.scopeReviewItems.length ? (
            <p className="scope-note">Also requiring scope review: {result.scopeReviewItems.map((item) => item.label).join(", ")}.</p>
          ) : null}
          <p className="scope-note">Final scope, third-party subscriptions, and any usage costs are confirmed before a proposal.</p>
        </section>

        <section className="result-card" aria-labelledby="fit-title">
          <p className="result-number">07 · Why it fits</p>
          <h2 id="fit-title">A route shaped by your answers</h2>
          <p>{result.recommendationReason}</p>
        </section>

        <section className="result-card" aria-labelledby="future-title">
          <p className="result-number">08 · Future phases</p>
          <h2 id="future-title">What can come next</h2>
          {result.futurePhaseSuggestions.length ? (
            <ul>{result.futurePhaseSuggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
          ) : <p>Keep the first phase focused, then expand only when the business needs it.</p>}
        </section>

        <section className="result-card result-card--wide" aria-labelledby="work-title">
          <p className="result-number">09 · Relevant work</p>
          <h2 id="work-title">Related projects</h2>
          <div className="result-projects">
            {relevantProjects.map((project) => (
              <article key={project.slug}>
                <span>{project.kind}</span>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="result-card result-card--next" aria-labelledby="next-title">
          <p className="result-number">10 · Next step</p>
          <h2 id="next-title">Turn the roadmap into a practical scope</h2>
          <p>Book a strategy call only if you want to review the recommendation and decide whether the next step is a fit.</p>
          <a className="quiz-primary" href="/booking/">Book a Strategy Call <span aria-hidden="true">→</span></a>
        </section>

        <section className="result-card result-card--quiet" aria-labelledby="privacy-title">
          <p className="result-number">11 · Your control</p>
          <h2 id="privacy-title">Your result stays on this device</h2>
          <p>No lead was created. Clearing browser data or switching devices may remove this saved roadmap.</p>
          <button className="quiz-back" onClick={onStartOver} type="button">Start a new assessment</button>
        </section>
      </div>
    </article>
  );
}
