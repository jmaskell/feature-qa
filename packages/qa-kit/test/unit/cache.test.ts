import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultCacheDir } from "../../src/manifest.ts";
import { getVerdict, putVerdict, verdictKey, type Verdict } from "../../src/cache.ts";

describe("verdict cache", () => {
  it("makes the same key for the same input", () =>
    expect(verdictKey("abc", "ac", "1")).toBe(verdictKey("abc", "ac", "1")));
  it("makes a new key when the judge version changes", () =>
    expect(verdictKey("abc", "ac", "1")).not.toBe(verdictKey("abc", "ac", "2")));
  it("makes a new key when the step hash or the judge changes", () => {
    expect(verdictKey("abc", "ac", "1")).not.toBe(verdictKey("abd", "ac", "1"));
    expect(verdictKey("abc", "ac", "1")).not.toBe(verdictKey("abc", "ux", "1"));
  });
  it("does not mix up values that join to the same text", () =>
    expect(verdictKey("a", "bc", "1")).not.toBe(verdictKey("ab", "c", "1")));
  it("returns a stored verdict", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "qa-cache-")), "nested");
    const v: Verdict = { judge: "ac", judgeVersion: "1", verdict: "pass", reason: "The list shows." };
    const key = verdictKey("abc", "ac", "1");
    await putVerdict(dir, key, v);
    expect(await getVerdict(dir, key)).toEqual(v);
  });
  it("returns null for a missing key", async () =>
    expect(await getVerdict(await mkdtemp(join(tmpdir(), "qa-cache-")), "nope")).toBeNull());
});

describe("default cache directory", () =>
  it("is .qa/cache under the root", () => expect(defaultCacheDir("/x")).toBe("/x/.qa/cache")));
