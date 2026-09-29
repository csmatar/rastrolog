import { ALL_CRAWLERS } from "../tokens.gen.js";
import type { Purpose } from "../types.js";
import { decide } from "./match.js";
import { parseRobots, type RobotsGroup, type RobotsLine, type RobotsRule } from "./parse.js";

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

/** A path the rule's pattern certainly matches: wildcards and the "$" anchor removed. */
function representative(pattern: string): string {
  const p = pattern.replace(/\*/g, "").replace(/\$$/, "");
  return p.startsWith("/") ? p : `/${p}`;
}

function evaluate(
  rules: readonly RobotsRule[],
  agentLines: RobotsLine[],
  matchedProduct: string | null,
) {
  const root = decide(rules, "/");
  let verdict: Verdict;
  let deciding: RobotsRule[];
  if (!root.allowed) {
    verdict = "blocked";
    deciding = root.rule ? [root.rule] : [];
  } else {
    deciding = rules.filter(
      (r) => !r.allow && r.pattern !== "" && !decide(rules, representative(r.pattern)).allowed,
    );
    verdict = deciding.length > 0 ? "partial" : "allowed";
    if (verdict === "allowed" && root.rule) deciding = [root.rule];
  }
  const agents = agentLines.filter(
    (a) => matchedProduct === null || ("product" in a && a.product === matchedProduct),
  );
  const byLine = new Map<number, RobotsLine>();
  for (const { line, text } of [...agents, ...deciding]) {
    if (!byLine.has(line)) byLine.set(line, { line, text });
  }
  const lines = [...byLine.values()].sort((a, b) => a.line - b.line);
  return { verdict, lines };
}

export function checkRobots(text: string | null): CrawlerVerdict[] {
  const groups = text === null ? [] : parseRobots(text);
  return ALL_CRAWLERS.map(([id, vendor, vendorName, token, purpose, aiSpecific, robotsOnly]) => {
    const found = groupsFor(groups, token);
    const rules = found.groups.flatMap((g) => g.rules);
    const agentLines = found.groups.flatMap((g) => g.agents);
    const matched =
      found.source === "token" ? token.toLowerCase() : found.source === "star" ? "*" : null;
    const { verdict, lines } = evaluate(rules, agentLines, matched);
    return {
      id,
      vendor,
      vendorName,
      token,
      purpose,
      aiSpecific,
      robotsOnly,
      verdict,
      source: found.source,
      lines,
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
