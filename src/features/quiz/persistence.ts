import { QUIZ_DEFINITIONS } from "./questions";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type SavedQuizAttempt,
} from "./types";

export const QUIZ_STORAGE_KEY = "elysha-works:quiz-attempt:v1";
export const QUIZ_STORAGE_VERSION = 1 as const;
export const QUIZ_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type LoadQuizAttemptResult =
  | { status: "valid"; attempt: SavedQuizAttempt }
  | { status: "missing" }
  | {
      status: "discarded";
      reason: "expired" | "corrupt_json" | "invalid_shape" | "version_mismatch";
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

function isAnswers(value: unknown): value is SavedQuizAttempt["answers"] {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (answer) => Array.isArray(answer) && answer.every((option) => typeof option === "string"),
    )
  );
}

function isSavedAttempt(value: unknown): value is SavedQuizAttempt {
  if (!isRecord(value)) return false;
  const audienceKey = value.audienceKey;
  const status = value.status;
  const resultValid = value.result === null || isRecord(value.result);
  return (
    hasCompatibleVersions(value) &&
    (status === "in_progress" || status === "completed") &&
    (audienceKey === null ||
      (typeof audienceKey === "string" && audienceKey in QUIZ_DEFINITIONS)) &&
    isAnswers(value.answers) &&
    Number.isInteger(value.currentQuestionIndex) &&
    Number(value.currentQuestionIndex) >= 0 &&
    Number(value.currentQuestionIndex) <= 7 &&
    resultValid &&
    (status !== "completed" || isRecord(value.result)) &&
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
  const raw = storage.getItem(QUIZ_STORAGE_KEY);
  if (raw === null) return { status: "missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(QUIZ_STORAGE_KEY);
    return { status: "discarded", reason: "corrupt_json" };
  }

  if (!isRecord(parsed)) {
    storage.removeItem(QUIZ_STORAGE_KEY);
    return { status: "discarded", reason: "invalid_shape" };
  }
  if (!hasVersionFields(parsed)) {
    storage.removeItem(QUIZ_STORAGE_KEY);
    return { status: "discarded", reason: "invalid_shape" };
  }
  if (!hasCompatibleVersions(parsed)) {
    storage.removeItem(QUIZ_STORAGE_KEY);
    return { status: "discarded", reason: "version_mismatch" };
  }
  if (!isSavedAttempt(parsed)) {
    storage.removeItem(QUIZ_STORAGE_KEY);
    return { status: "discarded", reason: "invalid_shape" };
  }
  if (now > Date.parse(parsed.expiresAt)) {
    storage.removeItem(QUIZ_STORAGE_KEY);
    return { status: "discarded", reason: "expired" };
  }
  return { status: "valid", attempt: parsed };
}

export function saveQuizAttempt(
  storage: Pick<Storage, "setItem">,
  attempt: SavedQuizAttempt,
) {
  storage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(attempt));
}

export function clearQuizAttempt(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(QUIZ_STORAGE_KEY);
}
