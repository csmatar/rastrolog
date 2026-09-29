import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import {
  EVENT_NAME,
  type ScriptOptions,
  type SnippetWindow,
  STORAGE_KEY,
  start,
} from "../src/runtime.js";

const CHATGPT = "https://chatgpt.com/";

/** A fresh happy-dom window on https://site.test/ whose `load` hasn't fired yet. */
function makeWindow(readyState: DocumentReadyState = "loading"): SnippetWindow {
  const win = new Window({ url: "https://site.test/landing" }) as unknown as SnippetWindow;
  Object.defineProperty(win.document, "readyState", { value: readyState, configurable: true });
  return win;
}

function script(attrs: Record<string, string> = {}): ScriptOptions {
  return {
    hasAttribute: (name) => name in attrs,
    getAttribute: (name) => attrs[name] ?? null,
  };
}

const fireLoad = (win: SnippetWindow) => win.dispatchEvent(new win.Event("load"));

const run = (win: SnippetWindow, referrer: string, attrs?: Record<string, string>) =>
  start({ win, referrer, hostname: "site.test", script: attrs ? script(attrs) : script() });

describe("landing from an AI product", () => {
  it("sets aiTraffic immediately and remembers the source for the session", () => {
    const win = makeWindow();
    expect(run(win, CHATGPT)).toEqual({ source: "chatgpt", vendor: "openai", landing: true });
    expect(win.aiTraffic).toEqual({ source: "chatgpt", vendor: "openai", landing: true });
    expect(JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      source: "chatgpt",
      vendor: "openai",
    });
  });

  it("dispatches only after load", () => {
    const win = makeWindow();
    win.gtag = vi.fn();
    run(win, CHATGPT);
    expect(win.gtag).not.toHaveBeenCalled();
    fireLoad(win);
    expect(win.gtag).toHaveBeenCalledWith("event", "ai_referral", { ai_source: "chatgpt" });
  });

  it("dispatches immediately when load already fired (Review Focus 2)", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    run(win, CHATGPT);
    expect(win.gtag).toHaveBeenCalledTimes(2);
  });

  it("calls data-callback, then fires rastrolog:match", () => {
    const win = makeWindow("complete");
    const order: string[] = [];
    (win as unknown as Record<string, unknown>).onAi = vi.fn(() => order.push("callback"));
    win.addEventListener(EVENT_NAME, (event) => {
      order.push("event");
      expect((event as CustomEvent).detail).toEqual({
        source: "chatgpt",
        vendor: "openai",
        landing: true,
      });
    });
    run(win, CHATGPT, { "data-callback": "onAi" });
    expect(order).toEqual(["callback", "event"]);
  });

  it("data-all sends to every tool", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    win.plausible = vi.fn();
    run(win, CHATGPT, { "data-all": "" });
    expect(win.plausible).toHaveBeenCalled();
  });

  it("a throwing callback or non-function callback never throws out", () => {
    const win = makeWindow("complete");
    const seen = vi.fn();
    win.addEventListener(EVENT_NAME, seen);
    (win as unknown as Record<string, unknown>).bad = () => {
      throw new Error("boom");
    };
    expect(() => run(win, CHATGPT, { "data-callback": "bad" })).not.toThrow();
    expect(seen).toHaveBeenCalledOnce();
    const win2 = makeWindow("complete");
    (win2 as unknown as Record<string, unknown>).notAFunction = 42;
    expect(() => run(win2, CHATGPT, { "data-callback": "notAFunction" })).not.toThrow();
  });
});

describe("reloads and back/forward", () => {
  // document.referrer survives a reload, and a back/forward navigation that isn't
  // served from the bfcache; neither is a new arrival from the AI product.
  function navigationType(win: SnippetWindow, type: string) {
    vi.spyOn(win.performance, "getEntriesByType").mockReturnValue([
      { type } as unknown as PerformanceEntry,
    ]);
  }

  it.each(["reload", "back_forward"])("%s of the landing page sends nothing again", (type) => {
    const win = makeWindow("complete");
    navigationType(win, type);
    win.gtag = vi.fn();
    const seen = vi.fn();
    win.addEventListener(EVENT_NAME, seen);
    expect(run(win, CHATGPT)).toEqual({ source: "chatgpt", vendor: "openai", landing: false });
    expect(win.gtag).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
    expect(JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) ?? "null")?.source).toBe("chatgpt");
  });

  it("a normal navigation is a landing", () => {
    const win = makeWindow("complete");
    navigationType(win, "navigate");
    win.gtag = vi.fn();
    expect(run(win, CHATGPT)?.landing).toBe(true);
    expect(win.gtag).toHaveBeenCalled();
  });

  it("a Performance API that throws still counts the landing", () => {
    const win = makeWindow("complete");
    vi.spyOn(win.performance, "getEntriesByType").mockImplementation(() => {
      throw new Error("unsupported");
    });
    expect(run(win, CHATGPT)?.landing).toBe(true);
  });
});

describe("later pages in the same session", () => {
  it("carries the source over with landing: false and dispatches nothing", () => {
    const win = makeWindow("complete");
    win.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ source: "claude", vendor: "anthropic" }),
    );
    win.gtag = vi.fn();
    const seen = vi.fn();
    win.addEventListener(EVENT_NAME, seen);
    expect(run(win, "https://site.test/pricing")).toEqual({
      source: "claude",
      vendor: "anthropic",
      landing: false,
    });
    expect(win.gtag).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
  });

  it("a new AI referral replaces the stored one and is a landing again", () => {
    const win = makeWindow("complete");
    win.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ source: "claude", vendor: "anthropic" }),
    );
    expect(run(win, CHATGPT)?.source).toBe("chatgpt");
    expect(JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) ?? "null").source).toBe("chatgpt");
  });

  it("no AI referral and nothing stored gives null", () => {
    const win = makeWindow("complete");
    expect(run(win, "https://www.google.com/")).toBeNull();
    expect(win.aiTraffic).toBeNull();
  });

  it("the site's own host is never a referral", () => {
    const win = makeWindow("complete");
    expect(
      start({ win, referrer: "https://chatgpt.com/x", hostname: "www.chatgpt.com", script: null }),
    ).toBeNull();
  });
});

describe("Review Focus", () => {
  it("1: storage that throws still sets aiTraffic and dispatches", () => {
    const win = makeWindow("complete");
    Object.defineProperty(win, "sessionStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
    win.gtag = vi.fn();
    expect(run(win, CHATGPT)?.landing).toBe(true);
    expect(win.gtag).toHaveBeenCalled();
    expect(run(makeWindowWithThrowingStorage(), "https://site.test/next")).toBeNull();
  });

  it("3: a second copy of the snippet does nothing", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    run(win, CHATGPT);
    run(win, CHATGPT);
    expect(win.gtag).toHaveBeenCalledTimes(2); // event + user_properties, once
  });

  it("4: no currentScript uses the defaults", () => {
    const win = makeWindow("complete");
    win.gtag = vi.fn();
    win.plausible = vi.fn();
    expect(() =>
      start({ win, referrer: CHATGPT, hostname: "site.test", script: null }),
    ).not.toThrow();
    expect(win.gtag).toHaveBeenCalled();
    expect(win.plausible).not.toHaveBeenCalled();
  });

  it.each(["not json", "null", "42", '{"source":1,"vendor":"x"}', '{"source":"x"}'])(
    "5: garbage in sessionStorage (%s) is treated as nothing stored",
    (stored) => {
      const win = makeWindow("complete");
      win.sessionStorage.setItem(STORAGE_KEY, stored);
      expect(run(win, "https://site.test/next")).toBeNull();
    },
  );
});

function makeWindowWithThrowingStorage(): SnippetWindow {
  const win = makeWindow("complete");
  Object.defineProperty(win, "sessionStorage", {
    get() {
      throw new Error("SecurityError");
    },
  });
  return win;
}
