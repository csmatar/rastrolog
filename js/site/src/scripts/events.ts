// The tools announce results; email.ts listens, so no email ask appears before one.
import type { NextCrawler } from "../lib/checker-model.ts";

export const CHECKER_RESULT = "rl:checker-result";
export const CHECKER_RESET = "rl:checker-reset";
export const LOG_RESULT = "rl:log-result";
export const LOG_RESET = "rl:log-reset";

export interface CheckerResult {
  /** "example.com" or "example.com:8443". */
  site: string;
  next: NextCrawler;
  named: number;
  total: number;
}

export interface LogResult {
  /** AI crawlers (not requests) that showed up in the log. */
  aiCrawlers: number;
}

export function emit(name: string, detail?: unknown): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
