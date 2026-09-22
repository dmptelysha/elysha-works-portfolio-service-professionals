import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizExperience } from "@/features/quiz/QuizExperience";
import { LeadContactStep } from "@/features/quiz/LeadContactStep";
import { QUIZ_DEFINITIONS } from "@/features/quiz/questions";
import { QUIZ_STORAGE_KEY, QUIZ_TTL_MS } from "@/features/quiz/persistence";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type SavedQuizAttempt,
} from "@/features/quiz/types";

async function completeContactStep(
  user: ReturnType<typeof userEvent.setup>,
  values = { firstName: "Mara", businessName: "Mara Consulting", email: "Mara@Example.com" },
) {
  await user.type(screen.getByLabelText(/first name/i), values.firstName);
  await user.type(screen.getByLabelText(/business name/i), values.businessName);
  await user.type(screen.getByLabelText(/^email/i), values.email);
  await user.click(screen.getByRole("checkbox", { name: /initial proposal.*up to three follow-ups/i }));
  await user.click(screen.getByRole("button", { name: /continue to assessment/i }));
}

describe("local portfolio quiz", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("validates and normalizes required lead contact details without navigating", async () => {
    const user = userEvent.setup();
    const initialUrl = window.location.href;
    let submitted: unknown = null;
    render(<LeadContactStep onSubmit={async (contact) => { submitted = contact; }} />);

    const submit = screen.getByRole("button", { name: /continue to assessment/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/first name/i), "  Mara  ");
    await user.type(screen.getByLabelText(/business name/i), "  Mara Consulting  ");
    await user.type(screen.getByLabelText(/^email/i), "  MARA@EXAMPLE.COM  ");
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /initial proposal.*up to three follow-ups/i }));
    await user.click(submit);

    await waitFor(() => expect(submitted).toEqual({
      firstName: "Mara",
      businessName: "Mara Consulting",
      email: "mara@example.com",
      consent: true,
    }));
    expect(window.location.href).toBe(initialUrl);
  });

  it("retains contact fields and announces a submission failure", async () => {
    const user = userEvent.setup();
    render(<LeadContactStep onSubmit={async () => { throw new Error("Backend unavailable"); }} />);
    await completeContactStep(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your details/i);
    expect(screen.getByLabelText(/first name/i)).toHaveValue("Mara");
    expect(screen.getByLabelText(/business name/i)).toHaveValue("Mara Consulting");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("Mara@Example.com");
  });

  it("completes all eight questions without navigation or network calls", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const initialUrl = window.location.href;

    render(<QuizExperience />);
    expect(await screen.findByRole("heading", { name: /which best describes your business/i })).toBeInTheDocument();
    const instructions = screen.getByRole("complementary", { name: /clear roadmap in three steps/i });
    expect(instructions).toHaveAttribute("id", "assessment-instructions");
    expect(within(instructions).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/elysha-works-privacy-policy/");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/elysha-works-terms-of-service/");
    await user.click(screen.getByRole("button", { name: /service-based business/i }));
    expect(screen.getByRole("heading", { name: /where should we send your 3-day proposal/i })).toBeInTheDocument();
    await completeContactStep(user);
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

    expect(await screen.findByRole("heading", { name: /Mara.*Mara Consulting/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /compare your roadmap options/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^basic$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^advanced$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^complete$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^systeme\.io$/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^highlevel$/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^custom app$/i })).toHaveLength(3);
    await user.click(screen.getAllByRole("button", { name: /^custom app$/i })[0]);
    const selectedSummary = screen.getByRole("region", { name: /your selected roadmap/i });
    expect(within(selectedSummary).getAllByText("Custom Starter").length).toBeGreaterThan(0);
    expect(within(selectedSummary).getAllByText("$3,000").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /^custom app$/i })[2]);
    expect(within(selectedSummary).getAllByText("Custom Growth").length).toBeGreaterThan(0);
    expect(within(selectedSummary).getAllByText("$7,500").length).toBeGreaterThan(0);
    for (const heading of [
      /where Mara Consulting is now/i,
      /where the business wants to go/i,
      /how Complete can exceed the requirement/i,
      /related work/i,
      /turn the roadmap into a practical scope/i,
    ]) expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /book a discovery call/i })).toHaveAttribute("href", "/booking/");
    expect(screen.getByRole("navigation", { name: /quiz footer/i })).toBeInTheDocument();
    expect(window.location.href).toBe(initialUrl);
    expect(fetchSpy).not.toHaveBeenCalled();

    const saved = JSON.parse(localStorage.getItem(QUIZ_STORAGE_KEY) ?? "null") as SavedQuizAttempt;
    expect(saved.status).toBe("completed");
    expect(localStorage.getItem(QUIZ_STORAGE_KEY)).not.toContain("Mara Consulting");
    expect(localStorage.getItem(QUIZ_STORAGE_KEY)).not.toContain("mara@example.com");
    expect(saved.result?.recommendedOfferKey).toBeTruthy();
    expect(saved.roadmapSelection).toEqual({ tierKey: "complete", platform: "custom_app", offerKey: "custom_growth" });
  });

  it("supports the complete keyboard pattern for single-choice radio groups", async () => {
    const user = userEvent.setup();
    render(<QuizExperience />);
    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await completeContactStep(user);
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
    await completeContactStep(user);
    expect(await screen.findByRole("status")).toHaveTextContent(/recovery is unavailable/i);
    expect(screen.getByText(/recovery is unavailable in this browser/i)).toBeInTheDocument();
  });

  it("offers resume, start-over, and not-now choices for an unfinished attempt", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const attempt: SavedQuizAttempt = {
      storageVersion: 3,
      cortexVersion: CORTEX_VERSION,
      questionSetVersion: QUESTION_SET_VERSION,
      catalogVersion: CATALOG_VERSION,
      status: "in_progress",
      audienceKey: "coaches_educators",
      answers: { q1_goal: ["coach_goal_book_calls"] },
      currentQuestionIndex: 1,
      result: null,
      roadmapSelection: null,
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

  it("renders a contact-qualified personalized proposal without persisting contact identity", async () => {
    const user = userEvent.setup();
    render(<QuizExperience />);
    await user.click(await screen.findByRole("button", { name: /custom-order business/i }));
    await completeContactStep(user, { firstName: "Mara", businessName: "La Jaysiedel Cakes", email: "mara@example.com" });
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const definition = QUIZ_DEFINITIONS.custom_order_businesses;
    for (const [index, question] of definition.questions.entries()) {
      await user.click(screen.getByRole(question.selection === "single" ? "radio" : "button", { name: question.options[0].label }));
      await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
    }
    expect(await screen.findByRole("heading", { name: /Mara.*La Jaysiedel Cakes/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /where La Jaysiedel Cakes is now/i })).toBeInTheDocument();

    const saved = localStorage.getItem(QUIZ_STORAGE_KEY);
    expect(saved).not.toBeNull();
    expect(saved).not.toContain("Mara");
    expect(saved).not.toContain("La Jaysiedel Cakes");
    expect(saved).not.toContain("mara@example.com");
    localStorage.setItem(QUIZ_STORAGE_KEY, saved!);
    render(<QuizExperience />);
    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: /your personalized roadmap/i })).toHaveLength(1);
    });
  });
});
