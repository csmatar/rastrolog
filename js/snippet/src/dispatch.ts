/** What the snippet exposes as `window.aiTraffic` and passes to the callback and event. */
export interface AiTraffic {
  /** Referrer id from signals.json, e.g. "chatgpt". */
  source: string;
  /** Vendor slug, e.g. "openai". */
  vendor: string;
  /** True on the page the visitor landed on from the AI product; false on later pages of the session. */
  landing: boolean;
}

type Props = Record<string, string>;

/** The analytics globals the snippet knows about. Every one is optional. */
export interface AnalyticsWindow {
  gtag?: (...args: unknown[]) => void;
  plausible?: (event: string, options?: { props?: Props }) => void;
  posthog?: {
    capture?: (event: string, properties?: Props) => void;
    setPersonProperties?: (properties: Props) => void;
  };
  fathom?: { trackEvent?: (name: string) => void };
  umami?: { track?: (event: string, data?: Props) => void };
  _paq?: unknown[];
  dataLayer?: unknown[];
}

/** Returns false when the tool isn't on the page; otherwise sends and returns true. */
export type Dispatcher = (w: AnalyticsWindow, source: string) => boolean;

// Verified against each vendor's docs on 2026-09-28 (see the Epic 2 spec).
const ga4: Dispatcher = (w, source) => {
  const { gtag } = w;
  if (typeof gtag !== "function") return false;
  gtag("event", "ai_referral", { ai_source: source });
  gtag("set", "user_properties", { ai_last_source: source });
  return true;
};

const plausible: Dispatcher = (w, source) => {
  if (typeof w.plausible !== "function") return false;
  w.plausible("AI Referral", { props: { source } });
  return true;
};

const posthog: Dispatcher = (w, source) => {
  const ph = w.posthog;
  if (typeof ph?.capture !== "function") return false;
  ph.capture("ai_referral", { source });
  if (typeof ph.setPersonProperties === "function")
    ph.setPersonProperties({ ai_last_source: source });
  return true;
};

const fathom: Dispatcher = (w, source) => {
  const f = w.fathom;
  if (typeof f?.trackEvent !== "function") return false;
  f.trackEvent(`AI Referral - ${source}`); // Fathom events carry no properties
  return true;
};

const umami: Dispatcher = (w, source) => {
  const u = w.umami;
  if (typeof u?.track !== "function") return false;
  u.track("ai_referral", { source });
  return true;
};

const matomo: Dispatcher = (w, source) => {
  if (!Array.isArray(w._paq)) return false;
  w._paq.push(["trackEvent", "AI Referral", source]);
  return true;
};

// gtag.js creates dataLayer too, so a gtag site is handled by ga4 and skipped here.
const gtm: Dispatcher = (w, source) => {
  if (!Array.isArray(w.dataLayer) || typeof w.gtag === "function") return false;
  w.dataLayer.push({ event: "ai_referral", ai_source: source });
  return true;
};

export const DISPATCHERS: readonly Dispatcher[] = [
  ga4,
  plausible,
  posthog,
  fathom,
  umami,
  matomo,
  gtm,
];

/**
 * Send the referral to the analytics tools on the page, in DISPATCHERS order.
 * The first detected tool wins unless `all`. A detected tool that throws still
 * counts as handled and never stops the others. Returns how many tools were detected.
 */
export function dispatch(w: AnalyticsWindow, source: string, all: boolean): number {
  let found = 0;
  for (const send of DISPATCHERS) {
    let hit: boolean;
    try {
      hit = send(w, source);
    } catch {
      hit = true;
    }
    if (hit) {
      found++;
      if (!all) break;
    }
  }
  return found;
}
