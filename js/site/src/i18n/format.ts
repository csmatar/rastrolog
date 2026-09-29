// String helpers shared by the build (.astro) and the browser (src/scripts). No
// string tables here, so importing this never bundles a language into the client.

export type Lang = "en" | "es";
export type Vars = Readonly<Record<string, string | number>>;

export interface Plural {
  one: string;
  other: string;
}

export interface Part {
  text: string;
  /** The placeholder this text came from, or null for template text. */
  name: string | null;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function fmt(template: string, vars: Vars): string {
  return template.replace(PLACEHOLDER, (whole: string, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

/** Like fmt, but keeps each filled value separate so the DOM can style it. */
export function fmtParts(template: string, vars: Vars): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    const name = m[1] as string;
    if (!Object.hasOwn(vars, name)) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: template.slice(last, at), name: null });
    parts.push({ text: String(vars[name]), name });
    last = at + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last), name: null });
  return parts;
}

export function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string).sort();
}

export function num(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang).format(n);
}

/** One decimal place, for megabytes. */
export function decimal(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    n,
  );
}

export function pluralForm(lang: Lang, n: number, forms: Plural): string {
  return new Intl.PluralRules(lang).select(n) === "one" ? forms.one : forms.other;
}

/** The plural form for n, with {n} filled in (plus any other vars). */
export function plural(lang: Lang, n: number, forms: Plural, vars: Vars = {}): string {
  return fmt(pluralForm(lang, n, forms), { ...vars, n: num(lang, n) });
}

/** Grammatical number of a list of names: one name or several. */
export function byCount(count: number, forms: Plural): string {
  return count === 1 ? forms.one : forms.other;
}

export function list(lang: Lang, items: readonly string[]): string {
  return new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(items);
}
