// ?check=<site> runs the checker on load. The Kit confirmation email links here,
// and so does the address bar after every check.
import { normalizeDomainInput } from "@rastrolog/core";

/** "https://example.com:8443" → "example.com:8443". */
export function siteOf(origin: string): string {
  return origin.replace(/^https:\/\//, "");
}

export function readCheckParam(search: string): string | null {
  const raw = new URLSearchParams(search).get("check");
  if (raw === null) return null;
  const parsed = normalizeDomainInput(raw);
  return parsed.ok ? siteOf(parsed.origin) : null;
}

export function reportUrl(pathname: string, site: string): string {
  return `${pathname}?check=${encodeURIComponent(site)}`;
}
