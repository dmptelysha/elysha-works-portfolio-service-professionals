import { expect, test, type Route } from "@playwright/test";

const reference = "11111111-1111-4111-8111-111111111111";
const code = "ABCDEFGHJKLM";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l2y0AAAAASUVORK5CYII=",
  "base64",
);

const proposal = {
  reference,
  clientName: "Meghan",
  businessName: "The Emotional Anchor",
  pointA: { heading: "A thoughtful concept", summary: "An offline first draft.", evidence: ["Current page direction"] },
  pointB: { heading: "A clear invitation", summary: "A launch ready page.", evidence: ["Responsive design"] },
  recommendation: { title: "A focused launch", reason: "Review the content and scope together." },
  offers: [
    { key: "basic", label: "Basic", priceCents: 150000, included: ["Sales page"] },
    { key: "advanced", label: "Advanced", priceCents: 250000, included: ["Sales page", "Booking"] },
    { key: "complete", label: "Complete", priceCents: 400000, included: ["Sales page", "Booking", "Automation"] },
  ],
  inclusions: [{ key: "extra", label: "Additional page", priceCents: 10000 }],
  bookingPath: "/booking/",
  currency: "USD",
  expiresAt: "2030-01-01T00:00:00.000Z",
  previewCapturedAt: "2026-10-17T00:00:00.000Z",
  previewSourceHash: "a".repeat(64),
};

test("a direct link needs its separate code, unlocks only in memory, and previews each viewport", async ({ page }, testInfo) => {
  let accessRequests = 0;
  await page.route("**/mock-supabase/functions/v1/manual-proposal-access", async (route) => {
    accessRequests += 1;
    const body = route.request().postDataJSON();
    expect(body).toEqual({ reference, accessKey: code });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        proposal,
        previewUrls: {
          desktop: "http://127.0.0.1:3000/mock-private/desktop.png",
          tablet: "http://127.0.0.1:3000/mock-private/tablet.png",
          mobile: "http://127.0.0.1:3000/mock-private/mobile.png",
        },
      }),
    });
  });
  await page.route("**/mock-private/*.png", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: png,
  }));

  await page.goto("/proposal/client/?ref=" + reference);
  await expect(page.getByRole("heading", { name: /open your private proposal/i })).toBeVisible();
  await expect(page.getByText("The Emotional Anchor")).toHaveCount(0);
  await page.getByRole("textbox", { name: /access code/i }).fill(code);
  await page.getByRole("button", { name: /open proposal/i }).click();
  await expect(page.getByRole("heading", { name: /Meghan.*Emotional Anchor/i })).toBeVisible();
  expect(accessRequests).toBe(1);
  await expect(page.getByTestId("selected-total")).toHaveText("$1,500.00");
  await page.getByRole("radio", { name: "Advanced" }).check();
  await page.getByRole("checkbox", { name: /additional page/i }).check();
  await expect(page.getByTestId("selected-total")).toHaveText("$2,600.00");
  await expect(page.getByTestId("selected-deposit")).toHaveText("$1,300.00");
  await expect(page.getByRole("button", { name: /reserve my slot/i })).toBeDisabled();
  await expect(page.getByRole("link", { name: /book a discovery call/i })).toHaveAttribute("href", "/booking/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("meghan-proposal.png"), fullPage: true });

  await page.getByRole("button", { name: /view the concept/i }).click();
  const dialog = page.getByRole("dialog", { name: "Concept preview" });
  await expect(dialog).toBeVisible();
  for (const mode of ["Desktop", "Tablet", "Mobile"]) {
    await dialog.getByRole("tab", { name: mode }).click();
    await expect(dialog.getByRole("img", { name: mode.toLowerCase() + " concept" })).toHaveAttribute("src", /^blob:/);
  }
  await page.screenshot({ path: testInfo.outputPath("meghan-preview.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: /open your private proposal/i })).toBeVisible();
  await expect(page.getByText("The Emotional Anchor")).toHaveCount(0);
  expect(accessRequests).toBe(1);
});

test("an absent reference stays locked and cannot submit a code", async ({ page }) => {
  await page.goto("/proposal/client/");
  await expect(page.getByRole("heading", { name: /open your private proposal/i })).toBeVisible();
  await page.getByRole("textbox", { name: /access code/i }).fill(code);
  await expect(page.getByRole("button", { name: /open proposal/i })).toBeDisabled();
  await expect(page.getByText("The Emotional Anchor")).toHaveCount(0);
});

test("offers remain available while a private preview download is pending", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The background download behavior is viewport independent.");
  let heldPreview: Route | undefined;
  await page.route("**/mock-supabase/functions/v1/manual-proposal-access", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ proposal, previewUrls: {
      desktop: "http://127.0.0.1:3000/mock-private/desktop.png",
      tablet: null, mobile: null,
    } }),
  }));
  await page.route("**/mock-private/desktop.png", (route) => { heldPreview = route; });
  await page.goto("/proposal/client/?ref=" + reference);
  await page.getByRole("textbox", { name: /access code/i }).fill(code);
  await page.getByRole("button", { name: /open proposal/i }).click();
  await expect(page.getByRole("heading", { name: /Meghan.*Emotional Anchor/i })).toBeVisible();
  await expect(page.getByTestId("selected-total")).toHaveText("$1,500.00");
  await expect(page.getByRole("link", { name: /book a discovery call/i })).toBeVisible();
  await expect.poll(() => Boolean(heldPreview)).toBe(true);
  await heldPreview?.fulfill({ status: 200, contentType: "image/png", body: png });
});
