import { describe, expect, it } from "vitest";
import { timed, timingTable, type Timings } from "../../src/timing.ts";

describe("timed", () => {
  it("adds the time to the key, and runs fn with no timings", async () => {
    const t: Timings = {};
    expect(await timed(t, "a", async () => 1)).toBe(1);
    await timed(t, "a", async () => 2);
    expect(t.a).toBeGreaterThanOrEqual(0);
    expect(await timed(undefined, "a", async () => 3)).toBe(3);
  });
});

describe("timingTable", () => {
  it("gives the median, p95 and max of each part, and a total of the top-level parts", () => {
    const steps = [10, 20, 30, 40].map((ms) => ({ timings: { screenshot: ms, checks: ms * 10, "checks.axe": ms * 5 } }));
    const rows = timingTable([...steps, {}]);
    const row = (part: string) => rows.find((r) => r.part === part);
    expect(row("screenshot")).toEqual({ part: "screenshot", steps: 4, median: 20, p95: 40, max: 40, total: 100 });
    expect(row("total")).toMatchObject({ steps: 4, median: 220, max: 440 });
    expect(rows[0]?.part).toBe("total");
  });

  it("adds no total for a record with only nested parts, such as after-test", () => {
    const rows = timingTable([{ timings: { screenshot: 10 } }, { timings: { "after-test.settle": 100 } }]);
    expect(rows.find((r) => r.part === "total")).toMatchObject({ steps: 1, total: 10 });
    expect(rows.find((r) => r.part === "after-test.settle")).toMatchObject({ steps: 1, total: 100 });
  });
});
