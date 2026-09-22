import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProposalAccess } from "@/features/proposal/ProposalAccess";
import { calculateRecommendation } from "@/features/quiz/cortex";
import { buildProposalViewModel } from "@/features/quiz/proposal-view";
import { defaultRoadmapSelection } from "@/features/quiz/roadmap-options";
import { QUIZ_DEFINITIONS } from "@/features/quiz/questions";
import type { ProposalViewModel, QuizAnswers } from "@/features/quiz/types";

const reference = "70000000-0000-4000-8000-000000000001";
const answers: QuizAnswers = Object.fromEntries(
  QUIZ_DEFINITIONS.service_businesses.questions.map((question) => [question.key, [question.options[0].key]]),
);

function proposalFixture(): ProposalViewModel {
  const result = calculateRecommendation({ audienceKey: "service_businesses", answers });
  return buildProposalViewModel(
    { firstName: "Mara", businessName: "Mara Consulting" },
    answers,
    result,
    defaultRoadmapSelection(result),
    "2030-01-04T00:00:00.000Z",
  );
}

describe("protected proposal access", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", `/proposal/?ref=${reference}`);
  });

  it("shows no client identity before verification and requires the access key", async () => {
    const verify = vi.fn();
    render(<ProposalAccess service={{ verify }} now={() => new Date("2030-01-01T00:00:00.000Z")} />);

    expect(screen.queryByText(/Mara Consulting/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /open your private roadmap/i })).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /view my proposal/i });
    expect(submit).toBeDisabled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("uses the same unavailable message for wrong, expired, or locked access", async () => {
    const user = userEvent.setup();
    const verify = vi.fn(async () => { throw new Error("proposal_unavailable"); });
    render(<ProposalAccess service={{ verify }} now={() => new Date("2030-01-01T00:00:00.000Z")} />);

    await user.type(screen.getByLabelText(/proposal access key/i), "ABCD234567");
    await user.click(screen.getByRole("button", { name: /view my proposal/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not verify this proposal/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/wrong|expired|locked/i);
  });

  it("renders the approved personalized order, three tiers, booking CTA, and expiry", async () => {
    const user = userEvent.setup();
    const proposal = proposalFixture();
    const verify = vi.fn(async () => proposal);
    render(<ProposalAccess service={{ verify }} now={() => new Date("2030-01-01T00:00:00.000Z")} />);

    await user.type(screen.getByLabelText(/proposal access key/i), "ABCD234567");
    await user.click(screen.getByRole("button", { name: /view my proposal/i }));

    expect(await screen.findByRole("heading", { name: /Mara.*Mara Consulting/i })).toBeInTheDocument();
    const main = screen.getByRole("main");
    const pointA = within(main).getByRole("heading", { name: proposal.pointA.heading });
    const pointB = within(main).getByRole("heading", { name: proposal.pointB.heading });
    const recommendation = within(main).getByRole("heading", { name: proposal.recommendation.title });
    expect(pointA.compareDocumentPosition(pointB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pointB.compareDocumentPosition(recommendation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(main).getByRole("heading", { name: /^Basic$/i })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: /^Advanced$/i })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: /^Complete$/i })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: /book a discovery call/i })).toHaveAttribute("href", "/booking/");
    expect(within(main).getByText(/available until/i)).toBeInTheDocument();
    expect(verify).toHaveBeenCalledWith(reference, "ABCD234567");
  });

  it("keeps only the verified view model in session storage and never stores the key", async () => {
    const user = userEvent.setup();
    const proposal = proposalFixture();
    const verify = vi.fn(async () => proposal);
    const { unmount } = render(<ProposalAccess service={{ verify }} now={() => new Date("2030-01-01T00:00:00.000Z")} />);
    await user.type(screen.getByLabelText(/proposal access key/i), "ABCD234567");
    await user.click(screen.getByRole("button", { name: /view my proposal/i }));
    await screen.findByRole("heading", { name: /Mara.*Mara Consulting/i });
    expect(JSON.stringify(sessionStorage)).not.toContain("ABCD234567");

    unmount();
    render(<ProposalAccess service={{ verify }} now={() => new Date("2030-01-01T00:00:00.000Z")} />);
    expect(await screen.findByRole("heading", { name: /Mara.*Mara Consulting/i })).toBeInTheDocument();
    await waitFor(() => expect(verify).toHaveBeenCalledOnce());
  });
});
