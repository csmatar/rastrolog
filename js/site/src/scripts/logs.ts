// The log analyzer: a file (picked or dropped) or pasted lines → a Web Worker that
// runs @rastrolog/core → the report in #logs. The log never leaves the browser.
import type { Format, ParseResult } from "@rastrolog/core";
import { fmt, plural } from "../i18n/format.ts";
import { logMeta, percent, progressText, toLogView, visitsHeadline } from "../lib/log-model.ts";
import type { LogJob, LogMessage } from "../lib/log-protocol.ts";
import { f, fromTemplate, q, reveal } from "./dom.ts";
import { emit, LOG_RESET, LOG_RESULT, type LogResult } from "./events.ts";
import { readStrings } from "./strings.ts";

const S = readStrings();
const t = S.logs;
const purposeLabels: Readonly<Record<string, { label: string } | undefined>> = S.checker.purposes;
const section = q("#logs");
const drop = q("[data-log-drop]");
const fileInput = q<HTMLInputElement>("[data-log-file]");
const pasteBox = q<HTMLTextAreaElement>("[data-log-paste]");
const status = q("[data-log-status]");
const progress = q("[data-log-progress]");
const unknown = q("[data-log-unknown]");
const message = q("[data-log-message]");
const result = q("[data-log-result]");

let worker: Worker | null = null;
let last: { job: LogJob; name: string; size: number | null } | null = null;

function stop(): void {
  worker?.terminate();
  worker = null;
  progress.hidden = true;
}

function start(job: LogJob, name: string, size: number | null): void {
  stop();
  const w = new Worker(new URL("./log-worker.ts", import.meta.url), { type: "module" });
  worker = w;
  last = { job, name, size };
  section.hidden = false;
  unknown.hidden = true;
  message.hidden = true;
  result.hidden = true;
  emit(LOG_RESET);
  const reading = fmt(t.reading, { name });
  f(progress, "label").textContent = reading;
  setProgress(0, size);
  progress.hidden = false;
  status.textContent = reading;
  reveal(section);
  w.onmessage = (event: MessageEvent<LogMessage>) => {
    if (worker !== w) return; // a newer job replaced this one
    const m = event.data;
    if (m.kind === "progress") {
      setProgress(m.bytesRead, size);
      return;
    }
    stop();
    if (m.kind === "done") render(m.result, name);
    else if (m.kind === "unknown-format") showUnknown(m.line);
    else showMessage(fmt(t.failed, { message: m.message }));
  };
  w.onerror = () => {
    if (worker !== w) return;
    stop();
    showMessage(fmt(t.failed, { message: t.workerFailed }));
  };
  w.postMessage(job);
}

function setProgress(read: number, size: number | null): void {
  f(progress, "amount").textContent = progressText(read, size, S.lang, t);
  const pct = size === null ? 0 : percent(read, size);
  f(progress, "bar").style.width = `${pct}%`;
  f(progress, "meter").setAttribute("aria-valuenow", String(pct));
}

function showMessage(text: string): void {
  message.textContent = text;
  message.hidden = false;
  status.textContent = text;
}

function showUnknown(line: string): void {
  f(unknown, "line").textContent = line;
  unknown.hidden = false;
  status.textContent = t.unknown;
}

function render(parsed: ParseResult, name: string): void {
  const view = toLogView(parsed);
  f(result, "meta").textContent = logMeta(view, name, S.lang, t);
  const headline = visitsHeadline(view, S.lang, t);
  f(result, "crawler-n").textContent = headline.crawlers.n;
  f(result, "crawler-text").textContent = headline.crawlers.text;
  f(result, "chat-n").textContent = headline.chats.n;
  f(result, "chat-text").textContent = headline.chats.text;
  f(result, "truncated").hidden = !view.truncated;
  f(result, "none").hidden = view.aiRequests + view.aiVisits > 0;

  f(result, "crawlers").hidden = view.crawlers.length === 0;
  f(result, "crawler-rows").replaceChildren(
    ...view.crawlers.map((c) => {
      const row = fromTemplate("crawler-row");
      f(row, "vendor").textContent = c.vendorName;
      f(row, "token").textContent = c.token;
      const badge = f(row, "purpose");
      badge.dataset.purpose = c.purpose.replace("_", "-"); // Tailwind reads "_" in data-[…] as a space
      badge.textContent = purposeLabels[c.purpose]?.label ?? c.purpose;
      f(row, "requests").textContent = String(c.requests);
      f(row, "pages").textContent = String(c.pages);
      f(row, "last-seen").textContent = c.lastSeen;
      f(row, "top-pages").textContent = c.topPages;
      return row;
    }),
  );

  f(result, "referrals").hidden = view.referrals.length === 0;
  f(result, "referral-rows").replaceChildren(
    ...view.referrals.map((r) => {
      const row = fromTemplate("referral-row");
      f(row, "product").textContent = r.product;
      f(row, "visits").textContent = String(r.visits);
      f(row, "last-seen").textContent = r.lastSeen;
      f(row, "landing").textContent = r.landing;
      return row;
    }),
  );

  f(result, "search").hidden = view.searchEngines.length === 0;
  f(result, "search-rows").replaceChildren(
    ...view.searchEngines.map((c) => {
      const row = fromTemplate("search-row");
      f(row, "token").textContent = c.token;
      f(row, "requests").textContent = plural(S.lang, c.requests, t.requests);
      return row;
    }),
  );

  result.hidden = false;
  status.textContent = `${headline.crawlers.n} ${headline.crawlers.text} ${headline.chats.n} ${headline.chats.text}`;
  const detail: LogResult = { aiCrawlers: view.aiCrawlers };
  emit(LOG_RESULT, detail);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = ""; // picking the same file again still fires "change"
  if (file !== undefined) start({ kind: "file", file }, file.name, file.size);
});

// A file dropped anywhere else must not make the browser open it and leave the page.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.dataset.dragging = "";
});
drop.addEventListener("dragleave", () => {
  delete drop.dataset.dragging;
});
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  delete drop.dataset.dragging;
  const file = event.dataTransfer?.files[0];
  if (file !== undefined) start({ kind: "file", file }, file.name, file.size);
});

q("[data-log-paste-run]").addEventListener("click", () => {
  const text = pasteBox.value;
  if (text.trim() === "") {
    pasteBox.focus();
    return;
  }
  start({ kind: "text", text }, t.pasteName, null);
});

q("[data-log-cancel]").addEventListener("click", () => {
  stop();
  showMessage(t.cancelled);
});

q<HTMLFormElement>("[data-log-format]").addEventListener("submit", (event) => {
  event.preventDefault();
  if (last === null) return;
  const format = q<HTMLSelectElement>("#log-format").value as Format;
  start({ ...last.job, format }, last.name, last.size);
});
