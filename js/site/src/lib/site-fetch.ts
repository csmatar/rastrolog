// Fetch a site's robots.txt or llms.txt from the visitor's browser (no proxy, ever)
// and classify the answer the way crawlers do (RFC 9309 §2.3.1).

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type FileOutcome =
  | { kind: "found"; status: number; text: string }
  /** 4xx: crawlers act as if there's no file. */
  | { kind: "missing"; status: number }
  /** 2xx, but the body is a web page (a single-page app answering every path). */
  | { kind: "html"; status: number }
  /** 5xx: crawlers treat robots.txt as "blocked everywhere" for now. */
  | { kind: "server-error"; status: number }
  /** Network error, CORS refusal or timeout: the browser can't read it. */
  | { kind: "unreachable" };

export const FETCH_TIMEOUT_MS = 8000;
export const MAX_FILE_BYTES = 1_048_576;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

export async function fetchSiteFile(
  origin: string,
  path: "/robots.txt" | "/llms.txt",
  fetchImpl: FetchLike = defaultFetch,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<FileOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${origin}${path}`, {
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { kind: "unreachable" };
  }
  if (res.status >= 500) return { kind: "server-error", status: res.status };
  if (res.status >= 400) return { kind: "missing", status: res.status };
  if (!res.ok) return { kind: "unreachable" };
  let text: string;
  try {
    text = await readCapped(res, MAX_FILE_BYTES);
  } catch {
    return { kind: "unreachable" }; // the timeout also covers reading the body
  }
  if (looksLikeHtml(text)) return { kind: "html", status: res.status };
  return { kind: "found", status: res.status, text };
}

/** The body as UTF-8 text, stopping after maxBytes (a hostile or broken site can't stall us). */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (res.body === null) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    const chunk = value.byteLength > room ? value.subarray(0, room) : value;
    total += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
}

/** True when the text starts like an HTML document (content types are often wrong, so sniff). */
export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 256).trimStart().toLowerCase();
  return ["<!doctype html", "<html", "<head", "<body"].some((start) => head.startsWith(start));
}
