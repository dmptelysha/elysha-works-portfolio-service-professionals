import { describe, expect, it } from "vitest";

import {
  QUIZ_STORAGE_KEY,
  QUIZ_TTL_MS,
  clearQuizAttempt,
  loadQuizAttempt,
  saveQuizAttempt,
} from "@/features/quiz/persistence";
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

const NOW = Date.UTC(2026, 8, 22, 0, 0, 0);
const attempt = (overrides: Partial<SavedQuizAttempt> = {}): SavedQuizAttempt => ({
  storageVersion: 1,
  cortexVersion: CORTEX_VERSION,
  questionSetVersion: QUESTION_SET_VERSION,
  catalogVersion: CATALOG_VERSION,
  status: "in_progress",
  audienceKey: "coaches_educators",
  answers: { q1_goal: ["coach_goal_enroll_students"] },
  currentQuestionIndex: 1,
  result: null,
  createdAt: new Date(NOW - 60_000).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + QUIZ_TTL_MS).toISOString(),
  ...overrides,
});

describe("quiz local persistence", () => {
  it("round-trips a valid versioned attempt", () => {
    const storage = new MemoryStorage();
    saveQuizAttempt(storage, attempt());
    expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "valid", attempt: attempt() });
  });

  it("keeps an attempt valid exactly at the 30-day boundary", () => {
    const storage = new MemoryStorage();
    saveQuizAttempt(storage, attempt({ expiresAt: new Date(NOW).toISOString() }));
    expect(loadQuizAttempt(storage, NOW).status).toBe("valid");
  });

  it("discards expired, corrupt, incomplete, and incompatible attempts safely", () => {
    const cases: Array<[string, string, string]> = [
      ["expired", JSON.stringify(attempt({ expiresAt: new Date(NOW - 1).toISOString() })), "expired"],
      ["corrupt", "{not-json", "corrupt_json"],
      ["missing", JSON.stringify({ storageVersion: 1 }), "invalid_shape"],
      ["audience", JSON.stringify({ ...attempt(), audienceKey: "unknown" }), "invalid_shape"],
      ["storage version", JSON.stringify({ ...attempt(), storageVersion: 2 }), "version_mismatch"],
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

  it("preserves a completed immutable result snapshot", () => {
    const storage = new MemoryStorage();
    const completed = attempt({
      status: "completed",
      currentQuestionIndex: 7,
      result: {
        cortexVersion: CORTEX_VERSION,
        questionSetVersion: QUESTION_SET_VERSION,
        catalogVersion: CATALOG_VERSION,
        audienceKey: "coaches_educators",
        recommendedBuildRoute: "platform",
        recommendedPlatform: "systeme_io",
        recommendedOfferKey: "platform_growth",
        primarySolutionType: "funnel",
        supportingSolutionTypes: [],
        recommendedSolutionTitle: "Enrollment Funnel",
        diagnosisSummary: "Snapshot",
        recommendationReason: "Reason",
        includedCapabilities: [],
        selectedAddons: [],
        pricedAddons: [],
        scopeReviewItems: [],
        futurePhaseSuggestions: [],
        scores: { acquisitionNeed: 1, automationNeed: 1, systemComplexity: 1, website: 1, funnel: 5, automation: 1, crm: 1, customApp: 0, systeme: 5, ghl: 1, customBuild: 0 },
        readinessLevel: "ready_now",
        basePriceUsd: 2500,
        addonTotalUsd: 0,
        adjustmentTotalUsd: 0,
        estimatedProjectInvestmentUsd: 2500,
        estimatedRecurringCosts: [],
        explanationTrace: [],
      },
    });
    saveQuizAttempt(storage, completed);
    expect(loadQuizAttempt(storage, NOW)).toEqual({ status: "valid", attempt: completed });
  });
});
