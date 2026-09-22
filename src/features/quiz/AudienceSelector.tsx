import { QUIZ_DEFINITIONS } from "./questions";
import type { AudienceKey } from "./types";

interface AudienceSelectorProps {
  onSelect: (audienceKey: AudienceKey) => void;
}

const audienceNumbers: Record<AudienceKey, string> = {
  coaches_educators: "01",
  service_businesses: "02",
  custom_order_businesses: "03",
};

export function AudienceSelector({ onSelect }: AudienceSelectorProps) {
  return (
    <section className="quiz-stage quiz-audience" aria-labelledby="audience-title">
      <p className="quiz-kicker">Personalized system roadmap</p>
      <h1 id="audience-title">Which best describes your business?</h1>
      <p className="quiz-lede">
        Choose the closest fit. Your answers stay on this device until you decide to take the next step.
      </p>
      <div className="audience-grid">
        {Object.values(QUIZ_DEFINITIONS).map((definition) => (
          <button
            className="audience-card"
            key={definition.audienceKey}
            onClick={() => onSelect(definition.audienceKey)}
            type="button"
          >
            <span className="audience-number">{audienceNumbers[definition.audienceKey]}</span>
            <strong>{definition.label}</strong>
            <span>{definition.description}</span>
            <span className="audience-action" aria-hidden="true">Choose this path →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
