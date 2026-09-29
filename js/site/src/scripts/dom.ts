// Small DOM helpers for the page scripts. Text only: nothing here parses HTML.
import type { Part } from "../i18n/format.ts";

export function q<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector);
  if (el === null) throw new Error(`rastrolog: missing ${selector}`);
  return el;
}

/** The [data-f="name"] field inside root. */
export function f<T extends Element = HTMLElement>(root: ParentNode, name: string): T {
  return q<T>(`[data-f="${name}"]`, root);
}

/** A copy of <template data-tpl="name">'s first element. */
export function fromTemplate<T extends HTMLElement = HTMLElement>(name: string): T {
  const tpl = q<HTMLTemplateElement>(`template[data-tpl="${name}"]`);
  const el = tpl.content.firstElementChild?.cloneNode(true);
  if (!(el instanceof HTMLElement)) throw new Error(`rastrolog: empty template ${name}`);
  return el as T;
}

/** Fill el with text, wrapping some parts in a styled <span> (text nodes only). */
export function setParts(
  el: HTMLElement,
  parts: readonly Part[],
  classes: Readonly<Record<string, string>> = {},
): void {
  el.replaceChildren(
    ...parts.map((part) => {
      const cls = part.name === null ? undefined : classes[part.name];
      if (cls === undefined) return document.createTextNode(part.text);
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = part.text;
      return span;
    }),
  );
}

export function reveal(el: Element): void {
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
}

export const GLYPH = { allowed: "✓", blocked: "✕", partial: "◐" } as const;

/** Beside a file status line: read, absent, unreadable. */
export const FILE_MARK = { ok: "✓", none: "–", warn: "!" } as const;
