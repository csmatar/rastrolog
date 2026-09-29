// Port of python/src/rastrolog/report.py; output shape: conformance/README.md.
import { classifyReferrer } from "../referrer.js";
import type { Match } from "../types.js";
import { classifyUserAgent } from "../userAgent.js";
import type { LogRecord } from "./formats.js";
import { formatIsoSeconds } from "./time.js";

export type PageCount = readonly [path: string, count: number];

export interface CrawlerRow {
  id: string;
  vendor: string;
  vendorName: string;
  token: string;
  purpose: string;
  aiSpecific: boolean;
  requests: number;
  uniquePages: number;
  lastSeen: number;
  topPages: PageCount[];
}

export interface ReferralRow {
  id: string;
  vendor: string;
  vendorName: string;
  product: string;
  visits: number;
  uniquePages: number;
  lastSeen: number;
  topPages: PageCount[];
}

export interface PageRow {
  path: string;
  crawlerRequests: number;
  referralVisits: number;
  crawlers: PageCount[];
  referrals: PageCount[];
}

export interface Report {
  records: number;
  skipped: number;
  crawlers: CrawlerRow[];
  referrals: ReferralRow[];
  pages: PageRow[];
}

/** Code-point string order (Python's str <), unlike UTF-16 "<" outside the BMP. */
export function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i) ?? 0;
    const cb = b.codePointAt(j) ?? 0;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : j < b.length ? -1 : 0;
}

function top(counter: Map<string, number>, limit: number): PageCount[] {
  return [...counter.entries()]
    .sort((x, y) => y[1] - x[1] || compareCodePoints(x[0], y[0]))
    .slice(0, limit);
}

interface Tally {
  match: Match;
  count: number;
  pages: Map<string, number>;
  lastSeen: number;
}

function bump(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

export class Aggregator {
  records = 0;
  private readonly ownHost: string | null;
  private readonly crawlers = new Map<string, Tally>();
  private readonly referrals = new Map<string, Tally>();
  private readonly pageCrawlers = new Map<string, Map<string, number>>();
  private readonly pageReferrals = new Map<string, Map<string, number>>();

  constructor(options: { ownHost?: string | null | undefined } = {}) {
    this.ownHost = options.ownHost ?? null;
  }

  add(record: LogRecord): void {
    this.records++;
    const crawler = classifyUserAgent(record.ua);
    if (crawler !== null) {
      this.tally(this.crawlers, crawler, record);
      if (crawler.aiSpecific) {
        const counts = this.pageCrawlers.get(record.path) ?? new Map<string, number>();
        this.pageCrawlers.set(record.path, counts);
        bump(counts, crawler.token ?? crawler.id);
      }
      return;
    }
    const referral = classifyReferrer(record.referrer, { ownHost: this.ownHost });
    if (referral !== null) {
      this.tally(this.referrals, referral, record);
      const counts = this.pageReferrals.get(record.path) ?? new Map<string, number>();
      this.pageReferrals.set(record.path, counts);
      bump(counts, referral.product ?? referral.id);
    }
  }

  private tally(bucket: Map<string, Tally>, match: Match, record: LogRecord): void {
    const t = bucket.get(match.id) ?? {
      match,
      count: 0,
      pages: new Map<string, number>(),
      lastSeen: record.ts,
    };
    bucket.set(match.id, t);
    t.count++;
    bump(t.pages, record.path);
    if (record.ts > t.lastSeen) t.lastSeen = record.ts;
  }

  result(options: { top?: number | undefined; skipped?: number | undefined } = {}): Report {
    const limit = options.top ?? 10;
    const byId = (a: { id: string }, b: { id: string }) => compareCodePoints(a.id, b.id);
    const crawlers = [...this.crawlers.values()]
      .map(
        (t): CrawlerRow => ({
          id: t.match.id,
          vendor: t.match.vendor,
          vendorName: t.match.vendorName,
          token: t.match.token ?? t.match.id,
          purpose: t.match.purpose ?? "",
          aiSpecific: t.match.aiSpecific,
          requests: t.count,
          uniquePages: t.pages.size,
          lastSeen: t.lastSeen,
          topPages: top(t.pages, limit),
        }),
      )
      .sort((a, b) => b.requests - a.requests || byId(a, b));
    const referrals = [...this.referrals.values()]
      .map(
        (t): ReferralRow => ({
          id: t.match.id,
          vendor: t.match.vendor,
          vendorName: t.match.vendorName,
          product: t.match.product ?? t.match.id,
          visits: t.count,
          uniquePages: t.pages.size,
          lastSeen: t.lastSeen,
          topPages: top(t.pages, limit),
        }),
      )
      .sort((a, b) => b.visits - a.visits || byId(a, b));
    const paths = new Set([...this.pageCrawlers.keys(), ...this.pageReferrals.keys()]);
    const pages = [...paths]
      .map((path): PageRow => {
        const c = this.pageCrawlers.get(path) ?? new Map<string, number>();
        const r = this.pageReferrals.get(path) ?? new Map<string, number>();
        const sum = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);
        return {
          path,
          crawlerRequests: sum(c),
          referralVisits: sum(r),
          crawlers: top(c, c.size),
          referrals: top(r, r.size),
        };
      })
      .sort(
        (a, b) =>
          b.crawlerRequests + b.referralVisits - (a.crawlerRequests + a.referralVisits) ||
          compareCodePoints(a.path, b.path),
      )
      .slice(0, limit);
    return { records: this.records, skipped: options.skipped ?? 0, crawlers, referrals, pages };
  }
}

const pageList = (pages: PageCount[]) => pages.map(([path, count]) => ({ path, count }));

/** Exactly Report.to_dict() in Python: the golden-file JSON. */
export function reportToDict(r: Report) {
  return {
    summary: {
      records: r.records,
      skipped: r.skipped,
      ai_crawler_requests: r.crawlers
        .filter((c) => c.aiSpecific)
        .reduce((n, c) => n + c.requests, 0),
      ai_referral_visits: r.referrals.reduce((n, c) => n + c.visits, 0),
    },
    crawlers: r.crawlers.map((c) => ({
      id: c.id,
      vendor: c.vendor,
      vendor_name: c.vendorName,
      token: c.token,
      purpose: c.purpose,
      ai_specific: c.aiSpecific,
      requests: c.requests,
      unique_pages: c.uniquePages,
      last_seen: formatIsoSeconds(c.lastSeen),
      top_pages: pageList(c.topPages),
    })),
    referrals: r.referrals.map((c) => ({
      id: c.id,
      vendor: c.vendor,
      vendor_name: c.vendorName,
      product: c.product,
      visits: c.visits,
      unique_pages: c.uniquePages,
      last_seen: formatIsoSeconds(c.lastSeen),
      top_pages: pageList(c.topPages),
    })),
    pages: r.pages.map((p) => ({
      path: p.path,
      crawler_requests: p.crawlerRequests,
      referral_visits: p.referralVisits,
      crawlers: p.crawlers.map(([token, count]) => ({ token, count })),
      referrals: p.referrals.map(([product, count]) => ({ product, count })),
    })),
  };
}

export type ReportDict = ReturnType<typeof reportToDict>;
