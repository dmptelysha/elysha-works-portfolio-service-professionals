import { expect, test } from "@playwright/test";

const blockedBackendPatterns = [
  /supabase\.co/i,
  /\/rest\/v1/i,
  /\/auth\/v1/i,
  /\/functions\/v1/i,
  /firestore|firebaseio\.com/i,
  /google-analytics|analytics\.google/i,
];

test("homepage keeps the hero clear and reveals contextual navigation at Projects", async ({ page }, testInfo) => {
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
  const serviceTab = page.getByRole("tab", { name: "Service Businesses" });
  await serviceTab.click();
  await expect(serviceTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Elysha Works Client Portal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Teacher Elysha" })).toBeHidden();

  await page.getByRole("tab", { name: "All" }).click();
  const scrollPreview = page.getByRole("link", { name: /view teacher elysha project/i }).first();
  await expect(scrollPreview.getByText(/hover to scroll/i)).toBeVisible();
  const canvas = scrollPreview.locator(".project-scroll-canvas");
  if (testInfo.project.name === "desktop" || testInfo.project.name === "short-laptop") {
    const beforeHover = await canvas.evaluate((element) => getComputedStyle(element).transform);
    await scrollPreview.hover();
    await expect.poll(async () => canvas.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeHover);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(150);
  await expect(nav).toBeHidden();
});

test("hero centers the roadmap CTA and preserves spacious desktop rhythm", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop geometry is asserted once.");
  await page.setViewportSize({ width: 1815, height: 805 });
  await page.goto("/");

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing hero element: ${selector}`);
      const box = element.getBoundingClientRect();
      return { x: box.x, top: box.top, bottom: box.bottom, width: box.width };
    };
    const selectors = [
      ".hero-promise",
      ".hero-roadmap-intro",
      ".hero-trust",
      ".hero-benefits",
      ".hero-roadmap .button-row",
      ".hero-assessment-link",
    ];
    return {
      inner: rect(".hero-roadmap-inner"),
      cta: rect(".hero-roadmap-cta"),
      elements: selectors.map(rect),
    };
  });

  const innerCenter = geometry.inner.x + geometry.inner.width / 2;
  const ctaCenter = geometry.cta.x + geometry.cta.width / 2;
  expect(Math.abs(innerCenter - ctaCenter)).toBeLessThanOrEqual(1);

  const gaps = geometry.elements.slice(1).map((element, index) => element.top - geometry.elements[index].bottom);
  expect(gaps).toEqual(expect.arrayContaining(gaps.map((gap) => expect.any(Number))));
  expect(gaps[0]).toBeGreaterThanOrEqual(22);
  expect(gaps[1]).toBeGreaterThanOrEqual(15);
  expect(gaps[2]).toBeGreaterThanOrEqual(21);
  expect(gaps[3]).toBeGreaterThanOrEqual(25);
  expect(gaps[4]).toBeGreaterThanOrEqual(19);
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
  await expect(page.getByRole("heading", { name: /compare your roadmap options/i })).toBeVisible();
  await page.getByRole("group", { name: /basic platform/i }).getByRole("button", { name: "Custom App" }).click();
  const selectedRoadmap = page.locator(".roadmap-selection-summary");
  await expect(selectedRoadmap.getByRole("heading", { name: /your selected roadmap/i })).toBeVisible();
  await expect(selectedRoadmap.getByText("Custom Starter", { exact: true }).first()).toBeVisible();
  await page.getByRole("group", { name: /complete platform/i }).getByRole("button", { name: "Custom App" }).click();
  await expect(selectedRoadmap.getByText("Custom Growth", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /book a strategy call/i })).toHaveAttribute("href", "/booking/");
  expect(blockedRequests).toEqual([]);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("elysha-works:quiz-attempt:v1") ?? "null"));
  expect(saved.status).toBe("completed");
  expect(saved.result.recommendedOfferKey).toBeTruthy();
  expect(saved.roadmapSelection).toEqual({ tierKey: "complete", platform: "custom_app", offerKey: "custom_growth" });
});

test("hero secondary action opens the assessment instructions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /see how the assessment works/i }).click();
  await expect(page).toHaveURL(/\/quiz\/?#assessment-instructions$/);
  await expect(page.getByRole("complementary", { name: /clear roadmap in three steps/i })).toBeInViewport();
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
