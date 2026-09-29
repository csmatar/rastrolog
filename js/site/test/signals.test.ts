import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chatCount,
  crawlerCount,
  documentedCount,
  referrerProducts,
  sampleAlert,
  vendorCount,
  vendors,
} from "../src/lib/signals.ts";

const RAW = JSON.parse(readFileSync(new URL("../../../signals.json", import.meta.url), "utf8")) as {
  crawlers: { vendor: string; vendor_documented?: boolean }[];
  referrers: unknown[];
};

describe("facts from signals.json", () => {
  it("counts what the file lists", () => {
    expect(crawlerCount).toBe(RAW.crawlers.length);
    expect(chatCount).toBe(RAW.referrers.length);
    expect(vendorCount).toBe(new Set(RAW.crawlers.map((c) => c.vendor)).size);
    expect(documentedCount).toBe(RAW.crawlers.filter((c) => c.vendor_documented !== false).length);
  });

  it("groups crawlers by vendor in file order and flags third-party sources", () => {
    const list = vendors();
    expect(list[0]).toMatchObject({
      name: "OpenAI",
      crawlers: [{ token: "GPTBot" }, { token: "ChatGPT-User" }, { token: "OAI-SearchBot" }],
    });
    expect(list.flatMap((v) => v.crawlers)).toHaveLength(crawlerCount);
    expect(list.find((v) => v.name === "ByteDance")?.crawlers[0]).toMatchObject({
      token: "Bytespider",
      vendorDocumented: false,
    });
  });

  it("names the AI chats and the sample alert's crawler", () => {
    expect(referrerProducts[0]).toBe("ChatGPT");
    expect(sampleAlert()).toEqual({
      token: "MistralAI-Training",
      vendorName: "Mistral AI",
      docsUrl: "https://docs.mistral.ai/robots",
    });
  });
});
