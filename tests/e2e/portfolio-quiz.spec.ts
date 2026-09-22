import { expect, test } from "@playwright/test";

const blockedBackendPatterns = [
  /supabase\.co/i,
  /\/rest\/v1/i,
  /\/auth\/v1/i,
  /\/functions\/v1/i,
  /firestore|firebaseio\.com/i,
  /google-analytics|analytics\.google/i,
];

test("homepage keeps the hero clear and reveals contextual navigation at Projects", async ({ page }) => {
  await page.goto("/");
  const hero = page.getByRole("region", { name: /before investing/i });
  const nav = page.getByRole("navigation", { name: /portfolio navigation/i });
  await expect(hero).toBeInViewport();
  await expect(nav).toBeHidden();

  const order = await page.locator("main > section").evaluateAll((sections) => sections.map((section) => section.id));
  expect(order).toEqual(["top", "projects", "about", "testimonial", "faq", "final-cta"]);
  await expect(page.locator("footer")).toBeVisible();

  await page.locator("#projects").evaluate((section) => section.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(150);
  await expect(nav).toBeVisible();
  const navBox = await nav.boundingBox();
  const projectsBox = await page.getByRole("heading", { name: /thoughtful work/i }).boundingBox();
  expect(navBox).not.toBeNull();
  expect(projectsBox).not.toBeNull();
  expect(projectsBox!.y + projectsBox!.height).toBeGreaterThan(navBox!.y + navBox!.height);

  await page.locator("#faq").evaluate((section) => section.scrollIntoView({ block: "start" }));
  const faq = page.getByRole("button", { name: /what does elysha works build/i });
  await faq.click();
  await expect(faq).toHaveAttribute("aria-expanded", "true");

  await page.locator("#projects").evaluate((section) => section.scrollIntoView({ block: "start" }));
  const preview = page.getByRole("button", { name: /preview teacher elysha/i });
  await preview.click();
  await expect(page.getByRole("dialog", { name: /teacher elysha preview/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeFocused();

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(150);
  await expect(nav).toBeHidden();
});

test("quiz resumes after reload, completes locally, and creates no backend request", async ({ page }) => {
  const blockedRequests: string[] = [];
  page.on("request", (request) => {
    if (blockedBackendPatterns.some((pattern) => pattern.test(request.url()))) blockedRequests.push(request.url());
  });

  await page.goto("/quiz/");
  const initialNavigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  await page.getByRole("button", { name: /service-based business/i }).click();
  await page.getByRole("button", { name: /start my assessment/i }).click();

  for (let index = 0; index < 3; index += 1) {
    await page.locator(".quiz-options button").first().click();
    await page.getByRole("button", { name: /^continue/i }).click();
  }
  await expect(page.getByText("Question 4 of 8")).toBeVisible();
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(initialNavigationCount);

  await page.reload();
  await page.getByRole("button", { name: /^resume$/i }).click();
  await expect(page.getByText("Question 4 of 8")).toBeVisible();

  for (let index = 3; index < 8; index += 1) {
    await page.locator(".quiz-options button").first().click();
    await page.getByRole("button", { name: index === 7 ? /see my roadmap/i : /^continue/i }).click();
  }

  await expect(page.getByRole("heading", { name: /your personalized roadmap/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /estimated project investment/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /book a strategy call/i })).toHaveAttribute("href", "/booking/");
  expect(blockedRequests).toEqual([]);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("elysha-works:quiz-attempt:v1") ?? "null"));
  expect(saved.status).toBe("completed");
  expect(saved.result.recommendedOfferKey).toBeTruthy();
});

test("homepage and quiz have no horizontal overflow across the required viewport matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit matrix runs once in the desktop browser project.");
  const viewports = [
    [320, 568], [360, 740], [375, 812], [390, 844], [430, 932],
    [768, 1024], [834, 1112], [1024, 768], [1366, 768], [1440, 900],
    [1536, 864], [1920, 1080], [2560, 1440],
  ] as const;

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(homeOverflow, `home overflow at ${width}×${height}`).toBeLessThanOrEqual(1);

    if (width === 1366 && height === 768) {
      const cta = await page.getByRole("link", { name: /get my personalized roadmap/i }).first().boundingBox();
      const secondary = await page.getByRole("link", { name: /see how the assessment works/i }).boundingBox();
      expect(cta!.y + cta!.height).toBeLessThanOrEqual(height);
      expect(secondary!.y + secondary!.height).toBeLessThanOrEqual(height);
    }

    await page.goto("/quiz/");
    const quizOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(quizOverflow, `quiz overflow at ${width}×${height}`).toBeLessThanOrEqual(1);
    if (width <= 430) {
      for (const card of await page.locator(".audience-card").all()) {
        const box = await card.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});
