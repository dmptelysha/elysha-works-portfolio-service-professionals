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
  const body = JSON.stringify(payload);
  const signature = await hmacSha256Hex(body, environment.webhookSecret);
  const response = await fetcher(environment.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Elysha-Signature": `sha256=${signature}`,
      "X-Elysha-Operation-Id": payload.operationId,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("proposal delivery failed");
}
