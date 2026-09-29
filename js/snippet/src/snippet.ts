// The <script> tag entry, bundled as an IIFE into dist/snippet.min.js.
import { type SnippetWindow, start } from "./runtime.js";

try {
  start({
    win: window as SnippetWindow,
    referrer: document.referrer,
    hostname: location.hostname,
    script: document.currentScript,
  });
} catch {
  // Never throw into the host page.
}
