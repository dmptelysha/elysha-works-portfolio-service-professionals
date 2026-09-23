import { describe, expect, it } from "vitest";

import { PROJECTS } from "@/data/projects";
import { SITE_CONTENT } from "@/data/site-content";
import { ADDON_CATALOG, PACKAGE_CATALOG } from "@/features/quiz/catalog";
import { offerKeyForTierPlatform, PUBLIC_TIER_DEFINITIONS } from "@/features/quiz/roadmap-tiers";
import {
  APPROVED_SIGNAL_TAGS,
  QUIZ_DEFINITIONS,
} from "@/features/quiz/questions";

describe("local quiz configuration", () => {
  const definitions = Object.values(QUIZ_DEFINITIONS);
  const allQuestions = definitions.flatMap((definition) => definition.questions);
  const allOptions = allQuestions.flatMap((question) => question.options);

  it("contains the three approved eleven-question diagnostic paths", () => {
    expect(Object.keys(QUIZ_DEFINITIONS)).toEqual([
      "coaches_educators",
      "service_businesses",
      "custom_order_businesses",
    ]);

    for (const definition of definitions) {
      expect(definition.questions).toHaveLength(11);
      expect(definition.version).toBe("business-systems-cortex-2026.09-v2");
      expect(definition.questions.map((question) => question.key)).toEqual([
        "q1_business_model",
        "q2_goal",
        "q3_current_journey",
        "q4_bottlenecks",
        "q5_demand_health",
        "q6_customer_requirements",
        "q7_post_conversion",
        "q8_scope",
        "q9_timeline",
        "q10_platform",
        "q11_addons",
      ]);
      expect(definition.questions[3]).toMatchObject({ selection: "multiple", maxSelections: 2 });
      expect(definition.questions[5].selection).toBe("multiple");
      expect(definition.questions[6].selection).toBe("multiple");
      expect(definition.questions[7].selection).toBe("multiple");
      expect(definition.questions[10].selection).toBe("multiple");
      expect(definition.questions[4].scope).toBe("universal");
      expect(definition.questions[8].scope).toBe("universal");
      expect(definition.questions[9].scope).toBe("universal");
      expect(definition.questions[10].scope).toBe("audience");
    }
  });

  it("uses unique reviewed option keys and only approved signals", () => {
    const optionKeys = new Set(allOptions.map((option) => option.key));
    const approvedTags = new Set(APPROVED_SIGNAL_TAGS);

    expect(optionKeys.size).toBeGreaterThan(200);
    for (const definition of definitions) {
      const audienceOptionKeys = definition.questions.flatMap((question) => question.options.map((item) => item.key));
      expect(new Set(audienceOptionKeys).size).toBe(audienceOptionKeys.length);
    }
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
    expect(PACKAGE_CATALOG.map((offer) => [offer.offerKey, offer.pageOrScreenLimit, offer.automationLimit, offer.paymentSetupLimit])).toEqual([
      ["platform_launch", 5, 3, 1],
      ["platform_growth", 8, 7, 2],
      ["platform_scale", 12, 12, 3],
      ["custom_starter", 6, 3, 1],
      ["custom_foundation", 10, 7, 2],
      ["custom_growth", 15, 12, 3],
      ["custom_complete", null, null, null],
    ]);
  });

  it("maps three public tiers to the seven approved catalog records", () => {
    expect(PUBLIC_TIER_DEFINITIONS).toHaveLength(3);
    expect(offerKeyForTierPlatform("basic", "systeme_io")).toBe("platform_launch");
    expect(offerKeyForTierPlatform("basic", "gohighlevel")).toBe("platform_launch");
    expect(offerKeyForTierPlatform("basic", "custom_app")).toBe("custom_starter");
    expect(offerKeyForTierPlatform("advanced", "custom_app")).toBe("custom_foundation");
    expect(offerKeyForTierPlatform("complete", "systeme_io")).toBe("platform_scale");
    expect(offerKeyForTierPlatform("complete", "custom_app")).toBe("custom_growth");

    const prices = new Map(PACKAGE_CATALOG.map((offer) => [offer.offerKey, offer.basePriceUsd]));
    expect([
      prices.get("platform_launch"), prices.get("custom_starter"),
      prices.get("platform_growth"), prices.get("custom_foundation"),
      prices.get("platform_scale"), prices.get("custom_growth"),
    ]).toEqual([1500, 3000, 2500, 5000, 4000, 7500]);

    for (const tier of PUBLIC_TIER_DEFINITIONS) {
      for (const [platform, offerKey] of Object.entries(tier.offerKeys)) {
        const offer = PACKAGE_CATALOG.find((item) => item.offerKey === offerKey);
        expect(offer).toBeDefined();
        expect(offer?.supportedPlatforms).toContain(platform);
      }
    }
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
