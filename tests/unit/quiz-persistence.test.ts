import { describe, expect, it } from "vitest";

import {
  QUIZ_STORAGE_KEY,
  QUIZ_STORAGE_VERSION,
  QUIZ_TTL_MS,
  clearQuizAttempt,
  loadQuizAttempt,
  saveQuizAttempt,
} from "@/features/quiz/persistence";
import { calculateRecommendation } from "@/features/quiz/cortex";
import { defaultRoadmapSelection } from "@/features/quiz/roadmap-options";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type SavedQuizAttempt,
} from "@/features/quiz/types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class ThrowingStorage extends MemoryStorage {
  override getItem(_key: string): string | null { throw new DOMException("Storage blocked", "SecurityError"); }
  override setItem(_key: string, _value: string): void { throw new DOMException("Storage blocked", "QuotaExceededError"); }
  override removeItem(_key: string): void { throw new DOMException("Storage blocked", "SecurityError"); }
}

const NOW = Date.UTC(2026, 8, 22, 0, 0, 0);
const attempt = (overrides: Partial<SavedQuizAttempt> = {}): SavedQuizAttempt => ({
  storageVersion: 3,
  cortexVersion: CORTEX_VERSION,
  questionSetVersion: QUESTION_SET_VERSION,
  catalogVersion: CATALOG_VERSION,
  status: "in_progress",
  audienceKey: "coaches_educators",
  answers: { q1_goal: ["coach_goal_enroll_students"] },
  currentQuestionIndex: 1,
  result: null,
  roadmapSelection: null,
  createdAt: new Date(NOW - 60_000).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + QUIZ_TTL_MS).toISOString(),
  ...overrides,
});

const completeAnswers = {
  q1_goal: ["coach_goal_enroll_students"],
  q2_setup: ["coach_setup_unclear_website"],
  q3_blocker: ["coach_blocker_questions_no_booking"],
  q4_capabilities: ["coach_capability_booking"],
  q5_complexity: ["coach_complexity_one_offer"],
  q6_readiness: ["readiness_ready_now"],
  q7_platform: ["platform_recommend"],
  q8_support: ["support_client_assets"],
} as const;

const completedAttempt = (overrides: Partial<SavedQuizAttempt> = {}): SavedQuizAttempt => {
  const result = calculateRecommendation({ audienceKey: "coaches_educators", answers: completeAnswers });
  return attempt({
    status: "completed",
    currentQuestionIndex: 7,
    answers: completeAnswers,
    result,
    roadmapSelection: defaultRoadmapSelection(result),
    ...overrides,
  });
};

describe("quiz local persistence", () => {
  it("round-trips a valid versioned attempt", () => {
    const storage = new MemoryStorage();
    saveQuizAttempt(storage, attempt());
    expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "valid", attempt: attempt() });
  });

  it("never serializes contact identity or email into browser storage", () => {
    const storage = new MemoryStorage();
    saveQuizAttempt(storage, {
      ...attempt(),
      clientIdentity: { firstName: "Mara", businessName: "Mara Coaching" },
      contact: { email: "mara@example.com" },
    } as SavedQuizAttempt);
    const raw = storage.getItem(QUIZ_STORAGE_KEY) ?? "";
    expect(raw).not.toContain("Mara");
    expect(raw).not.toContain("Mara Coaching");
    expect(raw).not.toContain("mara@example.com");
  });

  it("uses a 72-hour recovery window and keeps an attempt valid at the exact boundary", () => {
    expect(QUIZ_TTL_MS).toBe(72 * 60 * 60 * 1000);
    const storage = new MemoryStorage();
    saveQuizAttempt(storage, attempt({ expiresAt: new Date(NOW).toISOString() }));
    expect(loadQuizAttempt(storage, NOW).status).toBe("valid");
  });

  it("discards expired, corrupt, incomplete, and incompatible attempts safely", () => {
    const cases: Array<[string, string, string]> = [
      ["expired", JSON.stringify(attempt({ expiresAt: new Date(NOW - 1).toISOString() })), "expired"],
      ["corrupt", "{not-json", "corrupt_json"],
      ["missing", JSON.stringify({ storageVersion: 3 }), "invalid_shape"],
      ["audience", JSON.stringify({ ...attempt(), audienceKey: "unknown" }), "invalid_shape"],
      ["storage version", JSON.stringify({ ...attempt(), storageVersion: 4 }), "version_mismatch"],
      ["cortex version", JSON.stringify({ ...attempt(), cortexVersion: "future" }), "version_mismatch"],
      ["question version", JSON.stringify({ ...attempt(), questionSetVersion: "future" }), "version_mismatch"],
      ["catalog version", JSON.stringify({ ...attempt(), catalogVersion: "future" }), "version_mismatch"],
    ];

    for (const [, value, reason] of cases) {
      const storage = new MemoryStorage();
      storage.setItem(QUIZ_STORAGE_KEY, value);
      expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "discarded", reason });
      expect(storage.getItem(QUIZ_STORAGE_KEY)).toBeNull();
    }
  });

  it("returns missing without throwing and clears only the quiz key", () => {
    const storage = new MemoryStorage();
    storage.setItem("unrelated", "keep");
    expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "missing" });
    saveQuizAttempt(storage, attempt());
    clearQuizAttempt(storage);
    expect(storage.getItem(QUIZ_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
  });

  it("degrades safely when browser storage is blocked or full", () => {
    const storage = new ThrowingStorage();
    expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "unavailable" });
    expect(saveQuizAttempt(storage, attempt())).toBe(false);
    expect(clearQuizAttempt(storage)).toBe(false);
  });

  it("rejects unknown questions, invalid options, and malformed completed snapshots", () => {
    for (const value of [
      { ...attempt(), answers: { unexpected_question: ["anything"] } },
      { ...attempt(), answers: { q1_goal: ["not_an_approved_option"] } },
      { ...attempt(), status: "completed", result: {} },
    ]) {
      const storage = new MemoryStorage();
      storage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(value));
      expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "discarded", reason: "invalid_shape" });
    }
  });

  it("preserves a completed immutable result snapshot", () => {
    const storage = new MemoryStorage();
    const completed = completedAttempt();
    saveQuizAttempt(storage, completed);
    expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "valid", attempt: completed });
  });

  it("discards legacy pre-contact progress but preserves completed v2 results without extending expiry", () => {
    const inProgressStorage = new MemoryStorage();
    inProgressStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify({ ...attempt(), storageVersion: 2 }));
    expect(loadQuizAttempt(inProgressStorage, NOW)).toEqual({ status: "discarded", reason: "invalid_shape" });

    const completedStorage = new MemoryStorage();
    const legacyExpiry = new Date(NOW + (10 * QUIZ_TTL_MS)).toISOString();
    completedStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify({
      ...completedAttempt({ expiresAt: legacyExpiry }),
      storageVersion: 2,
      clientIdentity: undefined,
    }));
    const loaded = loadQuizAttempt(completedStorage, NOW);
    expect(loaded.status).toBe("valid");
    if (loaded.status === "valid") {
      expect(loaded.attempt.storageVersion).toBe(QUIZ_STORAGE_VERSION);
      expect("clientIdentity" in loaded.attempt).toBe(false);
      expect(loaded.attempt.expiresAt).toBe(new Date(NOW + QUIZ_TTL_MS).toISOString());
    }
  });
});
