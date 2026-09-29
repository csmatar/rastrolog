/** Lowercase, drop trailing dots and one leading "www." (Python: `normalize_host`). */
export function normalizeHost(host: string): string {
  const lowered = host.trim().toLowerCase();
  // A loop, not /\.+$/: that regex backtracks quadratically on a long run of
  // dots that isn't at the end, and raw Referer headers can reach this.
  let end = lowered.length;
  while (end > 0 && lowered[end - 1] === ".") end--;
  const h = lowered.slice(0, end);
  return h.startsWith("www.") ? h.slice(4) : h;
}

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * The lowercased hostname of `url`, read the way Python's `urllib.parse.urlsplit`
 * reads it. Deliberately not WHATWG `URL`, which disagrees on inputs pinned in
 * conformance/referrers.json (for example `https:chatgpt.com` and an
 * out-of-range port). Returns null when there's no scheme, no `//` authority,
 * no host, or unbalanced IPv6 brackets (where urlsplit raises).
 */
export function hostOf(url: string): string | null {
  const s = url.replace(/[\t\r\n]/g, "");
  const scheme = SCHEME.exec(s);
  if (!scheme) return null;
  const rest = s.slice(scheme[0].length);
  if (!rest.startsWith("//")) return null;
  const netloc = rest.slice(2).split(/[/?#]/, 1)[0] ?? "";
  if (netloc.includes("[") !== netloc.includes("]")) return null;
  const hostPort = netloc.slice(netloc.lastIndexOf("@") + 1);
  const open = hostPort.indexOf("[");
  const host =
    open >= 0
      ? (hostPort.slice(open + 1).split("]", 1)[0] ?? "")
      : (hostPort.split(":", 1)[0] ?? "");
  return host ? host.toLowerCase() : null;
}
