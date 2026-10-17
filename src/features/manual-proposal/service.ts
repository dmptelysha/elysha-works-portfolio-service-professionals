import type { ManualProposalView } from "./model";

export type PreviewMode = "desktop" | "tablet" | "mobile";
export type PreviewBlobs = Record<PreviewMode, string | null>;
export interface VerifiedManualProposal {
  proposal: ManualProposalView;
  previewBlobs: PreviewBlobs;
}
export interface ManualProposalService {
  verify(reference: string, accessKey: string): Promise<VerifiedManualProposal>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/u;
const MODES: readonly PreviewMode[] = ["desktop", "tablet", "mobile"];

export function isManualProposalReference(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function verifyManualProposal(reference: string, accessKey: string): Promise<VerifiedManualProposal> {
  const normalizedCode = accessKey.trim().toUpperCase();
  if (!isManualProposalReference(reference) || !CODE_PATTERN.test(normalizedCode)) {
    throw new Error("proposal_unavailable");
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("proposal_unavailable");
  const response = await fetch(supabaseUrl.replace(/\/$/u, "") + "/functions/v1/manual-proposal-access", {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ reference, accessKey: normalizedCode }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("proposal_unavailable");
  const result = await response.json() as {
    proposal?: ManualProposalView;
    previewUrls?: Record<PreviewMode, string | null>;
  };
  if (!result.proposal || result.proposal.reference !== reference ||
      !result.proposal.expiresAt || Date.parse(result.proposal.expiresAt) <= Date.now()) {
    throw new Error("proposal_unavailable");
  }
  const previewBlobs = {} as PreviewBlobs;
  await Promise.all(MODES.map(async (mode) => {
    const url = result.previewUrls?.[mode];
    if (!url) {
      previewBlobs[mode] = null;
      return;
    }
    try {
      const image = await fetch(url, { cache: "no-store", credentials: "omit" });
      if (!image.ok) throw new Error("preview_unavailable");
      const blob = await image.blob();
      if (!blob.type.startsWith("image/")) throw new Error("preview_unavailable");
      previewBlobs[mode] = URL.createObjectURL(blob);
    } catch {
      previewBlobs[mode] = null;
    }
  }));
  return { proposal: result.proposal, previewBlobs };
}

export const defaultManualProposalService: ManualProposalService = { verify: verifyManualProposal };
