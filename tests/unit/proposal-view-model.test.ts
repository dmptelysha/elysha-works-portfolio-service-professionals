import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";

import { calculateRecommendation } from "@/features/quiz/cortex";
import { calculateProjectPriceQuote } from "@/features/quiz/discounts";
import { QuizResult } from "@/features/quiz/QuizResult";
import {
  buildProposalDraft,
  buildProposalViewModel,
} from "@/features/quiz/proposal-view";
import { defaultRoadmapSelection, resolveRoadmapSelection } from "@/features/quiz/roadmap-options";
import type {
  LeadContactInput,
  RoadmapSelection,
} from "@/features/quiz/types";
import { quizV2Input } from "./quiz-v2-fixtures";

const contact: LeadContactInput = {
  firstName: "Ely",
  lastName: "Santos",
  businessName: "La Jaysiedel Cakes",
  email: "owner@example.com",
  consent: true,
};

const fixtures = [
  {
    name: "coaches and educators",
    input: quizV2Input("coaches_educators"),
    pointA: ["Through a website, but the next step is unclear.", "People are interested but do not book or enroll.", "Follow-up is manual or inconsistent.", "We receive steady inquiries or leads but lose some before conversion."],
    pointB: ["Enroll more students.", "Pay or enroll online.", "Access a course or resource library."],
  },
  {
    name: "service businesses",
    input: quizV2Input("service_businesses"),
    pointA: ["A booking tool followed by manual follow-up.", "Inquiries do not consistently become bookings.", "Intake, reminders, and follow-up take too much time.", "We receive steady inquiries or leads but lose some before conversion."],
    pointB: ["Book more appointments or consultations.", "Book an appointment or consultation.", "Receive automatic reminders."],
  },
  {
    name: "custom-order businesses",
    input: quizV2Input("custom_order_businesses"),
    pointA: ["We use several disconnected tools or spreadsheets.", "Production status is difficult to monitor.", "Customers frequently ask for order updates.", "We receive inquiries, but they are inconsistent."],
    pointB: ["Organize quotes, deposits, production, and customer updates.", "Choose customization options.", "Receive automatic status updates."],
  },
] as const;

function quoteFor(result: ReturnType<typeof calculateRecommendation>, selection: RoadmapSelection) {
  return calculateProjectPriceQuote({
    originalTotalUsd: resolveRoadmapSelection(result, selection).estimatedProjectInvestmentUsd,
    location: result.location,
  });
}

describe("proposal view model", () => {
  it.each(fixtures)("derives approved Point A and Point B evidence for $name", ({ input, pointA, pointB }) => {
    const result = calculateRecommendation(input);
    const selection = defaultRoadmapSelection(result);
    const draft = buildProposalDraft(contact, input.answers, result, selection, quoteFor(result, selection));

    expect(draft.client).toEqual({ firstName: "Ely", businessName: "La Jaysiedel Cakes" });
    expect(draft.pointA.heading).toBe("Where La Jaysiedel Cakes is now");
    expect(draft.pointA.evidence).toEqual(pointA);
    expect(draft.pointB.heading).toBe("Where the business wants to go");
    expect(draft.pointB.evidence).toEqual(pointB);
    expect(draft.expiresAt).toBeNull();
  });

  it("contains approved recommendation, selection, three tiers, prices, and expiry without sensitive internals", () => {
    const input = fixtures[1].input;
    const result = calculateRecommendation(input);
    const selection = defaultRoadmapSelection(result);
    const view = buildProposalViewModel(
      contact,
      input.answers,
      result,
      selection,
      quoteFor(result, selection),
      "2026-09-25T05:30:00.000Z",
    );

    expect(view.recommendation.offerKey).toBe(result.recommendedOfferKey);
    expect(view.selection).toEqual(selection);
    expect(view.tiers.map((tier) => tier.label)).toEqual(["Basic", "Advanced", "Complete"]);
    expect(view.tiers.flatMap((tier) => tier.variants).map((variant) => variant.offer.basePriceUsd)).toEqual(
      expect.arrayContaining([1500, 2500, 3000, 4000, 5000, 7500]),
    );
    expect(view.expiresAt).toBe("2026-09-25T05:30:00.000Z");

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(contact.email);
    expect(serialized).not.toContain("explanationTrace");
    expect(serialized).not.toContain("decisionTrace");
    expect(serialized).not.toContain('"scores"');
  });

  it("rejects answer keys that do not belong to the approved definition", () => {
    const input = fixtures[0].input;
    const result = calculateRecommendation(input);
    const tampered = { ...input.answers, q3_current_journey: ["browser_supplied_label"] };
    const selection = defaultRoadmapSelection(result);

    expect(() => buildProposalDraft(contact, tampered, result, selection, quoteFor(result, selection))).toThrow(/unknown option key/i);
  });

  it("renders client, Point A, Point B, recommendation, comparison, relevant work, and discovery call in order", () => {
    const input = fixtures[1].input;
    const result = calculateRecommendation(input);
    const selection = defaultRoadmapSelection(result);
    const proposal = buildProposalDraft(contact, input.answers, result, selection, quoteFor(result, selection));
    const { container } = render(createElement(QuizResult, {
      result,
      proposal,
      selection,
      onSelect: () => undefined,
      onStartOver: () => undefined,
      onRetryProposal: async () => undefined,
      issuing: false,
      issueError: null,
      persistenceAvailable: true,
    }));

    expect(screen.getByRole("heading", { name: /Ely.*La Jaysiedel Cakes/i })).toBeInTheDocument();
    const orderedCopy = [
      "Point A",
      proposal.pointA.heading,
      "Point B",
      proposal.pointB.heading,
      "Recommended path",
      "Compare your roadmap options",
      "How Complete can exceed the requirement",
      "Related work",
      "Turn the roadmap into a practical scope",
    ];
    let priorIndex = -1;
    for (const copy of orderedCopy) {
      const nextIndex = container.textContent?.indexOf(copy) ?? -1;
      expect(nextIndex, `missing or misordered: ${copy}`).toBeGreaterThan(priorIndex);
      priorIndex = nextIndex;
    }

    expect(screen.getByTestId("point-a-b-row")).toContainElement(screen.getByRole("heading", { name: proposal.pointA.heading }));
    expect(screen.getByTestId("point-a-b-row")).toContainElement(screen.getByRole("heading", { name: proposal.pointB.heading }));
    expect(screen.getAllByRole("img", { name: /project preview/i }).length).toBeGreaterThan(0);

    const selectedTier = proposal.tiers.find((tier) => tier.tierKey === selection.tierKey)!;
    const selectedVariant = selectedTier.variants.find((variant) => variant.platform === selection.platform)!;
    for (const feature of selectedVariant.offer.includedFeatures) {
      expect(screen.getAllByText(feature).length).toBeGreaterThan(0);
    }
  });
});
