import type { ProposalViewModel } from "@/features/quiz/types";

export interface ProposalService {
  verify(reference: string, accessKey: string): Promise<ProposalViewModel>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_KEY_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/;

export function isProposalReference(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function verifyProposal(reference: string, accessKey: string): Promise<ProposalViewModel> {
  if (!isProposalReference(reference) || !ACCESS_KEY_PATTERN.test(accessKey.toUpperCase())) {
    throw new Error("proposal_unavailable");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("proposal_unavailable");

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/verify-proposal`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ reference, accessKey: accessKey.toUpperCase() }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("proposal_unavailable");
  const result = await response.json() as { proposal?: ProposalViewModel };
  if (!result.proposal || Date.parse(result.proposal.expiresAt) <= Date.now()) {
    throw new Error("proposal_unavailable");
  }
  return result.proposal;
}

export const defaultProposalService: ProposalService = { verify: verifyProposal };
