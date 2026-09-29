// Email capture. The checker and log asks stay hidden until their tool reports a
// result (events from checker.ts and logs.ts); the band is there from the start.
import { fmt, num, plural } from "../i18n/format.ts";
import { submitToKit } from "../lib/kit.ts";
import { q } from "./dom.ts";
import {
  CHECKER_RESET,
  CHECKER_RESULT,
  type CheckerResult,
  LOG_RESET,
  LOG_RESULT,
  type LogResult,
} from "./events.ts";
import { readStrings } from "./strings.ts";

const S = readStrings();
type Variant = "checker" | "log" | "band";

function parts(variant: Variant) {
  const box = q(`[data-email-ask="${variant}"]`);
  return {
    box,
    form: q<HTMLFormElement>("form", box),
    sent: q(`[data-email-sent="${variant}"]`, box),
    error: q("[data-email-error]", box),
  };
}

function showForm(variant: Variant): void {
  const { form, sent, error } = parts(variant);
  form.hidden = false;
  sent.hidden = true;
  error.hidden = true;
}

function wire(variant: Variant): void {
  const { form, sent, error } = parts(variant);
  const box = form.querySelector<HTMLInputElement>("[data-latam-box]");
  const latam = form.querySelector<HTMLElement>("[data-latam]");
  if (latam !== null) latam.hidden = false;
  const syncAction = () => {
    form.action =
      (box?.checked ? form.dataset.actionLatam : form.dataset.actionGeneral) ?? form.action;
  };
  box?.addEventListener("change", syncAction);
  syncAction();

  const email = q<HTMLInputElement>('input[name="email_address"]', form);
  const button = q<HTMLButtonElement>("[data-email-submit]", form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = S.ask.submitting;
    error.hidden = true;
    const address = email.value.trim();
    const body = new URLSearchParams({ email_address: address });
    const domain = form.querySelector<HTMLInputElement>("[data-checked-domain]");
    if (domain !== null && domain.value !== "") body.set("fields[checked_domain]", domain.value);
    const outcome = await submitToKit(form.action, body);
    button.disabled = false;
    button.textContent = label;
    if (outcome === "error") {
      error.hidden = false;
      return;
    }
    const sentBody = variant === "band" ? S.signup.sentBody : S.ask[variant].sentBody;
    q("[data-sent-body]", sent).textContent = fmt(sentBody, { email: address });
    const link = sent.querySelector<HTMLAnchorElement>("[data-report-link]");
    if (link !== null) {
      link.href = location.href; // checker.ts already put ?check=<site> in the address bar
      link.textContent = location.href;
    }
    form.hidden = true;
    sent.hidden = false;
    sent.focus();
  });
}

document.addEventListener(CHECKER_RESULT, (event) => {
  const d = (event as CustomEvent<CheckerResult>).detail;
  const { box } = parts("checker");
  const a = S.ask.checker;
  const lead = d.next === "none" ? a.bodyNone : d.next === "closed" ? a.bodyClosed : a.bodyOpen;
  const vars = { host: d.site, named: num(S.lang, d.named), total: num(S.lang, d.total) };
  q("[data-ask-body]", box).textContent = `${fmt(lead, vars)} ${a.tail}`;
  q("[data-ask-fine]", box).textContent = fmt(a.fine, { host: d.site });
  q<HTMLInputElement>("[data-checked-domain]", box).value = d.site;
  showForm("checker");
  box.hidden = false;
});

document.addEventListener(CHECKER_RESET, () => {
  parts("checker").box.hidden = true;
});

document.addEventListener(LOG_RESULT, (event) => {
  const d = (event as CustomEvent<LogResult>).detail;
  const { box } = parts("log");
  const a = S.ask.log;
  q("[data-ask-body]", box).textContent =
    d.aiCrawlers === 0 ? a.bodyNone : plural(S.lang, d.aiCrawlers, a.body);
  showForm("log");
  box.hidden = false;
});

document.addEventListener(LOG_RESET, () => {
  parts("log").box.hidden = true;
});

for (const variant of ["checker", "log", "band"] as const) wire(variant);
