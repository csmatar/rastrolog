/** Lowercase, drop trailing dots and one leading "www." (Python: `normalize_host`). */
export function normalizeHost(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.+$/, "");
  return h.startsWith("www.") ? h.slice(4) : h;
}
