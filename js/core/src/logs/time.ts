import { MalformedLineError } from "./errors.js";
import { pyInt, pySplit } from "./pytext.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Python's datetime(...) range checks; epoch ms of those UTC fields, or null. */
export function utcMillis(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  micro = 0,
): number | null {
  if (y < 1 || y > 9999 || mo < 1 || mo > 12) return null;
  const dim = mo === 2 && isLeap(y) ? 29 : (DAYS[mo - 1] ?? 0);
  if (d < 1 || d > dim || h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, Math.floor(micro / 1000));
  return date.getTime();
}

function fail(value: string): never {
  throw new MalformedLineError(value);
}

/** parse_clf_time: "28/Sep/2026:12:00:00 +0200" -> epoch ms (UTC). */
export function parseClfTime(value: string): number {
  const dmy = pySplit(value, "/", 2);
  if (dmy.length !== 3) fail(value);
  const [day = "", month = "", rest = ""] = dmy;
  const hms = pySplit(rest, ":", 3);
  if (hms.length !== 4) fail(value);
  const [year = "", hour = "", minute = "", tail = ""] = hms;
  const tailParts = tail.split(" ");
  if (tailParts.length !== 2) fail(value);
  const [second = "", offset = ""] = tailParts;
  if (offset === "") fail(value);
  const sign = offset[0] === "-" ? -1 : 1;
  const oh = pyInt(offset.slice(1, 3));
  const om = pyInt(offset.slice(3, 5));
  const mo = MONTHS.indexOf(month) + 1;
  const fields = [pyInt(year), pyInt(day), pyInt(hour), pyInt(minute), pyInt(second)];
  if (oh === null || om === null || mo === 0 || fields.some((f) => f === null)) fail(value);
  const offsetMinutes = oh * 60 + om;
  if (Math.abs(offsetMinutes) >= 1440) fail(value); // timezone() must be strictly within ±24h
  const [y, d, h, mi, s] = fields as number[];
  const local = utcMillis(y ?? 0, mo, d ?? 0, h ?? 0, mi ?? 0, s ?? 0);
  if (local === null) fail(value);
  const utc = local - sign * offsetMinutes * 60_000;
  const year4 = new Date(utc).getUTCFullYear();
  if (year4 < 1 || year4 > 9999) fail(value);
  return utc;
}

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-])(\d{2}):(\d{2})$/;

/** The ISO 8601 forms ALB and CloudFront write (after "Z" -> "+00:00") -> epoch ms. */
export function parseIsoUtc(value: string): number {
  const m = ISO.exec(value);
  if (m === null) fail(value);
  const n = (i: number) => Number(m[i] ?? "0");
  const micro = Number((m[7] ?? "").padEnd(6, "0") || "0");
  const local = utcMillis(n(1), n(2), n(3), n(4), n(5), n(6), micro);
  const offsetMinutes = n(9) * 60 + n(10);
  if (local === null || offsetMinutes >= 1440) fail(value);
  return local - (m[8] === "-" ? -1 : 1) * offsetMinutes * 60_000;
}

/** Whole-second UTC as Python's datetime.replace(microsecond=0).isoformat(). */
export function formatIsoSeconds(ms: number): string {
  return `${new Date(Math.floor(ms / 1000) * 1000).toISOString().slice(0, 19)}+00:00`;
}
