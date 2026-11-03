import type { Page } from "@playwright/test";
import { collectElements, collectText, type ElementInfo } from "../collect.ts";
import { finding } from "../findings.ts";
import type { CopyRules, Finding } from "../types.ts";

export interface CopyInput {
  text: string[];
  buttons: string[];
  labelValuePairs: Array<[string, string]>;
  /** Value cells: the text of each visible dd and td. Optional for callers that have none. */
  values?: string[];
  /** Accessible names of controls, images and labelled elements. */
  names?: string[];
  /** Labels that the case rule applies to: buttons, tabs, menu items, options, h2–h6, th, label, legend. */
  labels?: string[];
}

const DEFAULT_VARIANTS = ["—", "-", "N/A", "n/a", "None", "none", "Not recorded", "not recorded", "Unknown", "unknown"];
const SAMPLE_MAX = 40;

// A token inside an email, a URL, a path or a file name is not an identifier.
const BEFORE = String.raw`(?<![\w@./:#-])`;
const AFTER = String.raw`(?![\w@/-]|\.\w)`;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SNAKE = new RegExp(`${BEFORE}[a-z][a-z0-9]*(?:_[a-z0-9]+)+${AFTER}`);
const CAMEL = new RegExp(`${BEFORE}[a-z]+(?:[A-Z][a-z0-9]+){2,}${AFTER}`);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function out(rule: string, severity: "fail" | "warn", message: string, sample: string): Finding {
  return finding({ check: "copy", rule, severity, message, sample: sample.slice(0, SAMPLE_MAX) });
}

// Words that stay lower case inside a title-case label.
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
// A placeholder keeps the word count when a proper noun is taken out.
const HOLE = "\u2063";

/**
 * Pure. True when a label breaks the case rule.
 * The first word of each clause is free. A clause starts after ". ", "! ", "? " or ": ".
 * Only plain words count: an acronym (PDF), a mixed word (iPhone) or a number is skipped.
 */
export function caseDrift(label: string, rule: "sentence" | "title", properNouns: string[] = []): boolean {
  let t = label;
  for (const p of [...properNouns].sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(?<!\\w)${escapeRegExp(p)}(?!\\w)`, "g"), p.split(/\s+/).map(() => HOLE).join(" "));
  }
  for (const clause of t.split(/[.!?:]\s+/)) {
    const tokens = clause.trim().split(/\s+/);
    for (let i = 1; i < tokens.length; i++) {
      const w = (tokens[i] ?? "").replace(/^[("'“‘]+|[)"'”’,;]+$/g, "");
      if (!/^[A-Za-z][a-z'’-]*$/.test(w)) continue;
      if (rule === "sentence" && /^[A-Z]/.test(w) && w !== "I") return true;
      if (rule === "title" && /^[a-z]/.test(w) && !SMALL_WORDS.has(w)) return true;
    }
  }
  return false;
}

/** Pure. It checks the text of a page against the copy rules. */
export function copyRules(input: CopyInput, rules: CopyRules = {}): Finding[] {
  const found: Finding[] = [];
  const seen = new Set<string>();
  const add = (f: Finding) => {
    const key = `${f.rule}|${f.sample ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(f);
  };
  const all = [...input.text, ...input.buttons, ...(input.names ?? [])];

  for (const t of all) {
    if (/([.!?,;:])\1/.test(t.replace(/\.{3,}/g, ""))) {
      add(out("doubled-punctuation", "fail", "Text has doubled punctuation.", t));
    }
    if (/^(\w[\w ]{1,30}):\s*\1:/i.test(t)) add(out("label-echo", "fail", "Text repeats its label.", t));
    if (UUID.test(t) || SNAKE.test(t) || CAMEL.test(t)) {
      add(out("leaked-identifier", "fail", "Text shows an internal identifier.", t));
    }
  }
  for (const [label, value] of input.labelValuePairs) {
    const l = label.trim().replace(/:$/, "");
    if (l && value.trim().toLowerCase().startsWith(`${l.toLowerCase()}:`)) {
      add(out("label-echo", "fail", "A value repeats its label.", value.trim()));
    }
  }
  for (const term of rules.bannedTerms ?? []) {
    const re = new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, "i");
    for (const t of all) if (re.test(t)) add(out("banned-term", "fail", "Text uses a banned term.", t));
  }
  const max = rules.maxButtonWords ?? 4;
  for (const b of input.buttons) {
    if (b.trim().split(/\s+/).filter(Boolean).length > max) {
      add(out("button-length", "warn", "A button label has too many words.", b));
    }
  }

  // Only the value side of a label/value pair counts: a dd, a td, a pair value, or the text after "Label:".
  // Free text such as a lone "None" paragraph is not a value, so it never counts.
  const variants = rules.emptyValueVariants ?? DEFAULT_VARIANTS;
  const used = new Set<string>();
  const values = [...(input.values ?? []), ...input.labelValuePairs.map(([, v]) => v)];
  for (const t of input.text) {
    const afterLabel = /^[^:]{1,40}:\s*(.+)$/.exec(t.trim())?.[1];
    if (afterLabel !== undefined) values.push(afterLabel);
  }
  for (const value of values) {
    const v = value.trim();
    if (variants.includes(v)) used.add(v);
  }
  const wrong = rules.emptyValueWord !== undefined
    ? [...used].filter((v) => v !== rules.emptyValueWord)
    : used.size > 1 ? [...used] : [];
  for (const v of wrong) add(out("mixed-empty-values", "fail", "The page shows empty values in more than one way.", v));
  if (rules.caseRule) {
    for (const label of input.labels ?? []) {
      if (caseDrift(label, rules.caseRule, rules.properNouns)) {
        add(out("case-drift", "fail", `A label does not follow the ${rules.caseRule} case rule.`, label));
      }
    }
  }
  return found;
}

/** Collect the copy of the visible page and check it. Pass `given` to use elements that the caller collected. */
export async function checkCopy(page: Page, rules: CopyRules = {}, given?: ElementInfo[]): Promise<Finding[]> {
  const els = given ?? (await collectElements(page));
  const { text, names } = await collectText(page, els);
  const buttons = els
    .filter((e) => e.tag === "button" || e.role === "button")
    .map((e) => e.name)
    .filter((n) => n !== "");
  const LABEL_ROLES = new Set(["button", "tab", "menuitem", "option"]);
  const LABEL_TAGS = new Set(["button", "h2", "h3", "h4", "h5", "h6", "th", "label", "legend"]);
  // h1 and links are not labels: they often hold record data.
  // A row header (th scope=row) often holds a name, so it is not a label either.
  const labels = els
    .filter((e) => (LABEL_TAGS.has(e.tag) && !(e.tag === "th" && e.attributes.scope === "row")) || LABEL_ROLES.has(e.role ?? ""))
    .map((e) => (e.interactive ? e.name : e.text))
    .filter((t) => t !== "");
  const { labelValuePairs, values } = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === "visible";
    };
    const clean = (s: string) => s.replace(/\s+/g, " ").trim();
    const pairs: Array<[string, string]> = [];
    document.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD" && visible(dt) && visible(dd)) pairs.push([clean(dt.textContent || ""), clean(dd.textContent || "")]);
    });
    document.querySelectorAll("th[scope=row]").forEach((th) => {
      const td = th.nextElementSibling;
      if (td && td.tagName === "TD" && visible(th) && visible(td)) pairs.push([clean(th.textContent || ""), clean(td.textContent || "")]);
    });
    const cells: string[] = [];
    document.querySelectorAll("dd, td").forEach((cell) => { if (visible(cell)) cells.push(clean(cell.textContent || "")); });
    return { labelValuePairs: pairs, values: cells };
  });
  return copyRules({ text, buttons, labelValuePairs, values, names, labels }, rules);
}
