// The domain checker: the hero form → robots.txt and llms.txt fetched from the
// visitor's browser → verdicts → the report in #checker. Everything read from the
// site reaches the page through textContent.
import {
  type CrawlerVerdict,
  checkRobots,
  normalizeDomainInput,
  parseRobots,
} from "@rastrolog/core";
import { fmt, fmtParts, plural } from "../i18n/format.ts";
import { readCheckParam, reportUrl, siteOf, stripScheme } from "../lib/check-param.ts";
import {
  countVerdicts,
  type FileMark,
  fileMark,
  groupVerdicts,
  headlineVars,
  type LlmsSource,
  llmsLine,
  nextCrawler,
  type RobotsSource,
  robotsLine,
  subline,
  summarize,
} from "../lib/checker-model.ts";
import { type FileOutcome, fetchSiteFile } from "../lib/site-fetch.ts";
import { FILE_MARK, f, fromTemplate, GLYPH, q, reveal, setParts } from "./dom.ts";
import { CHECKER_RESET, CHECKER_RESULT, type CheckerResult, emit } from "./events.ts";
import { readStrings } from "./strings.ts";

const S = readStrings();
const t = S.checker;
const form = q<HTMLFormElement>("[data-checker-form]");
const input = q<HTMLInputElement>("#domain");
const inputError = q("[data-domain-error]");
const section = q("#checker");
const status = q("[data-checker-status]");
const paste = q("[data-checker-paste]");
const result = q("[data-checker-result]");

let run = 0;
let current: { site: string; origin: string } | null = null;

function setInputError(message: string | null): void {
  inputError.textContent = message ?? "";
  inputError.hidden = message === null;
  if (message === null) input.removeAttribute("aria-invalid");
  else input.setAttribute("aria-invalid", "true");
}

async function check(raw: string): Promise<void> {
  const parsed = normalizeDomainInput(raw);
  if (!parsed.ok) {
    setInputError(t.input[parsed.reason]);
    input.focus();
    return;
  }
  setInputError(null);
  section.hidden = false;
  const site = siteOf(parsed.origin);
  input.value = site;
  history.replaceState(null, "", reportUrl(location.pathname, site));
  const mine = ++run;
  current = { site, origin: parsed.origin };
  paste.hidden = true;
  result.hidden = true;
  emit(CHECKER_RESET);
  status.textContent = fmt(t.checking, { host: site });
  const [robots, llms] = await Promise.all([
    fetchSiteFile(parsed.origin, "/robots.txt"),
    fetchSiteFile(parsed.origin, "/llms.txt"),
  ]);
  if (mine !== run) return; // a newer check started meanwhile; drop this one
  setLlms(llms);
  if (robots.kind === "found") render(robots.text, robots);
  else if (robots.kind === "missing" || robots.kind === "html") render(null, robots);
  else askForPaste(robots);
}

function setMark(el: HTMLElement, mark: FileMark): void {
  el.dataset.mark = mark;
  el.textContent = FILE_MARK[mark];
}

function setLlms(source: LlmsSource): void {
  f(result, "llms").textContent = llmsLine(source, S.lang, t);
  setMark(f(result, "llms-mark"), fileMark(source));
  const unreachable = source.kind === "unreachable";
  f(result, "llms-paste-item").hidden = !unreachable;
  if (!unreachable) showLlmsPaste(false);
}

function showLlmsPaste(open: boolean): void {
  f(result, "llms-paste").hidden = !open;
  f(result, "llms-paste-toggle").setAttribute("aria-expanded", String(open));
  if (open) f<HTMLTextAreaElement>(result, "llms-text").focus();
}

function render(text: string | null, source: RobotsSource): void {
  if (current === null) return;
  const { site } = current;
  const verdicts = checkRobots(text);
  const counts = countVerdicts(verdicts);
  f(result, "robots").textContent = robotsLine(source, S.lang, t);
  setMark(f(result, "robots-mark"), fileMark(source));
  setParts(f(result, "headline"), fmtParts(t.headline, headlineVars(counts, site, S.lang)), {
    allowed: "text-ok",
  });
  f(result, "sub").textContent = subline(counts, S.lang, t);
  f(result, "summary").replaceChildren(
    ...summarize(verdicts, site, S.lang, t).map((line) => {
      const li = fromTemplate("summary-line");
      li.dataset.verdict = line.verdict;
      f(li, "glyph").textContent = GLYPH[line.verdict];
      f(li, "text").textContent = line.text;
      return li;
    }),
  );
  renderGroups(verdicts);
  paste.hidden = true;
  result.hidden = false;
  status.textContent = fmt(t.ready, { host: site });
  reveal(section);
  const detail: CheckerResult = {
    site,
    next: nextCrawler(verdicts, text === null ? null : parseRobots(text)),
    named: counts.named,
    total: counts.total,
  };
  emit(CHECKER_RESULT, detail);
}

function renderGroups(verdicts: readonly CrawlerVerdict[]): void {
  const wide = matchMedia("(min-width: 48rem)").matches;
  f(result, "groups").replaceChildren(
    ...groupVerdicts(verdicts).map((group, index) => {
      const el = fromTemplate<HTMLDetailsElement>("group");
      el.open = wide || index === 0;
      const purpose = t.purposes[group.purpose];
      const badge = f(el, "badge");
      badge.dataset.purpose = group.purpose.replace("_", "-"); // Tailwind reads "_" in data-[…] as a space
      badge.textContent = purpose.label;
      const counts = [
        group.blocked > 0 ? plural(S.lang, group.blocked, t.counts.blocked) : null,
        group.partial > 0 ? plural(S.lang, group.partial, t.counts.partial) : null,
        group.allowed > 0 ? plural(S.lang, group.allowed, t.counts.allowed) : null,
        purpose.hint,
      ];
      f(el, "counts").textContent = counts.filter((x): x is string => x !== null).join(" · ");
      f(el, "table").setAttribute("aria-label", purpose.label);
      f(el, "rows").replaceChildren(
        ...group.rows.map((r) => {
          const row = fromTemplate("row");
          row.dataset.verdict = r.verdict;
          f(row, "glyph").textContent = GLYPH[r.verdict];
          f(row, "verdict").textContent = t.verdicts[r.verdict];
          f(row, "token").textContent = r.token;
          f(row, "vendor").textContent = r.vendorName;
          f(row, "evidence").textContent = r.evidence ?? t.noRule;
          return row;
        }),
      );
      return el;
    }),
  );
}

function askForPaste(outcome: FileOutcome): void {
  if (current === null) return;
  const { site, origin } = current;
  const message =
    outcome.kind === "server-error"
      ? fmt(t.serverError, { host: site, status: outcome.status })
      : fmt(t.cors, { host: site });
  f(paste, "message").textContent = message;
  const link = f<HTMLAnchorElement>(paste, "open");
  link.href = `${origin}/robots.txt`;
  link.textContent = fmt(t.openFile, { url: `${origin}/robots.txt` });
  paste.hidden = false;
  status.textContent = message;
  reveal(section);
}

// Paste, autofill or typing: drop a leading scheme the field already shows, and keep
// the caret where it was.
input.addEventListener("input", () => {
  const value = stripScheme(input.value);
  const removed = input.value.length - value.length;
  if (removed === 0) return;
  const caret = Math.max(0, (input.selectionStart ?? input.value.length) - removed);
  input.value = value;
  input.setSelectionRange(caret, caret);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void check(input.value);
});

f(paste, "run").addEventListener("click", () => {
  const text = f<HTMLTextAreaElement>(paste, "text").value;
  render(text, { kind: "pasted", text });
});

f(result, "llms-paste-toggle").addEventListener("click", () => {
  showLlmsPaste(f(result, "llms-paste").hidden === true);
});

f(result, "llms-run").addEventListener("click", () => {
  setLlms({ kind: "pasted", text: f<HTMLTextAreaElement>(result, "llms-text").value });
});

const initial = readCheckParam(location.search);
if (initial !== null) {
  input.value = initial;
  void check(initial);
}
