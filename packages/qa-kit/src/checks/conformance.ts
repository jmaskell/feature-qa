import type { Page } from "@playwright/test";
import { collectElements, type ElementInfo } from "../collect.ts";
import { finding } from "../findings.ts";
import { INTERACTIVE_SELECTOR } from "../interactive.ts";
import type { DesignSystemRules, Finding } from "../types.ts";

// A marked ancestor counts as the component wrapper of a control only when it is this close.
const WRAPPER_DEPTH = 2;

/** Selectors that the browser worked out. The pure rules cannot read the DOM. */
export interface ConformanceContext {
  inComponent: ReadonlySet<string>; // elements that match componentMarker, or whose component wrapper matches it (see checkConformance)
  interactive?: ReadonlySet<string>; // elements that match interactiveSelector; default: ElementInfo.interactive
  variantValues?: readonly string[]; // variant attribute values of all elements, hidden ones too; default: the visible elements
}

function out(rule: string, message: string, extra: Partial<Finding> = {}): Finding {
  return finding({ check: "conformance", rule, severity: "fail", message, ...extra });
}

/** Pure. It checks the elements and the root attributes against the design-system rules. */
export function conformanceRules(
  els: ElementInfo[],
  root: Record<string, string>,
  rules: DesignSystemRules,
  ctx?: ConformanceContext,
): Finding[] {
  const found: Finding[] = [];

  if (ctx) {
    for (const el of els) {
      const interactive = ctx.interactive ? ctx.interactive.has(el.selector) : el.interactive;
      if (interactive && !ctx.inComponent.has(el.selector)) {
        found.push(out("not-a-component", "An interactive element is not a design-system component.", { selector: el.selector }));
      }
    }
  }

  const variantAttr = rules.variantAttribute ?? "data-variant";
  const variants = new Map<string, Set<string>>();
  const componentAttr = rules.componentAttribute ?? "data-slot";
  // A value with no colon holds the variant only. The component name is then in componentAttribute.
  const qualify = (value: string, component: string | undefined) => (value && !value.includes(":") && component ? `${component}:${value}` : value);
  const values = ctx?.variantValues ?? els.map((el) => qualify(el.attributes[variantAttr] ?? "", el.attributes[componentAttr]));
  for (const value of values) {
    if (!value) continue;
    const i = value.indexOf(":");
    const component = i < 0 ? value : value.slice(0, i);
    if (!variants.has(component)) variants.set(component, new Set());
    variants.get(component)!.add(value);
  }
  for (const [component, set] of variants) {
    const max = rules.maxVariants?.[component];
    if (max !== undefined && set.size > max) {
      found.push(out("too-many-variants", `The page uses ${set.size} variants of "${component}". The limit is ${max}.`, { sample: [...set].sort().join(", ") }));
    }
  }

  for (const [name, expected] of Object.entries(rules.requiredRootAttributes ?? {})) {
    const actual = root[name];
    if (actual === undefined) found.push(out("root-attribute", `The root element has no "${name}" attribute.`, { sample: name }));
    else if (actual !== expected) found.push(out("root-attribute", `The root attribute "${name}" has the wrong value.`, { sample: name }));
  }
  return found;
}

// Runs in the browser. It must not use any outer-scope value.
async function readDom(page: Page, selectors: string[], marker: string, interactiveSelector: string, variantAttr: string, componentAttr: string, wrapperDepth: number) {
  return page.evaluate(
    ({ selectors, marker, interactiveSelector, variantAttr, componentAttr, wrapperDepth }) => {
      // A control is in a component when it matches the marker itself, or when its nearest marked ancestor
      // is at most wrapperDepth levels up and holds no other control. A marked page container is not a wrapper.
      const isComponent = (el: Element): boolean => {
        if (el.matches(marker)) return true;
        let cur = el.parentElement;
        for (let depth = 1; cur && depth <= wrapperDepth; depth++, cur = cur.parentElement) {
          if (!cur.matches(marker)) continue;
          const controls = Array.from(cur.querySelectorAll(interactiveSelector));
          return controls.every((c) => c === el || c.contains(el) || el.contains(c));
        }
        return false;
      };
      const inComponent: string[] = [];
      const interactive: string[] = [];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (!el) continue;
        if (isComponent(el)) inComponent.push(s);
        if (el.matches(interactiveSelector)) interactive.push(s);
      }
      const root: Record<string, string> = {};
      for (const a of Array.from(document.documentElement.attributes)) root[a.name] = a.value;
      const variantValues: string[] = [];
      document.querySelectorAll("[" + variantAttr + "]").forEach((el) => {
        const value = el.getAttribute(variantAttr) ?? "";
        const component = el.getAttribute(componentAttr);
        variantValues.push(value && !value.includes(":") && component ? component + ":" + value : value);
      });
      return { inComponent, interactive, root, variantValues };
    },
    { selectors, marker, interactiveSelector, variantAttr, componentAttr, wrapperDepth },
  );
}

/**
 * Check the page against the design-system rules.
 * not-a-component: a control passes when it matches componentMarker, or when its nearest marked ancestor is at most
 * 2 levels up and holds no other control (a component wrapper). The marker must match control components, not page containers.
 */
export async function checkConformance(page: Page, rules: DesignSystemRules, given?: ElementInfo[]): Promise<Finding[]> {
  const els = given ?? (await collectElements(page));
  const dom = await readDom(page, els.map((e) => e.selector), rules.componentMarker, rules.interactiveSelector ?? INTERACTIVE_SELECTOR, rules.variantAttribute ?? "data-variant", rules.componentAttribute ?? "data-slot", WRAPPER_DEPTH);
  return conformanceRules(els, dom.root, rules, { inComponent: new Set(dom.inComponent), interactive: new Set(dom.interactive), variantValues: dom.variantValues });
}
