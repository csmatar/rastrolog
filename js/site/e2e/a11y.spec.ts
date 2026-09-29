import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { isolate, LLMS_SAMPLE, NGINX_LOG, ROBOTS_SAMPLE, serveSite } from "./helpers.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

for (const [path, pasteLabel, readButton] of [
  ["/", "Log lines", "Read these lines"],
  ["/es/", "Líneas del log", "Leer estas líneas"],
] as const) {
  test(`${path} passes axe (WCAG 2.2 AA) before and after both tools run`, async ({ page }) => {
    await isolate(page);
    await serveSite(page, "example.com", {
      robots: { body: ROBOTS_SAMPLE },
      llms: { body: LLMS_SAMPLE },
    });
    await page.goto(path);
    await expectNoViolations(page);
    await page.locator("#domain").fill("example.com");
    await page.locator("#domain").press("Enter");
    await expect(page.locator('[data-email-ask="checker"]')).toBeVisible();
    await page
      .locator("[data-log-paste]")
      .locator("xpath=ancestor::details")
      .locator("summary")
      .click();
    await page.getByLabel(pasteLabel).fill(readFileSync(NGINX_LOG, "utf8"));
    await page.getByRole("button", { name: readButton }).click();
    await expect(page.locator('[data-email-ask="log"]')).toBeVisible();
    await expectNoViolations(page);
  });
}

test("keyboard only: skip link, run the checker, reach its email ask", async ({ page }) => {
  await isolate(page);
  await serveSite(page, "example.com", { robots: { body: ROBOTS_SAMPLE } });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("#domain")).toBeFocused();
  await page.keyboard.type("example.com");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-email-ask="checker"]')).toBeVisible();
  const email = page.locator("#checker-email");
  for (let i = 0; i < 60; i++) {
    if (await email.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(email).toBeFocused();
});
