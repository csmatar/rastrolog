import { en } from "./en.ts";
import { es } from "./es.ts";
import type { Lang } from "./format.ts";

export type { Lang, Plural } from "./format.ts";
export type Strings = typeof en;

export const LANGS: readonly Lang[] = ["en", "es"];

const TABLES: Readonly<Record<Lang, Strings>> = { en, es };

export function strings(lang: Lang): Strings {
  return TABLES[lang];
}
