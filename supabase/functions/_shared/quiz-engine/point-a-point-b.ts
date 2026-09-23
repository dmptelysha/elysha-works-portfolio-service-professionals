import { QUIZ_DEFINITIONS } from "./questions.ts";
import type { AudienceKey, PointABSummary, QuizAnswers } from "./types.ts";

const POINT_A_KEYS = ["q3_current_journey", "q4_bottlenecks", "q5_demand_health"] as const;
const POINT_B_KEYS = ["q2_goal", "q6_customer_requirements"] as const;

function resolveEvidence(
  audienceKey: AudienceKey,
  answers: QuizAnswers,
  questionKeys: readonly string[],
) {
  const definition = QUIZ_DEFINITIONS[audienceKey];
  if (!definition) throw new Error(`Unknown audience key: ${audienceKey}`);

  return questionKeys.flatMap((questionKey) => {
    const question = definition.questions.find((item) => item.key === questionKey);
    if (!question) throw new Error(`Unknown question key: ${questionKey}`);
    const options = new Map(question.options.map((option) => [option.key, option.label]));
    return (answers[questionKey] ?? []).map((optionKey) => {
      const label = options.get(optionKey);
      if (!label) throw new Error(`Unknown option key "${optionKey}" for ${questionKey}`);
      return label;
    });
  });
}

export function buildPointABSummary(
  businessName: string,
  audienceKey: AudienceKey,
  answers: QuizAnswers,
): PointABSummary {
  const normalizedBusinessName = businessName.trim();
  if (!normalizedBusinessName) throw new Error("Business name is required");
  const pointAEvidence = resolveEvidence(audienceKey, answers, POINT_A_KEYS);
  const pointBEvidence = resolveEvidence(audienceKey, answers, POINT_B_KEYS);
  if (pointAEvidence.length < 3 || pointBEvidence.length < 2) {
    throw new Error("Point A and Point B require complete approved answers");
  }

  return Object.freeze({
    pointA: Object.freeze({
      heading: `Where ${normalizedBusinessName} is now`,
      summary: `${normalizedBusinessName} currently relies on ${pointAEvidence[0].replace(/\.$/, "").toLowerCase()}. The assessment identified ${pointAEvidence[1].replace(/\.$/, "").toLowerCase()} as the first constraint to address.`,
      evidence: Object.freeze(pointAEvidence),
    }),
    pointB: Object.freeze({
      heading: "Where the business wants to go",
      summary: `The target is to ${pointBEvidence[0].replace(/\.$/, "").toLowerCase()}, supported by a customer journey that can ${pointBEvidence.slice(1, 3).map((item) => item.replace(/\.$/, "").toLowerCase()).join(" and ")}.`,
      evidence: Object.freeze(pointBEvidence),
    }),
  });
}
