import { describe, expect, it } from "vitest";
import {
  type FetchLike,
  fetchSiteFile,
  looksLikeHtml,
  MAX_FILE_BYTES,
} from "../src/lib/site-fetch.ts";

const reply =
  (body: string, status = 200): FetchLike =>
  async () =>
    new Response(body, { status });

describe("fetchSiteFile", () => {
  it("asks for origin + path with CORS, no credentials, no referrer and a timeout", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const spy: FetchLike = async (url, init) => {
      seen = { url, init };
      return new Response("User-agent: *\n");
    };
    await fetchSiteFile("https://example.com", "/robots.txt", spy);
    expect(seen?.url).toBe("https://example.com/robots.txt");
    expect(seen?.init).toMatchObject({
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(seen?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the text of a 2xx file", async () => {
    expect(
      await fetchSiteFile("https://a.example", "/robots.txt", reply("User-agent: *\nAllow: /\n")),
    ).toEqual({
      kind: "found",
      status: 200,
      text: "User-agent: *\nAllow: /\n",
    });
  });

  it.each([
    [404, "missing"],
    [410, "missing"],
    [403, "missing"],
    [500, "server-error"],
    [503, "server-error"],
  ] as const)("HTTP %i is %s (RFC 9309 §2.3.1)", async (status, kind) => {
    expect(await fetchSiteFile("https://a.example", "/robots.txt", reply("", status))).toEqual({
      kind,
      status,
    });
  });

  it("a network or CORS failure is unreachable", async () => {
    const failing: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await fetchSiteFile("https://a.example", "/robots.txt", failing)).toEqual({
      kind: "unreachable",
    });
  });

  it("gives up when the timeout fires", async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    expect(await fetchSiteFile("https://slow.example", "/robots.txt", hanging, 20)).toEqual({
      kind: "unreachable",
    });
  });

  it("a web page answering /robots.txt is not a robots.txt", async () => {
    const page = "\n  <!DOCTYPE html>\n<html><body>Not found</body></html>";
    expect(await fetchSiteFile("https://spa.example", "/robots.txt", reply(page))).toEqual({
      kind: "html",
      status: 200,
    });
  });

  it("reads at most MAX_FILE_BYTES", async () => {
    const outcome = await fetchSiteFile(
      "https://big.example",
      "/robots.txt",
      reply("a".repeat(MAX_FILE_BYTES + 5000)),
    );
    expect(outcome.kind).toBe("found");
    expect(outcome.kind === "found" && outcome.text.length).toBe(MAX_FILE_BYTES);
  });
});

describe("looksLikeHtml", () => {
  it.each([
    ["<!doctype html><p>x", true],
    ["﻿<html>", true],
    ["  <HEAD>", true],
    ["User-agent: *", false],
    ["# llms.txt <html> mentioned later", false],
  ] as const)("%j → %s", (text, expected) => {
    expect(looksLikeHtml(text)).toBe(expected);
  });
});
