import { hmacSha256Hex } from "./crypto.ts";
import { getMakeWebhookEnv } from "./env.ts";
import type { ProjectPriceQuote } from "./quiz-engine/types.ts";

export interface InitialProposalDelivery {
  operationId: string;
  recipient: { email: string; firstName: string; businessName: string };
  proposal: {
    reference: string;
    url: string;
    accessKey: string;
    expiresAt: string;
    stopUrl: string;
    discoveryCallUrl: string;
    pointA: string;
    pointB: string;
    recommendation: string;
    tierKey: string;
    platform: string;
    offerKey: string;
    price: ProjectPriceQuote;
  };
}

export async function deliverInitialProposal(
  payload: InitialProposalDelivery,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const environment = getMakeWebhookEnv();
  const body = JSON.stringify({
    delivery_id: payload.operationId,
    first_name: payload.recipient.firstName,
    business_name: payload.recipient.businessName,
    recipient_email: payload.recipient.email,
    point_a_summary: payload.proposal.pointA,
    point_b_summary: payload.proposal.pointB,
    recommendation: payload.proposal.recommendation,
    tier_key: payload.proposal.tierKey,
    platform: payload.proposal.platform,
    offer_key: payload.proposal.offerKey,
    original_total_usd: payload.proposal.price.originalTotalUsd,
    discount_amount_usd: payload.proposal.price.discountAmountUsd,
    final_total_usd: payload.proposal.price.finalTotalUsd,
    discount_code: payload.proposal.price.campaign?.code ?? null,
    discount_percent: payload.proposal.price.campaign?.percentage ?? null,
    local_total: payload.proposal.price.finalTotalLocal,
    local_currency: payload.proposal.price.localCurrency,
    proposal_url: payload.proposal.url,
    access_key: payload.proposal.accessKey,
    expires_at: payload.proposal.expiresAt,
    discovery_call_url: payload.proposal.discoveryCallUrl,
    stop_url: payload.proposal.stopUrl,
  });
  const signature = await hmacSha256Hex(body, environment.webhookSecret);
  const response = await fetcher(environment.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-make-apikey": environment.webhookSecret,
      "X-Elysha-Signature": `sha256=${signature}`,
      "X-Elysha-Operation-Id": payload.operationId,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("proposal delivery failed");
  const responseBody = await response.text();
  if (responseBody.length > 4_096) throw new Error("proposal delivery acknowledgement invalid");
  let acknowledgement: unknown;
  try {
    acknowledgement = JSON.parse(responseBody);
  } catch {
    throw new Error("proposal delivery acknowledgement invalid");
  }
  if (typeof acknowledgement !== "object" || acknowledgement === null
    || (acknowledgement as Record<string, unknown>).accepted !== true
    || (acknowledgement as Record<string, unknown>).delivery_id !== payload.operationId) {
    throw new Error("proposal delivery acknowledgement invalid");
  }
}
