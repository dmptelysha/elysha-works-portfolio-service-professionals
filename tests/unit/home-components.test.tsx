import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ContextualNav } from "@/components/home/ContextualNav";
import { Hero } from "@/components/home/Hero";
import { isAllowedPreviewUrl } from "@/components/home/ProjectPreviewDialog";
import { ProjectsSection } from "@/components/home/ProjectsSection";

describe("portfolio hero", () => {
  it("preserves the approved hero and routes both assessment actions to /quiz", () => {
    render(<Hero />);
    const hero = screen.getByRole("region", { name: /before investing/i });
    expect(within(hero).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Before investing in a website, funnel, or automation, discover exactly what your business needs to grow.",
    );
    for (const benefit of [
      "Personalized recommendations",
      "Clear next steps",
      "No sales pressure",
      "100% Free",
    ]) {
      expect(within(hero).getByText(benefit)).toBeInTheDocument();
    }
    expect(within(hero).getByRole("link", { name: /get my personalized roadmap/i })).toHaveAttribute("href", "/quiz");
    expect(within(hero).getByRole("link", { name: /see how the assessment works/i })).toHaveAttribute("href", "/quiz");
    expect(within(hero).queryByRole("navigation")).not.toBeInTheDocument();
    expect(within(hero).queryByText("Elysha Works")).not.toBeInTheDocument();
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
  it("renders the four repository projects without fabricated metrics", () => {
    render(<ProjectsSection />);
    for (const title of [
      "Teacher Elysha",
      "La Jaysiedel Cakes",
      "Elysha Works Client Portal",
      "Elysha Works Growth CRM",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /preview/i })).toHaveLength(4);
    expect(screen.getByRole("region", { name: /thoughtful work/i })).not.toHaveTextContent(/\b\d+(?:\.\d+)?%\b/);
  });

  it("opens an allow-listed protected preview and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(<ProjectsSection />);
    const trigger = screen.getByRole("button", { name: /preview teacher elysha/i });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: /teacher elysha preview/i });
    const frame = within(dialog).getByTitle("Teacher Elysha preview");
    expect(frame).toHaveAttribute("src", "/assets/project-previews/esl-tutor/index.html");
    expect(frame).toHaveAttribute("sandbox");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("rejects preview URLs outside the project allow-list", () => {
    expect(isAllowedPreviewUrl("/assets/project-previews/esl-tutor/index.html")).toBe(true);
    expect(isAllowedPreviewUrl("https://example.com/unsafe")).toBe(false);
    expect(isAllowedPreviewUrl("/assets/project-previews/not-real/index.html")).toBe(false);
  });
});
