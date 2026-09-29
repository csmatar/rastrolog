import { classifyReferrer } from "@rastrolog/core";
import { type AiTraffic, type AnalyticsWindow, dispatch } from "./dispatch.js";

export const STORAGE_KEY = "rastrolog";
export const EVENT_NAME = "rastrolog:match";

export type SnippetWindow = Window &
  typeof globalThis &
  AnalyticsWindow & { aiTraffic?: AiTraffic | null };

/** The bits of the <script> element the snippet reads (document.currentScript). */
export interface ScriptOptions {
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
}

export interface StartInput {
  win: SnippetWindow;
  referrer: string;
  hostname: string;
  script: ScriptOptions | null;
}

type Stored = Pick<AiTraffic, "source" | "vendor">;

function save(win: SnippetWindow, { source, vendor }: Stored): void {
  try {
    win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ source, vendor }));
  } catch {
    // Storage blocked: attribution just won't carry over to later pages.
  }
}

function load(win: SnippetWindow): Stored | null {
  try {
    const value: unknown = JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const { source, vendor } = value as Record<string, unknown>;
      if (typeof source === "string" && typeof vendor === "string") return { source, vendor };
    }
  } catch {
    // Blocked storage or a value we didn't write: treat as nothing stored.
  }
  return null;
}

function announce(
  win: SnippetWindow,
  traffic: AiTraffic,
  all: boolean,
  callback: string | null,
): void {
  dispatch(win, traffic.source, all);
  try {
    const fn = callback ? (win as unknown as Record<string, unknown>)[callback] : undefined;
    if (typeof fn === "function") fn(traffic);
  } catch {
    // The page's own callback failed; that's not ours to surface.
  }
  try {
    win.dispatchEvent(new win.CustomEvent(EVENT_NAME, { detail: traffic }));
  } catch {
    // Never throw into the host page.
  }
}

/**
 * Classify this page view, set `window.aiTraffic`, and on an AI landing send the
 * event after `load`. A second copy of the snippet on the same page does nothing.
 */
export function start({ win, referrer, hostname, script }: StartInput): AiTraffic | null {
  if (win.aiTraffic !== undefined) return win.aiTraffic;
  const match = classifyReferrer(referrer, { ownHost: hostname });
  let traffic: AiTraffic | null;
  if (match) {
    traffic = { source: match.id, vendor: match.vendor, landing: true };
    save(win, traffic);
  } else {
    const stored = load(win);
    traffic = stored ? { ...stored, landing: false } : null;
  }
  win.aiTraffic = traffic;
  if (traffic?.landing) {
    const landed = traffic;
    const all = script?.hasAttribute("data-all") ?? false;
    const callback = script?.getAttribute("data-callback") ?? null;
    const go = () => announce(win, landed, all, callback);
    if (win.document.readyState === "complete") go();
    else win.addEventListener("load", go, { once: true });
  }
  return traffic;
}
