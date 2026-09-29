import { expect, test } from "./fixtures.ts";
import { COUNTS } from "./helpers.ts";

test("English hero, stats and language link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The AI bots reading your site. The visitors AI sends back.",
  );
  await expect(page.locator("#top")).toContainText(
    `Paste a domain to see which of ${COUNTS.crawlers} AI crawlers its robots.txt lets in.`,
  );
  const stats = page.getByRole("region", { name: "What rastrolog knows" });
  await expect(stats.locator("dd")).toHaveText([
    `${COUNTS.crawlers}`,
    `${COUNTS.vendors}`,
    `${COUNTS.chats}`,
    "0",
  ]);
  await expect(stats.locator("p span")).toHaveCount(COUNTS.vendors + 1);
  await expect(page.getByRole("link", { name: "Español" })).toHaveAttribute("href", "/es/");
});

test("Spanish hero", async ({ page }) => {
  await page.goto("/es/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Los bots de IA que leen tu sitio. Las visitas que la IA te devuelve.",
  );
  await expect(page.getByRole("link", { name: "English" })).toHaveAttribute("href", "/");
});

test("the skip link lands just before the domain field", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to the checker" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("#domain")).toBeFocused();
});

test("the mobile menu opens and lists the sections", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the menu is mobile-only");
  await page.goto("/");
  await page.locator("header details summary").click();
  await expect(page.getByRole("link", { name: "Log analyzer" })).toBeVisible();
});

test("the tool sections stay out of the way until a tool runs", async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort("blockedbyclient"));
  await page.goto("/");
  await expect(page.locator("#checker")).toBeHidden();
  await expect(page.locator("#logs")).toBeHidden();
  await page.locator("#domain").fill("example.com");
  await page.locator("#domain").press("Enter");
  await expect(page.locator("#checker")).toBeVisible();
  await expect(page.locator("#logs")).toBeHidden();
  await page
    .locator("[data-log-paste]")
    .locator("xpath=ancestor::details")
    .locator("summary")
    .click();
  await page.getByLabel("Log lines").fill("hello world\n");
  await page.getByRole("button", { name: "Read these lines" }).click();
  await expect(page.locator("#logs")).toBeVisible();
});

test("the header links lead to the tool panels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the desktop nav holds these links");
  await page.goto("/");
  await expect(page.locator("header nav").getByRole("link", { name: "Checker" })).toHaveAttribute(
    "href",
    "#checker-form",
  );
  await expect(
    page.locator("header nav").getByRole("link", { name: "Log analyzer" }),
  ).toHaveAttribute("href", "#log-panel");
});
