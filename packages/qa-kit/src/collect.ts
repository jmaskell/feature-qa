import type { Page } from "@playwright/test";
import { INTERACTIVE_SELECTOR } from "./interactive.ts";

export interface ElementInfo {
  selector: string; // CSS path from body, with :nth-child()
  tag: string;
  text: string; // own visible text, trimmed, spaces collapsed
  name: string; // accessible name: aria-label, aria-labelledby text, alt, title, or text
  role: string | null; // explicit role, or "button" / "link" / "textbox" from the tag
  box: { x: number; y: number; width: number; height: number }; // document coordinates
  style: {
    cursor: string;
    fontSize: number;
    fontWeight: number;
    outlineStyle: string;
    outlineWidth: number;
    boxShadow: string;
    overflowX: string;
    whiteSpace: string;
    textOverflow: string;
    display: string;
    position: string;
  };
  scrollWidth: number;
  clientWidth: number;
  attributes: Record<string, string>; // data-*, class, role, aria-*, href, type, scope
  interactive: boolean; // matches INTERACTIVE_SELECTOR (src/interactive.ts)
  disabled: boolean;
  parentSelector: string | null;
  inModal?: boolean; // inside a dialog element, a role=dialog element or an aria-modal=true element
  layer?: string | null; // the selector of the nearest fixed or sticky element, this one or an ancestor; null in the normal flow
}

// Runs in the browser. It must not use any outer-scope value. The caller passes the control selector.
// Visible = not in a [hidden], display:none, visibility:hidden or aria-hidden="true" subtree,
// has a box larger than zero, and is not fully above or left of the document origin.
function walkVisibleElements(interactiveSelector: string): ElementInfo[] {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "META", "LINK", "HEAD", "TITLE"]);
  const collapse = function (s: string): string { return s.replace(/\s+/g, " ").trim(); };

  const selectorOf = function (el: Element): string {
    const steps: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && cur.parentElement) {
      const index = Array.prototype.indexOf.call(cur.parentElement.children, cur) + 1;
      steps.unshift(cur.tagName.toLowerCase() + ":nth-child(" + index + ")");
      cur = cur.parentElement;
    }
    return steps.length ? "body > " + steps.join(" > ") : "body";
  };

  const isShown = function (el: Element): boolean {
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      if (cur.hasAttribute("hidden") || cur.getAttribute("aria-hidden") === "true") return false;
      if (getComputedStyle(cur).display === "none") return false;
    }
    if (getComputedStyle(el).visibility !== "visible") return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0) return false;
    return true;
  };

  const roleOf = function (el: Element): string | null {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "button") return "button";
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "button" || type === "submit" || type === "reset") return "button";
      if (type === "checkbox" || type === "radio") return type;
      return "textbox";
    }
    return null;
  };

  const isInteractive = function (el: Element): boolean {
    return el.matches(interactiveSelector);
  };

  const ownText = function (el: Element): string {
    let out = "";
    el.childNodes.forEach(function (n) { if (n.nodeType === 3) out += (n.textContent || "") + " "; });
    return collapse(out);
  };

  const nameOf = function (el: Element): string {
    const label = el.getAttribute("aria-label");
    if (label && label.trim()) return collapse(label);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const joined = by.split(/\s+/).map(function (id) {
        const target = document.getElementById(id);
        return target ? target.textContent || "" : "";
      }).join(" ");
      if (collapse(joined)) return collapse(joined);
    }
    const alt = el.getAttribute("alt");
    if (el.tagName === "IMG" && alt && alt.trim()) return collapse(alt);
    const title = el.getAttribute("title");
    if (title && title.trim()) return collapse(title);
    // Only a control takes its name from its content. A wrapper uses its own text,
    // so a wrapper and its button do not both match the same name.
    if (isInteractive(el)) return collapse((el as HTMLElement).innerText || "");
    return ownText(el);
  };

  const attributesOf = function (el: Element): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) {
      if (a.name.indexOf("data-") === 0 || a.name.indexOf("aria-") === 0 || a.name === "class" || a.name === "role" || a.name === "href" || a.name === "type" || a.name === "scope") out[a.name] = a.value;
    }
    return out;
  };

  // A fixed or sticky box moves with the scroll, and so does each element in it. The walk is in document order, so a parent comes first.
  const layers = new Map<Element, string | null>();
  const layerOf = function (el: Element): string | null {
    const known = layers.get(el);
    if (known !== undefined) return known;
    const position = getComputedStyle(el).position;
    const parent = el.parentElement;
    const layer = position === "fixed" || position === "sticky" ? selectorOf(el) : parent && parent !== document.body ? layerOf(parent) : null;
    layers.set(el, layer);
    return layer;
  };

  const result: ElementInfo[] = [];
  document.body.querySelectorAll("*").forEach(function (el) {
    if (SKIP.has(el.tagName) || !isShown(el)) return;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const weight = parseInt(cs.fontWeight, 10);
    result.push({
      selector: selectorOf(el),
      tag: el.tagName.toLowerCase(),
      text: ownText(el),
      name: nameOf(el),
      role: roleOf(el),
      box: { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height },
      style: {
        cursor: cs.cursor,
        fontSize: parseFloat(cs.fontSize),
        fontWeight: isNaN(weight) ? 400 : weight,
        outlineStyle: cs.outlineStyle,
        outlineWidth: parseFloat(cs.outlineWidth) || 0,
        boxShadow: cs.boxShadow,
        overflowX: cs.overflowX,
        whiteSpace: cs.whiteSpace,
        textOverflow: cs.textOverflow,
        display: cs.display,
        position: cs.position,
      },
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      attributes: attributesOf(el),
      interactive: isInteractive(el),
      disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
      parentSelector: el.parentElement && el.parentElement !== document.body ? selectorOf(el.parentElement) : el.parentElement ? "body" : null,
      inModal: el.closest("dialog,[role=dialog],[aria-modal=true]") !== null,
      layer: layerOf(el),
    });
  });
  return result;
}

/** Collect the visible elements of the page. The walk runs in the browser. */
export async function collectElements(page: Page): Promise<ElementInfo[]> {
  return page.evaluate(walkVisibleElements, INTERACTIVE_SELECTOR);
}

/** Collect the visible own texts, the accessible names and the title. Pass `els` to use elements that the caller collected. */
export async function collectText(page: Page, given?: ElementInfo[]): Promise<{ text: string[]; names: string[]; title: string }> {
  const [els, title] = await Promise.all([given ?? collectElements(page), page.title()]);
  const text = els.map((e) => e.text).filter((t) => t !== "");
  const names = els
    .filter((e) => e.interactive || e.tag === "img" || "aria-label" in e.attributes || "aria-labelledby" in e.attributes)
    .map((e) => e.name)
    .filter((n) => n !== "");
  return { text, names, title };
}
