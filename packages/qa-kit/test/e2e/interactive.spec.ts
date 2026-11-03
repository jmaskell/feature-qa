import { expect, test } from "@playwright/test";
import { INTERACTIVE_SELECTOR } from "../../src/interactive.ts";

test("a grid cell or a tree item is a control only when it has a tabindex", async ({ page }) => {
  await page.setContent(`
    <div role="grid" aria-readonly="true"><div role="row">
      <span role="gridcell" id="a">1</span><span role="gridcell" id="b" tabindex="-1">2</span>
    </div></div>
    <ul role="tree"><li role="treeitem" id="c">x</li><li role="treeitem" id="d" tabindex="0">y</li></ul>`);
  const matches = await page.evaluate(
    (sel) => ["a", "b", "c", "d"].map((id) => document.getElementById(id)!.matches(sel)),
    INTERACTIVE_SELECTOR,
  );
  expect(matches).toEqual([false, true, false, true]);
});
