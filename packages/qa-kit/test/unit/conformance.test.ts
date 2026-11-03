import { describe, expect, it } from "vitest";
import { conformanceRules } from "../../src/checks/conformance.ts";
import type { ElementInfo } from "../../src/collect.ts";
import type { DesignSystemRules } from "../../src/types.ts";

const rules: DesignSystemRules = { componentMarker: "[data-ds]", maxVariants: { button: 2 }, requiredRootAttributes: { "data-brand": "x" } };
const el = (selector: string, attributes: Record<string, string> = {}, interactive = true): ElementInfo =>
  ({ selector, tag: "button", attributes, interactive }) as ElementInfo;
const ctx = (inComponent: string[]) => ({ inComponent: new Set(inComponent) });

describe("conformanceRules", () => {
  it("flags an interactive element outside a component", () => {
    const f = conformanceRules([el("a"), el("b")], { "data-brand": "x" }, rules, ctx(["b"]));
    expect(f.map((x) => [x.rule, x.selector])).toEqual([["not-a-component", "a"]]);
  });
  it("flags too many variants of one component", () => {
    const v = (s: string, n: string) => el(s, { "data-slot": "button", "data-variant": `button:${n}` });
    const f = conformanceRules([v("a", "p"), v("b", "s"), v("c", "g")], { "data-brand": "x" }, rules, ctx(["a", "b", "c"]));
    expect(f.map((x) => x.rule)).toEqual(["too-many-variants"]);
  });
  it("flags a missing or wrong root attribute", () => {
    expect(conformanceRules([], {}, rules, ctx([])).map((x) => x.rule)).toEqual(["root-attribute"]);
    expect(conformanceRules([], { "data-brand": "y" }, rules, ctx([])).map((x) => x.rule)).toEqual(["root-attribute"]);
  });
});

describe("componentAttribute", () => {
  it("reads the component name from componentAttribute when the variant value has no colon", () => {
    const v = (s: string, n: string) => el(s, { "data-slot": "button", "data-variant": n });
    const f = conformanceRules([v("#a", "default"), v("#b", "secondary"), v("#c", "ghost")], {}, { componentMarker: "[data-slot]", maxVariants: { button: 2 } });
    expect(f.map((x) => x.rule)).toEqual(["too-many-variants"]);
    expect(f[0]!.sample).toBe("button:default, button:ghost, button:secondary");
  });

  it("keeps a component:variant value as it is", () => {
    const v = (s: string, n: string) => el(s, { "data-slot": "x", "data-variant": `button:${n}` });
    const f = conformanceRules([v("#a", "a"), v("#b", "b")], {}, { componentMarker: "[data-slot]", maxVariants: { button: 2 } });
    expect(f).toEqual([]);
  });
});
