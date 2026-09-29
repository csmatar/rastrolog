import { expect, test } from "@playwright/test";
import { COUNTS, SIGNALS } from "./helpers.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("install commands copy, with a visible Copied state", async ({ page }) => {
  await page.goto("/");
  const button = page.locator("#install button").first();
  await button.click();
  await expect(button).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "pip install rastrolog\nrastrolog parse access.log",
  );
  await expect(button).toHaveText("Copy", { timeout: 4000 });
  await expect(page.locator("#install code").last()).toContainText('integrity="sha384-');
  await expect(page.locator("#install a")).toHaveCount(0);
  const block = page.locator("#install button").first().locator("xpath=..");
  await expect(block).toHaveCSS("background-color", "rgb(23, 21, 30)");
  await expect(block.locator("code")).toHaveCSS("color", "rgb(236, 234, 243)");
});

test("what it detects: every crawler token links to its documentation", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#detects");
  await expect(section.locator("tbody tr")).toHaveCount(COUNTS.vendors);
  await expect(section.locator("tbody a")).toHaveCount(COUNTS.crawlers);
  const gptbot = SIGNALS.crawlers.find((c) => c.token === "GPTBot");
  await expect(section.getByRole("link", { name: "GPTBot" })).toHaveAttribute(
    "href",
    gptbot?.docs_url ?? "",
  );
  await expect(section.getByRole("row", { name: /ByteDance/ })).toContainText(
    "(third-party source)",
  );
  await expect(section).toContainText(
    `${COUNTS.crawlers} crawler tokens and ${COUNTS.chats} AI products. ${COUNTS.documented} of the tokens come from the vendor's own documentation`,
  );
});

test("articles and video stay hidden until site.config.ts has some", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#media")).toHaveCount(0);
});

test("Spanish sections and footer", async ({ page }) => {
  await page.goto("/es/");
  await expect(page.locator("#install h2")).toHaveText(
    "Sigue contando después de cerrar esta pestaña",
  );
  await expect(page.locator("#detects h2")).toHaveText("Qué detecta");
  await expect(page.locator("#detects").getByRole("row", { name: /ByteDance/ })).toContainText(
    "(fuente externa)",
  );
  await expect(page.locator("footer")).toContainText("Sin cookies.");
});
