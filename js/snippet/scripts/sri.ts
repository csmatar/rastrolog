// Pinned-install block in the READMEs:
//   node scripts/sri.ts --write ../../README.md README.md   (release PR)
//   node scripts/sri.ts --check ../../README.md README.md   (release.yml)
// The block records the release in package.json "version" and the SHA-384 of
// dist/snippet.min.js, so run `pnpm run build` first.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SRI_START = "<!-- rastrolog:sri:start -->";
export const SRI_END = "<!-- rastrolog:sri:end -->";

export function sriHash(bytes: Uint8Array): string {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

export function pinnedBlock(version: string, hash: string): string {
  const src = `https://cdn.jsdelivr.net/npm/rastrolog@${version}/dist/snippet.min.js`;
  return [
    SRI_START,
    "```html",
    `<script src="${src}" integrity="${hash}" crossorigin="anonymous" defer></script>`,
    "```",
    SRI_END,
  ].join("\n");
}

export function replaceBlock(text: string, block: string): string {
  const start = text.indexOf(SRI_START);
  const end = text.indexOf(SRI_END);
  if (start < 0 || end < start) throw new Error(`missing ${SRI_START} ... ${SRI_END} markers`);
  return text.slice(0, start) + block + text.slice(end + SRI_END.length);
}

function main(argv: string[]): number {
  const [mode, ...files] = argv;
  if ((mode !== "--write" && mode !== "--check") || files.length === 0) {
    console.error("usage: sri.ts --write|--check FILE...");
    return 2;
  }
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  const bundle = readFileSync(new URL("../dist/snippet.min.js", import.meta.url));
  const block = pinnedBlock(pkg.version, sriHash(bundle));
  let ok = true;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const updated = replaceBlock(text, block);
    if (mode === "--write") {
      writeFileSync(file, updated);
      console.log(`sri: wrote ${file}`);
    } else if (updated !== text) {
      console.error(`sri: ${file} does not pin rastrolog@${pkg.version} with this build's hash`);
      ok = false;
    }
  }
  return ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
