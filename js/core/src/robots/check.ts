import { ALL_CRAWLERS } from "../tokens.gen.js";
import type { Purpose } from "../types.js";
import { decide, patternMatches } from "./match.js";
import {
  parseRobots,
  type RobotsAgent,
  type RobotsGroup,
  type RobotsLine,
  type RobotsRule,
} from "./parse.js";

export type Verdict = "allowed" | "blocked" | "partial";
/** Which group decided: one naming the token, the "*" group, or no group at all. */
export type VerdictSource = "token" | "star" | "none";

export interface CrawlerVerdict {
  id: string;
  vendor: string;
  vendorName: string;
  token: string;
  purpose: Purpose;
  aiSpecific: boolean;
  robotsOnly: boolean;
  /** For the home page "/": blocked there, allowed with some paths disallowed ("partial"), or allowed. */
  verdict: Verdict;
  source: VerdictSource;
  /** The user-agent lines and rules behind the verdict, in file order. */
  lines: RobotsLine[];
}

function groupsFor(
  groups: readonly RobotsGroup[],
  token: string,
): { source: VerdictSource; groups: RobotsGroup[] } {
  const product = token.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a.product === product));
  if (named.length > 0) return { source: "token", groups: named };
  const star = groups.filter((g) => g.agents.some((a) => a.product === "*"));
  return star.length > 0 ? { source: "star", groups: star } : { source: "none", groups: [] };
}

/** Evidence stays readable: at most this many rules (and agent lines) per verdict. */
const MAX_EVIDENCE = 10;
/** Pattern matches one checkRobots call may spend deciding "partial" on a hostile file. */
const MATCH_BUDGET = 200_000;
/** A path segment no Allow rule plausibly names, to probe below a Disallow's path. */
const PROBE = "~rastrolog-probe";

/** A path the rule's pattern certainly matches: wildcards and the "$" anchor removed. */
function representative(pattern: string): string {
  const p = pattern.replace(/\*/g, "").replace(/\$$/, "");
  return p.startsWith("/") ? p : `/${p}`;
}

/**
 * Paths a Disallow covers: its representative and, unless it's "$"-anchored, a
 * path below it. The second catches "Allow: /$" next to "Disallow: /", where the
 * home page is allowed but every other page isn't.
 */
function probes(pattern: string): string[] {
  const path = representative(pattern);
  if (pattern.endsWith("$")) return [path];
  return [path, `${path}${path.endsWith("/") ? "" : "/"}${PROBE}`];
}

interface Work {
  budget: number;
}

/**
 * Whether `path` stays disallowed by `rule` (a Disallow) once every rule is
 * weighed: only an Allow at least as long can rescue it (RFC 9309 §2.2.2), and
 * then only a Disallow longer than that Allow can take it back. `allows` and
 * `disallows` are sorted longest first. When the budget runs out, count the
 * Disallow as applying.
 */
function stillDisallowed(
  rule: RobotsRule,
  path: string,
  allows: readonly RobotsRule[],
  disallows: readonly RobotsRule[],
  work: Work,
): boolean {
  if (work.budget-- <= 0) return true;
  if (!patternMatches(rule.pattern, path)) return false;
  let best = -1;
  for (const allow of allows) {
    if (allow.pattern.length < rule.pattern.length) break;
    if (work.budget-- <= 0) return true;
    if (patternMatches(allow.pattern, path)) {
      best = allow.pattern.length;
      break;
    }
  }
  if (best < 0) return true;
  for (const other of disallows) {
    if (other.pattern.length <= best) break;
    if (work.budget-- <= 0) return true;
    if (patternMatches(other.pattern, path)) return true;
  }
  return false;
}

interface Evaluation {
  verdict: Verdict;
  /** The rules behind the verdict, in file order. */
  deciding: RobotsRule[];
}

function evaluate(rules: readonly RobotsRule[], work: Work): Evaluation {
  const root = decide(rules, "/");
  if (!root.allowed) return { verdict: "blocked", deciding: root.rule ? [root.rule] : [] };
  const active = rules.filter((r) => r.pattern !== "");
  const longestFirst = (a: RobotsRule, b: RobotsRule) => b.pattern.length - a.pattern.length;
  const allows = active.filter((r) => r.allow).sort(longestFirst);
  const disallows = active.filter((r) => !r.allow).sort(longestFirst);
  const deciding = active.filter(
    (rule) =>
      !rule.allow &&
      probes(rule.pattern).some((path) => stillDisallowed(rule, path, allows, disallows, work)),
  );
  if (deciding.length > 0) return { verdict: "partial", deciding };
  return { verdict: "allowed", deciding: root.rule ? [root.rule] : [] };
}

function evidence(
  agents: readonly RobotsAgent[],
  deciding: readonly RobotsRule[],
  matchedProduct: string | null,
): RobotsLine[] {
  const mine = agents.filter((a) => matchedProduct === null || a.product === matchedProduct);
  const byLine = new Map<number, RobotsLine>();
  for (const { line, text } of [
    ...mine.slice(0, MAX_EVIDENCE),
    ...deciding.slice(0, MAX_EVIDENCE),
  ]) {
    if (!byLine.has(line)) byLine.set(line, { line, text });
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

export function checkRobots(text: string | null): CrawlerVerdict[] {
  const groups = text === null ? [] : parseRobots(text);
  const work: Work = { budget: MATCH_BUDGET };
  // Most crawlers fall back to the same "*" groups: evaluate each distinct set once.
  const evaluated = new Map<string, Evaluation>();
  return ALL_CRAWLERS.map(([id, vendor, vendorName, token, purpose, aiSpecific, robotsOnly]) => {
    const found = groupsFor(groups, token);
    const key = found.groups.map((g) => groups.indexOf(g)).join(",");
    let result = evaluated.get(key);
    if (result === undefined) {
      result = evaluate(
        found.groups.flatMap((g) => g.rules),
        work,
      );
      evaluated.set(key, result);
    }
    const matched =
      found.source === "token" ? token.toLowerCase() : found.source === "star" ? "*" : null;
    return {
      id,
      vendor,
      vendorName,
      token,
      purpose,
      aiSpecific,
      robotsOnly,
      verdict: result.verdict,
      source: found.source,
      lines: evidence(
        found.groups.flatMap((g) => g.agents),
        result.deciding,
        matched,
      ),
    };
  });
}

export interface VendorSummary {
  vendor: string;
  vendorName: string;
  /** One verdict per purpose the vendor has crawlers for; "mixed" when they disagree. */
  purposes: Partial<Record<Purpose, Verdict | "mixed">>;
}

export function summarizeByVendor(verdicts: readonly CrawlerVerdict[]): VendorSummary[] {
  const byVendor = new Map<string, VendorSummary>();
  for (const v of verdicts) {
    const summary = byVendor.get(v.vendor) ?? {
      vendor: v.vendor,
      vendorName: v.vendorName,
      purposes: {},
    };
    byVendor.set(v.vendor, summary);
    const prior = summary.purposes[v.purpose];
    summary.purposes[v.purpose] = prior === undefined || prior === v.verdict ? v.verdict : "mixed";
  }
  return [...byVendor.values()];
}
