import { hostOf, normalizeHost } from "./host.js";
import { REFERRERS } from "./referrers.gen.js";
import type { Match, ReferrerRow } from "./types.js";

export interface ReferrerOptions {
  /** The site's own host. A referrer from exactly this host (after normalisation) is never a referral. */
  ownHost?: string | null | undefined;
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
  for (let start = 0; start < labels.length - 1; start++) {
    const candidate = labels.slice(start).join(".");
    const row = REFERRERS.find((r) => r[4].includes(candidate));
    if (row) return toMatch(row);
  }
  return null;
}
