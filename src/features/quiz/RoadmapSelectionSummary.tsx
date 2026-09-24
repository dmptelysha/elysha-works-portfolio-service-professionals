import { resolveRoadmapSelection } from "./roadmap-options";
import type { CortexResult, PlatformKey, ProjectPriceQuote, RoadmapSelection } from "./types";

const platformNames: Record<PlatformKey, string> = {
  systeme_io: "Systeme.io",
  gohighlevel: "HighLevel",
  custom_app: "Custom App",
};
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function RoadmapSelectionSummary({ result, selection, quote }: { result: CortexResult; selection: RoadmapSelection; quote?: ProjectPriceQuote }) {
  const selected = resolveRoadmapSelection(result, selection);
  const includedSupport = selected.selectedSupportItems.filter((item) => item.disposition === "included");

  return (
    <section className="roadmap-selection-summary" aria-labelledby="selected-roadmap-title">
      <div className="roadmap-selection-heading">
        <div>
          <p className="result-number">07 · Your selection</p>
          <h2 id="selected-roadmap-title">Your selected roadmap</h2>
        </div>
        <span>{selection.tierKey} · {platformNames[selection.platform]}</span>
      </div>
      <div className="selected-roadmap-offer">
        <div><span>Approved offer</span><strong>{selected.offer.name}</strong></div>
        <div><span>Base build</span><strong>{money.format(selected.basePriceUsd)}{selected.offer.startingPrice ? "+" : ""}</strong></div>
      </div>
      <p>{selected.offer.description}</p>
      <div className="selected-roadmap-columns">
        <div>
          <h3>Included in this route</h3>
          <ul className="result-check-list">
            {selected.offer.includedFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            {includedSupport.map((item) => <li key={item.key}>{item.label}</li>)}
          </ul>
        </div>
        <div>
          <h3>Estimate</h3>
          <div className="investment-lines">
            <div><span>{selected.offer.name}</span><strong>{money.format(selected.basePriceUsd)}</strong></div>
            {selected.pricedAddons.map((addon) => <div key={addon.addonKey}><span>{addon.name}</span><strong>{money.format(addon.priceUsd)}</strong></div>)}
            <div className="investment-total"><span>Planning estimate</span><strong>{money.format(quote?.finalTotalUsd ?? selected.estimatedProjectInvestmentUsd)}{selected.offer.startingPrice ? "+" : ""}</strong></div>
          </div>
          {selected.scopeReviewItems.length ? (
            <div className="selected-scope-review"><strong>Confirm during scope review</strong><ul>{selected.scopeReviewItems.map((item) => <li key={item.key}>{item.label}</li>)}</ul></div>
          ) : null}
        </div>
      </div>
      <p className="scope-note">This is a planning recommendation, not a binding quotation. Final scope is confirmed before a proposal or payment.</p>
    </section>
  );
}
