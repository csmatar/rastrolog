// The domain checker's input. Browser-facing only (not a conformance rule), so it
// uses WHATWG URL. robots.txt and llms.txt are always fetched over https.
export type DomainInput =
  | { ok: true; host: string; origin: string }
  | { ok: false; reason: "empty" | "invalid" | "ip" | "local" };

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

export function normalizeDomainInput(input: string): DomainInput {
  const s = input.trim();
  if (s === "") return { ok: false, reason: "empty" };
  let url: URL;
  try {
    url = new URL(SCHEME.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "invalid" };
  const host = url.hostname.replace(/\.$/, "");
  if (host.startsWith("[") || IPV4.test(host)) return { ok: false, reason: "ip" };
  if (host === "localhost" || !host.includes(".") || LOCAL_SUFFIXES.some((x) => host.endsWith(x))) {
    return { ok: false, reason: "local" };
  }
  return { ok: true, host, origin: `https://${host}${url.port ? `:${url.port}` : ""}` };
}
