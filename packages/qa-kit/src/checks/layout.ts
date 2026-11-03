import type { Page } from "@playwright/test";
import { collectElements, type ElementInfo } from "../collect.ts";
import { finding } from "../findings.ts";
import type { DesignSystemRules, Finding } from "../types.ts";

const sample = (text: string): string => text.slice(0, 30);

export interface LayoutOptions {
  /** The text scale of the page (2 for the 200% text profile). The type-scale rule accepts the font size or the font size divided by it. Default 1. */
  textScale?: number;
}

/** Apply the layout rules to collected elements. Pure. An element with tag "html" carries the document scroll width. */
export function layoutRules(els: ElementInfo[], viewport: { width: number }, rules?: DesignSystemRules, opts: LayoutOptions = {}): Finding[] {
  const textScale = opts.textScale ?? 1;
  const out: Finding[] = [];
  const add = (rule: string, message: string, e: ElementInfo, withSample = false): void => {
    out.push(finding({
      check: "layout", rule, severity: "fail", message, selector: e.selector,
      ...(withSample && e.text ? { sample: sample(e.text) } : {}),
    }));
  };

  // Rule 1: the page is wider than the viewport.
  const html = els.find((e) => e.tag === "html");
  if (html && html.scrollWidth > viewport.width + 1) {
    add("horizontal-overflow", `The page is ${html.scrollWidth}px wide in a ${viewport.width}px viewport.`, html);
  }

  // Rule 2: text is cut off by its own box.
  for (const e of els) {
    if (e.text.trim() === "" || e.tag === "html") continue;
    // A box of 2px or less is visually hidden text on purpose.
    if (e.box.width <= 2 || e.box.height <= 2) continue;
    const clips = e.style.overflowX === "hidden" || e.style.overflowX === "clip";
    if (clips && e.scrollWidth > e.clientWidth + 1 && e.style.textOverflow !== "ellipsis") {
      add("clipped-text", `The text is cut off: it needs ${e.scrollWidth}px and the box is ${e.clientWidth}px.`, e, true);
    }
  }

  // Rule 3: one sibling in a vertical stack has a different left edge.
  const groups = new Map<string, ElementInfo[]>();
  for (const e of els) {
    // An absolute or fixed box is out of the flow, so it is not part of the stack.
    if (e.parentSelector === null || e.style.display.startsWith("inline") || e.style.position === "absolute" || e.style.position === "fixed") continue;
    const key = `${e.parentSelector}|${e.tag}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const stack = [...group].sort((a, b) => a.box.y - b.box.y);
    const stacked = stack.every((e, i) => i === 0 || e.box.y > (stack[i - 1] as ElementInfo).box.y + (stack[i - 1] as ElementInfo).box.height - 1);
    if (!stacked) continue;
    // A centred stack has one centre line, so different left edges are expected.
    const centres = stack.map((e) => e.box.x + e.box.width / 2);
    if (Math.max(...centres) - Math.min(...centres) <= 2) continue;
    const modeOf = (values: number[]): number => {
      const counts = new Map<number, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      let common = values[0] ?? 0;
      let best = 0;
      for (const [v, c] of counts) if (c > best) { best = c; common = v; }
      return common;
    };
    const left = modeOf(stack.map((e) => e.box.x));
    const right = modeOf(stack.map((e) => e.box.x + e.box.width));
    // Right-aligned blocks share a right edge but not a left edge. If two blocks share a left edge, the stack is left-aligned.
    const leftShared = stack.filter((e) => Math.abs(e.box.x - left) <= 2).length > 1;
    for (const e of stack) {
      // A right edge that matches the group is a right-aligned stack, not a misalignment.
      if (Math.abs(e.box.x - left) > 2 && (leftShared || Math.abs(e.box.x + e.box.width - right) > 2)) {
        add("misaligned-sibling", `The element starts ${Math.round(e.box.x - left)}px from the other siblings.`, e);
      }
    }
  }

  // Rule 4: font size and weight are not in the type scale.
  const scale = rules?.typeScale;
  if (scale?.length) {
    for (const e of els) {
      if (e.text.trim() === "") continue;
      const measured = Math.round(e.style.fontSize * 2) / 2;
      // Text in rem grows with the scale. Text in px does not. So the measured size or the size divided by the scale may be on the scale.
      const size = Math.round((e.style.fontSize / textScale) * 2) / 2;
      if (!scale.some(([s, w]) => (s === size || s === measured) && w === e.style.fontWeight)) {
        const what = textScale === 1 ? `${size}px at weight ${e.style.fontWeight}` : `${measured}px/${e.style.fontWeight} at ${Math.round(textScale * 100)}% text`;
        add("off-scale-type", `The type is ${what}. It is not in the type scale.`, e, true);
      }
    }
  }
  // Rule 5: two visible controls overlap. A control inside another control does not count.
  // A fixed or sticky box moves with the scroll, and so does each control in it. So two controls compare only when they are in the same
  // scroll layer: both in the normal flow, or both in one fixed or sticky box. Without `layer`, a fixed or sticky control is its own layer.
  const OVERLAP_TOLERANCE_PX = 2;
  const layerOf = (e: ElementInfo): string | null =>
    e.layer !== undefined ? e.layer : e.style.position === "fixed" || e.style.position === "sticky" ? e.selector : null;
  const controls = els.filter((e) => e.interactive);
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i] as ElementInfo;
      const b = controls[j] as ElementInfo;
      if (b.selector.startsWith(`${a.selector} > `) || a.selector.startsWith(`${b.selector} > `)) continue;
      // A modal sits over the page. Its controls overlap the controls behind the backdrop, by design.
      if ((a.inModal === true) !== (b.inModal === true)) continue;
      if (layerOf(a) !== layerOf(b)) continue;
      const w = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
      const h = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);
      if (w > OVERLAP_TOLERANCE_PX && h > OVERLAP_TOLERANCE_PX) {
        add("overlap", "Two controls overlap.", b);
      }
    }
  }

  return out;
}

/** Collect the page, then apply the layout rules. Pass `given` to use elements that the caller collected. */
export async function checkLayout(page: Page, rules?: DesignSystemRules, opts?: LayoutOptions, given?: ElementInfo[]): Promise<Finding[]> {
  const [els, doc] = await Promise.all([
    given ?? collectElements(page),
    page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth })),
  ]);
  const htmlEl: ElementInfo = {
    selector: "html", tag: "html", text: "", name: "", role: null,
    box: { x: 0, y: 0, width: doc.width, height: 0 },
    style: { cursor: "auto", fontSize: 16, fontWeight: 400, outlineStyle: "none", outlineWidth: 0, boxShadow: "none", overflowX: "visible", whiteSpace: "normal", textOverflow: "clip", display: "block", position: "static" },
    scrollWidth: doc.scrollWidth, clientWidth: doc.width, attributes: {}, interactive: false, disabled: false, parentSelector: null,
  };
  return layoutRules([htmlEl, ...els], { width: doc.width }, rules, opts);
}
