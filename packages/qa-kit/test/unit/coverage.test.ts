import { describe, expect, it } from "vitest";
import { coverage } from "../../src/checks/coverage.ts";
import { accessProbes, samePath } from "../../src/checks/access.ts";
import type { QaConfig } from "../../src/types.ts";

describe("coverage", () => {
  it("reports a state that no step reaches", () => {
    const found = coverage({ states: ["default", "empty"], criteria: [], steps: [{ state: "default" }] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: "coverage", rule: "state-not-reached", severity: "fail", state: "empty" });
  });
  it("reports a criterion that no step tests", () => {
    const found = coverage({ states: [], criteria: ["AC1", "AC2"], steps: [{ criteria: ["AC1"] }] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: "coverage", rule: "criterion-without-test", severity: "fail" });
    expect(found[0]!.message).toContain("AC2");
  });
  it("returns nothing when all is covered", () => {
    expect(coverage({ states: ["a"], criteria: ["AC1"], steps: [{ state: "a", criteria: ["AC1"] }] })).toEqual([]);
  });
});

describe("accessProbes", () => {
  const config = {
    baseURL: "http://x", routes: ["/a", "/b"], scenarios: [],
    roles: [{ name: "agent" }, { name: "landlord" }],
    accessMatrix: { "/a": { agent: "allow", anonymous: "deny" }, "/b": { agent: "allow" } },
  } as QaConfig;
  it("makes one probe for each route and role, plus anonymous", () => {
    const probes = accessProbes(config);
    expect(probes).toHaveLength(6);
    expect(probes).toContainEqual({ route: "/a", role: "agent", expected: "allow" });
  });
  it("treats a missing cell as deny", () => {
    const probes = accessProbes(config);
    expect(probes).toContainEqual({ route: "/b", role: "landlord", expected: "deny" });
    expect(probes).toContainEqual({ route: "/b", role: "anonymous", expected: "deny" });
  });
});

describe("samePath", () => {
  it("ignores a trailing slash on either side", () => {
    expect(samePath("/properties", "/properties/")).toBe(true);
    expect(samePath("/properties/", "/properties")).toBe(true);
    expect(samePath("/", "/")).toBe(true);
  });
  it("finds a real difference", () => {
    expect(samePath("/properties", "/sign-in")).toBe(false);
    expect(samePath("/properties/p3", "/properties")).toBe(false);
  });
});
