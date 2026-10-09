import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuizResult } from "@/features/quiz/QuizResult";
import { calculateRecommendation } from "@/features/quiz/cortex";
import { buildProposalDraft } from "@/features/quiz/proposal-view";
import { defaultRoadmapSelection, resolveRoadmapSelection } from "@/features/quiz/roadmap-options";
import { PROPOSAL_SNAPSHOT_VERSION, type ProposalDraftViewModel } from "@/features/quiz/types";

describe("production proposal compatibility", () => {
  it("renders the deployed v2 investment contract without crashing", () => {
    const answers = {
      q1_business_model: ["service_model_consultation"],
      q2_goal: ["service_goal_bookings"],
      q3_current_journey: ["service_journey_social_phone"],
      q4_bottlenecks: ["service_blocker_booking"],
      q5_demand_health: ["demand_steady_some_dropoff"],
      q6_customer_requirements: ["service_customer_qualify", "service_customer_book"],
      q7_post_conversion: ["service_after_reminders"],
      q8_scope: ["service_scope_integrations"],
      q9_timeline: ["timeline_within_30_days"],
      q10_platform: ["platform_recommend"],
      q11_addons: ["service_addon_copy"],
    };
    const result = calculateRecommendation({ audienceKey: "service_businesses", answers });
    const selection = defaultRoadmapSelection(result);
    const originalTotalUsd = resolveRoadmapSelection(result, selection).estimatedProjectInvestmentUsd;
    const v2Investment = {
      originalTotalUsd,
      discountAmountUsd: 0,
      finalTotalUsd: originalTotalUsd,
      localCurrency: "USD",
      localSymbol: "$",
      finalTotalLocal: originalTotalUsd,
      fxRate: 1,
      fxRateTimestamp: null,
      campaign: null,
    };
    const proposalDraft = buildProposalDraft(
      { firstName: "Mara", businessName: "Mara Consulting" },
      answers,
      result,
      selection,
      v2Investment,
    );
    const deployedV2Proposal: ProposalDraftViewModel = {
      ...proposalDraft,
      proposalSnapshotVersion: PROPOSAL_SNAPSHOT_VERSION,
      investment: {
        basePriceUsd: originalTotalUsd,
        ...v2Investment,
      },
    };

    render(
      <QuizResult
        result={result}
        proposal={deployedV2Proposal}
        selection={selection}
        onSelect={vi.fn()}
        onStartOver={vi.fn()}
        onRetryProposal={vi.fn(async () => undefined)}
        issuing={false}
        issueError={null}
        persistenceAvailable
      />,
    );

    expect(screen.getByRole("heading", { name: /project investment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm roadmap and email proposal/i })).toBeEnabled();
  });
});
