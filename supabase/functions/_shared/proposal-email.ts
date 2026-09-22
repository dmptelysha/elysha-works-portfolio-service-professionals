import { hmacSha256Hex } from "./crypto.ts";
import { getMakeWebhookEnv } from "./env.ts";

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
}
