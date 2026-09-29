import { expect, test } from "./fixtures.ts";

test.use({ javaScriptEnabled: false });

for (const [path, form] of [
  ["/", "test-general"],
  ["/es/", "test-latam"],
] as const) {
  test(`${path} without JavaScript: the band posts natively to ${form}`, async ({ page }) => {
    let posted: { method: string; body: string } | null = null;
    await page.route(`https://app.kit.com/forms/${form}/subscriptions`, async (route) => {
      posted = { method: route.request().method(), body: route.request().postData() ?? "" };
      await route.fulfill({ status: 200, contentType: "text/html", body: "<p>ok</p>" });
    });
    await page.goto(path);
    const band = page.locator('[data-email-ask="band"]');
    await expect(band.locator("[data-latam]")).toBeHidden();
    await expect(page.locator('[data-email-ask="checker"]')).toBeHidden();
    await band.locator('input[type="email"]').fill("ana@example.org");
    await band.locator('button[type="submit"]').click();
    await expect
      .poll(() => posted)
      .toEqual({ method: "POST", body: "email_address=ana%40example.org" });
  });
}

test("without JavaScript the tools say they need it", async ({ page }) => {
  await page.goto("/");
  // Playwright's javaScriptEnabled:false keeps the parser's scripting flag on, so
  // <noscript> content stays raw text here; a browser with JS off renders it.
  const notice = await page.locator("#checker-form noscript").evaluate((el) => el.innerHTML);
  expect(notice).toContain("The checker and the log analyzer need JavaScript.");
});
