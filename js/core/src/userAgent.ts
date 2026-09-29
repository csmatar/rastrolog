import { CRAWLERS } from "./crawlers.gen.js";
import type { CrawlerRow, Match } from "./types.js";

function toMatch([id, vendor, vendorName, token, purpose, aiSpecific]: CrawlerRow): Match {
  return { kind: "crawler", id, vendor, vendorName, token, purpose, aiSpecific };
}

/** Classify a User-Agent header. Case-insensitive; the longest matching token wins. */
export function classifyUserAgent(ua: string | null | undefined): Match | null {
  if (!ua?.trim()) return null;
  const lowered = ua.toLowerCase();
  const row = CRAWLERS.find((r) => lowered.includes(r[3].toLowerCase()));
  return row ? toMatch(row) : null;
}
