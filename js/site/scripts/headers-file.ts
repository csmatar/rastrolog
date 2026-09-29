// Cloudflare Pages' _headers format: a path line, then indented "Name: value" lines.
// The unit tests, the Playwright fixture and verify-live all read the file through
// this, so the policy the tests enforce is the one that ships.
import { readFileSync } from "node:fs";

export interface HeaderRule {
  path: string;
  headers: Record<string, string>;
}

export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: {} });
      continue;
    }
    const rule = rules[rules.length - 1];
    const colon = line.indexOf(":");
    if (rule === undefined || colon < 0)
      throw new Error(`_headers: header before any path: ${line}`);
    rule.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return rules;
}

export function readHeadersFile(): HeaderRule[] {
  return parseHeaders(readFileSync(new URL("../public/_headers", import.meta.url), "utf8"));
}

export function headerFor(
  rules: readonly HeaderRule[],
  path: string,
  name: string,
): string | undefined {
  const rule = rules.find((r) => r.path === path);
  if (rule === undefined) return undefined;
  const key = Object.keys(rule.headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : rule.headers[key];
}
