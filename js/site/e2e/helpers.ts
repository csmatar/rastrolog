import { readFileSync } from "node:fs";

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
