import { describe, expect, it } from "vitest";
import type { ElementInfo } from "../../src/collect.ts";
import { layoutRules } from "../../src/checks/layout.ts";

let n = 0;
function el(p: Partial<Omit<ElementInfo, "style">> & { style?: Partial<ElementInfo["style"]> } = {}): ElementInfo {
  n += 1;
  const { style, ...rest } = p;
  return {
    selector: `body > x:nth-child(${n})`, tag: "div", text: "", name: "", role: null,
    box: { x: 0, y: 0, width: 100, height: 20 },
    style: { cursor: "auto", fontSize: 16, fontWeight: 400, outlineStyle: "none", outlineWidth: 0, boxShadow: "none",
      overflowX: "visible", whiteSpace: "normal", textOverflow: "clip", display: "block", position: "static", ...style },
    scrollWidth: 100, clientWidth: 100, attributes: {}, interactive: false, disabled: false, parentSelector: "body > ul:nth-child(1)",
    ...rest,
  };
}
const vp = { width: 1280 };
const li = (x: number, y: number) => el({ tag: "li", box: { x, y, width: 100, height: 20 } });

describe("layoutRules", () => {
  it("flags the one sibling that is out of line in a vertical stack", () => {
    const items = [li(16, 0), li(16, 30), li(29, 60)];
    const out = layoutRules(items, vp);
    expect(out.map((f) => f.rule)).toEqual(["misaligned-sibling"]);
    expect(out[0]?.selector).toBe(items[2]?.selector);
  });
  it("skips an absolute or fixed sibling, which is out of the flow", () => {
    const pos = (x: number, y: number, position: string) => el({ tag: "li", box: { x, y, width: 100, height: 20 }, style: { position } });
    expect(layoutRules([li(16, 0), li(16, 30), pos(200, 60, "absolute"), pos(300, 90, "fixed"), li(16, 120)], vp)).toEqual([]);
  });
  it("accepts siblings on one row", () => {
    expect(layoutRules([li(16, 0), li(120, 0), li(224, 0)], vp)).toEqual([]);
  });
  it("ignores inline siblings", () => {
    const items = [16, 16, 29].map((x, i) => el({ tag: "span", style: { display: "inline" }, box: { x, y: i * 30, width: 10, height: 20 } }));
    expect(layoutRules(items, vp)).toEqual([]);
  });
  it("flags clipped text", () => {
    const dt = el({ tag: "dt", text: "Monthly rent", scrollWidth: 140, clientWidth: 40, style: { overflowX: "hidden" } });
    const out = layoutRules([dt], vp);
    expect(out.map((f) => f.rule)).toEqual(["clipped-text"]);
    expect(out[0]?.sample).toBe("Monthly rent");
  });
  it("accepts clipped text with an ellipsis", () => {
    const dt = el({ tag: "dt", text: "Monthly rent", scrollWidth: 140, clientWidth: 40, style: { overflowX: "hidden", textOverflow: "ellipsis" } });
    expect(layoutRules([dt], vp)).toEqual([]);
  });
  it("flags horizontal overflow from the html element", () => {
    const html = el({ tag: "html", scrollWidth: 900 });
    expect(layoutRules([html], { width: 375 }).map((f) => f.rule)).toEqual(["horizontal-overflow"]);
    expect(layoutRules([el({ tag: "html", scrollWidth: 376 })], { width: 375 })).toEqual([]);
  });
  it("flags type that is off the scale", () => {
    const rules = { componentMarker: "[data-ds]", typeScale: [[16, 400], [32, 600]] as Array<[number, number]> };
    const h1 = (size: number) => el({ tag: "h1", text: "Title", style: { fontSize: size, fontWeight: 600 } });
    expect(layoutRules([h1(19)], vp, rules).map((f) => f.rule)).toEqual(["off-scale-type"]);
    expect(layoutRules([h1(32)], vp, rules)).toEqual([]);
    expect(layoutRules([h1(19)], vp, { componentMarker: "x" })).toEqual([]);
  });
  describe("text scale", () => {
    const text = (size: number, weight: number) => el({ tag: "p", text: "Body", style: { fontSize: size, fontWeight: weight } });
    it("divides the font size by the scale before it compares", () => {
      const rules = { componentMarker: "x", typeScale: [[14, 600]] as Array<[number, number]> };
      expect(layoutRules([text(28, 600)], vp, rules, { textScale: 2 })).toEqual([]);
    });
    it("accepts px text that did not grow: a 16/400 element passes at scale 2 when the scale has [16, 400]", () => {
      const rules = { componentMarker: "x", typeScale: [[16, 400]] as Array<[number, number]> };
      expect(layoutRules([text(16, 400)], vp, rules, { textScale: 2 })).toEqual([]);
    });
    it("flags a 28/600 element at scale 1", () => {
      const rules = { componentMarker: "x", typeScale: [[14, 600]] as Array<[number, number]> };
      const out = layoutRules([text(28, 600)], vp, rules);
      expect(out.map((f) => f.rule)).toEqual(["off-scale-type"]);
    });
    it("flags a 15/400 element at scale 2 and shows the scale in the sample", () => {
      const rules = { componentMarker: "x", typeScale: [[14, 400]] as Array<[number, number]> };
      const out = layoutRules([text(15, 400)], vp, rules, { textScale: 2 });
      expect(out.map((f) => f.rule)).toEqual(["off-scale-type"]);
      expect(out[0]?.message).toContain("15px/400 at 200% text");
    });
  });
  it("keeps page text out of the message", () => {
    const dt = el({ tag: "dt", text: "Secret Name", scrollWidth: 140, clientWidth: 40, style: { overflowX: "hidden" } });
    expect(layoutRules([dt], vp)[0]?.message).not.toContain("Secret");
  });
  it("ignores visually hidden text in a 1px box", () => {
    const sr = el({ tag: "span", text: "Skip to content", box: { x: 0, y: 0, width: 1, height: 1 }, scrollWidth: 120, clientWidth: 1, style: { overflowX: "hidden" } });
    expect(layoutRules([sr], vp)).toEqual([]);
  });
  const boxes = (xs: Array<[number, number]>) => xs.map(([x, w], i) => el({ tag: "li", box: { x, y: i * 30, width: w, height: 20 } }));
  it("accepts a centred stack of different widths", () => {
    expect(layoutRules(boxes([[540, 200], [490, 300], [515, 250]]), vp)).toEqual([]);
  });
  it("accepts a right-aligned stack", () => {
    expect(layoutRules(boxes([[800, 200], [700, 300], [750, 250]]), vp)).toEqual([]);
  });
  it("accepts a left-aligned stack of different widths", () => {
    expect(layoutRules(boxes([[16, 200], [16, 300], [16, 250]]), vp)).toEqual([]);
  });
  it("treats an empty type scale as no scale", () => {
    const h1 = el({ tag: "h1", text: "Title", style: { fontSize: 19, fontWeight: 600 } });
    expect(layoutRules([h1], vp, { componentMarker: "x", typeScale: [] })).toEqual([]);
  });
  it("ignores whitespace-only text", () => {
    const dt = el({ tag: "dt", text: "   ", scrollWidth: 140, clientWidth: 40, style: { overflowX: "hidden", fontSize: 19 } });
    expect(layoutRules([dt], vp, { componentMarker: "x", typeScale: [[16, 400]] })).toEqual([]);
  });
  it("rounds the font size to 0.5px", () => {
    const p = el({ tag: "p", text: "Body" , style: { fontSize: 15.98 } });
    expect(layoutRules([p], vp, { componentMarker: "x", typeScale: [[16, 400]] })).toEqual([]);
  });
});

describe("overlap", () => {
  const ctl = (selector: string, x: number, y: number, extra: Partial<ElementInfo["style"]> = {}) =>
    el({ selector, interactive: true, tag: "a", box: { x, y, width: 80, height: 24 }, style: extra });
  it("flags two controls whose boxes cross by more than 2px", () => {
    const out = layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 40, 0)], vp);
    expect(out.map((f) => [f.rule, f.selector])).toEqual([["overlap", "body > a:nth-child(2)"]]);
  });
  it("allows boxes that touch or cross by 2px or less", () => {
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 78, 0)], vp)).toEqual([]);
  });
  it("skips a control inside another control, and fixed or sticky controls", () => {
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(1) > button:nth-child(1)", 10, 0)], vp)).toEqual([]);
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 40, 0, { position: "fixed" })], vp)).toEqual([]);
    expect(layoutRules([ctl("body > a:nth-child(1)", 0, 0), ctl("body > a:nth-child(2)", 40, 0, { position: "sticky" })], vp)).toEqual([]);
  });
  it("compares two controls only when they are in the same scroll layer", () => {
    const inBar = (e: ElementInfo): ElementInfo => ({ ...e, layer: "body > footer:nth-child(9)" });
    // A link in a sticky bar and a field under it: the bar moves with the scroll, so the pair does not count.
    expect(layoutRules([{ ...ctl("body > form > a:nth-child(1)", 0, 0), layer: null }, inBar(ctl("body > footer:nth-child(9) > a:nth-child(1)", 40, 0))], vp)).toEqual([]);
    // Two links in the same sticky bar still count.
    const both = layoutRules([inBar(ctl("body > footer:nth-child(9) > a:nth-child(1)", 0, 0)), inBar(ctl("body > footer:nth-child(9) > a:nth-child(2)", 40, 0))], vp);
    expect(both.map((f) => f.rule)).toEqual(["overlap"]);
  });
  const inModal = (e: ElementInfo): ElementInfo => ({ ...e, inModal: true });
  it("skips a pair when one control is inside a modal and the other is not, whatever the modal tag", () => {
    const out = layoutRules([ctl("body > main > a:nth-child(1)", 0, 0), inModal(ctl("body > div:nth-child(3) > button:nth-child(1)", 40, 0))], vp);
    expect(out).toEqual([]);
  });
  it("still flags two controls inside the same modal", () => {
    const out = layoutRules([
      inModal(ctl("body > div:nth-child(3) > button:nth-child(1)", 0, 0)),
      inModal(ctl("body > div:nth-child(3) > button:nth-child(2)", 40, 0)),
    ], vp);
    expect(out.map((f) => f.rule)).toEqual(["overlap"]);
  });
});
