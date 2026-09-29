import { hostOf, normalizeHost } from "./host.js";
import { REFERRERS } from "./referrers.gen.js";
import type { Match, ReferrerRow } from "./types.js";

export interface ReferrerOptions {
  /** The site's own host. A referrer from exactly this host (after normalisation) is never a referral. */
  ownHost?: string | null | undefined;
}

let maxLabels = 0;

/** Label count of the longest listed host (e.g. 3 for notebooklm.google.com). */
function maxReferrerLabels(): number {
  if (maxLabels === 0) {
    for (const row of REFERRERS) {
      for (const host of row[4]) maxLabels = Math.max(maxLabels, host.split(".").length);
    }
  }
  return maxLabels;
}

function toMatch([id, vendor, vendorName, product]: ReferrerRow): Match {
  return { kind: "referral", id, vendor, vendorName, product, aiSpecific: true };
}

/** Classify a Referer header / `document.referrer`. Rules: conformance/README.md. */
export function classifyReferrer(
  url: string | null | undefined,
  options: ReferrerOptions = {},
): Match | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const hostname = hostOf(trimmed);
  if (!hostname) return null;
  const host = normalizeHost(hostname);
  if (options.ownHost && host === normalizeHost(options.ownHost)) return null;
  const labels = host.split(".");
  // Only suffixes with at most as many labels as the longest listed host can match;
  // starting there keeps a hostile many-label host linear, not quadratic.
  for (
    let start = Math.max(0, labels.length - maxReferrerLabels());
    start < labels.length - 1;
    start++
  ) {
    const candidate = labels.slice(start).join(".");
    const row = REFERRERS.find((r) => r[4].includes(candidate));
    if (row) return toMatch(row);
  }
  return null;
}
