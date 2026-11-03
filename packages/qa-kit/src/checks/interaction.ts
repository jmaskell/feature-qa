import type { Page } from "@playwright/test";
import { collectElements, type ElementInfo } from "../collect.ts";
import { finding } from "../findings.ts";
import { TEXT_ENTRY_TYPES } from "../interactive.ts";
import { timed, type Timings } from "../timing.ts";
import type { Finding } from "../types.ts";

const SETTLE_MS = 150;
const SHIFT_LIMIT = 0.5;
// A dialog or popover can play an exit animation. Wait this long for it to close.
const CLOSE_WAIT_MS = 1000;
// Text-entry roles keep the text cursor. Container roles hand the pointer to their items.
const NO_POINTER_ROLES = new Set(["textbox", "searchbox", "listbox", "tablist", "gridcell", "treeitem"]);

const fail = (rule: string, message: string, selector: string): Finding =>
  finding({ check: "interaction", rule, severity: "fail", message, selector });


const isTextField = (e: ElementInfo): boolean =>
  e.tag === "textarea" ||
  (e.tag === "input" && (TEXT_ENTRY_TYPES as readonly string[]).includes((e.attributes.type ?? "text").toLowerCase()));

/** Rule: an enabled control that is not a text field shows the pointer cursor. Pure. */
export function cursorRules(els: ElementInfo[]): Finding[] {
  return els
    .filter((e) => e.interactive && !e.disabled && !isTextField(e) && !NO_POINTER_ROLES.has(e.attributes.role ?? "") && e.style.cursor !== "pointer")
    .map((e) => fail("pointer-cursor", `The cursor is "${e.style.cursor}", not "pointer".`, e.selector));
}

interface Look { outlineStyle: string; outlineWidth: number; boxShadow: string }
type Box = { x: number; y: number; width: number; height: number };

/**
 * Rule focus-visible. The check presses a modifier key once, so the browser is in keyboard mode, which :focus-visible needs.
 * Then one script in the page does each control in turn: blur the focused element and read the look, focus the control, and read the look again.
 * Before each read the script waits one task, so a framework can render a focus ring from state, and finishes each CSS transition, so the read sees the end state.
 * The check does not walk with Tab, because WebKit does not Tab to buttons and links by default.
 * When there are controls but none takes focus, the check gives the warning focus-unreachable.
 */
async function checkFocus(page: Page, els: ElementInfo[], max: number): Promise<Finding[]> {
  const targets = els.filter((e) => e.interactive && !e.disabled).slice(0, max);
  if (targets.length === 0) return [];
  // A modifier key moves nothing and types nothing, but it puts the browser in keyboard mode. Script focus keeps that mode.
  await page.keyboard.press("Shift");
  let looks: Array<{ was: Look; now: Look | null } | null>;
  try {
    looks = await page.evaluate(async (selectors) => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      const finishTransitions = () => {
        for (const a of document.getAnimations()) {
          try { if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish(); } catch { /* not finishable */ }
        }
      };
      const look = (el: Element) => {
        const cs = getComputedStyle(el);
        return { outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth) || 0, boxShadow: cs.boxShadow };
      };
      const out: Array<{ was: ReturnType<typeof look>; now: ReturnType<typeof look> | null } | null> = [];
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) { out.push(null); continue; } // detached since the collect
        (document.activeElement as HTMLElement | null)?.blur();
        await tick();
        finishTransitions();
        const was = look(el);
        el.focus({ preventScroll: true });
        await tick();
        finishTransitions();
        out.push({ was, now: document.activeElement === el ? look(el) : null });
      }
      (document.activeElement as HTMLElement | null)?.blur();
      return out;
    }, targets.map((e) => e.selector));
  } catch {
    return []; // the page navigated or closed during the check
  }
  const out: Finding[] = [];
  let reached = 0;
  looks.forEach((r, i) => {
    if (!r || !r.now) return; // detached, or the element does not take focus
    reached += 1;
    const { was, now } = r;
    const changed = was.outlineStyle !== now.outlineStyle || was.outlineWidth !== now.outlineWidth || was.boxShadow !== now.boxShadow;
    const visible = (now.outlineStyle !== "none" && now.outlineWidth > 0) || (now.boxShadow !== "" && now.boxShadow !== "none");
    if (!changed || !visible) out.push(fail("focus-visible", "The element shows no focus indicator when it gets keyboard focus.", targets[i]!.selector));
  });
  if (reached === 0) {
    out.push(finding({ check: "interaction", rule: "focus-unreachable", severity: "warn", message: "No control took focus, so the focus rule did not run." }));
  }
  return out;
}

// Runs in the browser. Waits for one frame, finishes each CSS transition, and returns the box of each element, its centre and the scroll position.
// An entry is null when the element is gone, its centre is not in view, or another element covers its centre.
// With `scrollTo`, it first scrolls that element into view when its centre is not in view.
async function readHoverBoxes({ selectors, scrollTo }: { selectors: string[]; scrollTo?: string }): Promise<{ sx: number; sy: number; reads: Array<{ box: Box; cx: number; cy: number; sx: number; sy: number } | null> }> {
  const target = scrollTo ? document.querySelector(scrollTo) : null;
  if (target) {
    const r = target.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) target.scrollIntoView({ block: "center", inline: "center" });
  }
  await new Promise((r) => requestAnimationFrame(r));
  for (const a of document.getAnimations()) {
    try { if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish(); } catch { /* not finishable */ }
  }
  const reads = selectors.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (r.width <= 0 || r.height <= 0 || cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return null;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(hit === el || el.contains(hit))) return null;
    return { box: { x: r.x, y: r.y, width: r.width, height: r.height }, cx, cy, sx: scrollX, sy: scrollY };
  });
  return { sx: scrollX, sy: scrollY, reads };
}

// Runs in the browser. Waits for one frame, finishes each CSS transition and returns the box of the element and its centre.
// With `before`, it first scrolls the element into view when its centre is not in view, and returns null when another element covers the centre.
async function readHoverBox({ sel, before }: { sel: string; before: boolean }): Promise<{ box: Box; cx: number; cy: number; sx: number; sy: number } | null> {
  const el = document.querySelector(sel);
  if (!el) return null;
  if (before) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) el.scrollIntoView({ block: "center", inline: "center" });
  }
  await new Promise((r) => requestAnimationFrame(r));
  for (const a of document.getAnimations()) {
    try { if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish(); } catch { /* not finishable */ }
  }
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const box = { x: r.x, y: r.y, width: r.width, height: r.height };
  if (!before) return { box, cx, cy, sx: scrollX, sy: scrollY };
  if (r.width <= 0 || r.height <= 0 || cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return null;
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || !(hit === el || el.contains(hit))) return null; // covered
  return { box, cx, cy, sx: scrollX, sy: scrollY };
}

/**
 * Rule hover-shift. For each control and each list or table row that holds a control: read the box with the pointer away,
 * move the pointer to the centre and read the box again. Each read waits one frame and finishes each CSS transition,
 * so the check needs no fixed wait. An element that another element covers is skipped.
 * One read in the page gives the "away" box of each element in view. The pointer then goes from element to element, which takes the
 * hover off the last element. An element out of view gets a new read that scrolls it into view. That read also gives the "away" box of
 * each later element that the scroll brings into view. A page that scrolled since the "away" read gets a new read for that element.
 */
async function checkHover(page: Page, els: ElementInfo[], max: number): Promise<Finding[]> {
  const interactive = els.filter((e) => e.interactive && !e.disabled);
  const rows = els.filter((e) => (e.tag === "li" || e.tag === "tr") && interactive.some((i) => i.selector.startsWith(e.selector + " > ")));
  const candidates: ElementInfo[] = [];
  for (let i = 0; candidates.length < max && (i < interactive.length || i < rows.length); i++) {
    if (i < rows.length) candidates.push(rows[i]!);
    if (i < interactive.length && candidates.length < max) candidates.push(interactive[i]!);
  }
  const out: Finding[] = [];
  if (candidates.length === 0) return out;
  await page.mouse.move(0, 0);
  const away = await page.evaluate(readHoverBoxes, { selectors: candidates.map((e) => e.selector) }).then((r) => r.reads, () => candidates.map(() => null));
  for (const [i, e] of candidates.entries()) {
    try {
      let a = away[i] ?? null;
      if (!a) {
        // Scroll this element into view. The same read gives the "away" box of each later element that is now in view.
        // A later "away" box from another scroll position no longer compares, so the read replaces it.
        await page.mouse.move(0, 0); // let go of the previous element
        const later = candidates.map((_, j) => j).filter((j) => j > i);
        const { sx, sy, reads } = await page.evaluate(readHoverBoxes, { selectors: [e.selector, ...later.map((j) => candidates[j]!.selector)], scrollTo: e.selector });
        a = reads[0] ?? null;
        later.forEach((j, k) => {
          const old = away[j] ?? null;
          away[j] = reads[k + 1] ?? (old && old.sx === sx && old.sy === sy ? old : null);
        });
        if (!a) continue;
      }
      await page.mouse.move(a.cx, a.cy);
      let b = await page.evaluate(readHoverBox, { sel: e.selector, before: false });
      if (!b) continue;
      if (b.sx !== a.sx || b.sy !== a.sy) {
        // The page scrolled since the "away" read, so the two boxes do not compare. Read both again for this element.
        await page.mouse.move(0, 0);
        a = await page.evaluate(readHoverBox, { sel: e.selector, before: true });
        if (!a) continue;
        await page.mouse.move(a.cx, a.cy);
        b = await page.evaluate(readHoverBox, { sel: e.selector, before: false });
        if (!b) continue;
      }
      const moved = ["x", "y", "width", "height"] as const;
      if (moved.some((k) => Math.abs(a.box[k] - b.box[k]) > SHIFT_LIMIT)) {
        out.push(fail("hover-shift", "The element changes its size or position when the pointer is over it.", e.selector));
      }
    } catch {
      // The element is detached or the page navigated. Skip it.
    }
  }
  return out;
}

// Runs in the browser. Returns the selectors of the open dialogs and popovers.
function readOpen(): string[] {
  const out: string[] = [];
  const seen = new Set<Element>();
  const nodes = Array.from(document.querySelectorAll("dialog[open], [role=dialog]"));
  document.querySelectorAll("[popover]").forEach((el) => { if (el.matches(":popover-open")) nodes.push(el); });
  for (const el of nodes) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (getComputedStyle(el).visibility !== "visible" || r.width <= 0 || r.height <= 0) continue;
    const steps: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && cur.parentElement) {
      const index = Array.prototype.indexOf.call(cur.parentElement.children, cur) + 1;
      steps.unshift(cur.tagName.toLowerCase() + ":nth-child(" + index + ")");
      cur = cur.parentElement;
    }
    out.push("body > " + steps.join(" > "));
  }
  return out;
}

/**
 * Rule escape-closes: run `open`, press Escape once, and fail for each new dialog or popover that stays open.
 * A dialog that was open before `open` (for example a cookie banner) does not count.
 * The check waits up to 1 s for the close, so an exit animation can finish.
 */
export async function checkEscape(page: Page, open: () => Promise<void>): Promise<Finding[]> {
  const before = new Set(await page.evaluate(readOpen));
  await open();
  await page.waitForTimeout(SETTLE_MS);
  const opened = (await page.evaluate(readOpen)).filter((s) => !before.has(s));
  if (opened.length === 0) {
    return [finding({ check: "interaction", rule: "escape-nothing-open", severity: "warn", message: "The action opened no dialog or popover, so the Escape rule did not run." })];
  }
  await page.keyboard.press("Escape"); // once: a second press can close a dialog that cancelled the first
  const deadline = Date.now() + CLOSE_WAIT_MS;
  let still = opened;
  while (still.length > 0 && Date.now() < deadline) {
    await page.waitForTimeout(100);
    const open = new Set(await page.evaluate(readOpen));
    still = opened.filter((s) => open.has(s));
  }
  return still.map((selector) => fail("escape-closes", "The dialog or popover stays open after the Escape key.", selector));
}

/** Run the cursor, focus and hover rules. Use checkEscape for the Escape rule. Pass `elements` to use elements that the caller collected. */
export async function checkInteraction(page: Page, opts: { maxElements?: number; timings?: Timings; elements?: ElementInfo[] } = {}): Promise<Finding[]> {
  const max = opts.maxElements ?? 40;
  const t = opts.timings;
  const els = opts.elements ?? (await timed(t, "checks.interaction.collect", () => collectElements(page)));
  const focus = await timed(t, "checks.interaction.focus", () => checkFocus(page, els, max));
  const hover = await timed(t, "checks.interaction.hover", () => checkHover(page, els, max));
  const found = [...cursorRules(els), ...focus, ...hover];
  // Leave the page in a clean state for the next check.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  await page.mouse.move(0, 0);
  return found;
}
