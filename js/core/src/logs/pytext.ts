// Python's text semantics, which python/src/rastrolog/formats.py relies on and
// the TypeScript port must reproduce exactly (conformance/README.md).

/** Python's str.isspace(): the set str.strip(), str.split() and re's \s use. */
export function isPySpace(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    (code >= 0x1c && code <= 0x20) ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

/** The same set as a regex character-class body. */
export const PY_WS_CLASS =
  "\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

/** str.strip(): loops, not /\s+$/, which is quadratic on long whitespace runs. */
export function pyStrip(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isPySpace(s.charCodeAt(start))) start++;
  while (end > start && isPySpace(s.charCodeAt(end - 1))) end--;
  return s.slice(start, end);
}

/** str.split() with no arguments. */
export function pySplitWs(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && isPySpace(s.charCodeAt(i))) i++;
    const start = i;
    while (i < s.length && !isPySpace(s.charCodeAt(i))) i++;
    if (i > start) out.push(s.slice(start, i));
  }
  return out;
}

/** str.split(sep, maxsplit): the remainder stays in the last part. */
export function pySplit(s: string, sep: string, maxsplit: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (out.length < maxsplit) {
    const at = rest.indexOf(sep);
    if (at < 0) break;
    out.push(rest.slice(0, at));
    rest = rest.slice(at + sep.length);
  }
  out.push(rest);
  return out;
}

const INT = /^[+-]?[0-9]+(?:_[0-9]+)*$/;

/** int(s) for ASCII digits; null where Python raises ValueError. */
export function pyInt(s: string): number | null {
  const t = pyStrip(s);
  if (!INT.test(t)) return null;
  const n = Number(t.replace(/_/g, ""));
  return n === 0 ? 0 : n; // Python has no -0 integer
}

// Not fatal: invalid bytes become U+FFFD, like errors="replace". ignoreBOM keeps
// an encoded BOM, like Python's utf-8 codec.
const UTF8 = new TextDecoder("utf-8", { ignoreBOM: true });

function isHex(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

function unquoteAsciiRun(run: string): string {
  if (!run.includes("%")) return run;
  const bytes: number[] = [];
  for (let i = 0; i < run.length; i++) {
    const c = run.charCodeAt(i);
    if (
      c === 37 &&
      i + 2 < run.length &&
      isHex(run.charCodeAt(i + 1)) &&
      isHex(run.charCodeAt(i + 2))
    ) {
      bytes.push(Number.parseInt(run.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(c);
    }
  }
  return UTF8.decode(new Uint8Array(bytes));
}

/** urllib.parse.unquote: each ASCII run's %XX escapes decode as UTF-8; invalid escapes stay. */
export function pyUnquote(s: string): string {
  if (!s.includes("%")) return s;
  let out = "";
  let i = 0;
  while (i < s.length) {
    const start = i;
    const ascii = s.charCodeAt(i) < 0x80;
    while (i < s.length && s.charCodeAt(i) < 0x80 === ascii) i++;
    const run = s.slice(start, i);
    out += ascii ? unquoteAsciiRun(run) : run;
  }
  return out;
}
