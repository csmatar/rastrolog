import { readFileSync } from "node:fs";
import { parseLogText } from "@rastrolog/core";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";
import {
  formatLastSeen,
  logMeta,
  pageList,
  percent,
  progressText,
  toLogView,
  visitsHeadline,
} from "../src/lib/log-model.ts";

const NGINX = readFileSync(new URL("../../../conformance/logs/nginx.log", import.meta.url), "utf8");
const view = toLogView(parseLogText(NGINX));
const MIB = 1_048_576;

describe("toLogView on the nginx golden log", () => {
  it("separates AI crawlers from search engines and totals the traffic", () => {
    expect(view).toMatchObject({
      format: "combined",
      lines: 15,
      records: 14,
      skipped: 1,
      truncated: false,
      aiRequests: 7,
      aiVisits: 4,
      aiCrawlers: 4,
    });
    expect(view.crawlers.map((c) => c.token)).toEqual([
      "GPTBot",
      "ClaudeBot",
      "ChatGPT-User",
      "PerplexityBot",
    ]);
    expect(view.searchEngines.map((c) => c.token)).toEqual(["Googlebot"]);
    expect(view.crawlers[0]).toEqual({
      vendorName: "OpenAI",
      token: "GPTBot",
      purpose: "training",
      requests: 3,
      pages: 2,
      lastSeen: "2026-09-22 08:00",
      topPages: "/docs (2)\n/pricing (1)",
    });
    expect(view.referrals).toEqual([
      { product: "ChatGPT", visits: 2, lastSeen: "2026-09-25 13:00", landing: "/pricing (2)" },
      {
        product: "Claude",
        visits: 1,
        lastSeen: "2026-09-26 13:00",
        landing: "/blog/ai-traffic (1)",
      },
      { product: "Perplexity", visits: 1, lastSeen: "2026-09-26 12:00", landing: "/docs (1)" },
    ]);
  });
});

describe("the words around the numbers", () => {
  it("meta line in both languages", () => {
    expect(logMeta(view, "access.log", "en", en.logs)).toBe(
      "access.log · nginx/Apache combined · 15 lines · 1 skipped · read on this device",
    );
    expect(logMeta(view, "access.log", "es", es.logs)).toBe(
      "access.log · nginx/Apache combined · 15 líneas · 1 omitida · leído en este dispositivo",
    );
  });

  it("headline numbers with their words, singular and plural", () => {
    expect(visitsHeadline(view, "en", en.logs)).toEqual({
      crawlers: { n: "7", text: "AI crawler visits." },
      chats: { n: "4", text: "people sent by AI chats." },
    });
    const one = toLogView(parseLogText(NGINX.split("\n")[0] ?? ""));
    expect(visitsHeadline(one, "en", en.logs)).toEqual({
      crawlers: { n: "1", text: "AI crawler visit." },
      chats: { n: "0", text: "people sent by AI chats." },
    });
    expect(visitsHeadline(view, "es", es.logs).chats).toEqual({
      n: "4",
      text: "personas llegaron desde chats de IA.",
    });
  });

  it("progress", () => {
    expect(progressText(38 * MIB, 112 * MIB, "en", en.logs)).toBe("38.0 of 112.0 MB");
    expect(progressText(38 * MIB, 112 * MIB, "es", es.logs)).toBe("38,0 de 112,0 MB");
    expect(progressText(3 * MIB, null, "en", en.logs)).toBe("3.0 MB read");
    expect([percent(0, 100), percent(34, 100), percent(200, 100), percent(5, 0)]).toEqual([
      0, 34, 100, 100,
    ]);
  });

  it("times and page lists look like the CLI's", () => {
    expect(formatLastSeen(Date.UTC(2026, 8, 22, 8, 0, 59))).toBe("2026-09-22 08:00");
    expect(
      pageList([
        ["/a", 2],
        ["/b", 1],
      ]),
    ).toBe("/a (2)\n/b (1)");
  });
});
