import { describe, expect, it } from "vitest";
import { applyIgnore, dedupe, finding, hasFailures, selectorPattern } from "../../src/findings.ts";

describe("findings", () => {
  it("trims a sample to 80 characters", () =>
    expect(finding({ check: "copy", rule: "r", severity: "fail", message: "m", sample: "x".repeat(200) }).sample).toHaveLength(80));
  it("collapses one rule on many rows into one finding with a count", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      finding({ check: "interaction", rule: "pointer-cursor", severity: "fail", message: "m", selector: `ul > li:nth-child(${i + 1}) > button` }));
    const out = dedupe(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.count).toBe(200);
  });
  it("keeps different rules apart", () =>
    expect(dedupe([
      finding({ check: "copy", rule: "a", severity: "fail", message: "m" }),
      finding({ check: "copy", rule: "b", severity: "fail", message: "m" }),
    ])).toHaveLength(2));
  it("removes nth-child from a selector pattern", () =>
    expect(selectorPattern("main > ul:nth-of-type(2) > li:nth-child(3)")).toBe("main > ul > li"));
  it("finds failures and ignores warnings", () => {
    expect(hasFailures([finding({ check: "copy", rule: "a", severity: "warn", message: "m" })])).toBe(false);
    expect(hasFailures([finding({ check: "copy", rule: "a", severity: "fail", message: "m" })])).toBe(true);
  });
});

describe("applyIgnore", () => {
  const f = (p: Partial<Parameters<typeof finding>[0]> = {}) =>
    finding({ check: "copy", rule: "banned-term", severity: "fail", message: "m", selector: "body > p:nth-child(2)", route: "/a", ...p });
  it("drops a finding that matches check, rule, selector and route", () =>
    expect(applyIgnore([f()], [{ check: "copy", rule: "banned-term", selector: "body > p", route: "/a", reason: "legal text" }])).toEqual([]));
  it("matches every rule of the check when rule is not set", () =>
    expect(applyIgnore([f(), f({ rule: "label-echo" })], [{ check: "copy", reason: "r" }])).toEqual([]));
  it("keeps a finding on another route, rule or check", () => {
    expect(applyIgnore([f()], [{ check: "copy", route: "/b", reason: "r" }])).toHaveLength(1);
    expect(applyIgnore([f()], [{ check: "copy", rule: "label-echo", reason: "r" }])).toHaveLength(1);
    expect(applyIgnore([f()], [{ check: "layout", reason: "r" }])).toHaveLength(1);
  });
  it("keeps a finding with no selector when the entry names a selector", () =>
    expect(applyIgnore([f({ selector: undefined })], [{ check: "copy", selector: "body > p", reason: "r" }])).toHaveLength(1));
  it("uses the selector test that the caller gives", () =>
    expect(applyIgnore([f()], [{ check: "copy", selector: "#banner", reason: "r" }], (sel, ign) => sel === "body > p:nth-child(2)" && ign === "#banner")).toEqual([]));
});
