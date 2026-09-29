import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { UnknownFormatError } from "../src/logs/errors.js";
import { reportToDict } from "../src/logs/report.js";
import { parseLogStream } from "../src/logs/stream.js";

const LOGS = new URL("../../../conformance/logs/", import.meta.url);
const enc = new TextEncoder();

function streamOf(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

const LINE = '1.2.3.4 - - [28/Sep/2026:12:00:00 +0000] "GET /a HTTP/1.1" 200 5 "-" "GPTBot/1.4"';
const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...enc.encode(p)] : p)));
const paths = async (data: Uint8Array, chunk = 3) => {
  const r = await parseLogStream(streamOf(data, chunk));
  return {
    lines: r.lines,
    records: r.records,
    skipped: r.skipped,
    truncated: r.truncated,
    paths: r.report.crawlers.flatMap((c) => c.topPages.map(([p]) => p)).sort(),
  };
};

describe("golden reports through the stream", () => {
  it.each(["nginx", "apache", "cloudfront", "alb", "alb-microseconds", "cloudfront-encoded-stem"])(
    "%s",
    async (name) => {
      const raw = new Uint8Array(readFileSync(new URL(`${name}.log`, LOGS)));
      const expected = JSON.parse(readFileSync(new URL(`${name}.expected.json`, LOGS), "utf8"));
      for (const chunk of [1, 7, 65_536]) {
        expect(reportToDict((await parseLogStream(streamOf(raw, chunk))).report)).toEqual(expected);
      }
      expect(
        reportToDict((await parseLogStream(streamOf(new Uint8Array(gzipSync(raw)), 3))).report),
      ).toEqual(expected);
    },
  );
});

// Expected values are Python's iter_records() output, captured 2026-09-29.
describe("file-level behaviour matches Python", () => {
  it("keeps a BOM (combined still parses)", async () => {
    expect(await paths(bytes([0xef, 0xbb, 0xbf], LINE, "\n"))).toMatchObject({
      lines: 1,
      records: 1,
    });
  });

  it("a BOM before #Version: is an unknown format, as in Python", async () => {
    await expect(
      parseLogStream(streamOf(bytes([0xef, 0xbb, 0xbf], "#Version: 1.0\n"), 4)),
    ).rejects.toThrow(UnknownFormatError);
  });

  it("lone \\r is a line break (Review Focus 1)", async () => {
    const data = bytes(LINE, "\r", LINE.replace("/a", "/b"), "\r");
    for (const chunk of [1, 2, 5]) {
      expect(await paths(data, chunk)).toMatchObject({ lines: 2, records: 2, paths: ["/a", "/b"] });
    }
  });

  it("\\r\\n split across chunks is one break; blank lines count (Review Focus 1)", async () => {
    const data = bytes(LINE, "\r\n\r\n   \r\n", LINE, "\r\n");
    for (const chunk of [1, LINE.length + 1]) {
      expect(await paths(data, chunk)).toMatchObject({ lines: 4, records: 2 });
    }
  });

  it("reads a last line without a newline", async () => {
    expect(await paths(bytes(LINE))).toMatchObject({ lines: 1, records: 1 });
  });

  it("replaces invalid UTF-8", async () => {
    expect(
      await paths(bytes(LINE.replace("GPTBot/1.4", "GPTBot/1.4 "), [0xff, 0xfe], "\n")),
    ).toMatchObject({ records: 1 });
  });

  it("a truncated gzip keeps what it can and says so", async () => {
    const gz = new Uint8Array(gzipSync(enc.encode(`${LINE}\n${LINE}\n`)));
    const cut = gz.slice(0, gz.length - 12);
    // Python keeps 1 record here. Node's DecompressionStream drops output it still
    // buffers when it fails, so the TS port may keep fewer (conformance/README.md,
    // "Known gaps"); it always marks the result truncated and never invents a line.
    for (const chunk of [3, cut.length]) {
      const r = await paths(cut, chunk);
      expect(r.truncated).toBe(true);
      expect(r.records).toBeLessThanOrEqual(1);
    }
  });

  it("a realistic truncated gzip keeps exactly what Python keeps", async () => {
    // 1,000 lines gzipped by Python with its last 12 bytes cut off; Python's
    // iter_records reads 999 lines and 999 records from it and marks it truncated.
    const cut = new Uint8Array(
      readFileSync(new URL("./fixtures/truncated-1000.log.gz", import.meta.url)),
    );
    // File.stream() hands over chunks of tens of KiB: there the count is exact.
    for (const chunk of [4096, cut.length]) {
      expect(await paths(cut, chunk)).toMatchObject({
        lines: 999,
        records: 999,
        skipped: 0,
        truncated: true,
      });
    }
    // With tiny chunks Node's DecompressionStream drops a little buffered output (README gap).
    const tiny = await paths(cut, 7);
    expect(tiny.truncated).toBe(true);
    expect(tiny.records).toBeGreaterThanOrEqual(990);
  });

  it("reads every member of a concatenated gzip (Review Focus 2)", async () => {
    const a = gzipSync(enc.encode(`${LINE}\n`));
    const b = gzipSync(enc.encode(`${LINE.replace("/a", "/c")}\n`));
    expect(await paths(new Uint8Array([...a, ...b]))).toMatchObject({
      lines: 2,
      records: 2,
      paths: ["/a", "/c"],
      truncated: false,
    });
  });

  it("reads every member even when the first is large (current runtimes stop at a member's end)", async () => {
    const big = Array.from({ length: 20_000 }, (_, i) => `${LINE.replace("/a", `/p${i}`)}\n`).join(
      "",
    );
    const data = new Uint8Array([
      ...gzipSync(enc.encode(big)),
      ...gzipSync(enc.encode(`${LINE.replace("/a", "/z")}\n`)),
    ]);
    for (const chunk of [1024, 1_048_576, data.length]) {
      const r = await parseLogStream(streamOf(data, chunk));
      expect({ lines: r.lines, records: r.records, truncated: r.truncated }).toEqual({
        lines: 20_001,
        records: 20_001,
        truncated: false,
      });
    }
  });

  it("ignores zero padding after the last member, like Python", async () => {
    const gz = gzipSync(enc.encode(`${LINE}\n`));
    expect(await paths(new Uint8Array([...gz, 0, 0, 0, 0, 0, 0, 0, 0]))).toMatchObject({
      records: 1,
      truncated: false,
    });
  });

  it("marks other trailing bytes as a damaged file, like Python's BadGzipFile", async () => {
    const gz = gzipSync(enc.encode(`${LINE}\n`));
    expect(await paths(new Uint8Array([...gz, 0x41, 0x42, 0x43]))).toMatchObject({
      records: 1,
      truncated: true,
    });
  });

  it("reports an unknown format with its first line", async () => {
    await expect(
      parseLogStream(streamOf(bytes("hello world\n", LINE, "\n"), 4)),
    ).rejects.toMatchObject({
      name: "UnknownFormatError",
      line: "hello world",
    });
  });

  it("an explicit format skips detection", async () => {
    const r = await parseLogStream(streamOf(bytes("hello world\n", LINE, "\n"), 4), {
      format: "combined",
    });
    expect({ records: r.records, skipped: r.skipped }).toEqual({ records: 1, skipped: 1 });
  });
});

describe("progress and cancel", () => {
  it("reports input bytes, ending at the file size", async () => {
    const raw = new Uint8Array(gzipSync(readFileSync(new URL("nginx.log", LOGS))));
    const seen: number[] = [];
    await parseLogStream(streamOf(raw, 16), { onProgress: (n) => seen.push(n), progressEvery: 64 });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    expect(seen[seen.length - 1]).toBe(raw.length);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      parseLogStream(streamOf(bytes(LINE, "\n"), 4), { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("large input", () => {
  it("parses 100,000 lines (about 20 MB) in a few seconds", async () => {
    const line = `${LINE}\n`;
    const data = enc.encode(line.repeat(100_000));
    const started = performance.now();
    const r = await parseLogStream(streamOf(data, 1_048_576));
    expect(r.records).toBe(100_000);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
