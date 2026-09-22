import { QUIZ_DEFINITIONS } from "./questions";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type AudienceKey,
  type CortexResult,
  type SavedQuizAttempt,
} from "./types";

export const QUIZ_STORAGE_KEY = "elysha-works:quiz-attempt:v1";
export const QUIZ_STORAGE_VERSION = 1 as const;
export const QUIZ_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type LoadQuizAttemptResult =
  | { status: "valid"; attempt: SavedQuizAttempt }
  | { status: "missing" }
  | { status: "unavailable" }
  | {
      status: "discarded";
      reason: "expired" | "corrupt_json" | "invalid_shape" | "version_mismatch";
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;
const isOneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  typeof value === "string" && choices.includes(value as T);

const AUDIENCES = Object.keys(QUIZ_DEFINITIONS) as AudienceKey[];
const ROUTES = ["platform", "custom"] as const;
const PLATFORMS = ["systeme_io", "gohighlevel", "custom_app"] as const;
const SOLUTIONS = ["website", "funnel", "automation", "crm", "custom_app"] as const;
const READINESS = ["ready_now", "within_30_days", "planning_1_2_months", "researching"] as const;
const CONFIDENCE = ["standard", "low"] as const;
const DECISION_RULES = ["primary_solution", "build_route", "platform", "base_offer", "pricing"] as const;
const SCORE_KEYS = [
  "acquisitionNeed", "automationNeed", "systemComplexity", "website", "funnel",
  "automation", "crm", "customApp", "systeme", "ghl", "customBuild",
] as const;

function hasCompatibleVersions(value: Record<string, unknown>) {
  return (
    value.storageVersion === QUIZ_STORAGE_VERSION &&
    value.cortexVersion === CORTEX_VERSION &&
    value.questionSetVersion === QUESTION_SET_VERSION &&
    value.catalogVersion === CATALOG_VERSION
  );
}

function hasVersionFields(value: Record<string, unknown>) {
  return (
    "storageVersion" in value &&
    "cortexVersion" in value &&
    "questionSetVersion" in value &&
    "catalogVersion" in value
  );
}

function isAnswers(
  value: unknown,
  audienceKey: AudienceKey | null,
  requireComplete: boolean,
): value is SavedQuizAttempt["answers"] {
  if (!isRecord(value)) return false;
  if (audienceKey === null) return Object.keys(value).length === 0;
  const definition = QUIZ_DEFINITIONS[audienceKey];
  const questions = new Map(definition.questions.map((question) => [question.key, question]));
  for (const [questionKey, answer] of Object.entries(value)) {
    const question = questions.get(questionKey);
    if (!question || !isStringArray(answer) || new Set(answer).size !== answer.length) return false;
    if (question.selection === "single" && answer.length > 1) return false;
    const allowedOptions = new Set(question.options.map((option) => option.key));
    if (!answer.every((optionKey) => allowedOptions.has(optionKey))) return false;
  }
  return !requireComplete || definition.questions.every((question) => {
    const selected = value[question.key];
    return Array.isArray(selected) && (!question.required || selected.length > 0);
  });
}

function isScores(value: unknown): value is CortexResult["scores"] {
  return isRecord(value) && SCORE_KEYS.every((key) => isNonNegativeNumber(value[key]));
}

function isExplanationTrace(value: unknown): value is CortexResult["explanationTrace"] {
  return Array.isArray(value) && value.every((entry) => {
    if (!isRecord(entry)) return false;
    const before = entry.before;
    const after = entry.after;
    return isString(entry.questionKey) && isStringArray(entry.optionKeys) && isStringArray(entry.signals) &&
      isStringArray(entry.flags) && isRecord(before) && isRecord(after) &&
      isRecord(before.diagnostic) && isRecord(before.solutions) && isRecord(before.platforms) &&
      isRecord(after.diagnostic) && isRecord(after.solutions) && isRecord(after.platforms) &&
      [...Object.values(before.diagnostic), ...Object.values(before.solutions), ...Object.values(before.platforms),
        ...Object.values(after.diagnostic), ...Object.values(after.solutions), ...Object.values(after.platforms)]
        .every(isNonNegativeNumber);
  });
}

function isCortexResult(value: unknown, audienceKey: AudienceKey): value is CortexResult {
  if (!isRecord(value)) return false;
  const textFields = [
    "audienceLabel", "recommendedOfferKey", "recommendedOfferName", "recommendedOfferDescription",
    "recommendedSolutionTitle", "diagnosisSummary", "recommendationReason", "confidenceMessage",
  ];
  const arrays = [
    "recommendedOfferIncludedFeatures", "includedCapabilities", "selectedAddons",
    "futurePhaseSuggestions", "estimatedRecurringCosts",
  ];
  const selectedSupportValid = Array.isArray(value.selectedSupportItems) && value.selectedSupportItems.every((item) =>
    isRecord(item) && isString(item.key) && isString(item.label) &&
    isOneOf(item.disposition, ["included", "priced", "scope_review"] as const));
  const pricedAddonsValid = Array.isArray(value.pricedAddons) && value.pricedAddons.every((item) =>
    isRecord(item) && isString(item.addonKey) && isString(item.name) &&
    isNonNegativeNumber(item.priceUsd) && typeof item.startingAt === "boolean");
  const scopeReviewValid = Array.isArray(value.scopeReviewItems) && value.scopeReviewItems.every((item) =>
    isRecord(item) && isString(item.key) && isString(item.label) && isString(item.reason) &&
    (item.startingPriceUsd === undefined || isNonNegativeNumber(item.startingPriceUsd)));
  const decisionTraceValid = Array.isArray(value.decisionTrace) && value.decisionTrace.length === DECISION_RULES.length &&
    value.decisionTrace.every((entry, index) => isRecord(entry) && entry.ruleKey === DECISION_RULES[index] &&
      isString(entry.outcome) && isString(entry.reason));

  return value.cortexVersion === CORTEX_VERSION &&
    value.questionSetVersion === QUESTION_SET_VERSION && value.catalogVersion === CATALOG_VERSION &&
    value.audienceKey === audienceKey && textFields.every((key) => isString(value[key])) &&
    arrays.every((key) => isStringArray(value[key])) &&
    isOneOf(value.recommendedBuildRoute, ROUTES) && isOneOf(value.recommendedPlatform, PLATFORMS) &&
    isOneOf(value.primarySolutionType, SOLUTIONS) && isStringArray(value.supportingSolutionTypes) &&
    value.supportingSolutionTypes.every((solution) => SOLUTIONS.includes(solution as typeof SOLUTIONS[number])) &&
    isOneOf(value.readinessLevel, READINESS) && isOneOf(value.confidenceLevel, CONFIDENCE) &&
    isScores(value.scores) && selectedSupportValid && pricedAddonsValid && scopeReviewValid &&
    isExplanationTrace(value.explanationTrace) && decisionTraceValid &&
    isNonNegativeNumber(value.basePriceUsd) && isNonNegativeNumber(value.addonTotalUsd) &&
    value.adjustmentTotalUsd === 0 && isNonNegativeNumber(value.estimatedProjectInvestmentUsd);
}

function isSavedAttempt(value: unknown): value is SavedQuizAttempt {
  if (!isRecord(value)) return false;
  const audienceKey = value.audienceKey;
  const status = value.status;
  const validAudience = audienceKey === null || (typeof audienceKey === "string" && AUDIENCES.includes(audienceKey as AudienceKey));
  if (!validAudience) return false;
  const typedAudience = audienceKey as AudienceKey | null;
  const completed = status === "completed";
  const definition = typedAudience ? QUIZ_DEFINITIONS[typedAudience] : null;
  const resultValid = completed
    ? typedAudience !== null && isCortexResult(value.result, typedAudience)
    : value.result === null;
  return (
    hasCompatibleVersions(value) &&
    (status === "in_progress" || status === "completed") &&
    validAudience &&
    isAnswers(value.answers, typedAudience, completed) &&
    Number.isInteger(value.currentQuestionIndex) &&
    Number(value.currentQuestionIndex) >= 0 &&
    Number(value.currentQuestionIndex) <= (definition ? definition.questions.length - 1 : 0) &&
    resultValid &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt))
  );
}

export function loadQuizAttempt(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): LoadQuizAttemptResult {
  let raw: string | null;
  try {
    raw = storage.getItem(QUIZ_STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "missing" };

  const removeInvalidAttempt = () => {
    try { storage.removeItem(QUIZ_STORAGE_KEY); } catch { /* Storage may be blocked. */ }
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeInvalidAttempt();
    return { status: "discarded", reason: "corrupt_json" };
  }

  if (!isRecord(parsed)) {
    removeInvalidAttempt();
    return { status: "discarded", reason: "invalid_shape" };
  }
  if (!hasVersionFields(parsed)) {
    removeInvalidAttempt();
    return { status: "discarded", reason: "invalid_shape" };
  }
  if (!hasCompatibleVersions(parsed)) {
    removeInvalidAttempt();
    return { status: "discarded", reason: "version_mismatch" };
  }
  if (!isSavedAttempt(parsed)) {
    removeInvalidAttempt();
    return { status: "discarded", reason: "invalid_shape" };
  }
  if (now > Date.parse(parsed.expiresAt)) {
    removeInvalidAttempt();
    return { status: "discarded", reason: "expired" };
  }
  return { status: "valid", attempt: parsed };
}

export function saveQuizAttempt(
  storage: Pick<Storage, "setItem">,
  attempt: SavedQuizAttempt,
) {
  try {
    storage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
}

export function clearQuizAttempt(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(QUIZ_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
