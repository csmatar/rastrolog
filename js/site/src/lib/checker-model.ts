// Turn the engine's verdicts into what the checker shows: counts and the headline,
// one sentence per verdict per purpose, the grouped table, and the file status lines.
import {
  type CrawlerVerdict,
  type Purpose,
  type RobotsGroup,
  summarizeByVendor,
  summarizeLlmsTxt,
  type Verdict,
} from "@rastrolog/core";
import type { ClientStrings } from "../i18n/client.ts";
import { byCount, fmt, type Lang, list, num, type Plural, plural } from "../i18n/format.ts";
import type { FileOutcome } from "./site-fetch.ts";

type T = ClientStrings["checker"];

export const PURPOSES: readonly Purpose[] = ["training", "user_fetch", "search_index"];

export interface Counts {
  total: number;
  allowed: number;
  blocked: number;
  partial: number;
  /** Crawlers the file names in their own User-agent group. */
  named: number;
}

export function countVerdicts(verdicts: readonly CrawlerVerdict[]): Counts {
  const counts: Counts = { total: verdicts.length, allowed: 0, blocked: 0, partial: 0, named: 0 };
  for (const v of verdicts) {
    counts[v.verdict] += 1;
    if (v.source === "token") counts.named += 1;
  }
  return counts;
}

export function headlineVars(
  counts: Counts,
  host: string,
  lang: Lang,
): { host: string; allowed: string; total: string } {
  return { host, allowed: num(lang, counts.allowed), total: num(lang, counts.total) };
}

export function subline(counts: Counts, lang: Lang, t: T): string {
  const parts: string[] = [];
  if (counts.blocked > 0) parts.push(plural(lang, counts.blocked, t.blockedEverywhere));
  if (counts.partial > 0) parts.push(plural(lang, counts.partial, t.blockedSome));
  const [first, second] = parts;
  if (first !== undefined && second !== undefined)
    return fmt(t.subBoth, { blocked: first, some: second });
  if (first !== undefined) return fmt(t.subOne, { part: first });
  return t.subNone;
}

/** What a crawler that launches tomorrow (named nowhere in the file) will get. */
export type NextCrawler = "open" | "closed" | "none";

export function nextCrawler(
  verdicts: readonly CrawlerVerdict[],
  groups: readonly RobotsGroup[] | null,
): NextCrawler {
  if (groups === null) return "none";
  const hasStar = groups.some((g) => g.agents.some((a) => a.product === "*"));
  if (!hasStar) return "open";
  const star = verdicts.find((v) => v.source === "star");
  return star !== undefined && star.verdict !== "blocked" ? "open" : "closed";
}

export interface Row {
  token: string;
  vendorName: string;
  verdict: Verdict;
  /** The robots.txt lines that decided, joined; null when no rule applies. */
  evidence: string | null;
}

export interface Group {
  purpose: Purpose;
  blocked: number;
  partial: number;
  allowed: number;
  rows: Row[];
}

const RANK: Readonly<Record<Verdict, number>> = { blocked: 0, partial: 1, allowed: 2 };

export function groupVerdicts(verdicts: readonly CrawlerVerdict[]): Group[] {
  return PURPOSES.map((purpose) => {
    const mine = verdicts.filter((v) => v.purpose === purpose);
    const count = (verdict: Verdict) => mine.filter((v) => v.verdict === verdict).length;
    const rows = [...mine]
      .sort((a, b) => RANK[a.verdict] - RANK[b.verdict]) // stable: file order within a verdict
      .map((v) => ({
        token: v.token,
        vendorName: v.vendorName,
        verdict: v.verdict,
        evidence: v.lines.length > 0 ? v.lines.map((l) => l.text.trim()).join("  ") : null,
      }));
    return {
      purpose,
      blocked: count("blocked"),
      partial: count("partial"),
      allowed: count("allowed"),
      rows,
    };
  });
}

export interface Line {
  verdict: Verdict;
  text: string;
}

export function summarize(
  verdicts: readonly CrawlerVerdict[],
  host: string,
  lang: Lang,
  t: T,
): Line[] {
  const vendors = summarizeByVendor(verdicts);
  const lines: Line[] = [];
  for (const purpose of PURPOSES) {
    const tpl = t.summary[purpose];
    const who = (keep: (v: Verdict | "mixed") => boolean) =>
      vendors
        .filter((s) => {
          const v = s.purposes[purpose];
          return v !== undefined && keep(v);
        })
        .map((s) => s.vendorName);
    const blocked = who((v) => v === "blocked");
    const some = who((v) => v === "partial" || v === "mixed");
    const allowed = who((v) => v === "allowed");
    if (blocked.length === 0 && some.length === 0) {
      lines.push({ verdict: "allowed", text: fmt(tpl.all, { host }) });
      continue;
    }
    if (allowed.length === 0 && some.length === 0) {
      lines.push({ verdict: "blocked", text: fmt(tpl.none, { host }) });
      continue;
    }
    const say = (names: string[], forms: Plural, verdict: Verdict) => {
      if (names.length > 0) {
        lines.push({
          verdict,
          text: fmt(byCount(names.length, forms), { vendors: list(lang, names), host }),
        });
      }
    };
    say(blocked, tpl.blocked, "blocked");
    say(some, tpl.partial, "partial");
    say(allowed, tpl.allowed, "allowed");
  }
  return lines;
}

export function countLines(text: string): number {
  if (text === "") return 0;
  const n = text.split(/\r\n|\r|\n/).length;
  return /(\r\n|\r|\n)$/.test(text) ? n - 1 : n;
}

export type RobotsSource = FileOutcome | { kind: "pasted"; text: string };
export type LlmsSource = FileOutcome | { kind: "pasted"; text: string };

/** The mark beside a file status line: read, absent (or not a real file), or unreadable. */
export type FileMark = "ok" | "none" | "warn";

export function fileMark(source: RobotsSource): FileMark {
  if (source.kind === "found" || source.kind === "pasted") return "ok";
  if (source.kind === "missing" || source.kind === "html") return "none";
  return "warn";
}

export function robotsLine(source: RobotsSource, lang: Lang, t: T): string {
  switch (source.kind) {
    case "found":
      return plural(lang, countLines(source.text), t.robots.found, { status: source.status });
    case "pasted":
      return plural(lang, countLines(source.text), t.robots.pasted);
    case "missing":
      return fmt(
        source.status === 404 || source.status === 410 ? t.robots.missing : t.robots.unavailable,
        {
          status: source.status,
        },
      );
    case "html":
      return fmt(t.robots.html, { status: source.status });
    default:
      return ""; // server-error and unreachable never render a report
  }
}

export function llmsLine(source: LlmsSource, lang: Lang, t: T): string {
  if (source.kind === "unreachable") return t.llms.unreachable;
  if (source.kind !== "found" && source.kind !== "pasted") return t.llms.missing;
  const { title, links } = summarizeLlmsTxt(source.text);
  const linkText = plural(lang, links, t.llms.links);
  if (source.kind === "pasted") return fmt(t.llms.pasted, { links: linkText });
  return title === null
    ? fmt(t.llms.foundUntitled, { status: source.status, links: linkText })
    : fmt(t.llms.found, { status: source.status, title, links: linkText });
}
