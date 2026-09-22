import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizExperience } from "@/features/quiz/QuizExperience";
import { QUIZ_DEFINITIONS } from "@/features/quiz/questions";
import { QUIZ_STORAGE_KEY, QUIZ_TTL_MS } from "@/features/quiz/persistence";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type SavedQuizAttempt,
} from "@/features/quiz/types";

describe("local portfolio quiz", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("completes all eight questions without navigation or network calls", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const initialUrl = window.location.href;

    render(<QuizExperience />);
    expect(await screen.findByRole("heading", { name: /which best describes your business/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/elysha-works-privacy-policy/");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/elysha-works-terms-of-service/");
    await user.click(screen.getByRole("button", { name: /service-based business/i }));
    expect(screen.getByRole("heading", { name: /your roadmap starts with context/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const definition = QUIZ_DEFINITIONS.service_businesses;
    for (const [index, question] of definition.questions.entries()) {
      expect(screen.getByText(`Question ${index + 1} of 8`)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: question.prompt })).toBeInTheDocument();
      const option = screen.getByRole(question.selection === "single" ? "radio" : "button", { name: question.options[0].label });
      await user.click(option);
      if (question.selection === "single") expect(option).toHaveAttribute("aria-checked", "true");
      await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
    }

    expect(await screen.findByRole("heading", { name: /your personalized roadmap/i })).toBeInTheDocument();
    for (const block of [
      "01 · Business snapshot",
      "02 · Growth blocker",
      "03 · Primary recommended solution",
      "04 · Supporting components",
      "05 · Build route and platform",
      "06 · Recommended base offer",
      "07 · Included capabilities",
      "08 · Selected support",
      "09 · Priced add-ons",
      "10 · Scope-review items",
      "11 · Itemized estimated project investment",
      "12 · Recurring-cost notice",
      "13 · Why this fits",
      "14 · Suggested next phase",
      "15 · Relevant projects",
      "16 · Book a strategy call",
    ]) {
      expect(screen.getByText(block)).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: /estimated project investment/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /book a strategy call/i })).toHaveAttribute("href", "/booking/");
    expect(screen.getByRole("navigation", { name: /quiz footer/i })).toBeInTheDocument();
    expect(window.location.href).toBe(initialUrl);
    expect(fetchSpy).not.toHaveBeenCalled();

    const saved = JSON.parse(localStorage.getItem(QUIZ_STORAGE_KEY) ?? "null") as SavedQuizAttempt;
    expect(saved.status).toBe("completed");
    expect(saved.result?.recommendedOfferKey).toBeTruthy();
  });

  it("supports the complete keyboard pattern for single-choice radio groups", async () => {
    const user = userEvent.setup();
    render(<QuizExperience />);
    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const radios = screen.getAllByRole("radio");
    radios[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{End}");
    expect(radios.at(-1)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(radios[0]).toHaveFocus();
  });

  it("shows truthful recovery copy when local storage writes are unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    render(<QuizExperience />);
    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/recovery is unavailable/i);
    expect(screen.getByText(/recovery is unavailable in this browser/i)).toBeInTheDocument();
  });

  it("offers resume, start-over, and not-now choices for an unfinished attempt", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const attempt: SavedQuizAttempt = {
      storageVersion: 1,
      cortexVersion: CORTEX_VERSION,
      questionSetVersion: QUESTION_SET_VERSION,
      catalogVersion: CATALOG_VERSION,
      status: "in_progress",
      audienceKey: "coaches_educators",
      answers: { q1_goal: ["coach_goal_book_calls"] },
      currentQuestionIndex: 1,
      result: null,
      createdAt: new Date(now - 60_000).toISOString(),
      updatedAt: new Date(now - 30_000).toISOString(),
      expiresAt: new Date(now + QUIZ_TTL_MS).toISOString(),
    };
    localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(attempt));

    const { unmount } = render(<QuizExperience />);
    const dialog = await screen.findByRole("dialog", { name: /continue your roadmap/i });
    const resumeButton = within(dialog).getByRole("button", { name: /resume/i });
    expect(resumeButton).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: /start over/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /not now/i })).toBeInTheDocument();
    const notNowButton = within(dialog).getByRole("button", { name: /not now/i });
    notNowButton.focus();
    await user.tab();
    expect(resumeButton).toHaveFocus();
    await user.click(resumeButton);
    expect(screen.getByText("Question 2 of 8")).toBeInTheDocument();

    unmount();
    render(<QuizExperience />);
    await user.click(within(await screen.findByRole("dialog", { name: /continue your roadmap/i })).getByRole("button", { name: /start over/i }));
    expect(screen.getByRole("heading", { name: /which best describes your business/i })).toBeInTheDocument();
    expect(localStorage.getItem(QUIZ_STORAGE_KEY)).toBeNull();
  });

  it("restores a completed result directly and keeps personal details optional", async () => {
    const user = userEvent.setup();
    render(<QuizExperience />);
    await user.click(await screen.findByRole("button", { name: /custom-order business/i }));
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const definition = QUIZ_DEFINITIONS.custom_order_businesses;
    for (const [index, question] of definition.questions.entries()) {
      await user.click(screen.getByRole(question.selection === "single" ? "radio" : "button", { name: question.options[0].label }));
      await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
    }
    await screen.findByRole("heading", { name: /your personalized roadmap/i });
    expect(screen.queryByRole("textbox", { name: /name|email|phone/i })).not.toBeInTheDocument();

    const saved = localStorage.getItem(QUIZ_STORAGE_KEY);
    expect(saved).not.toBeNull();
    localStorage.setItem(QUIZ_STORAGE_KEY, saved!);
    render(<QuizExperience />);
    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: /your personalized roadmap/i })).toHaveLength(2);
    });
  });
});
