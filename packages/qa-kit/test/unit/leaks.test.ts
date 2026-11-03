import { describe, expect, it } from "vitest";
import { findValues, maskSample } from "../../src/checks/leaks.ts";

describe("findValues", () => {
  it("skips a value under 4 characters", () => {
    expect(findValues("Annual review", ["Ann"])).toEqual([]);
  });
  it("matches a value between word boundaries", () => {
    expect(findValues("Hello Grace Hopper.", ["Grace Hopper"])).toEqual(["Grace Hopper"]);
    expect(findValues("Gracefully", ["Grace"])).toEqual([]);
  });
  it("matches the URL-encoded form", () => {
    expect(findValues("/x?e=grace.hopper%40example.test", ["grace.hopper@example.test"])).toEqual(["grace.hopper@example.test"]);
  });
  it("matches the plus form and the lowercase encoded form", () => {
    expect(findValues("/x?n=Grace+Hopper", ["Grace Hopper"])).toEqual(["Grace Hopper"]);
    expect(findValues("/x?n=so%c3%ab+k", ["soë k"])).toEqual(["soë k"]);
  });
  it("ignores case", () => {
    expect(findValues("GRACE HOPPER", ["Grace Hopper"])).toEqual(["Grace Hopper"]);
  });
});

describe("maskSample", () => {
  it("keeps the field name and 2 characters", () => {
    expect(maskSample("tenant", "grace.hopper@example.test")).toBe("tenant: gr***********************");
    expect(maskSample("k", "ab")).toBe("k: ab");
  });
});

describe("phone forms", () => {
  const phone = ["07700 900201"];
  it("matches digits-only, +44 and encoded forms", () => {
    expect(findValues("tel=07700900201", phone)).toEqual(phone);
    expect(findValues("tel=+447700900201", phone)).toEqual(phone);
    expect(findValues("tel=%2B447700900201", phone)).toEqual(phone);
    expect(findValues("tel=+17700900201", phone)).toEqual(phone);
  });
  it("matches separators between digits and the +44 and 0044 prefixes", () => {
    for (const text of ["+44 7700 900201", "07700-900-201", "(07700) 900 201", "0044 7700 900201", "tel=%2B44%207700%20900201", "q= 447700900201"]) {
      expect(findValues(text, phone), text).toEqual(phone);
    }
  });
  it("matches any short country code in the + and 00 forms", () => {
    expect(findValues("tel=00353 7700 900201", phone)).toEqual(phone);
    expect(findValues("tel=+1 (7700) 900-201", phone)).toEqual(phone);
  });
  it("needs digit boundaries", () => {
    expect(findValues("1077009002019", phone)).toEqual([]);
    expect(findValues("447700900201", phone)).toEqual([]);
  });
});
