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
    await user.click(screen.getByRole("button", { name: /service-based business/i }));
    expect(screen.getByRole("heading", { name: /your roadmap starts with context/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const definition = QUIZ_DEFINITIONS.service_businesses;
    for (const [index, question] of definition.questions.entries()) {
      expect(screen.getByText(`Question ${index + 1} of 8`)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: question.prompt })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: question.options[0].label }));
      await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
    }

    expect(await screen.findByRole("heading", { name: /your personalized roadmap/i })).toBeInTheDocument();
    expect(screen.getByText(/recommended system/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /estimated project investment/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /book a strategy call/i })).toHaveAttribute("href", "/booking/");
    expect(window.location.href).toBe(initialUrl);
    expect(fetchSpy).not.toHaveBeenCalled();

    const saved = JSON.parse(localStorage.getItem(QUIZ_STORAGE_KEY) ?? "null") as SavedQuizAttempt;
    expect(saved.status).toBe("completed");
    expect(saved.result?.recommendedOfferKey).toBeTruthy();
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
    expect(within(dialog).getByRole("button", { name: /resume/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /start over/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /not now/i })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /resume/i }));
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
      await user.click(screen.getByRole("button", { name: question.options[0].label }));
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
