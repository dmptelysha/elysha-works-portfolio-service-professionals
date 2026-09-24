import { buildRoadmapTiers } from "./roadmap-options";
import type { CortexResult, PlatformKey, RoadmapSelection, RoadmapVariant } from "./types";

const platformNames: Record<PlatformKey, string> = {
  systeme_io: "Systeme.io",
  gohighlevel: "HighLevel",
  custom_app: "Custom App",
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

interface RoadmapComparisonProps {
  result: CortexResult;
  selection: RoadmapSelection;
  onSelect: (selection: RoadmapSelection) => void;
  locked?: boolean;
}

function chooseVariant(variant: RoadmapVariant, tierKey: RoadmapSelection["tierKey"], onSelect: RoadmapComparisonProps["onSelect"]) {
  if (!variant.feasibility.available) return;
  onSelect({ tierKey, platform: variant.platform, offerKey: variant.offer.offerKey });
}

export function RoadmapComparison({ result, selection, onSelect, locked = false }: RoadmapComparisonProps) {
  const tiers = buildRoadmapTiers(result);

  return (
    <section className="roadmap-comparison" aria-labelledby="roadmap-comparison-title">
      <header>
        <p className="result-number">06 · Package and platform choices</p>
        <h2 id="roadmap-comparison-title">Compare your roadmap options</h2>
        <p>Every tier is designed to work. Higher tiers add connected automation, visibility, and operational depth.</p>
      </header>
      <div className="roadmap-tier-grid">
        {tiers.map((tier) => {
          const selectedVariant = tier.variants.find((variant) => variant.platform === selection.platform && selection.tierKey === tier.tierKey)
            ?? tier.variants.find((variant) => variant.platform === result.recommendedPlatform && variant.feasibility.available)
            ?? tier.variants.find((variant) => variant.feasibility.available)!;
          const unavailable = tier.variants.find((variant) => !variant.feasibility.available);
          const isSelectedTier = selection.tierKey === tier.tierKey;
          return (
            <article className={`roadmap-tier-card${isSelectedTier ? " roadmap-tier-card--selected" : ""}`} key={tier.tierKey}>
              <div className="roadmap-tier-heading">
                <div>
                  <p>{tier.recommended ? "Recommended tier" : "Available tier"}</p>
                  <h3>{tier.label}</h3>
                </div>
                {isSelectedTier ? <strong>{locked ? "Proposal confirmed" : "Your selection"}</strong> : null}
              </div>
              <p className="roadmap-tier-promise">{tier.promise}</p>
              <div className="roadmap-platforms" role="group" aria-label={`${tier.label} platform`}>
                {tier.variants.map((variant) => (
                  <button
                    key={variant.platform}
                    type="button"
                    disabled={locked || !variant.feasibility.available}
                    aria-pressed={selection.tierKey === tier.tierKey && selection.platform === variant.platform}
                    onClick={() => chooseVariant(variant, tier.tierKey, onSelect)}
                  >
                    {platformNames[variant.platform]}
                  </button>
                ))}
              </div>
              {unavailable && !unavailable.feasibility.available ? <p className="roadmap-unavailable">{unavailable.feasibility.reason}</p> : null}
              <div className="roadmap-tier-price">
                <span>Starting build</span>
                <strong>{money.format(selectedVariant.offer.basePriceUsd)}{selectedVariant.offer.startingPrice ? "+" : ""}</strong>
              </div>
              <ul>
                {selectedVariant.offer.includedFeatures.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button
                className="roadmap-choose"
                type="button"
                disabled={locked || !selectedVariant.feasibility.available}
                onClick={() => chooseVariant(selectedVariant, tier.tierKey, onSelect)}
              >
                {isSelectedTier ? "Selected roadmap" : "Choose this roadmap"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
