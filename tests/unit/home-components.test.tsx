import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextualNav } from "@/components/home/ContextualNav";
import { Hero } from "@/components/home/Hero";
import { ProjectsSection } from "@/components/home/ProjectsSection";
import { FaqSection } from "@/components/home/FaqSection";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";
import { FounderSection } from "@/components/home/FounderSection";
import { SiteFooter } from "@/components/home/SiteFooter";
import { TestimonialSection } from "@/components/home/TestimonialSection";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("portfolio hero", () => {
  it("places Elysha's strategy-first endorsement below the only assessment action", () => {
    render(<Hero />);
    const hero = screen.getByRole("region", { name: /before investing/i });
    expect(within(hero).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Before investing in a website, funnel, or automation, discover exactly what your business needs to grow.",
    );
    const benefitGroup = within(hero).getByRole("group", {
      name: "What your personalized roadmap includes: 100% Free, Personalized recommendations, Clear next steps, No sales pressure",
    });
    expect(benefitGroup).toBeInTheDocument();
    expect(benefitGroup.querySelector("svg")).not.toBeInTheDocument();
    const cta = within(hero).getByRole("link", { name: /get my personalized roadmap/i });
    const strategy = within(hero).getByText("Strategy-first guidance for growing businesses.");
    expect(cta).toHaveAttribute("href", "/quiz");
    const trust = hero.querySelector(".hero-trust")!;
    const stars = within(hero).getByLabelText("Five out of five stars");
    expect(within(hero).queryByRole("img", { name: "Elysha Dumpit" })).not.toBeInTheDocument();
    expect(trust.querySelector(".hero-trust-divider")).not.toBeInTheDocument();
    expect(stars.compareDocumentPosition(strategy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cta.compareDocumentPosition(strategy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(hero).queryByRole("link", { name: /see how the assessment works/i })).not.toBeInTheDocument();
    expect(within(hero).queryByText(/trusted by/i)).not.toBeInTheDocument();
    expect(within(hero).queryByRole("navigation")).not.toBeInTheDocument();
    expect(within(hero).queryByText("Elysha Works")).not.toBeInTheDocument();
  });

  it("types each benefit in order, holds it for four seconds, and loops", async () => {
    vi.useFakeTimers();
    render(<Hero />);

    const benefit = screen.getByTestId("hero-benefit-text");
    const advanceSteps = async (count: number, milliseconds: number) => {
      for (let step = 0; step < count; step += 1) {
        await act(() => vi.advanceTimersByTimeAsync(milliseconds));
      }
    };
    expect(benefit).toHaveTextContent("");

    await advanceSteps(9, 55);
    expect(benefit).toHaveTextContent("100% Free");

    await act(() => vi.advanceTimersByTimeAsync(3999));
    expect(benefit).toHaveTextContent("100% Free");

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(benefit).toHaveTextContent("100% Free");
    await act(() => vi.advanceTimersByTimeAsync(30));
    expect(benefit).not.toHaveTextContent("100% Free");

    await advanceSteps(8, 30);
    await act(() => vi.advanceTimersByTimeAsync(180));
    await advanceSteps(28, 55);
    expect(benefit).toHaveTextContent("Personalized recommendations");

    await act(() => vi.advanceTimersByTimeAsync(4000));
    await advanceSteps(28, 30);
    await act(() => vi.advanceTimersByTimeAsync(180));
    await advanceSteps(16, 55);
    expect(benefit).toHaveTextContent("Clear next steps");

    await act(() => vi.advanceTimersByTimeAsync(4000));
    await advanceSteps(16, 30);
    await act(() => vi.advanceTimersByTimeAsync(180));
    await advanceSteps(17, 55);
    expect(benefit).toHaveTextContent("No sales pressure");

    await act(() => vi.advanceTimersByTimeAsync(4000));
    await advanceSteps(17, 30);
    await act(() => vi.advanceTimersByTimeAsync(180));
    await advanceSteps(9, 55);
    expect(benefit).toHaveTextContent("100% Free");
  });

  it("keeps the first benefit static when reduced motion is requested", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<Hero />);
    const benefit = screen.getByTestId("hero-benefit-text");
    expect(benefit).toHaveTextContent("100% Free");

    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(benefit).toHaveTextContent("100% Free");
  });
});

describe("contextual navigation", () => {
  it("renders the logo, approved section links, and roadmap CTA", () => {
    render(<ContextualNav />);
    const nav = screen.getByRole("navigation", { name: /portfolio navigation/i });
    expect(within(nav).getByLabelText("Elysha Works home")).toHaveAttribute("href", "/#top");
    expect(within(nav).getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/#projects");
    expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute("href", "/#about");
    expect(within(nav).getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/#faq");
    expect(within(nav).getByRole("link", { name: /get my roadmap/i })).toHaveAttribute("href", "/quiz");
  });

  it("opens an accessible mobile menu and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<ContextualNav />);
    const button = screen.getByRole("button", { name: /open navigation/i });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("mobile-navigation")).not.toHaveAttribute("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });
});

describe("verified projects", () => {
  it("renders audience tabs and two-column-ready project cards without the device preview dialog", async () => {
    const user = userEvent.setup();
    render(<ProjectsSection />);
    const tabs = screen.getByRole("tablist", { name: /filter projects by audience/i });
    for (const label of ["All", "Coaches & Educators", "Service Businesses", "Custom-Order Brands"]) {
      expect(within(tabs).getByRole("tab", { name: label })).toBeInTheDocument();
    }
    for (const title of [
      "Teacher Elysha",
      "La Jaysiedel Cakes",
      "Elysha Works Client Portal",
      "Elysha Works Growth CRM",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Hover to scroll")).toHaveLength(4);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /desktop|tablet|mobile/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /thoughtful work/i })).not.toHaveTextContent(/\b\d+(?:\.\d+)?%\b/);
    await user.click(within(tabs).getByRole("tab", { name: "Service Businesses" }));
    expect(screen.queryByRole("heading", { name: "Teacher Elysha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "La Jaysiedel Cakes" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elysha Works Client Portal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elysha Works Growth CRM" })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: "Service Businesses" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("remaining homepage sections", () => {
  it("renders the approved founder content and verified portrait", () => {
    render(<FounderSection />);
    expect(screen.getByRole("heading", { name: "Strategy first. Then the right system." })).toBeInTheDocument();
    expect(screen.getByText(/I’m Elysha Dumpit, the founder of Elysha Works/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Elysha Dumpit, founder of Elysha Works" })).toHaveAttribute(
      "src",
      "/assets/v3-hero/elysha-portrait-cutout.png",
    );
    expect(screen.getByRole("link", { name: /book a strategy call/i })).toHaveAttribute("href", "/booking/");
  });

  it("uses only the approved testimonial placeholder with no fake attribution", () => {
    render(<TestimonialSection />);
    expect(screen.getByText("Client testimonial will be added after review and approval.")).toBeInTheDocument();
    expect(screen.queryByText(/CEO|Founder at|—/)).not.toBeInTheDocument();
  });

  it("renders eight FAQs and keeps only one answer expanded", async () => {
    const user = userEvent.setup();
    render(<FaqSection />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(8);
    await user.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    await user.click(buttons[1]);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the final quiz CTA and only verified footer links", () => {
    const { rerender } = render(<FinalCtaSection />);
    expect(screen.getByRole("link", { name: /get my personalized roadmap/i })).toHaveAttribute("href", "/quiz");
    rerender(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/elysha-works-privacy-policy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/elysha-works-terms-of-service");
    expect(screen.queryByRole("link", { name: /facebook|instagram|linkedin/i })).not.toBeInTheDocument();
  });
});
