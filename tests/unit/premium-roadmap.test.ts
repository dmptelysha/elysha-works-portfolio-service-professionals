import { describe, expect, it } from "vitest";

import { calculateRecommendation } from "@/features/quiz/cortex";
import { calculateProjectPriceQuote } from "@/features/quiz/discounts";
import { buildProposalDraft } from "@/features/quiz/proposal-view";
import { defaultRoadmapSelection, resolveRoadmapSelection } from "@/features/quiz/roadmap-options";
import type { CortexInput, RoadmapSelection, ValidatedDiscountCampaign } from "@/features/quiz/types";

const input = {
  audienceKey: "service_businesses",
  location: {
    businessCountry: "Philippines",
    countryCode: "PH",
    displayCurrency: "PHP",
    currencySymbol: "₱",
    fxRate: 58,
    fxRateTimestamp: "2026-09-23T00:00:00.000Z",
  },
  answers: {
    q1_business_model: ["service_model_consultation"],
    q2_goal: ["service_goal_bookings"],
    q3_current_journey: ["service_journey_social_phone"],
    q4_bottlenecks: ["service_blocker_booking", "service_blocker_admin"],
    q5_demand_health: ["demand_steady_some_dropoff"],
    q6_customer_requirements: ["service_customer_qualify", "service_customer_book", "service_customer_pay", "service_customer_reminders", "service_customer_intake"],
    q7_post_conversion: ["service_after_payment", "service_after_reminders", "service_after_intake", "service_after_follow_up"],
    q8_scope: ["service_scope_payments", "service_scope_integrations"],
    q9_timeline: ["timeline_within_30_days"],
    q10_platform: ["platform_recommend"],
    q11_addons: ["service_addon_copy", "service_addon_payment"],
  },
} satisfies CortexInput;

function quoteFor(
  result: ReturnType<typeof calculateRecommendation>,
  selection: RoadmapSelection,
  campaign: ValidatedDiscountCampaign | null = null,
) {
  return calculateProjectPriceQuote({
    originalTotalUsd: resolveRoadmapSelection(result, selection).estimatedProjectInvestmentUsd,
    location: result.location,
    campaign,
  });
}

describe("premium roadmap proposal model", () => {
  it("contains the complete client-facing strategic roadmap without recalculating the result", () => {
    const result = calculateRecommendation(input);
    const selection = defaultRoadmapSelection(result);
    const proposal = buildProposalDraft(
      { firstName: "Mara", businessName: "Mara Consulting" },
      input.answers,
      result,
      selection,
      quoteFor(result, selection),
    );

    expect(proposal.pointA.summary).toMatch(/social media|phone calls|direct messages/i);
    expect(proposal.pointB.summary).toMatch(/book more appointments/i);
    expect(proposal.problem.primary).toMatch(/bookings/i);
    expect(proposal.missingSystem).toMatch(/connected/i);
    expect(proposal.customerJourney).toEqual(result.recommendedCustomerJourney);
    expect(proposal.platform.recommended).toBe("gohighlevel");
    expect(proposal.platform.reasons.length).toBeGreaterThanOrEqual(2);
    expect(proposal.platform.alternatives.custom_app).toMatch(/custom infrastructure/i);
    expect(proposal.package.reasons).toEqual(result.packageReasons);
    expect(proposal.pages).toEqual(result.recommendedPages);
    expect(proposal.automations).toEqual(result.recommendedAutomations);
    expect(proposal.payment.options.join(" ")).toMatch(/GCash|Maya/i);
    expect(proposal.domainAndEmail.domainOwnership).toMatch(/client/i);
    expect(proposal.ownership.some((row) => row.item === "Domain" && row.client.includes("owns"))).toBe(true);
    expect(proposal.paymentSchedule.depositPercent).toBe(50);
    expect(proposal.paymentSchedule.balancePercent).toBe(50);
    expect(proposal.disclaimer).toMatch(/preliminary recommended roadmap/i);
  });

  it("keeps local display pricing tied to the stored USD base and supplied FX metadata", () => {
    const result = calculateRecommendation(input);
    const selection = defaultRoadmapSelection(result);
    const proposal = buildProposalDraft(
      { firstName: "Mara", businessName: "Mara Consulting" },
      input.answers,
      result,
      selection,
      quoteFor(result, selection),
    );
    expect(proposal.investment.basePriceUsd).toBe(result.basePriceUsd);
    expect(proposal.investment.localCurrency).toBe("PHP");
    expect(proposal.investment.finalTotalLocal).toBe(result.estimatedProjectInvestmentUsd * 58);
    expect(proposal.investment.finalTotalLocal).not.toBeNull();
    if (proposal.investment.finalTotalLocal === null) throw new Error("Expected local pricing");
    expect(proposal.paymentSchedule.depositAmount).toBe(proposal.investment.finalTotalLocal / 2);
  });

  it("stores the selected discounted estimate in a V2 proposal snapshot", () => {
    const result = calculateRecommendation(input);
    const selection = { tierKey: "basic", platform: "systeme_io", offerKey: "platform_launch" } as const;
    const quote = quoteFor(result, selection, {
      campaignKey: "pinoyako",
      code: "PINOYAKO",
      percentage: 50,
    });

    const proposal = buildProposalDraft(
      { firstName: "Mara", businessName: "Mara Consulting" },
      input.answers,
      result,
      selection,
      quote,
    );

    expect(proposal.proposalSnapshotVersion).toBe("proposal-snapshot-2026.09-v2");
    expect(proposal.investment).toMatchObject({
      originalTotalUsd: 2000,
      discountAmountUsd: 1000,
      finalTotalUsd: 1000,
      finalTotalLocal: 58000,
      campaign: { code: "PINOYAKO", percentage: 50 },
    });
    expect(proposal.recommendation.offerKey).toBe("platform_launch");
    expect(proposal.recommendation.estimatedProjectInvestmentUsd).toBe(1000);
  });
});
