import { describe, expect, it } from "vitest";
import { settle } from "../../src/fixture.ts";

describe("settle", () => {
  it("waits for the load event, then for an idle moment of the page, before a step's screenshot", async () => {
    const calls: string[] = [];
    let loaded = false;
    const page = {
      waitForLoadState: async (state: "load") => {
        await new Promise((r) => setTimeout(r, 10));
        loaded = true;
        calls.push(state);
      },
      evaluate: async <R>(fn: () => R | Promise<R>) => {
        calls.push(loaded ? "idle after load" : "idle before load");
        return fn();
      },
    };
    await settle(page);
    expect(calls).toEqual(["load", "idle after load"]);
  });
});
