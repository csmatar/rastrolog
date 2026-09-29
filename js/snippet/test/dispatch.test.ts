import { describe, expect, it, vi } from "vitest";
import { type AnalyticsWindow, dispatch } from "../src/dispatch.js";

describe("each tool", () => {
  it("GA4 sends ai_referral and sets the user property", () => {
    const gtag = vi.fn();
    expect(dispatch({ gtag }, "chatgpt", false)).toBe(1);
    expect(gtag.mock.calls).toEqual([
      ["event", "ai_referral", { ai_source: "chatgpt" }],
      ["set", "user_properties", { ai_last_source: "chatgpt" }],
    ]);
  });

  it("Plausible sends the AI Referral goal with a source prop", () => {
    const plausible = vi.fn();
    dispatch({ plausible }, "claude", false);
    expect(plausible).toHaveBeenCalledWith("AI Referral", { props: { source: "claude" } });
  });

  it("PostHog captures and sets a person property", () => {
    const posthog = { capture: vi.fn(), setPersonProperties: vi.fn() };
    dispatch({ posthog }, "perplexity", false);
    expect(posthog.capture).toHaveBeenCalledWith("ai_referral", { source: "perplexity" });
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({ ai_last_source: "perplexity" });
  });

  it("PostHog without setPersonProperties still captures", () => {
    const posthog = { capture: vi.fn() };
    expect(dispatch({ posthog }, "perplexity", false)).toBe(1);
    expect(posthog.capture).toHaveBeenCalledOnce();
  });

  it("Fathom puts the source in the event name", () => {
    const fathom = { trackEvent: vi.fn() };
    dispatch({ fathom }, "gemini", false);
    expect(fathom.trackEvent).toHaveBeenCalledWith("AI Referral - gemini");
  });

  it("Umami tracks ai_referral with a source", () => {
    const umami = { track: vi.fn() };
    dispatch({ umami }, "copilot", false);
    expect(umami.track).toHaveBeenCalledWith("ai_referral", { source: "copilot" });
  });

  it("Matomo pushes a trackEvent", () => {
    const _paq: unknown[] = [];
    dispatch({ _paq }, "grok", false);
    expect(_paq).toEqual([["trackEvent", "AI Referral", "grok"]]);
  });

  it("GTM-only pushes a dataLayer event", () => {
    const dataLayer: unknown[] = [];
    dispatch({ dataLayer }, "chatgpt", false);
    expect(dataLayer).toEqual([{ event: "ai_referral", ai_source: "chatgpt" }]);
  });
});

describe("order and data-all", () => {
  const everything = () => ({
    gtag: vi.fn(),
    plausible: vi.fn(),
    posthog: { capture: vi.fn() },
    fathom: { trackEvent: vi.fn() },
    umami: { track: vi.fn() },
    _paq: [] as unknown[],
    dataLayer: [] as unknown[],
  });

  it("first detected tool wins by default", () => {
    const w = everything();
    expect(dispatch(w, "chatgpt", false)).toBe(1);
    expect(w.gtag).toHaveBeenCalled();
    expect(w.plausible).not.toHaveBeenCalled();
    expect(w._paq).toEqual([]);
  });

  it("all sends to every detected tool, but GTM defers to gtag", () => {
    const w = everything();
    expect(dispatch(w, "chatgpt", true)).toBe(6);
    expect(w.plausible).toHaveBeenCalled();
    expect(w.posthog.capture).toHaveBeenCalled();
    expect(w.fathom.trackEvent).toHaveBeenCalled();
    expect(w.umami.track).toHaveBeenCalled();
    expect(w._paq).toHaveLength(1);
    expect(w.dataLayer).toEqual([]);
  });

  it("follows the documented order when gtag is absent", () => {
    const w: AnalyticsWindow = { _paq: [], dataLayer: [], umami: { track: vi.fn() } };
    dispatch(w, "chatgpt", false);
    expect(w.umami?.track).toHaveBeenCalled();
    expect(w._paq).toEqual([]);
  });

  it("returns 0 and does nothing when no tool is present", () => {
    expect(dispatch({}, "chatgpt", true)).toBe(0);
  });

  it("ignores non-function look-alikes", () => {
    const w = {
      gtag: "nope",
      posthog: {},
      fathom: { trackEvent: 1 },
    } as unknown as AnalyticsWindow;
    expect(dispatch(w, "chatgpt", true)).toBe(0);
  });
});

describe("a throwing tool", () => {
  const boom = () => {
    throw new Error("analytics blew up");
  };

  it("counts as handled and never throws out", () => {
    const plausible = vi.fn();
    expect(() => dispatch({ gtag: vi.fn(boom), plausible }, "chatgpt", false)).not.toThrow();
    expect(plausible).not.toHaveBeenCalled();
  });

  it("does not stop the others under data-all", () => {
    const plausible = vi.fn();
    expect(dispatch({ gtag: vi.fn(boom), plausible }, "chatgpt", true)).toBe(2);
    expect(plausible).toHaveBeenCalled();
  });
});
