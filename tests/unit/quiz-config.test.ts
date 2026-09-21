import { describe, expect, it } from "vitest";

import { PROJECTS } from "@/data/projects";
import { SITE_CONTENT } from "@/data/site-content";
import { ADDON_CATALOG, PACKAGE_CATALOG } from "@/features/quiz/catalog";
import {
  APPROVED_SIGNAL_TAGS,
  QUIZ_DEFINITIONS,
} from "@/features/quiz/questions";

describe("local quiz configuration", () => {
  const definitions = Object.values(QUIZ_DEFINITIONS);
  const allQuestions = definitions.flatMap((definition) => definition.questions);
  const allOptions = allQuestions.flatMap((question) => question.options);

  it("contains the three approved eight-question audience paths", () => {
    expect(Object.keys(QUIZ_DEFINITIONS)).toEqual([
      "coaches_educators",
      "service_businesses",
      "custom_order_businesses",
    ]);

    for (const definition of definitions) {
      expect(definition.questions).toHaveLength(8);
      expect(definition.version).toBe("cortex-local-v0.1");
      expect(definition.questions.map((question) => question.key)).toEqual([
        "q1_goal",
        "q2_setup",
        "q3_blocker",
        "q4_capabilities",
        "q5_complexity",
        "q6_readiness",
        "q7_platform",
        "q8_support",
      ]);
      expect(definition.questions[3].selection).toBe("multiple");
      expect(definition.questions[7].selection).toBe("multiple");
      expect(definition.questions[5].scope).toBe("universal");
      expect(definition.questions[6].scope).toBe("universal");
      expect(definition.questions[7].scope).toBe("universal");
    }
  });

  it("uses all 95 unique reviewed option keys and only approved signals", () => {
    const optionKeys = new Set(allOptions.map((option) => option.key));
    const approvedTags = new Set(APPROVED_SIGNAL_TAGS);

    expect(optionKeys.size).toBe(95);
    for (const option of allOptions) {
      expect(option.key).toMatch(/^[a-z0-9_]+$/);
      for (const signal of option.signals) {
        expect(approvedTags.has(signal)).toBe(true);
      }
    }
  });

  it("mirrors the seven approved packages and 21 approved add-ons", () => {
    expect(PACKAGE_CATALOG).toHaveLength(7);
    expect(PACKAGE_CATALOG.map((offer) => [offer.offerKey, offer.basePriceUsd])).toEqual([
      ["platform_launch", 1500],
      ["platform_growth", 2500],
      ["platform_scale", 4000],
      ["custom_starter", 3000],
      ["custom_foundation", 5000],
      ["custom_growth", 7500],
      ["custom_complete", 10000],
    ]);
    expect(ADDON_CATALOG).toHaveLength(21);
    expect(new Set(ADDON_CATALOG.map((addon) => addon.addonKey)).size).toBe(21);
  });

  it("contains only the four verified projects without numeric outcome claims", () => {
    expect(PROJECTS).toHaveLength(4);
    expect(PROJECTS.map((project) => project.title)).toEqual([
      "Teacher Elysha",
      "La Jaysiedel Cakes",
      "Elysha Works Client Portal",
      "Elysha Works Growth CRM",
    ]);
    for (const project of PROJECTS) {
      expect(project.outcome).not.toMatch(/\b\d+(?:\.\d+)?%\b/);
      expect(project.previewUrl).toMatch(/^\/assets\/project-previews\//);
    }
  });

  it("keeps the testimonial honest and the FAQ complete", () => {
    expect(SITE_CONTENT.testimonial.quote).toBe(
      "Client testimonial will be added after review and approval.",
    );
    expect(SITE_CONTENT.testimonial.attribution).toBeNull();
    expect(SITE_CONTENT.faq).toHaveLength(8);
  });
});
