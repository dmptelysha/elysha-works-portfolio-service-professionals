import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ManualProposalDocument } from "@/features/manual-proposal/ManualProposalDocument";
import type { ManualProposalView } from "@/features/manual-proposal/model";

const proposal: ManualProposalView = {
  reference: "11111111-1111-4111-8111-111111111111",
  clientName: "Meghan",
  businessName: "The Emotional Anchor",
  pointA: { heading: "A thoughtful concept", summary: "Offline for now.", evidence: ["Current design"] },
  pointB: { heading: "A clear invitation", summary: "Launch ready.", evidence: ["Responsive site"] },
  recommendation: { title: "A focused launch", reason: "Confirm details first." },
  offers: [
    { key: "basic", label: "Basic", priceCents: 150000, included: ["Sales page"] },
    { key: "advanced", label: "Advanced", priceCents: 250000, included: ["Sales page", "Booking"] },
    { key: "complete", label: "Complete", priceCents: 400000, included: ["Sales page", "Booking", "Automation"] },
  ],
  inclusions: [{ key: "extra", label: "Additional page", priceCents: 101 }],
  bookingPath: "/booking/",
  currency: "USD",
  expiresAt: "2030-01-01T00:00:00.000Z",
  previewCapturedAt: "2026-10-17T00:00:00.000Z",
  previewSourceHash: "a".repeat(64),
};
const previewBlobs = { desktop: "blob:desktop", tablet: "blob:tablet", mobile: "blob:mobile" };

describe("manual proposal document", () => {
  it("shows the strategy before three issued offers and updates a cent-accurate total", async () => {
    const user = userEvent.setup();
    render(<ManualProposalDocument proposal={proposal} previewBlobs={previewBlobs} />);
    expect(screen.getByRole("heading", { name: /Meghan.*Emotional Anchor/i })).toBeInTheDocument();
    const pointA = screen.getByRole("heading", { name: proposal.pointA.heading });
    const pointB = screen.getByRole("heading", { name: proposal.pointB.heading });
    expect(pointA.compareDocumentPosition(pointB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const tier of ["Basic", "Advanced", "Complete"]) {
      expect(screen.getByRole("radio", { name: new RegExp(tier, "i") })).toBeInTheDocument();
    }
    expect(screen.getByTestId("selected-total")).toHaveTextContent("$1,500.00");
    await user.click(screen.getByRole("checkbox", { name: /additional page/i }));
    expect(screen.getByTestId("selected-total")).toHaveTextContent("$1,501.01");
    expect(screen.getByTestId("selected-deposit")).toHaveTextContent("$750.51");
    expect(screen.getByTestId("selected-balance")).toHaveTextContent("$750.50");
    await user.click(screen.getByRole("radio", { name: /advanced/i }));
    expect(screen.getByTestId("selected-total")).toHaveTextContent("$2,501.01");
    expect(screen.getByRole("link", { name: /book a discovery call/i })).toHaveAttribute("href", "/booking/");
    expect(screen.getByRole("button", { name: /reserve my slot/i })).toBeDisabled();
    expect(screen.getByText(/50% down payment/i)).toHaveTextContent("$1,250.51");
    expect(screen.getByText(/checkout is being connected/i)).toBeInTheDocument();
  });

  it("hides optional inclusions when none are priced", () => {
    render(<ManualProposalDocument proposal={{ ...proposal, inclusions: [] }} previewBlobs={previewBlobs} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("opens a focus-managed in-page preview and switches desktop, tablet, and mobile", async () => {
    const user = userEvent.setup();
    render(<ManualProposalDocument proposal={proposal} previewBlobs={previewBlobs} />);
    const opener = screen.getByRole("button", { name: /view the concept/i });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: /concept preview/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: /desktop concept/i })).toHaveAttribute("src", "blob:desktop");
    expect(within(dialog).getByRole("button", { name: /close preview/i })).toHaveFocus();
    await user.click(within(dialog).getByRole("tab", { name: "Tablet" }));
    expect(within(dialog).getByRole("img", { name: /tablet concept/i })).toHaveAttribute("src", "blob:tablet");
    await user.click(within(dialog).getByRole("tab", { name: "Mobile" }));
    expect(within(dialog).getByRole("img", { name: /mobile concept/i })).toHaveAttribute("src", "blob:mobile");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("shows an unavailable state for a missing mode while keeping the booking path", async () => {
    const user = userEvent.setup();
    render(<ManualProposalDocument proposal={proposal} previewBlobs={{ ...previewBlobs, tablet: null }} />);
    await user.click(screen.getByRole("button", { name: /view the concept/i }));
    await user.click(screen.getByRole("tab", { name: "Tablet" }));
    expect(within(screen.getByRole("dialog")).getByText(/tablet preview unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /book a discovery call/i })).toBeInTheDocument();
  });

  it("discourages right-click and F12 without blocking paste or Escape", async () => {
    const user = userEvent.setup();
    render(<ManualProposalDocument proposal={proposal} previewBlobs={previewBlobs} />);
    const context = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.dispatchEvent(context);
    expect(context.defaultPrevented).toBe(true);
    const f12 = new KeyboardEvent("keydown", { key: "F12", bubbles: true, cancelable: true });
    document.dispatchEvent(f12);
    expect(f12.defaultPrevented).toBe(true);
    const paste = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
    await user.click(screen.getByRole("button", { name: /view the concept/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
