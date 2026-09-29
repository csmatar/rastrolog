import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";

export const SIGNALS = JSON.parse(
  readFileSync(new URL("../../../signals.json", import.meta.url), "utf8"),
) as {
  crawlers: { vendor: string; token: string; docs_url: string; vendor_documented?: boolean }[];
  referrers: unknown[];
};

export const COUNTS = {
  crawlers: SIGNALS.crawlers.length,
  vendors: new Set(SIGNALS.crawlers.map((c) => c.vendor)).size,
  chats: SIGNALS.referrers.length,
  documented: SIGNALS.crawlers.filter((c) => c.vendor_documented !== false).length,
};

export const ROBOTS_SAMPLE = readFileSync(
  new URL("../test/fixtures/robots-sample.txt", import.meta.url),
  "utf8",
);
export const LLMS_SAMPLE = readFileSync(
  new URL("../test/fixtures/llms-sample.txt", import.meta.url),
  "utf8",
);

/** Every https request fails unless a test routes it: tests never touch the real internet. */
export async function isolate(page: Page): Promise<void> {
  await page.route(/^https:\/\//, (route) => route.abort("blockedbyclient"));
}

export type Reply =
  | { status?: number; body?: string; cors?: boolean; contentType?: string }
  | "abort";

/** Serve https://<host>/robots.txt and /llms.txt; a file left out answers 404 (with CORS). */
export async function serveSite(
  page: Page,
  host: string,
  files: { robots?: Reply; llms?: Reply },
): Promise<void> {
  const answer = (reply: Reply | undefined) => (route: Route) => {
    if (reply === "abort") return route.abort("failed");
    const r = reply ?? { status: 404 };
    // Playwright doesn't enforce CORS on responses it fulfils, and a real CORS refusal
    // reaches the page as the same TypeError as a network error: abort instead.
    if (r.cors === false) return route.abort("accessdenied");
    return route.fulfill({
      status: r.status ?? 200,
      body: r.body ?? "",
      headers: {
        "content-type": r.contentType ?? "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    });
  };
  await page.route(`https://${host}/robots.txt`, answer(files.robots));
  await page.route(`https://${host}/llms.txt`, answer(files.llms));
}

export const NGINX_LOG = fileURLToPath(
  new URL("../../../conformance/logs/nginx.log", import.meta.url),
);
