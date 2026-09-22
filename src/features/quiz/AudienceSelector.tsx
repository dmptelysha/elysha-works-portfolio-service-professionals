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
      <aside
        className="assessment-instructions"
        id="assessment-instructions"
        aria-labelledby="assessment-instructions-title"
      >
        <p className="quiz-kicker">How the assessment works</p>
        <h2 id="assessment-instructions-title">A clear roadmap in three steps.</h2>
        <ol>
          <li><span>01</span><strong>Choose your business type</strong><small>We tailor the questions to how your audience buys and works with you.</small></li>
          <li><span>02</span><strong>Answer eight focused questions</strong><small>Your goals, workflow, and must-have capabilities shape the recommendation.</small></li>
          <li><span>03</span><strong>Compare your best-fit options</strong><small>See the recommended tier, feasible platforms, inclusions, and planning price.</small></li>
        </ol>
      </aside>
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
