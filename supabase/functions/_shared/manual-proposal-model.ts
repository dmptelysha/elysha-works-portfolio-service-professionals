export type TierKey = "basic" | "advanced" | "complete";
export interface ManualOffer { key: TierKey; label: string; priceCents: number; included: string[] }
export interface PricedInclusion { key: string; label: string; priceCents: number }
export interface ManualProposalDraft {
  clientName: string;
  businessName: string;
  pointA: { heading: string; summary: string; evidence: string[] };
  pointB: { heading: string; summary: string; evidence: string[] };
  recommendation: { title: string; reason: string };
  offers: ManualOffer[];
  inclusions: PricedInclusion[];
  bookingPath: string;
  currency: "USD";
  expiresAt: string;
  captureManifestPath: string;
}
export type ManualProposalView = Omit<ManualProposalDraft, "captureManifestPath"> & {
  reference: string;
  previewCapturedAt: string;
  previewSourceHash: string;
};
export interface ManualQuote {
  baseCents: number;
  additionsCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

const TIERS: readonly TierKey[] = ["basic", "advanced", "complete"];

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) {
    throw new Error(label + " must be nonempty text");
  }
  return value.trim();
}
function cents(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be nonnegative integer cents");
  }
  return value;
}
function textList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    throw new Error(label + " must be a nonempty list");
  }
  return value.map((item, index) => text(item, label + "[" + index + "]"));
}
function point(value: unknown, label: string) {
  const input = object(value, label);
  return {
    heading: text(input.heading, label + ".heading"),
    summary: text(input.summary, label + ".summary"),
    evidence: textList(input.evidence, label + ".evidence"),
  };
}
function isoDate(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(result) ||
      Number.isNaN(Date.parse(result))) {
    throw new Error(label + " must be an ISO UTC timestamp");
  }
  return result;
}

export function validateManualDraft(input: unknown): ManualProposalDraft {
  const source = object(input, "draft");
  if (!Array.isArray(source.offers) || source.offers.length !== 3) {
    throw new Error("Exactly three offers are required");
  }
  const offers = source.offers.map((value, index) => {
    const offer = object(value, "offers[" + index + "]");
    if (!TIERS.includes(offer.key as TierKey)) throw new Error("Unknown offer key");
    return {
      key: offer.key as TierKey,
      label: text(offer.label, "offer.label"),
      priceCents: cents(offer.priceCents, "offer.priceCents"),
      included: textList(offer.included, "offer.included"),
    };
  });
  if (new Set(offers.map((offer) => offer.key)).size !== 3) {
    throw new Error("Offer keys must be unique");
  }
  if (!Array.isArray(source.inclusions) || source.inclusions.length > 50) {
    throw new Error("Inclusions must be a list");
  }
  const inclusions = source.inclusions.map((value, index) => {
    const inclusion = object(value, "inclusions[" + index + "]");
    const key = text(inclusion.key, "inclusion.key");
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key)) throw new Error("Invalid inclusion key");
    return { key, label: text(inclusion.label, "inclusion.label"), priceCents: cents(inclusion.priceCents, "inclusion.priceCents") };
  });
  if (new Set(inclusions.map((item) => item.key)).size !== inclusions.length) {
    throw new Error("Inclusion keys must be unique");
  }
  const recommendation = object(source.recommendation, "recommendation");
  const bookingPath = text(source.bookingPath, "bookingPath");
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]*\/$/u.test(bookingPath)) {
    throw new Error("bookingPath must be a same-site path");
  }
  if (source.currency !== "USD") throw new Error("Only USD is supported");
  const captureManifestPath = text(source.captureManifestPath, "captureManifestPath");
  if (!captureManifestPath.startsWith(".tmp/manual-proposals/") ||
      captureManifestPath.includes("..") || captureManifestPath.includes("\\")) {
    throw new Error("Capture manifest must be in ignored local staging");
  }
  return {
    clientName: text(source.clientName, "clientName"),
    businessName: text(source.businessName, "businessName"),
    pointA: point(source.pointA, "pointA"),
    pointB: point(source.pointB, "pointB"),
    recommendation: { title: text(recommendation.title, "recommendation.title"), reason: text(recommendation.reason, "recommendation.reason") },
    offers,
    inclusions,
    bookingPath,
    currency: "USD",
    expiresAt: isoDate(source.expiresAt, "expiresAt"),
    captureManifestPath,
  };
}

export function calculateManualQuote(
  proposal: ManualProposalView,
  tierKey: TierKey,
  inclusionKeys: readonly string[],
): ManualQuote {
  const offer = proposal.offers.find((candidate) => candidate.key === tierKey);
  if (!offer || !TIERS.includes(tierKey)) throw new Error("Unknown offer");
  if (new Set(inclusionKeys).size !== inclusionKeys.length) throw new Error("Duplicate inclusion selection");
  const inclusionMap = new Map(proposal.inclusions.map((item) => [item.key, item]));
  let additionsCents = 0;
  for (const key of inclusionKeys) {
    const inclusion = inclusionMap.get(key);
    if (!inclusion) throw new Error("Unknown inclusion");
    additionsCents += cents(inclusion.priceCents, "inclusion.priceCents");
  }
  const baseCents = cents(offer.priceCents, "offer.priceCents");
  const totalCents = baseCents + additionsCents;
  if (!Number.isSafeInteger(totalCents)) throw new Error("Total is too large");
  const depositCents = Math.ceil(totalCents / 2);
  return { baseCents, additionsCents, totalCents, depositCents, balanceCents: totalCents - depositCents };
}
