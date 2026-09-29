import { describe, expect, it } from "vitest";
import { clientJson } from "../src/i18n/client.ts";
import { en } from "../src/i18n/en.ts";
import { es } from "../src/i18n/es.ts";
import { byCount, fmt, fmtParts, list, placeholders, plural } from "../src/i18n/format.ts";

type Tree = { readonly [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

const EN = leaves(en as unknown as Tree);
const ES = leaves(es as unknown as Tree);

describe("the English and Spanish tables", () => {
  it("have the same keys", () => {
    expect([...ES.keys()]).toEqual([...EN.keys()]);
  });

  it("use the same placeholders in every string", () => {
    for (const [key, text] of EN)
      expect(placeholders(ES.get(key) ?? ""), key).toEqual(placeholders(text));
  });
});

describe("format helpers", () => {
  it("fmt fills known placeholders and leaves unknown ones", () => {
    expect(fmt("{host} lets {n} in, {x}", { host: "example.com", n: 3 })).toBe(
      "example.com lets 3 in, {x}",
    );
  });

  it("fmtParts splits a template around its values", () => {
    expect(
      fmtParts("{host} lets {allowed} of {total} in.", {
        host: "a.com",
        allowed: "23",
        total: "28",
      }),
    ).toEqual([
      { text: "a.com", name: "host" },
      { text: " lets ", name: null },
      { text: "23", name: "allowed" },
      { text: " of ", name: null },
      { text: "28", name: "total" },
      { text: " in.", name: null },
    ]);
  });

  it("plural picks the form by language and formats the number", () => {
    const lines = { one: "1 line", other: "{n} lines" };
    expect(plural("en", 1, lines)).toBe("1 line");
    expect(plural("en", 0, lines)).toBe("0 lines");
    expect(plural("en", 1234, lines)).toBe("1,234 lines");
    expect(plural("es", 1234, { one: "1 línea", other: "{n} líneas" })).toBe("1234 líneas");
  });

  it("byCount picks by list length, list joins in each language", () => {
    expect(byCount(1, { one: "a", other: "b" })).toBe("a");
    expect(byCount(2, { one: "a", other: "b" })).toBe("b");
    expect(list("en", ["OpenAI", "Google", "ByteDance"])).toBe("OpenAI, Google, and ByteDance");
    expect(list("es", ["OpenAI", "Google", "ByteDance"])).toBe("OpenAI, Google y ByteDance");
    expect(list("en", ["OpenAI"])).toBe("OpenAI");
  });

  it("clientJson can't close its <script> tag", () => {
    expect(clientJson("en")).not.toContain("<");
    expect(JSON.parse(clientJson("en")).lang).toBe("en");
  });
});
