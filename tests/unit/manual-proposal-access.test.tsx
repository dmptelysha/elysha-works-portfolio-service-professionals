import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManualProposalAccess } from "@/features/manual-proposal/ManualProposalAccess";
import {
  verifyManualProposal,
  type VerifiedManualProposal,
} from "@/features/manual-proposal/service";

const reference = "11111111-1111-4111-8111-111111111111";
const proposal: VerifiedManualProposal["proposal"] = {
  reference,
  clientName: "Meghan",
  businessName: "Emotional Anchor",
  pointA: { heading: "Today", summary: "Offline", evidence: ["Concept"] },
  pointB: { heading: "Next", summary: "Online", evidence: ["Page"] },
  recommendation: { title: "Launch", reason: "Confirm details." },
  offers: [
    { key: "basic", label: "Basic", priceCents: 150000, included: ["Page"] },
    { key: "advanced", label: "Advanced", priceCents: 250000, included: ["Page"] },
    { key: "complete", label: "Complete", priceCents: 400000, included: ["Page"] },
  ],
  inclusions: [],
  bookingPath: "/booking/",
  currency: "USD",
  expiresAt: "2030-01-01T00:00:00.000Z",
  previewCapturedAt: "2026-10-17T00:00:00.000Z",
  previewSourceHash: "a".repeat(64),
};
const unlocked: VerifiedManualProposal = {
  proposal,
  previewBlobs: { desktop: "blob:desktop", tablet: null, mobile: "blob:mobile" },
};

describe("manual proposal lock", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/proposal/client/?ref=" + reference);
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows only a lock before access and never embeds client details", () => {
    const verify = vi.fn();
    render(<ManualProposalAccess service={{ verify }} />);
    expect(screen.getByRole("heading", { name: /open your private proposal/i })).toBeInTheDocument();
    expect(screen.queryByText("Meghan")).not.toBeInTheDocument();
    expect(screen.queryByText("$1,500")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open proposal/i })).toBeDisabled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("keeps absent, malformed, wrong, expired, and locked access generic", async () => {
    const user = userEvent.setup();
    const verify = vi.fn(async () => { throw new Error("proposal_unavailable"); });
    window.history.replaceState({}, "", "/proposal/client/");
    const first = render(<ManualProposalAccess service={{ verify }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not verify this proposal/i);
    expect(verify).not.toHaveBeenCalled();
    first.unmount();
    window.history.replaceState({}, "", "/proposal/client/?ref=" + reference);
    render(<ManualProposalAccess service={{ verify }} />);
    await user.click(screen.getByLabelText(/access code/i));
    await user.paste("ABCDEFGH2345");
    await user.click(screen.getByRole("button", { name: /open proposal/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not verify this proposal/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/wrong|expired|locked/i);
    expect(verify).toHaveBeenCalledWith(reference, "ABCDEFGH2345");
  });

  it("unlocks in memory, preserves booking if an image is unavailable, and relocks on remount", async () => {
    const user = userEvent.setup();
    const verify = vi.fn(async () => unlocked);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const first = render(<ManualProposalAccess service={{ verify }} />);
    await user.type(screen.getByLabelText(/access code/i), "abcdefgh2345");
    await user.click(screen.getByRole("button", { name: /open proposal/i }));
    expect(await screen.findByRole("heading", { name: /proposal unlocked/i })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Tablet" }));
    expect(screen.getByText(/tablet preview unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /book a discovery call/i })).toHaveAttribute("href", "/booking/");
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
    first.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:desktop");
    expect(revoke).toHaveBeenCalledWith("blob:mobile");
    render(<ManualProposalAccess service={{ verify }} />);
    expect(screen.getByRole("heading", { name: /open your private proposal/i })).toBeInTheDocument();
    expect(verify).toHaveBeenCalledOnce();
    revoke.mockRestore();
  });

  it("locks a different reference and ignores an old verification that finishes after navigation", async () => {
    const user = userEvent.setup();
    let release: ((value: VerifiedManualProposal) => void) | undefined;
    const verify = vi.fn(() => new Promise<VerifiedManualProposal>((done) => { release = done; }));
    render(<ManualProposalAccess service={{ verify }} />);
    await user.type(screen.getByLabelText(/access code/i), "abcdefgh2345");
    await user.click(screen.getByRole("button", { name: /open proposal/i }));
    act(() => {
      window.history.pushState({}, "", "/proposal/client/?ref=22222222-2222-4222-8222-222222222222");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => { release?.(unlocked); });
    expect(screen.getByRole("heading", { name: /open your private proposal/i })).toBeInTheDocument();
    expect(screen.queryByText("Emotional Anchor")).not.toBeInTheDocument();
  });

  it("relocks immediately when the reference changes after unlock", async () => {
    const user = userEvent.setup();
    render(<ManualProposalAccess service={{ verify: async () => unlocked }} />);
    await user.type(screen.getByLabelText(/access code/i), "abcdefgh2345");
    await user.click(screen.getByRole("button", { name: /open proposal/i }));
    expect(await screen.findByRole("heading", { name: /proposal unlocked/i })).toBeInTheDocument();
    act(() => {
      window.history.pushState({}, "", "/proposal/client/?ref=22222222-2222-4222-8222-222222222222");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("heading", { name: /open your private proposal/i })).toBeInTheDocument();
    expect(screen.queryByText("Emotional Anchor")).not.toBeInTheDocument();
  });
});

it("fetches signed images into Blob URLs and treats expired images as unavailable", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("manual-proposal-access")) {
      return new Response(JSON.stringify({
        proposal,
        previewUrls: {
          desktop: "https://private.example.test/desktop",
          tablet: "https://private.example.test/tablet",
          mobile: null,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/tablet")) return new Response("", { status: 403 });
    return new Response(new Blob(["png"], { type: "image/png" }), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:desktop"),
    revokeObjectURL: vi.fn(),
  }));
  const result = await verifyManualProposal(reference, "ABCDEFGH2345");
  expect(result.previewBlobs).toEqual({ desktop: null, tablet: null, mobile: null });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const previews: Record<string, string | null> = {};
  await result.loadPreviews?.((mode, url) => { previews[mode] = url; });
  expect(previews).toEqual({ desktop: "blob:desktop", tablet: null, mobile: null });
  expect(fetcher).toHaveBeenCalledTimes(3);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
