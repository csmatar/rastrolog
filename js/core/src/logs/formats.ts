// Port of python/src/rastrolog/formats.py. Rules: conformance/README.md -> Log line parsing.
import { urlsplitPath } from "../host.js";
import { MalformedLineError, UnknownFormatError } from "./errors.js";
import { PY_WS_CLASS, pySplitWs, pyStrip, pyUnquote } from "./pytext.js";
import { parseClfTime, parseIsoUtc } from "./time.js";

export type Format = "combined" | "cloudfront" | "alb";
export const FORMATS: readonly Format[] = ["combined", "cloudfront", "alb"];

export interface LogRecord {
  /** Epoch milliseconds, UTC. */
  ts: number;
  /** No query string or fragment. */
  path: string;
  /** 0 when the log has none. */
  status: number;
  /** "" when absent. */
  ua: string;
  /** "" when absent. */
  referrer: string;
}

export interface LineParser {
  /** A record, null for a line to ignore, or throws MalformedLineError. */
  parse(line: string): LogRecord | null;
}

const NS = `[^${PY_WS_CLASS}]`; // Python's \S
// Python: "([^"\\]*(?:\\.[^"\\]*)*)" with "." = any character but "\n".
const QUOTED = '"([^"\\\\]*(?:\\\\[^\\n][^"\\\\]*)*)"';
const COMBINED = new RegExp(
  `^${NS}+ ${NS}+ ${NS}+ \\[([^\\]]+)\\] ${QUOTED} (\\d{3}|-) ${NS}+ ${QUOTED} ${QUOTED}`,
);
const ALB = new RegExp(
  `^[a-z0-9]+ (\\d{4}-\\d{2}-\\d{2}T${NS}+)${` ${NS}+`.repeat(6)} (\\d{3}|-)${` ${NS}+`.repeat(3)} "([^"]*)" "([^"]*)"`,
);
const CLOUDFRONT_DATA = /^\d{4}-\d{2}-\d{2}\t\d{2}:\d{2}:\d{2}\t/;
const ESCAPE = /\\(x[0-9a-fA-F]{2}|[^\n])/g;

export const DEFAULT_CLOUDFRONT_FIELDS: readonly string[] = [
  "date",
  "time",
  "x-edge-location",
  "sc-bytes",
  "c-ip",
  "cs-method",
  "cs(Host)",
  "cs-uri-stem",
  "sc-status",
  "cs(Referer)",
  "cs(User-Agent)",
  "cs-uri-query",
  "cs(Cookie)",
  "x-edge-result-type",
  "x-edge-request-id",
  "x-host-header",
  "cs-protocol",
  "cs-bytes",
  "time-taken",
  "x-forwarded-for",
  "ssl-protocol",
  "ssl-cipher",
  "x-edge-response-result-type",
  "cs-protocol-version",
  "fle-status",
  "fle-encrypted-fields",
  "c-port",
  "time-to-first-byte",
  "x-edge-detailed-result-type",
  "sc-content-type",
  "sc-content-len",
  "sc-range-start",
  "sc-range-end",
];

/** Pick the format from the first non-blank line of a file. */
export function detect(line: string): Format {
  const text = pyStrip(line);
  if (text.startsWith("#Version:") || text.startsWith("#Fields:") || CLOUDFRONT_DATA.test(text)) {
    return "cloudfront";
  }
  if (ALB.test(text)) return "alb";
  if (COMBINED.test(text)) return "combined";
  throw new UnknownFormatError(text);
}

/** Drop scheme/host, query string and fragment. */
export function normalizePath(target: string): string {
  let path: string;
  if (target.startsWith("http://") || target.startsWith("https://")) {
    const p = urlsplitPath(target);
    if (p === null) return "-";
    path = p;
  } else {
    path = (target.split("?", 1)[0] ?? "").split("#", 1)[0] ?? "";
  }
  return path || "/";
}

function requestPath(request: string): string {
  const parts = request.split(" ");
  return parts.length >= 2 ? normalizePath(parts[1] ?? "") : "-";
}

/** Undo Apache (\") and nginx (\xHH) escaping inside quoted fields. */
function unescapeField(value: string): string {
  if (!value.includes("\\")) return value;
  return value.replace(ESCAPE, (_m, esc: string) =>
    esc.length === 3 && esc[0] === "x"
      ? String.fromCharCode(Number.parseInt(esc.slice(1), 16))
      : esc,
  );
}

const dash = (v: string) => (v === "-" ? "" : v);
const status = (v: string) => (/^[0-9]+$/.test(v) ? Number(v) : 0);

class CombinedParser implements LineParser {
  parse(line: string): LogRecord | null {
    const m = COMBINED.exec(line);
    if (m === null) throw new MalformedLineError(line);
    const [, time = "", request = "", code = "", referrer = "", ua = ""] = m;
    return {
      ts: parseClfTime(time),
      path: requestPath(unescapeField(request)),
      status: status(code),
      ua: dash(unescapeField(ua)),
      referrer: dash(unescapeField(referrer)),
    };
  }
}

class AlbParser implements LineParser {
  parse(line: string): LogRecord | null {
    const m = ALB.exec(line);
    if (m === null) throw new MalformedLineError(line);
    const [, time = "", code = "", request = "", ua = ""] = m;
    return {
      ts: parseIsoUtc(time.replace(/Z/g, "+00:00")),
      path: requestPath(request),
      status: status(code),
      ua: dash(ua),
      referrer: "",
    };
  }
}

const NEEDED = [
  "date",
  "time",
  "cs-uri-stem",
  "sc-status",
  "cs(Referer)",
  "cs(User-Agent)",
] as const;

function positions(fields: readonly string[]): number[] {
  const index = new Map<string, number>();
  fields.forEach((name, i) => {
    index.set(name, i);
  });
  const missing = NEEDED.filter((name) => !index.has(name));
  if (missing.length > 0)
    throw new MalformedLineError(`#Fields header lacks ${missing.join(", ")}`);
  return NEEDED.map((name) => index.get(name) ?? -1);
}

class CloudFrontParser implements LineParser {
  private columns = positions(DEFAULT_CLOUDFRONT_FIELDS);

  parse(line: string): LogRecord | null {
    if (line.startsWith("#")) {
      if (line.startsWith("#Fields:"))
        this.columns = positions(pySplitWs(line.slice("#Fields:".length)));
      return null;
    }
    const cols = line.split("\t");
    const values = this.columns.map((i) => cols[i]);
    if (values.some((v) => v === undefined)) throw new MalformedLineError(line);
    const [date = "", time = "", stem = "", code = "", referrer = "", ua = ""] = values as string[];
    return {
      ts: parseIsoUtc(`${date}T${time}+00:00`),
      // Cut first, then decode: an encoded %3F/%23 in the stem is part of the path.
      path: pyUnquote(normalizePath(stem)),
      status: status(code),
      ua: dash(pyUnquote(ua)),
      referrer: dash(pyUnquote(referrer)),
    };
  }
}

export function makeParser(format: Format): LineParser {
  if (format === "combined") return new CombinedParser();
  if (format === "cloudfront") return new CloudFrontParser();
  return new AlbParser();
}
