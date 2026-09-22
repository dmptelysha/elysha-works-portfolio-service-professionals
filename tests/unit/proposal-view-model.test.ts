import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";

import { calculateRecommendation } from "@/features/quiz/cortex";
import { QuizResult } from "@/features/quiz/QuizResult";
import {
  buildProposalDraft,
  buildProposalViewModel,
} from "@/features/quiz/proposal-view";
import { defaultRoadmapSelection } from "@/features/quiz/roadmap-options";
import type {
  AudienceKey,
  CortexInput,
  LeadContactInput,
  QuizAnswers,
} from "@/features/quiz/types";

const contact: LeadContactInput = {
  firstName: "Ely",
  businessName: "La Jaysiedel Cakes",
  email: "owner@example.com",
  consent: true,
};

function complete(
  audienceKey: AudienceKey,
  answers: Record<string, string | string[]>,
): CortexInput {
  return {
    audienceKey,
    answers: Object.fromEntries(
      Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? value : [value]]),
    ) as QuizAnswers,
  };
}

const fixtures = [
  {
    name: "coaches and educators",
    input: complete("coaches_educators", {
      q1_goal: "coach_goal_enroll_students",
      q2_setup: "coach_setup_unclear_website",
      q3_blocker: "coach_blocker_questions_no_booking",
      q4_capabilities: ["coach_capability_enrollment_payment", "coach_capability_student_onboarding"],
      q5_complexity: "coach_complexity_program_delivery",
      q6_readiness: "readiness_within_30_days",
      q7_platform: "platform_recommend",
      q8_support: ["support_client_assets"],
    }),
    pointA: ["Through a website, but the path is unclear.", "People ask questions but do not book or enroll."],
    pointB: ["Enroll more students in a course or program.", "Enrollment and payment.", "Student onboarding or portal."],
  },
  {
    name: "service businesses",
    input: complete("service_businesses", {
      q1_goal: "service_goal_book_appointments",
      q2_setup: "service_setup_disconnected_booking",
      q3_blocker: "service_blocker_manual_intake_follow_up",
      q4_capabilities: ["service_capability_booking", "service_capability_reminders"],
      q5_complexity: "service_complexity_multiple_services",
      q6_readiness: "readiness_ready_now",
      q7_platform: "platform_recommend",
      q8_support: ["support_client_assets"],
    }),
    pointA: ["A booking tool that is not connected to the rest of the workflow.", "Intake, reminders, and follow-up take too much time."],
    pointB: ["Book more appointments or consultations.", "Appointment booking.", "Automated reminders and follow-up."],
  },
  {
    name: "custom-order businesses",
    input: complete("custom_order_businesses", {
      q1_goal: "order_goal_organize_operations",
      q2_setup: "order_setup_disconnected_tools",
      q3_blocker: "order_blocker_production_updates",
      q4_capabilities: ["order_capability_updates", "order_capability_inventory"],
      q5_complexity: "order_complexity_roles_inventory",
      q6_readiness: "readiness_ready_now",
      q7_platform: "platform_recommend",
      q8_support: ["support_inventory", "support_order_management"],
    }),
    pointA: ["Through several disconnected tools or spreadsheets.", "Production status, delivery, and customer updates are difficult to track."],
    pointB: ["Organize orders, payments, and customer updates.", "Automated confirmation and updates.", "Inventory or production tracking."],
  },
] as const;

describe("proposal view model", () => {
  it.each(fixtures)("derives approved Point A and Point B evidence for $name", ({ input, pointA, pointB }) => {
    const result = calculateRecommendation(input);
    const draft = buildProposalDraft(contact, input.answers, result, defaultRoadmapSelection(result));

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
    const view = buildProposalViewModel(contact, input.answers, result, selection, "2026-09-25T05:30:00.000Z");

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
    const tampered = { ...input.answers, q2_setup: ["browser_supplied_label"] };

    expect(() => buildProposalDraft(contact, tampered, result, defaultRoadmapSelection(result))).toThrow(/unknown option key/i);
  });

  it("renders client, Point A, Point B, recommendation, comparison, relevant work, and discovery call in order", () => {
    const input = fixtures[1].input;
    const result = calculateRecommendation(input);
    const selection = defaultRoadmapSelection(result);
    const proposal = buildProposalDraft(contact, input.answers, result, selection);
    const { container } = render(createElement(QuizResult, {
      result,
      proposal,
      selection,
      onSelect: () => undefined,
      onStartOver: () => undefined,
      onIssue: async () => undefined,
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
  });
});
