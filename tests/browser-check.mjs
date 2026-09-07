import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const require = createRequire(join(process.cwd(), "..", "Elysha Works Growth CRM", "package.json"));
const { chromium } = require("@playwright/test");
const root = process.cwd();
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    const file = resolve(root, requested);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error("invalid path");
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});

await mkdir(join(root, ".tmp"), { recursive: true });
await new Promise((resolveReady, rejectReady) => {
  server.once("error", rejectReady);
  server.listen(0, "127.0.0.1", resolveReady);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("server did not expose a TCP port");
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1180], ["mobile", 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: name === "mobile" ? "reduce" : "no-preference" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const metrics = await page.evaluate(() => {
      const heading = document.querySelector("#hero-title");
      const style = getComputedStyle(heading);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        heroLines: heading.getBoundingClientRect().height / parseFloat(style.lineHeight),
        projectTops: [...document.querySelectorAll(".project-card")].map(card => Math.round(card.getBoundingClientRect().top)),
        projectHeights: [...document.querySelectorAll(".project-card")].map(card => Math.round(card.getBoundingClientRect().height)),
        motion: document.documentElement.dataset.motion
      };
    });
    if (metrics.scrollWidth > metrics.clientWidth + 1) throw new Error(`${name} overflows by ${metrics.scrollWidth - metrics.clientWidth}px`);
    if (metrics.heroLines > (name === "desktop" ? 2.2 : 3.2)) throw new Error(`${name} hero wraps to ${metrics.heroLines.toFixed(1)} lines`);
    await page.screenshot({ path: join(root, ".tmp", `${name}-top.png`) });
    if (name === "desktop") {
      for (const [left, right] of [[0, 1], [2, 3]]) {
        if (Math.abs(metrics.projectTops[left] - metrics.projectTops[right]) > 1 || Math.abs(metrics.projectHeights[left] - metrics.projectHeights[right]) > 1) throw new Error(`desktop project row ${left / 2 + 1} is uneven`);
      }
      await page.locator(".nav-links a[href='#work']").click();
      await page.waitForFunction(() => Math.abs(document.querySelector("#work").getBoundingClientRect().top) <= 140);
    }
    if (name === "mobile") {
      if (metrics.motion !== "reduced") throw new Error("reduced motion was not respected");
      const menuButton = page.locator(".menu-toggle");
      await menuButton.click();
      if (await menuButton.getAttribute("aria-expanded") !== "true" || await menuButton.getAttribute("aria-label") !== "Close menu") throw new Error("mobile menu did not open correctly");
      await page.keyboard.press("Escape");
      if (await menuButton.getAttribute("aria-expanded") !== "false" || await menuButton.getAttribute("aria-label") !== "Open menu") throw new Error("Escape did not close the menu");
      await menuButton.click();
      await page.mouse.click(5, 400);
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("outside click did not close the menu");
      await menuButton.click();
      await page.setViewportSize({ width: 901, height: 844 });
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("desktop breakpoint did not reset the menu");
      await page.setViewportSize({ width: 390, height: 844 });
      await menuButton.click();
      await page.locator("#site-menu a[href='#work']").click();
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("menu link did not close the menu");
      await page.locator(".faq-item").first().locator("summary").click();
      await page.locator(".faq-item").nth(1).locator("summary").click();
      if (await page.locator(".faq-item").first().evaluate(details => details.open) || !(await page.locator(".faq-item").nth(1).evaluate(details => details.open))) throw new Error("FAQ one-open behavior failed");
      const mailto = await page.locator("a.button[href^='mailto:']").first().getAttribute("href");
      if (!mailto?.includes("support@elyshaworks.com")) throw new Error("inquiry link is incorrect");
      const projectLink = page.locator(".project-link").first();
      if (await projectLink.getAttribute("href") !== "#contact") throw new Error("project action is incorrect");
      await projectLink.focus();
      if (await projectLink.evaluate(link => getComputedStyle(link).outlineStyle === "none")) throw new Error("project action has no visible keyboard focus");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => Math.abs(document.querySelector("#contact").getBoundingClientRect().top) <= 140);
      const shortTargets = await page.locator("a,button,summary").evaluateAll(elements => elements.filter(element => element.getClientRects().length && element.getBoundingClientRect().height < 44).map(element => `${element.tagName}:${element.textContent.trim().slice(0, 40)}:${Math.round(element.getBoundingClientRect().height)}px`));
      if (shortTargets.length) throw new Error(`visible mobile controls are shorter than 44px: ${shortTargets.join(", ")}`);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.locator("[data-back-to-top]").click();
      await page.waitForTimeout(100);
      if (await page.evaluate(() => scrollY) > 2) throw new Error("Back to top failed");
    }
    if (errors.length) throw new Error(`${name}: ${errors.join("; ")}`);
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = "auto";
      for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight * 0.5) {
        scrollTo(0, top);
        await new Promise(resolveStep => setTimeout(resolveStep, 80));
      }
      scrollTo(0, 0);
      document.documentElement.style.removeProperty("scroll-behavior");
    });
    await page.waitForTimeout(150);
    const hiddenReveals = await page.locator(".reveal").evaluateAll(elements => elements.filter(element => Number(getComputedStyle(element).opacity) < 0.95).map(element => element.className));
    if (hiddenReveals.length) throw new Error(`${name} retained ${hiddenReveals.length} hidden reveal elements: ${hiddenReveals.slice(0, 4).join(", ")}`);
    await page.screenshot({ path: join(root, ".tmp", `${name}.png`), fullPage: true });
    await context.close();
  }

  const noJsContext = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(origin, { waitUntil: "networkidle" });
  if (!(await noJsPage.locator("#site-menu").isVisible())) throw new Error("navigation is hidden without JavaScript");
  await noJsPage.locator(".faq-item summary").first().click();
  if (!(await noJsPage.locator(".faq-item").first().evaluate(details => details.open))) throw new Error("FAQ is unusable without JavaScript");
  await noJsContext.close();
} finally {
  await browser?.close();
  await new Promise(resolveClosed => server.close(resolveClosed));
}
