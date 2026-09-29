import { existsSync, readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const SITE = "https://site.test";
const PAGES = new URL("./pages/", import.meta.url);
const SNIPPET = readFileSync(new URL("../dist/snippet.min.js", import.meta.url), "utf8");
const TYPES: Record<string, string> = { html: "text/html", js: "text/javascript" };

async function serveSite(page: Page) {
  await page.route(`${SITE}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    const file = new URL(`.${pathname}`, PAGES);
    if (pathname !== "/snippet.min.js" && !existsSync(file)) return route.fulfill({ status: 404 }); // e.g. /favicon.ico
    const body = pathname === "/snippet.min.js" ? SNIPPET : readFileSync(file, "utf8");
    return route.fulfill({
      contentType: TYPES[pathname.split(".").pop() ?? ""] ?? "text/plain",
      body,
    });
  });
}

/** Land on `path` by clicking a link on `from`, so the browser sets document.referrer. */
async function landFrom(page: Page, from: string, path: string) {
  await serveSite(page);
  await page.route(`${from}/`, (route) =>
    route.fulfill({ contentType: "text/html", body: `<a id="go" href="${SITE}${path}">go</a>` }),
  );
  await page.goto(`${from}/`);
  await Promise.all([page.waitForURL(`${SITE}${path}`), page.click("#go")]);
  await page.waitForLoadState("load");
}

const aiTraffic = (page: Page) =>
  page.evaluate(() => (window as { aiTraffic?: unknown }).aiTraffic);

// Dispatch runs in a `load` listener, so positive tests wait for the stub to record calls.
// waitForFunction callbacks run in the page: keep them self-contained (no Node-side helpers).
type Recorded = {
  dataLayer?: unknown[];
  plausible?: { q?: unknown[] };
  posthog?: { calls: unknown[] };
  seen?: unknown[];
};

test("GA4 receives ai_referral and the user property", async ({ page }) => {
  await landFrom(page, "https://chatgpt.com", "/ga4.html");
  expect(await page.evaluate(() => document.referrer)).toBe("https://chatgpt.com/");
  await page.waitForFunction(() => ((window as unknown as Recorded).dataLayer?.length ?? 0) >= 2);
  expect(await aiTraffic(page)).toEqual({ source: "chatgpt", vendor: "openai", landing: true });
  const calls = await page.evaluate(() =>
    (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((args) => Array.from(args)),
  );
  expect(calls).toEqual([
    ["set", "user_properties", { ai_last_source: "chatgpt" }],
    ["event", "ai_referral", { ai_source: "chatgpt" }],
  ]);
});

test("Plausible receives the AI Referral goal", async ({ page }) => {
  await landFrom(page, "https://claude.ai", "/plausible.html");
  await page.waitForFunction(
    () => ((window as unknown as Recorded).plausible?.q?.length ?? 0) >= 1,
  );
  const queue = await page.evaluate(
    () => (window as unknown as { plausible: { q: unknown[] } }).plausible.q,
  );
  expect(queue).toEqual([["AI Referral", { props: { source: "claude" } }]]);
});

test("PostHog captures and sets the person property", async ({ page }) => {
  await landFrom(page, "https://www.perplexity.ai", "/posthog.html");
  await page.waitForFunction(
    () => ((window as unknown as Recorded).posthog?.calls.length ?? 0) >= 2,
  );
  const calls = await page.evaluate(
    () => (window as unknown as { posthog: { calls: unknown[] } }).posthog.calls,
  );
  expect(calls).toEqual([
    ["capture", "ai_referral", { source: "perplexity" }],
    ["setPersonProperties", { ai_last_source: "perplexity" }],
  ]);
});

test("a non-AI referrer sends nothing", async ({ page }) => {
  await landFrom(page, "https://www.google.com", "/ga4.html");
  expect(await aiTraffic(page)).toBeNull();
  expect(
    await page.evaluate(() => (window as unknown as { dataLayer: unknown[] }).dataLayer),
  ).toEqual([]);
});

test("the next page in the session carries the source without a second event", async ({ page }) => {
  await landFrom(page, "https://chatgpt.com", "/ga4.html");
  await Promise.all([page.waitForURL(`${SITE}/next.html`), page.click("#next")]);
  await page.waitForLoadState("load");
  expect(await aiTraffic(page)).toEqual({ source: "chatgpt", vendor: "openai", landing: false });
  expect(
    await page.evaluate(() => (window as unknown as { dataLayer: unknown[] }).dataLayer),
  ).toEqual([]);
});

test("data-callback runs before the rastrolog:match event", async ({ page }) => {
  await landFrom(page, "https://chatgpt.com", "/callback.html");
  await page.waitForFunction(() => ((window as unknown as Recorded).seen?.length ?? 0) >= 2);
  const detail = { source: "chatgpt", vendor: "openai", landing: true };
  expect(await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([
    ["callback", detail],
    ["event", detail],
  ]);
});
