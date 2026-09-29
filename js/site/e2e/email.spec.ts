import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  COUNTS,
  isolate,
  LLMS_SAMPLE,
  NGINX_LOG,
  ROBOTS_SAMPLE,
  routeKit,
  serveSite,
} from "./helpers.ts";

const KIT = "https://app.kit.com/forms";

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

async function pasteLog(page: Page): Promise<void> {
  await page
    .locator("[data-log-paste]")
    .locator("xpath=ancestor::details")
    .locator("summary")
    .click();
  await page.getByLabel("Log lines").fill(readFileSync(NGINX_LOG, "utf8"));
  await page.getByRole("button", { name: "Read these lines" }).click();
}

test("before any result, the signup band is the only email field", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-email-ask="checker"]')).toBeHidden();
  await expect(page.locator('[data-email-ask="log"]')).toBeHidden();
  await expect(page.locator('input[type="email"]:visible')).toHaveCount(1);
});

test("the checker ask sends the email and the checked site, then shows the report link", async ({
  page,
}) => {
  await serveSite(page, "example.com", {
    robots: { body: ROBOTS_SAMPLE },
    llms: { body: LLMS_SAMPLE },
  });
  const posts = await routeKit(page);
  await page.goto("/");
  await page.locator("#domain").fill("example.com");
  await page.locator("#domain").press("Enter");
  const ask = page.locator('[data-email-ask="checker"]');
  await expect(ask).toBeVisible();
  await expect(ask.locator("[data-ask-body]")).toHaveText(
    `The robots.txt on example.com names 5 of the ${COUNTS.crawlers} AI crawlers rastrolog knows, so the next one a company launches walks straight in. We'll send a link to this report now, then one short alert each time a crawler is added, with the lines to paste into robots.txt.`,
  );
  await expect(ask.locator("[data-ask-fine]")).toHaveText(
    "Your email and example.com go to Kit, our mailing service. You confirm by email first, and one click unsubscribes.",
  );
  await ask.getByLabel("Email").fill("ana@example.org");
  await ask.getByRole("button", { name: "Email me the report" }).click();
  const sent = ask.locator('[data-email-sent="checker"]');
  await expect(sent).toContainText(
    "Confirm ana@example.org and the link to this report is on its way.",
  );
  await expect(sent.locator("[data-report-link]")).toHaveAttribute(
    "href",
    "http://localhost:4321/?check=example.com",
  );
  expect(posts).toEqual([
    {
      url: `${KIT}/test-general/subscriptions`,
      fields: { email_address: "ana@example.org", "fields[checked_domain]": "example.com" },
    },
  ]);
});

test("the log ask sends the email and nothing from the log", async ({ page }) => {
  const posts = await routeKit(page);
  await page.goto("/");
  await pasteLog(page);
  const ask = page.locator('[data-email-ask="log"]');
  await expect(ask.locator("[data-ask-body]")).toHaveText(
    "4 AI crawlers read this site. When a company adds another, you get one email with its name, what it does and the robots.txt lines to block it.",
  );
  await ask.getByLabel("Email").fill("ana@example.org");
  await ask.getByRole("button", { name: "Send me alerts" }).click();
  await expect(ask.locator('[data-email-sent="log"]')).toContainText(
    "Confirm ana@example.org to start getting crawler alerts.",
  );
  expect(posts).toEqual([
    { url: `${KIT}/test-general/subscriptions`, fields: { email_address: "ana@example.org" } },
  ]);
});

test("a failed signup keeps the email and can be retried", async ({ page }) => {
  const posts = await routeKit(page, [500, 200]);
  await page.goto("/");
  const band = page.locator('[data-email-ask="band"]');
  await band.getByLabel("Email").fill("ana@example.org");
  await band.getByRole("button", { name: "Send me alerts" }).click();
  await expect(band.locator("[data-email-error]")).toBeVisible();
  await expect(band.getByLabel("Email")).toHaveValue("ana@example.org");
  await band.getByRole("button", { name: "Send me alerts" }).click();
  await expect(band.locator('[data-email-sent="band"]')).toContainText(
    "Confirm ana@example.org to start getting crawler alerts.",
  );
  expect(posts).toHaveLength(2);
});

test("the LATAM box picks the LATAM form, and starts ticked on /es/", async ({ page }) => {
  const posts = await routeKit(page);
  await page.goto("/");
  const band = page.locator('[data-email-ask="band"]');
  await band.getByLabel("I build software for businesses in Mexico or LATAM.").check();
  await band.getByLabel("Email").fill("ana@example.org");
  await band.getByRole("button", { name: "Send me alerts" }).click();
  await expect(band.locator('[data-email-sent="band"]')).toBeVisible();
  await page.goto("/es/");
  const esBand = page.locator('[data-email-ask="band"]');
  await expect(
    esBand.getByLabel("Desarrollo software para negocios en México o LATAM."),
  ).toBeChecked();
  await esBand.getByLabel("Correo").fill("ana@example.org");
  await esBand.getByRole("button", { name: "Mándame avisos" }).click();
  await expect(esBand.locator('[data-email-sent="band"]')).toBeVisible();
  expect(posts.map((p) => p.url)).toEqual([
    `${KIT}/test-latam/subscriptions`,
    `${KIT}/test-latam/subscriptions`,
  ]);
});

test("a new check hides the old ask and brings a fresh one", async ({ page }) => {
  await serveSite(page, "example.com", { robots: { body: ROBOTS_SAMPLE } });
  await serveSite(page, "closed.example", { robots: { body: "User-agent: *\nDisallow: /\n" } });
  await routeKit(page);
  await page.goto("/");
  await page.locator("#domain").fill("example.com");
  await page.locator("#domain").press("Enter");
  const ask = page.locator('[data-email-ask="checker"]');
  await ask.getByLabel("Email").fill("ana@example.org");
  await ask.getByRole("button", { name: "Email me the report" }).click();
  await expect(ask.locator('[data-email-sent="checker"]')).toBeVisible();
  await page.locator("#domain").fill("closed.example");
  await page.locator("#domain").press("Enter");
  await expect(ask.locator("[data-ask-body]")).toContainText(
    "falls under its User-agent: * rules.",
  );
  await expect(ask.locator("form")).toBeVisible();
  await expect(ask.locator('input[name="fields[checked_domain]"]')).toHaveValue("closed.example");
});
