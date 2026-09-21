import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(
  join(process.cwd(), "..", "Elysha Works Growth CRM", "package.json"),
);
const { chromium } = require("@playwright/test");

const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: name === "mobile" ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("http://127.0.0.1:5002", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible" });

    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      failedImages: [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
    }));

    if (metrics.scrollWidth > metrics.clientWidth + 1) {
      throw new Error(`${name} overflows by ${metrics.scrollWidth - metrics.clientWidth}px`);
    }
    if (metrics.failedImages.length) {
      throw new Error(`${name} failed images: ${metrics.failedImages.join(", ")}`);
    }

    await page.locator(".project-card").first().click();
    await page.locator(".v3-project-viewer").waitFor({ state: "visible" });
    await page.locator("[data-viewer-close]").click();

    await page.locator(".faq-list details").first().locator("summary").click();
    if (!(await page.locator(".faq-list details").first().evaluate((item) => item.open))) {
      throw new Error(`${name} FAQ did not open`);
    }

    await page.locator("[data-portfolio-chat-toggle]").click();
    await page.locator("[data-portfolio-chat-panel]").waitFor({ state: "visible" });
    await page.locator("[data-portfolio-chat-close]").click();

    if (name === "mobile") {
      const menu = page.locator("[data-menu-toggle]");
      await menu.click();
      if ((await menu.getAttribute("aria-expanded")) !== "true") {
        throw new Error("mobile menu did not open");
      }
      await page.keyboard.press("Escape");
      if ((await menu.getAttribute("aria-expanded")) !== "false") {
        throw new Error("Escape did not close the mobile menu");
      }
    }

    if (errors.length) throw new Error(`${name} runtime errors: ${errors.join("; ")}`);
    await page.screenshot({ path: join(".tmp", `live-${name}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}
