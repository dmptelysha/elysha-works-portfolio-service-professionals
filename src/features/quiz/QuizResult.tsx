import { PROJECTS } from "@/data/projects";

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
  const relevantProjects = PROJECTS.filter((project) => project.audienceKeys.includes(result.audienceKey)).slice(0, 2);
  const includedSupport = result.selectedSupportItems.filter((item) => item.disposition === "included");

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
          <p className="result-number">03 · Primary recommended solution</p>
          <h2 id="primary-title">{result.recommendedSolutionTitle}</h2>
          <p>{solutionNames[result.primarySolutionType]} is the strongest primary component for the needs reflected in your answers.</p>
        </section>

        <section className="result-card" aria-labelledby="supporting-title">
          <p className="result-number">04 · Supporting components</p>
          <h2 id="supporting-title">What supports the primary system</h2>
          {result.supportingSolutionTypes.length ? (
            <ul className="result-simple-list">
              {result.supportingSolutionTypes.map((solution) => <li key={solution}>{solutionNames[solution]}</li>)}
            </ul>
          ) : <p>No separate supporting component is needed in the recommended first phase.</p>}
        </section>

        <section className="result-card" aria-labelledby="route-title">
          <p className="result-number">05 · Build route and platform</p>
          <h2 id="route-title">{platformNames[result.recommendedPlatform]}</h2>
          <p>A {result.recommendedBuildRoute} route is the strongest fit for the workflow and complexity reflected in your answers.</p>
        </section>

        <section className="result-card result-card--wide" aria-labelledby="offer-title">
          <p className="result-number">06 · Recommended base offer</p>
          <h2 id="offer-title">{result.recommendedOfferName}</h2>
          <p>{result.recommendedOfferDescription}</p>
          <strong className="result-price">Starting scope: {money.format(result.basePriceUsd)}</strong>
        </section>

        <section className="result-card result-card--wide" aria-labelledby="capabilities-title">
          <p className="result-number">07 · Included capabilities</p>
          <h2 id="capabilities-title">What the recommended offer includes</h2>
          <ul className="result-check-list">
            {result.recommendedOfferIncludedFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            {includedSupport.map((item) => <li key={item.key}>{item.label}</li>)}
          </ul>
        </section>

        <section className="result-card" aria-labelledby="selected-support-title">
          <p className="result-number">08 · Selected support</p>
          <h2 id="selected-support-title">What you asked to include</h2>
          {result.selectedSupportItems.length ? (
            <ul className="result-support-list">
              {result.selectedSupportItems.map((item) => (
                <li key={item.key}><span>{item.label}</span><small>{item.disposition.replace("_", " ")}</small></li>
              ))}
            </ul>
          ) : <p>No separately catalogued support item was selected.</p>}
        </section>

        <section className="result-card" aria-labelledby="priced-addons-title">
          <p className="result-number">09 · Priced add-ons</p>
          <h2 id="priced-addons-title">Additional priced support</h2>
          {result.pricedAddons.length ? (
            <ul className="result-support-list">
              {result.pricedAddons.map((addon) => (
                <li key={addon.addonKey}><span>{addon.name}</span><strong>{addon.startingAt ? "Starting at " : ""}{money.format(addon.priceUsd)}</strong></li>
              ))}
            </ul>
          ) : <p>No additional priced add-on is required for this recommendation.</p>}
        </section>

        <section className="result-card result-card--wide" aria-labelledby="scope-review-title">
          <p className="result-number">10 · Scope-review items</p>
          <h2 id="scope-review-title">Items to confirm before a proposal</h2>
          {result.scopeReviewItems.length ? (
            <ul className="result-support-list">
              {result.scopeReviewItems.map((item) => (
                <li key={item.key}>
                  <span>{item.label}<small>{item.reason}</small></span>
                  <strong>{item.startingPriceUsd ? `Starting at ${money.format(item.startingPriceUsd)}` : "Scope review"}</strong>
                </li>
              ))}
            </ul>
          ) : <p>No separate scope-review item was identified from your selections.</p>}
        </section>

        <section className="result-card result-card--wide" aria-labelledby="investment-title">
          <p className="result-number">11 · Itemized estimated project investment</p>
          <h2 id="investment-title">Estimated Project Investment</h2>
          <div className="investment-lines">
            <div><span>{result.recommendedOfferName}</span><strong>{money.format(result.basePriceUsd)}</strong></div>
            {result.pricedAddons.map((addon) => (
              <div key={addon.addonKey}><span>{addon.name}{addon.startingAt ? " (starting at)" : ""}</span><strong>{money.format(addon.priceUsd)}</strong></div>
            ))}
            <div className="investment-total"><span>Planning estimate</span><strong>{money.format(result.estimatedProjectInvestmentUsd)}</strong></div>
          </div>
          <p className="scope-note">This is a planning estimate, not a binding quotation. Final scope is confirmed before a proposal.</p>
        </section>

        <section className="result-card result-card--wide" aria-labelledby="recurring-title">
          <p className="result-number">12 · Recurring-cost notice</p>
          <h2 id="recurring-title">Costs kept separate from the build estimate</h2>
          <ul className="result-simple-list">
            {result.estimatedRecurringCosts.map((notice) => <li key={notice}>{notice}</li>)}
          </ul>
        </section>

        <section className="result-card" aria-labelledby="fit-title">
          <p className="result-number">13 · Why this fits</p>
          <h2 id="fit-title">A route shaped by your answers</h2>
          <p>{result.recommendationReason}</p>
        </section>

        <section className="result-card" aria-labelledby="future-title">
          <p className="result-number">14 · Suggested next phase</p>
          <h2 id="future-title">What can come next</h2>
          {result.futurePhaseSuggestions.length ? (
            <ul className="result-simple-list">{result.futurePhaseSuggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
          ) : <p>Keep the first phase focused, then expand only when the business needs it.</p>}
        </section>

        <section className="result-card result-card--wide" aria-labelledby="work-title">
          <p className="result-number">15 · Relevant projects</p>
          <h2 id="work-title">Related work</h2>
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

        <section className="result-card result-card--next result-card--wide" aria-labelledby="next-title">
          <p className="result-number">16 · Book a strategy call</p>
          <h2 id="next-title">Turn the roadmap into a practical scope</h2>
          <p>Book only if you want to review the recommendation and decide whether the next step is a fit.</p>
          <a className="quiz-primary" href="/booking/">Book a Strategy Call <span aria-hidden="true">→</span></a>
        </section>
      </div>

      <footer className="result-control">
        <div>
          <p className="result-number">Your control</p>
          <h2>Your result stays on this device</h2>
          <p>No lead was created. Clearing browser data or switching devices may remove this saved roadmap.</p>
        </div>
        <button className="quiz-back" onClick={onStartOver} type="button">Start a new assessment</button>
      </footer>
    </article>
  );
}
