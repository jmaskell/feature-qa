import { describe, expect, it } from "vitest";
import { CHECK_IDS, type CheckId } from "../../src/types.ts";
// @ts-expect-error The fixture is plain JavaScript and has no types.
import { DEFECTS } from "../../../../fixtures/lettings-app/defects.mjs";

interface Defect { id: string; check: CheckId; rule: string }
const defects = DEFECTS as Defect[];

// Every rule id that a check can emit. Keep this list in step with the check sources.
const RULES: Record<string, string[]> = {
  smoke: ["console-error", "page-error", "asset-failed", "csp-violation", "dead-action", "action-missing", "action-not-clickable", "unstyled", "teardown-error"],
  layout: ["horizontal-overflow", "clipped-text", "misaligned-sibling", "off-scale-type", "overlap"],
  interaction: ["pointer-cursor", "focus-visible", "focus-unreachable", "hover-shift", "escape-closes", "escape-nothing-open"],
  a11y: ["axe-button-name", "reflow", "reflow-skipped", "forced-colors"],
  copy: ["doubled-punctuation", "label-echo", "leaked-identifier", "banned-term", "button-length", "mixed-empty-values", "case-drift"],
  conformance: ["not-a-component", "too-many-variants", "root-attribute"],
  leaks: ["url", "title", "storage", "third-party", "server-log", "cookie"],
  access: ["denied-but-allowed", "allowed-but-denied", "probe-error"],
  visual: ["new-baseline", "changed"],
};

// Rules with no planted defect, each with the reason.
const NO_DEFECT_YET: Record<string, string> = {
  "smoke/page-error": "The fixture has no uncaught page exception defect.",
  "smoke/csp-violation": "Proved by its own spec with a routed CSP page; the fixture sends no CSP.",
  "smoke/teardown-error": "Raised only when a scan throws; no page can plant it.",
  "interaction/focus-unreachable": "A warning that needs a page whose controls take no focus; proved in interaction.spec.ts.",
  "interaction/escape-nothing-open": "A warning that needs an opener that opens nothing; proved in interaction.spec.ts.",
  "a11y/reflow-skipped": "A warning that needs a context with no viewport; proved in a11y.spec.ts.",
  "access/allowed-but-denied": "A warning for a broken allowed route; proved in access.spec.ts.",
  "access/probe-error": "Raised only when a probe throws; proved in access.spec.ts.",
  "visual/new-baseline": "Compares two runs, not one page; proved in visual.spec.ts.",
  "visual/changed": "Compares two runs, not one page; proved in visual.spec.ts.",
};

describe("defect registry", () => {
  it("has a planted defect for every check except coverage and visual", () => {
    const covered = new Set(defects.map((d) => d.check));
    expect(CHECK_IDS.filter((c) => c !== "coverage" && c !== "visual" && !covered.has(c))).toEqual([]);
  });

  it("gives every defect a unique id and a rule", () => {
    const ids = defects.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(defects.filter((d) => !d.rule)).toEqual([]);
  });

  it("names a known rule on every defect", () => {
    const bad = defects.filter((d) => !(RULES[d.check] ?? []).includes(d.rule));
    expect(bad.map((d) => d.id)).toEqual([]);
  });

  it("has a defect for every rule except the named ones", () => {
    const have = new Set(defects.map((d) => `${d.check}/${d.rule}`));
    const missing = Object.entries(RULES).flatMap(([check, rules]) => rules.map((r) => `${check}/${r}`)).filter((k) => !have.has(k) && !(k in NO_DEFECT_YET));
    expect(missing).toEqual([]);
  });

  it("lists in NO_DEFECT_YET only rules that have no defect", () => {
    const have = new Set(defects.map((d) => `${d.check}/${d.rule}`));
    expect(Object.keys(NO_DEFECT_YET).filter((k) => have.has(k))).toEqual([]);
  });
});
