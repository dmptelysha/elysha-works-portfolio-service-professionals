import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(
  join(process.cwd(), "..", "Elysha Works Growth CRM", "package.json"),
);
const { chromium } = require("@playwright/test");

const browser = await chromium.launch({ channel: "msedge", headless: true });
mkdirSync(join(process.cwd(), ".tmp"), { recursive: true });

try {
  for (const [name, width, height] of [
    ["laptop", 1366, 768],
    ["desktop", 1920, 1080],
    ["mobile", 390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
    await page.locator(".hero-roadmap").waitFor({ state: "visible" });

    const metrics = await page.evaluate(() => {
      const hero = document.querySelector(".hero-roadmap");
      const content = document.querySelector(".hero-roadmap-inner");
      const cta = document.querySelector(".hero-roadmap-cta");
      const launcher = document.querySelector(".portfolio-chat-launcher");
      const accentLines = [...document.querySelectorAll(".hero-promise-accent")];
      const benefits = document.querySelector(".hero-benefits");
      const heroRect = hero.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const ctaRect = cta.getBoundingClientRect();
      const launcherStyle = launcher ? getComputedStyle(launcher) : null;
      const benefitsRect = benefits.getBoundingClientRect();

      return {
        viewportWidth: document.documentElement.clientWidth,
        heroClientWidth: hero.clientWidth,
        heroScrollWidth: hero.scrollWidth,
        heroHeight: heroRect.height,
        contentTop: contentRect.top,
        contentBottom: contentRect.bottom,
        ctaLeft: ctaRect.left,
        ctaRight: ctaRect.right,
        ctaWidth: ctaRect.width,
        accentUsesGradient: accentLines
          .every((element) => getComputedStyle(element).backgroundImage.includes("linear-gradient")),
        accentIsClipped: accentLines.some(
          (element) => element.scrollHeight > element.clientHeight + 1,
        ),
        firstBenefitLeft: benefitsRect.left,
        benefitVisualCenter: (benefitsRect.left + benefitsRect.right) / 2,
        ctaCenter: (ctaRect.left + ctaRect.right) / 2,
        launcherHidden:
          !launcher ||
          launcherStyle.visibility === "hidden" ||
          Number.parseFloat(launcherStyle.opacity) === 0,
      };
    });

    if (metrics.heroScrollWidth > metrics.heroClientWidth + 1) {
      throw new Error(`${name}: hero overflows horizontally by ${metrics.heroScrollWidth - metrics.heroClientWidth}px`);
    }
    if (metrics.heroHeight < height - 1) {
      throw new Error(`${name}: hero does not fill the first viewport`);
    }
    if (metrics.contentTop < -1 || metrics.contentBottom > height + 1) {
      throw new Error(`${name}: hero content escapes the first viewport`);
    }
    if (metrics.ctaLeft < 0 || metrics.ctaRight > width) {
      throw new Error(`${name}: CTA overflows the viewport`);
    }
    if (name === "laptop" && metrics.ctaWidth > width * 0.47) {
      throw new Error(`${name}: CTA is visually oversized at ${metrics.ctaWidth}px`);
    }
    if (!metrics.accentUsesGradient) {
      throw new Error(`${name}: gold headline accent is missing its vertical gradient`);
    }
    if (name !== "mobile" && metrics.accentIsClipped) {
      throw new Error(`${name}: gold headline descenders are vertically clipped`);
    }
    if (name !== "mobile" && metrics.firstBenefitLeft < width * 0.25) {
      throw new Error(`${name}: left benefits column sits too far left`);
    }
    if (
      name !== "mobile" &&
      Math.abs(metrics.benefitVisualCenter - metrics.ctaCenter) > width * 0.025
    ) {
      throw new Error(`${name}: benefits are not visually centered over the CTA`);
    }
    if (!metrics.launcherHidden) {
      throw new Error(`${name}: chat launcher is visible over the hero`);
    }

    await page.screenshot({ path: join(".tmp", `hero-${name}.png`) });
    await context.close();
  }
} finally {
  await browser.close();
}
