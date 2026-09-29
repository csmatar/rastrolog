// Build-time facts from the repo-root signals.json. Only .astro frontmatter imports
// this (it runs during the build), so the file itself never ships to the browser.
import type { Purpose } from "@rastrolog/core";
import raw from "../../../../signals.json";

interface CrawlerEntry {
  id: string;
  vendor: string;
  vendor_name: string;
  token: string;
  purpose: Purpose;
  docs_url: string;
  vendor_documented?: boolean;
}

interface ReferrerEntry {
  product: string;
}

const signals = raw as unknown as { crawlers: CrawlerEntry[]; referrers: ReferrerEntry[] };

export interface VendorCrawlers {
  vendor: string;
  name: string;
  crawlers: { token: string; purpose: Purpose; docsUrl: string; vendorDocumented: boolean }[];
}

export function vendors(): VendorCrawlers[] {
  const byVendor = new Map<string, VendorCrawlers>();
  for (const c of signals.crawlers) {
    let entry = byVendor.get(c.vendor);
    if (entry === undefined) {
      entry = { vendor: c.vendor, name: c.vendor_name, crawlers: [] };
      byVendor.set(c.vendor, entry);
    }
    entry.crawlers.push({
      token: c.token,
      purpose: c.purpose,
      docsUrl: c.docs_url,
      vendorDocumented: c.vendor_documented !== false,
    });
  }
  return [...byVendor.values()];
}

export const crawlerCount = signals.crawlers.length;
export const chatCount = signals.referrers.length;
export const vendorCount = vendors().length;
export const documentedCount = signals.crawlers.filter((c) => c.vendor_documented !== false).length;
export const referrerProducts: readonly string[] = signals.referrers.map((r) => r.product);

/** The crawler the signup band's sample alert is written for. */
export function sampleAlert(): { token: string; vendorName: string; docsUrl: string } {
  const c = signals.crawlers.find((x) => x.id === "mistral-mistralai-training");
  if (c === undefined)
    throw new Error("signals.json no longer lists mistral-mistralai-training; pick another sample");
  return { token: c.token, vendorName: c.vendor_name, docsUrl: c.docs_url };
}
