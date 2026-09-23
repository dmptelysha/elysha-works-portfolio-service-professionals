import { expect, test } from "@playwright/test";

const forbiddenBackendPatterns = [
  /firestore|firebaseio\.com/i,
  /hook\.(?:us\d+\.)?make\.com/i,
  /google-analytics|analytics\.google/i,
];

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  definition: "20000000-0000-4000-8000-000000000001",
  visitor: "30000000-0000-4000-8000-000000000001",
  portfolioSession: "40000000-0000-4000-8000-000000000001",
  quiz: "50000000-0000-4000-8000-000000000001",
  lead: "60000000-0000-4000-8000-000000000001",
  proposal: "70000000-0000-4000-8000-000000000001",
  challenge: "80000000-0000-4000-8000-000000000001",
};

const proposalDraft = {
  audienceKey: "service_businesses",
  client: { firstName: "Mara", businessName: "Mara Consulting" },
  pointA: { heading: "Where Mara Consulting is now", summary: "The current path needs clearer qualification.", evidence: ["Manual lead handling"] },
  pointB: { heading: "Where the business wants to go", summary: "A connected inquiry-to-booking path.", evidence: ["Qualified discovery calls"] },
  recommendation: {
    title: "A connected lead and booking system",
    reason: "The selected answers prioritize qualification and follow-up.",
    buildRoute: "platform",
    platform: "gohighlevel",
    offerKey: "platform_growth",
    offerName: "Growth System",
    basePriceUsd: 2500,
    includedFeatures: [],
    estimatedProjectInvestmentUsd: 2500,
  },
  selection: { tierKey: "advanced", platform: "gohighlevel", offerKey: "platform_growth" },
  tiers: [],
  expiresAt: null,
};

async function mockSupabaseQuiz(
  page: import("@playwright/test").Page,
  observed: string[],
  leadRpcPayloads: Record<string, unknown>[] = [],
) {
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    observed.push(`${request.method()} ${url.pathname}`);
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      },
      body: JSON.stringify(body),
    });

    if (url.pathname.endsWith("/auth/v1/signup")) return json({
      access_token: "test-anonymous-access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "test-anonymous-refresh-token",
      user: {
        id: ids.user,
        aud: "authenticated",
        role: "authenticated",
        is_anonymous: true,
      },
    });
    if (url.pathname.endsWith("/functions/v1/request-email-otp")) return json({
      challengeId: ids.challenge,
      expiresAt: "2026-09-23T00:10:00.000Z",
      resendAvailableAt: "2026-09-23T00:01:00.000Z",
    });
    if (url.pathname.endsWith("/functions/v1/verify-email-otp")) return json({
      verified: true,
      grantExpiresAt: "2026-09-23T00:20:00.000Z",
    });
    if (url.pathname.endsWith("/rest/v1/quiz_definitions")) {
      return json({ id: ids.definition, version: 1, audience_key: "service_businesses" });
    }
    if (url.pathname.endsWith("/rest/v1/site_visitors") && request.method() === "GET") return json(null);
    if (url.pathname.endsWith("/rest/v1/site_visitors") && request.method() === "POST") return json({ id: ids.visitor });
    if (url.pathname.endsWith("/rest/v1/portfolio_sessions") && request.method() === "POST") return json({ id: ids.portfolioSession });
    if (url.pathname.endsWith("/rest/v1/quiz_sessions") && request.method() === "POST") return json({ id: ids.quiz });
    if (url.pathname.endsWith("/rest/v1/quiz_sessions") && request.method() === "PATCH") return json(null, 204);
    if (url.pathname.endsWith("/rest/v1/rpc/begin_custom_verified_qualified_quiz")) {
      leadRpcPayloads.push(request.postDataJSON() as Record<string, unknown>);
      return json([{ submission_status: "accepted", lead_id: ids.lead, quiz_session_id: ids.quiz }]);
    }
    if (url.pathname.endsWith("/functions/v1/finalize-proposal")) {
      const payload = request.postDataJSON() as { operation?: string };
      return json(payload.operation === "issue"
        ? { proposalReference: ids.proposal, proposal: { ...proposalDraft, expiresAt: "2026-09-25T05:00:00.000Z" } }
        : { proposal: proposalDraft });
    }
    return json({ message: "unhandled mock request" }, 404);
  });
}

async function fillQuizContact(page: import("@playwright/test").Page) {
  await page.getByLabel(/first name/i).fill("Mara");
  await page.getByLabel(/last name/i).fill("Santos");
  await page.getByLabel(/business name/i).fill("Mara Consulting");
  await page.getByLabel(/^email/i).fill("mara@example.com");
  const consent = page.getByRole("checkbox", { name: /initial proposal.*up to three follow-ups/i });
  const verifyEmail = page.getByRole("button", { name: /^verify email$/i });
  await expect(consent).not.toBeChecked();
  await expect(verifyEmail).toBeEnabled();
  await verifyEmail.click();
  const code = page.getByLabel(/verification code/i);
  await expect(code).toBeVisible();
  await code.fill("123456");
  await page.getByRole("button", { name: /verify code/i }).click();
  await expect(page.getByText(/email verified/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /continue to assessment/i })).toBeDisabled();
  await consent.check();
  await page.getByRole("button", { name: /continue to assessment/i }).click();
  await expect(page.getByRole("heading", { name: /your roadmap starts with context/i })).toBeVisible();
}

test("contact and inline OTP fit the laptop viewport without requiring consent to verify", async ({ page }, testInfo) => {
  test.skip(!["desktop", "short-laptop"].includes(testInfo.project.name), "Desktop and laptop geometry only.");
  await mockSupabaseQuiz(page, []);
  await page.goto("/quiz/");
  await page.getByRole("button", { name: /service-based business/i }).click();
  await page.getByLabel(/first name/i).fill("Mara");
  await page.getByLabel(/last name/i).fill("Santos");
  await page.getByLabel(/business name/i).fill("Mara Consulting");
  await page.getByLabel(/^email/i).fill("mara@example.com");

  const verifyEmail = page.getByRole("button", { name: /^verify email$/i });
  await expect(verifyEmail).toBeEnabled();
  await verifyEmail.click();
  await expect(page.getByLabel(/verification code/i)).toBeVisible();
  await expect(page.locator(".quiz-footer")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
});

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

test("quiz uses mocked Supabase ownership without Firebase, Make, analytics, or page navigation", async ({ page }) => {
  const forbiddenRequests: string[] = [];
  const supabaseRequests: string[] = [];
  const leadRpcPayloads: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (forbiddenBackendPatterns.some((pattern) => pattern.test(request.url()))) forbiddenRequests.push(request.url());
  });
  await mockSupabaseQuiz(page, supabaseRequests, leadRpcPayloads);

  await page.goto("/quiz/");
  const initialNavigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  await page.getByRole("button", { name: /service-based business/i }).click();
  await fillQuizContact(page);
  await page.getByRole("button", { name: /start my assessment/i }).click();

  for (let index = 0; index < 3; index += 1) {
    await page.locator(".quiz-options button").first().click();
    await page.getByRole("button", { name: /^continue/i }).click();
  }
  await expect(page.getByText("Question 4 of 8")).toBeVisible();
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(initialNavigationCount);

  await page.reload();
  await page.getByRole("button", { name: /^resume$/i }).click();
  await fillQuizContact(page);
  await page.getByRole("button", { name: /start my assessment/i }).click();
  await expect(page.getByText("Question 4 of 8")).toBeVisible();

  for (let index = 3; index < 8; index += 1) {
    await page.locator(".quiz-options button").first().click();
    await page.getByRole("button", { name: index === 7 ? /see my roadmap/i : /^continue/i }).click();
  }

  await expect(page.getByRole("heading", { name: /Mara.*roadmap for Mara Consulting/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /compare your roadmap options/i })).toBeVisible();
  const successDialog = page.getByRole("dialog", { name: /your proposal is ready/i });
  await expect(successDialog).toBeVisible();
  await expect(successDialog.getByText(/sent.*m\*\*\*@example\.com/i)).toBeVisible();
  await successDialog.getByRole("button", { name: /view my roadmap/i }).click();
  const selectedRoadmap = page.locator(".roadmap-selection-summary");
  await expect(selectedRoadmap.getByRole("heading", { name: /your selected roadmap/i })).toBeVisible();
  await expect(selectedRoadmap.getByText(/planning estimate/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /book a discovery call/i })).toHaveAttribute("href", "/booking/");
  await expect(page.getByRole("button", { name: /create my 3-day proposal/i })).toHaveCount(0);
  expect(forbiddenRequests).toEqual([]);
  expect(supabaseRequests.some((entry) => entry.includes("/functions/v1/request-email-otp"))).toBe(true);
  expect(supabaseRequests.some((entry) => entry.includes("/functions/v1/verify-email-otp"))).toBe(true);
  expect(supabaseRequests.some((entry) => entry.includes("/auth/v1/otp"))).toBe(false);
  expect(supabaseRequests.some((entry) => entry.includes("/auth/v1/verify"))).toBe(false);
  expect(supabaseRequests.some((entry) => entry.includes("/rest/v1/quiz_sessions"))).toBe(true);
  expect(supabaseRequests.some((entry) => entry.includes("/rpc/begin_custom_verified_qualified_quiz"))).toBe(true);
  expect(leadRpcPayloads).not.toHaveLength(0);
  expect(leadRpcPayloads[0]).toEqual(expect.objectContaining({ p_challenge_id: ids.challenge }));
  expect(leadRpcPayloads[0]).not.toHaveProperty("p_email");
  expect(supabaseRequests.filter((entry) => entry.includes("/functions/v1/finalize-proposal"))).toHaveLength(2);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("elysha-works:quiz-attempt:v1") ?? "null"));
  expect(saved.status).toBe("completed");
  expect(saved.result.recommendedOfferKey).toBeTruthy();
  expect(saved.roadmapSelection).toEqual(expect.objectContaining({ tierKey: expect.any(String), platform: expect.any(String) }));
});

test("hero secondary action opens the audience selector", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /see how the assessment works/i }).click();
  await expect(page).toHaveURL(/\/quiz\/?$/);
  await expect(page.getByRole("heading", { name: /which best describes your business/i })).toBeInViewport();
  await expect(page.getByText(/a clear roadmap in three steps/i)).toHaveCount(0);
});

test("proposal contact heading stays on one line on a laptop viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Laptop geometry is asserted once.");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/quiz/");
  await page.getByRole("button", { name: /service-based business/i }).click();

  const heading = page.getByRole("heading", { name: "Where should we send your proposal?" });
  await expect(heading).toBeVisible();
  const geometry = await heading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      lineFragments: range.getClientRects().length,
      right: element.getBoundingClientRect().right,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry.lineFragments).toBe(1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
});

test("proposal access stays on-page and does not disclose why access failed", async ({ page }) => {
  await page.route("https://*.supabase.co/functions/v1/verify-proposal", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "proposal_unavailable" }),
    });
  });
  await page.goto(`/proposal/?ref=${ids.proposal}`);
  const initialNavigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  await page.getByLabel(/proposal access key/i).fill("ABCD234567");
  await page.getByRole("button", { name: /view my proposal/i }).click();
  const message = await page.locator(".proposal-error[role='alert']").textContent();
  expect(message).toMatch(/could not verify this proposal/i);
  expect(message).not.toMatch(/wrong|expired|locked/i);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(initialNavigationCount);
  await expect(page).toHaveURL(new RegExp(`/proposal/\\?ref=${ids.proposal}$`));
});

test("homepage, quiz, and proposal access have no horizontal overflow across the required viewport matrix", async ({ page }, testInfo) => {
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

    await page.goto(`/proposal/?ref=${ids.proposal}`);
    const proposalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(proposalOverflow, `proposal overflow at ${width}x${height}`).toBeLessThanOrEqual(1);
  }
});
