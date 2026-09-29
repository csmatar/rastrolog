import { expect, type Page, test } from "@playwright/test";
import { COUNTS, isolate, LLMS_SAMPLE, ROBOTS_SAMPLE, serveSite } from "./helpers.ts";

const N = COUNTS.crawlers;

async function check(page: Page, domain: string): Promise<void> {
  await page.locator("#domain").fill(domain);
  await page.locator("#domain").press("Enter");
}

const report = (page: Page) => page.locator("[data-checker-result]");
const field = (page: Page, name: string) => report(page).locator(`[data-f="${name}"]`);

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

test("found robots.txt and llms.txt: headline, summary, table and a shareable URL", async ({
  page,
}) => {
  await serveSite(page, "example.com", {
    robots: { body: ROBOTS_SAMPLE },
    llms: { body: LLMS_SAMPLE },
  });
  await page.goto("/");
  await check(page, "Example.com/pricing");
  await expect(field(page, "headline")).toHaveText(
    `example.com lets ${N - 5} of ${N} AI crawlers in.`,
  );
  await expect(field(page, "sub")).toHaveText(
    "4 are blocked everywhere, and 1 is blocked on some pages.",
  );
  await expect(field(page, "robots")).toHaveText("robots.txt · 200 · 17 lines");
  await expect(field(page, "llms")).toHaveText('llms.txt · 200 · "Example Docs" · 12 links');
  await expect(field(page, "summary").locator("li").first()).toContainText(
    "OpenAI, Google, Common Crawl, and ByteDance can't collect training data from example.com.",
  );
  const gptbot = report(page).getByRole("row", { name: /GPTBot/ });
  await expect(gptbot).toContainText("blocked");
  await expect(gptbot).toContainText("User-agent: GPTBot Disallow: /");
  await expect(page).toHaveURL(/\/\?check=example\.com$/);
  await expect(page.locator("#domain")).toHaveValue("example.com");
});

test("404: every crawler allowed by default, and no llms.txt", async ({ page }) => {
  await serveSite(page, "example.com", { robots: { status: 404 }, llms: { status: 404 } });
  await page.goto("/");
  await check(page, "example.com");
  await expect(field(page, "headline")).toHaveText(`example.com lets ${N} of ${N} AI crawlers in.`);
  await expect(field(page, "sub")).toHaveText("None are blocked.");
  await expect(field(page, "robots")).toHaveText(
    "robots.txt · 404 · none, so every crawler is allowed by default",
  );
  await expect(field(page, "llms")).toHaveText("No llms.txt");
});

test("403 counts as no robots.txt, and a web page is not a robots.txt", async ({ page }) => {
  await serveSite(page, "example.com", {
    robots: { status: 403 },
    llms: { body: "<!doctype html><html><body>Not found</body></html>", contentType: "text/html" },
  });
  await serveSite(page, "spa.example", {
    robots: { body: '<!DOCTYPE html>\n<html lang="en"></html>' },
  });
  await page.goto("/");
  await check(page, "example.com");
  await expect(field(page, "robots")).toHaveText(
    "robots.txt · 403 · crawlers treat that as no robots.txt, so everything is allowed",
  );
  await expect(field(page, "llms")).toHaveText("No llms.txt");
  await check(page, "spa.example");
  await expect(field(page, "robots")).toHaveText(
    "robots.txt · 200 · a web page came back instead, so no rules apply",
  );
});

test("CORS refusal: explain, then check what the visitor pastes", async ({ page }) => {
  await serveSite(page, "example.com", {
    robots: { body: ROBOTS_SAMPLE, cors: false },
    llms: { body: LLMS_SAMPLE, cors: false },
  });
  await page.goto("/");
  await check(page, "example.com");
  const paste = page.locator("[data-checker-paste]");
  await expect(paste).toContainText(
    "example.com doesn't let other sites read its robots.txt from a browser",
  );
  await expect(
    paste.getByRole("link", { name: "Open https://example.com/robots.txt" }),
  ).toHaveAttribute("href", "https://example.com/robots.txt");
  await expect(report(page)).toBeHidden();
  await paste.getByLabel("robots.txt contents").fill(ROBOTS_SAMPLE);
  await paste.getByRole("button", { name: "Check pasted text" }).click();
  await expect(field(page, "robots")).toHaveText("robots.txt · pasted · 17 lines");
  await expect(field(page, "llms")).toHaveText("llms.txt · couldn't be read from the browser");
  await report(page).getByText("Paste llms.txt instead").click();
  await report(page).getByLabel("llms.txt contents").fill(LLMS_SAMPLE);
  await report(page).getByRole("button", { name: "Read llms.txt" }).click();
  await expect(field(page, "llms")).toHaveText("llms.txt · pasted · 12 links");
});

test("a server error shows the status and the paste box, never made-up verdicts", async ({
  page,
}) => {
  await serveSite(page, "example.com", { robots: { status: 503 } });
  await page.goto("/");
  await check(page, "example.com");
  await expect(page.locator("[data-checker-paste]")).toContainText(
    'example.com/robots.txt answered 503. Crawlers treat a server error as "blocked everywhere"',
  );
  await expect(report(page)).toBeHidden();
});

test("?check= runs on load; a local address runs nothing", async ({ page }) => {
  await serveSite(page, "example.com", { robots: { body: ROBOTS_SAMPLE } });
  await page.goto("/?check=example.com");
  await expect(field(page, "headline")).toContainText("example.com lets");
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://")) fetched.push(r.url());
  });
  await page.goto("/?check=localhost");
  await expect(page.locator("#domain")).toHaveValue("");
  await expect(report(page)).toBeHidden();
  expect(fetched).toEqual([]);
});

test("bad input keeps focus, with a message tied to the field", async ({ page }) => {
  await page.goto("/");
  await check(page, "192.168.0.1");
  await expect(page.locator("[data-domain-error]")).toHaveText(
    "Type a domain name, not an IP address.",
  );
  await expect(page.locator("#domain")).toBeFocused();
  await expect(page.locator("#domain")).toHaveAttribute("aria-invalid", "true");
});

test("robots.txt text shaped like HTML stays text", async ({ page }) => {
  await serveSite(page, "example.com", {
    robots: { body: 'User-agent: *\nDisallow: /<img src=x onerror="window.__pwned=1">\n' },
  });
  await page.goto("/");
  await check(page, "example.com");
  await expect(
    report(page).getByText('<img src=x onerror="window.__pwned=1">', { exact: false }).first(),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
});

test("a newer check wins over a slower earlier one", async ({ page }) => {
  await page.route("https://slow.example/robots.txt", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 200,
      body: "User-agent: *\nDisallow: /\n",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await serveSite(page, "fast.example", { robots: { body: ROBOTS_SAMPLE } });
  await page.goto("/");
  await check(page, "slow.example");
  await check(page, "fast.example");
  await expect(field(page, "headline")).toContainText("fast.example lets");
  await page.waitForTimeout(2000);
  await expect(field(page, "headline")).toContainText("fast.example lets");
});

test("Spanish report and URL", async ({ page }) => {
  await serveSite(page, "example.com", { robots: { body: ROBOTS_SAMPLE } });
  await page.goto("/es/");
  await check(page, "example.com");
  await expect(field(page, "headline")).toHaveText(
    `example.com deja pasar a ${N - 5} de ${N} rastreadores de IA.`,
  );
  await expect(page).toHaveURL(/\/es\/\?check=example\.com$/);
});

test("on a phone only the first purpose group starts open", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "desktop opens every group");
  await serveSite(page, "example.com", { robots: { body: ROBOTS_SAMPLE } });
  await page.goto("/");
  await check(page, "example.com");
  await expect(field(page, "headline")).toBeVisible();
  const open = await field(page, "groups")
    .locator(":scope > details")
    .evaluateAll((els) => els.map((el) => (el as HTMLDetailsElement).open));
  expect(open).toEqual([true, false, false]);
});
