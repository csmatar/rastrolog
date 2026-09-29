// Builds dist/: the script-tag IIFE, the ESM entry, and index.d.ts (which
// re-exports core's declarations; `tsc` emits them into dist/core afterwards).
// Deterministic for a given lockfile: the release checks the SRI hash against it.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const at = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

rmSync(at("dist"), { recursive: true, force: true });
mkdirSync(at("dist"), { recursive: true });

const common = { bundle: true, target: "es2020", legalComments: "none", charset: "utf8" } as const;

await build({
  ...common,
  entryPoints: [at("src/snippet.ts")],
  outfile: at("dist/snippet.min.js"),
  format: "iife",
  platform: "browser",
  minify: true,
});

await build({
  ...common,
  entryPoints: [at("src/index.ts")],
  outfile: at("dist/index.js"),
  format: "esm",
  platform: "neutral",
});

writeFileSync(
  at("dist/index.d.ts"),
  [
    'export { classifyReferrer, classifyUserAgent } from "./core/index.js";',
    'export type { Match, Purpose, ReferrerOptions } from "./core/index.js";',
    "",
  ].join("\n"),
);

// npm packs LICENSE only from the package directory (gitignored copy).
copyFileSync(at("../../LICENSE"), at("LICENSE"));
