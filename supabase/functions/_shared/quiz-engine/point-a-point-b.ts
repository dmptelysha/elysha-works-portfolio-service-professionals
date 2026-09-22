import { QUIZ_DEFINITIONS } from "./questions.ts";
import type { AudienceKey, PointABSummary, QuizAnswers } from "./types.ts";

const POINT_A_KEYS = ["q2_setup", "q3_blocker"] as const;
const POINT_B_KEYS = ["q1_goal", "q4_capabilities"] as const;

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
  if (pointAEvidence.length !== 2 || pointBEvidence.length < 2) {
    throw new Error("Point A and Point B require complete approved answers");
  }

  return Object.freeze({
    pointA: Object.freeze({
      heading: `Where ${normalizedBusinessName} is now`,
      summary: `${normalizedBusinessName} is working from a current setup with a clear operational or conversion blocker.`,
      evidence: Object.freeze(pointAEvidence),
    }),
    pointB: Object.freeze({
      heading: "Where the business wants to go",
      summary: "The target is a clearer customer journey supported by the capabilities selected in the assessment.",
      evidence: Object.freeze(pointBEvidence),
    }),
  });
}
