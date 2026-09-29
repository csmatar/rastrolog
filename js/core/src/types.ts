export type Purpose = "training" | "user_fetch" | "search_index";

/** What a user agent or referrer was classified as. Python's `Match`, in camelCase. */
export interface Match {
  kind: "crawler" | "referral";
  /** Stable id from signals.json, e.g. "openai-gptbot" or "chatgpt". */
  id: string;
  vendor: string;
  vendorName: string;
  /** Referrals only: the product name, e.g. "ChatGPT". */
  product?: string;
  /** Crawlers only: the user-agent token, e.g. "GPTBot". */
  token?: string;
  /** Crawlers only. */
  purpose?: Purpose;
  /** False for search-engine crawlers (Googlebot, bingbot, Applebot); true for every referral. */
  aiSpecific: boolean;
}

/** One referrer entry: id, vendor, vendor name, product, normalised hosts. */
export type ReferrerRow = readonly [
  id: string,
  vendor: string,
  vendorName: string,
  product: string,
  hosts: readonly string[],
];

/** One `match: "user_agent"` crawler. Rows are ordered longest token first. */
export type CrawlerRow = readonly [
  id: string,
  vendor: string,
  vendorName: string,
  token: string,
  purpose: Purpose,
  aiSpecific: boolean,
];
