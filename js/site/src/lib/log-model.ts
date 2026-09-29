// Turn a ParseResult (the same report as the CLI) into what the log section shows.
import type { CrawlerRow, ParseResult, ReferralRow } from "@rastrolog/core";
import type { ClientStrings } from "../i18n/client.ts";
import { decimal, fmt, type Lang, num, plural, pluralForm } from "../i18n/format.ts";

type T = ClientStrings["logs"];

export interface CrawlerLine {
  vendorName: string;
  token: string;
  purpose: string;
  requests: number;
  pages: number;
  lastSeen: string;
  topPages: string;
}

export interface ReferralLine {
  product: string;
  visits: number;
  lastSeen: string;
  landing: string;
}

export interface LogView {
  format: ParseResult["format"];
  lines: number;
  records: number;
  skipped: number;
  truncated: boolean;
  aiRequests: number;
  aiVisits: number;
  aiCrawlers: number;
  crawlers: CrawlerLine[];
  searchEngines: CrawlerLine[];
  referrals: ReferralLine[];
}

/** "2026-09-22 08:00": UTC, to the minute, like the CLI table. */
export function formatLastSeen(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/** One "path (count)" per line. */
export function pageList(pages: CrawlerRow["topPages"]): string {
  return pages.map(([path, count]) => `${path} (${count})`).join("\n");
}

function crawlerLine(c: CrawlerRow): CrawlerLine {
  return {
    vendorName: c.vendorName,
    token: c.token,
    purpose: c.purpose,
    requests: c.requests,
    pages: c.uniquePages,
    lastSeen: formatLastSeen(c.lastSeen),
    topPages: pageList(c.topPages),
  };
}

function referralLine(r: ReferralRow): ReferralLine {
  return {
    product: r.product,
    visits: r.visits,
    lastSeen: formatLastSeen(r.lastSeen),
    landing: pageList(r.topPages),
  };
}

export function toLogView(result: ParseResult): LogView {
  const ai = result.report.crawlers.filter((c) => c.aiSpecific);
  return {
    format: result.format,
    lines: result.lines,
    records: result.records,
    skipped: result.skipped,
    truncated: result.truncated,
    aiRequests: ai.reduce((sum, c) => sum + c.requests, 0),
    aiVisits: result.report.referrals.reduce((sum, r) => sum + r.visits, 0),
    aiCrawlers: ai.length,
    crawlers: ai.map(crawlerLine),
    searchEngines: result.report.crawlers.filter((c) => !c.aiSpecific).map(crawlerLine),
    referrals: result.report.referrals.map(referralLine),
  };
}

export function logMeta(view: LogView, name: string, lang: Lang, t: T): string {
  return fmt(t.meta, {
    name,
    format: view.format === null ? "?" : t.formats[view.format],
    lines: plural(lang, view.lines, t.lines),
    skipped: plural(lang, view.skipped, t.skipped),
  });
}

export interface Headline {
  crawlers: { n: string; text: string };
  chats: { n: string; text: string };
}

/** The numbers are separate so the page can colour them. */
export function visitsHeadline(view: LogView, lang: Lang, t: T): Headline {
  return {
    crawlers: {
      n: num(lang, view.aiRequests),
      text: pluralForm(lang, view.aiRequests, t.crawlerVisits),
    },
    chats: { n: num(lang, view.aiVisits), text: pluralForm(lang, view.aiVisits, t.chatVisits) },
  };
}

const MIB = 1_048_576;

export function progressText(read: number, total: number | null, lang: Lang, t: T): string {
  const done = decimal(lang, read / MIB);
  return total === null
    ? fmt(t.progressUnknown, { read: done })
    : fmt(t.progress, { read: done, total: decimal(lang, total / MIB) });
}

export function percent(read: number, total: number): number {
  return total <= 0 ? 100 : Math.min(100, Math.round((read / total) * 100));
}
