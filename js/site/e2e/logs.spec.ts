import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { isolate, NGINX_LOG } from "./helpers.ts";

const NGINX = readFileSync(NGINX_LOG);
const DIR = mkdtempSync(join(tmpdir(), "rastrolog-e2e-"));
const HEADLINE = "7 AI crawler visits. 4 people sent by AI chats.";

function file(name: string, data: Buffer): string {
  const path = join(DIR, name);
  writeFileSync(path, data);
  return path;
}

function copies(n: number): Buffer {
  return Buffer.concat(Array.from({ length: n }, () => NGINX));
}

const result = (page: Page) => page.locator("[data-log-result]");
const field = (page: Page, name: string) => result(page).locator(`[data-f="${name}"]`);

async function pasteLines(
  page: Page,
  text: string,
  button = "Read these lines",
  label = "Log lines",
): Promise<void> {
  await page
    .locator("[data-log-paste]")
    .locator("xpath=ancestor::details")
    .locator("summary")
    .click();
  await page.getByLabel(label).fill(text);
  await page.getByRole("button", { name: button }).click();
}

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

test("pasted lines: the CLI's numbers, with AI crawlers apart from search engines", async ({
  page,
}) => {
  await page.goto("/");
  await pasteLines(page, NGINX.toString("utf8"));
  await expect(field(page, "headline")).toHaveText(HEADLINE);
  await expect(field(page, "meta")).toHaveText(
    "pasted lines · nginx/Apache combined · 15 lines · 1 skipped · read on this device",
  );
  await expect(field(page, "crawler-rows").getByRole("row")).toHaveCount(4);
  await expect(field(page, "crawler-rows").getByRole("row").first()).toContainText("GPTBot");
  await expect(field(page, "referral-rows").getByRole("row")).toHaveCount(3);
  await expect(field(page, "search-rows")).toContainText("Googlebot");
  const rows = field(page, "crawler-rows");
  await expect(
    rows.getByRole("row", { name: /ChatGPT-User/ }).locator('[data-f="purpose"]'),
  ).toHaveCSS("background-color", "rgb(4, 181, 117)");
  await expect(
    rows.getByRole("row", { name: /PerplexityBot/ }).locator('[data-f="purpose"]'),
  ).toHaveCSS("background-color", "rgb(106, 69, 224)");
});

test("a picked file is read without any request leaving the page", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost:4321/")) outside.push(r.url());
  });
  await page.goto("/");
  await page.locator("[data-log-file]").setInputFiles(NGINX_LOG);
  await expect(field(page, "headline")).toHaveText(HEADLINE);
  await expect(field(page, "meta")).toContainText("nginx.log · nginx/Apache combined · 15 lines");
  expect(outside).toEqual([]);
});

test("gzip, a concatenated multi-member gzip, and a truncated gzip", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("[data-log-file]");
  await input.setInputFiles(file("access.log.gz", gzipSync(NGINX)));
  await expect(field(page, "headline")).toHaveText(HEADLINE);
  await input.setInputFiles(
    file("access.log.1.gz", Buffer.concat([gzipSync(NGINX), gzipSync(NGINX)])),
  );
  await expect(field(page, "headline")).toHaveText(
    "14 AI crawler visits. 8 people sent by AI chats.",
  );
  await expect(field(page, "meta")).toContainText(
    "access.log.1.gz · nginx/Apache combined · 30 lines · 2 skipped",
  );
  await expect(field(page, "truncated")).toBeHidden();
  const gz = gzipSync(NGINX);
  await input.setInputFiles(file("cut.log.gz", gz.subarray(0, gz.length - 12)));
  await expect(field(page, "truncated")).toBeVisible();
});

test("a drop on the panel is read; a drop anywhere else can't navigate away", async ({ page }) => {
  await page.goto("/");
  const prevented = await page.evaluate(() => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  const dataTransfer = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], "dropped.log", { type: "text/plain" }));
    return dt;
  }, NGINX.toString("utf8"));
  await page.dispatchEvent("[data-log-drop]", "drop", { dataTransfer });
  await expect(field(page, "meta")).toContainText("dropped.log");
});

test("an unknown format shows its first line and lets the visitor choose one", async ({ page }) => {
  await page.goto("/");
  await pasteLines(page, `not a log line\n${NGINX.toString("utf8")}`);
  const unknown = page.locator("[data-log-unknown]");
  await expect(unknown).toContainText("rastrolog doesn't recognise this log format.");
  await expect(unknown.locator('[data-f="line"]')).toHaveText("not a log line");
  await unknown.getByLabel("Read it as").selectOption("combined");
  await unknown.getByRole("button", { name: "Try again" }).click();
  await expect(field(page, "meta")).toContainText("16 lines · 2 skipped");
  await expect(field(page, "headline")).toHaveText(HEADLINE);
});

test("log text shaped like HTML stays text", async ({ page }) => {
  await page.goto("/");
  const line =
    '203.0.113.7 - - [22/Sep/2026:08:00:00 +0000] "GET /<img/src=x/onerror=window.__pwned=1> HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (compatible; GPTBot/1.4; +https://openai.com/gptbot)"';
  await pasteLines(page, `${line}\n`);
  await expect(field(page, "crawler-rows")).toContainText("/<img/src=x/onerror=window.__pwned=1>");
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
});

test("Spanish report", async ({ page }) => {
  await page.goto("/es/");
  await pasteLines(page, NGINX.toString("utf8"), "Leer estas líneas", "Líneas del log");
  await expect(field(page, "headline")).toHaveText(
    "7 visitas de rastreadores de IA. 4 personas llegaron desde chats de IA.",
  );
});

test("a 100 MB log: progress, a responsive page, then the report", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one big file is enough");
  test.setTimeout(180_000);
  const n = Math.ceil((100 * 1_048_576) / NGINX.length);
  await page.goto("/");
  await page.locator("[data-log-file]").setInputFiles(file("big.log", copies(n)));
  const progress = page.locator("[data-log-progress]");
  await expect(progress).toBeVisible();
  await expect(progress.locator('[data-f="amount"]')).toContainText(/ of 10\d\.\d MB$/);
  const started = Date.now();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  expect(Date.now() - started).toBeLessThan(1000);
  const fmt = new Intl.NumberFormat("en");
  await expect(field(page, "headline")).toHaveText(
    `${fmt.format(7 * n)} AI crawler visits. ${fmt.format(4 * n)} people sent by AI chats.`,
    { timeout: 150_000 },
  );
});

test("cancel stops reading and keeps nothing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one big file is enough");
  await page.goto("/");
  await page
    .locator("[data-log-file]")
    .setInputFiles(file("cancel.log", copies(Math.ceil((100 * 1_048_576) / NGINX.length))));
  await page.locator("[data-log-progress]").getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-log-message]")).toHaveText(
    "Stopped. Nothing from the file was kept.",
  );
  await expect(result(page)).toBeHidden();
  await expect(page.locator("[data-log-progress]")).toBeHidden();
});
