import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import { siteConfig } from "./site.config.ts";

// signals.json lives at the repo root, two levels up.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** A family served from a pinned @fontsource package's latin woff2 files. */
function fontsource(
  pkg: string,
  name: string,
  cssVariable: string,
  weights: [number, ...number[]],
  fallback: string,
) {
  const variant = (weight: number) => ({
    weight,
    style: "normal" as const,
    display: "swap" as const,
    src: [`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff2`] as [string],
  });
  const [first, ...rest] = weights;
  return {
    provider: fontProviders.local(),
    name,
    cssVariable,
    fallbacks: [fallback],
    options: {
      variants: [variant(first), ...rest.map(variant)] as [
        ReturnType<typeof variant>,
        ...ReturnType<typeof variant>[],
      ],
    },
  };
}

export default defineConfig({
  site: siteConfig.siteUrl,
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory", inlineStylesheets: "always" },
  i18n: { locales: ["en", "es"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
  devToolbar: { enabled: false },
  fonts: [
    fontsource(
      "jetbrains-mono",
      "JetBrains Mono",
      "--font-jetbrains-mono",
      [400, 500, 700, 800],
      "monospace",
    ),
    fontsource(
      "ibm-plex-sans",
      "IBM Plex Sans",
      "--font-plex-sans",
      [400, 500, 600, 700],
      "sans-serif",
    ),
  ],
  vite: {
    plugins: [tailwindcss()],
    // The snippet (< 4 KB) would otherwise be inlined as a data: URI; serve it as a file.
    build: { assetsInlineLimit: 0 },
    server: { fs: { allow: [repoRoot] } },
  },
});
