import type { Finding, IgnoreEntry } from "./types.ts";

export function finding(f: Finding): Finding {
  return f.sample === undefined ? f : { ...f, sample: f.sample.slice(0, 80) };
}

export function selectorPattern(selector: string): string {
  return selector.replace(/:nth-(child|of-type)\(\d+\)/g, "");
}

export function dedupe(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding>();
  for (const f of findings) {
    const key = [f.check, f.rule, f.severity, f.route ?? "", f.state ?? "", f.viewport ?? "", selectorPattern(f.selector ?? "")].join("|");
    const seen = groups.get(key);
    if (seen) seen.count = (seen.count ?? 1) + 1;
    else groups.set(key, { ...f });
  }
  return [...groups.values()];
}

export function hasFailures(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === "fail");
}

function samePath(a: string, b: string): boolean {
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p) || "/";
  return clean(a) === clean(b);
}

/**
 * Pure. Drop each finding that matches an ignore entry.
 * `inside(findingSelector, ignoreSelector)` tells if the finding element matches the entry selector or sits inside a match.
 * The default compares the selectors without :nth-child() and :nth-of-type() and also accepts a prefix path.
 */
export function applyIgnore(
  findings: Finding[],
  ignore: readonly IgnoreEntry[] = [],
  inside: (findingSelector: string, ignoreSelector: string) => boolean = (a, b) => {
    const pa = selectorPattern(a);
    const pb = selectorPattern(b);
    return a === b || pa === pb || pa.startsWith(pb + " > ");
  },
): Finding[] {
  if (ignore.length === 0) return findings;
  return findings.filter((f) => !ignore.some((e) =>
    e.check === f.check &&
    (e.rule === undefined || e.rule === f.rule) &&
    (e.route === undefined || (f.route !== undefined && samePath(e.route, f.route))) &&
    (e.selector === undefined || (f.selector !== undefined && inside(f.selector, e.selector)))));
}
