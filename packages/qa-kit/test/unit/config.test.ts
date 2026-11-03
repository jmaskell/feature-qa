import { describe, expect, it } from "vitest";
import { defineQaConfig } from "../../src/config.ts";
import type { QaConfig } from "../../src/types.ts";

const base: QaConfig = {
  baseURL: "http://localhost:4400",
  routes: ["/", "/tenants"],
  roles: [{ name: "agent" }, { name: "landlord" }],
  scenarios: [{ name: "Ada", states: ["default"], knownValues: ["ada.lovelace@example.test"] }],
  accessMatrix: { "/tenants": { agent: "allow", landlord: "deny" } },
};

describe("defineQaConfig", () => {
  it("returns a valid config unchanged", () => expect(defineQaConfig(base)).toBe(base));
  it("refuses a matrix route that is not in routes", () =>
    expect(() => defineQaConfig({ ...base, accessMatrix: { "/x": { agent: "allow" } } })).toThrow("accessMatrix: route /x is not in routes"));
  it("refuses a matrix role that is not in roles", () =>
    expect(() => defineQaConfig({ ...base, accessMatrix: { "/": { owner: "allow" } } })).toThrow("accessMatrix: role owner is not in roles"));
  it("refuses a baseURL that is not http or https", () =>
    expect(() => defineQaConfig({ ...base, baseURL: "ftp://x" })).toThrow("baseURL"));
  it("refuses two roles with one name", () =>
    expect(() => defineQaConfig({ ...base, roles: [{ name: "agent" }, { name: "agent" }] })).toThrow("roles: agent is listed twice"));
  it("refuses a role named anonymous, which is reserved", () =>
    expect(() => defineQaConfig({ ...base, roles: [{ name: "anonymous" }] })).toThrow("roles: anonymous is reserved"));
  it("refuses an ignore entry with no reason", () =>
    expect(() => defineQaConfig({ ...base, ignore: [{ check: "copy", reason: " " }] })).toThrow("ignore: each entry needs a reason"));
});
