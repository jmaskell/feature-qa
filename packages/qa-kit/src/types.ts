export const CHECK_IDS = [
  "smoke", "layout", "interaction", "a11y", "copy",
  "conformance", "leaks", "access", "coverage", "visual",
] as const;
export type CheckId = typeof CHECK_IDS[number];
export type Severity = "fail" | "warn";
export interface Finding {
  check: CheckId;
  rule: string;            // short kebab id, e.g. "doubled-punctuation"
  severity: Severity;
  message: string;         // one sentence, no personal data
  selector?: string;       // CSS path of the element, when there is one
  sample?: string;         // at most 80 characters of the text that broke the rule
  count?: number;          // set by dedupe()
  route?: string;
  state?: string;
  viewport?: string;
}
/** A role. The name "anonymous" is reserved for the signed-out visitor, and defineQaConfig refuses it. */
export interface Role { name: string; signIn?: (page: import("@playwright/test").Page) => Promise<void>; }
export interface Scenario { name: string; states: string[]; knownValues: string[]; }
export interface DesignSystemRules {
  componentMarker: string;                 // CSS selector that matches a design-system component root
  interactiveSelector?: string;            // default: INTERACTIVE_SELECTOR (src/interactive.ts), the one definition of a control
  maxVariants?: Record<string, number>;    // component name → allowed variants
  variantAttribute?: string;               // attribute that holds "<component>:<variant>", default "data-variant"
  componentAttribute?: string;             // attribute that holds the component name, default "data-slot"
  typeScale?: Array<[number, number]>;     // allowed [font-size px, font-weight] pairs
  requiredRootAttributes?: Record<string, string>;
}
export interface CopyRules {
  bannedTerms?: string[];
  maxButtonWords?: number;                 // default 4
  emptyValueWord?: string;                 // the one allowed word for an empty value, e.g. "None"
  emptyValueVariants?: string[];           // words that mean "empty"; default ["—","-","N/A","n/a","None","none","Not recorded","not recorded","Unknown","unknown"]
  caseRule?: "sentence" | "title";         // the case of labels: buttons, tabs, menu items, options, h2–h6, th, label, legend
  properNouns?: string[];                  // words and phrases that keep their capitals, e.g. a company name
  rulesFile?: string;                      // path to the project's copy rules; the copy judge reads it
}
/** A primary action on a route. The smoke check clicks it and expects the page to change. */
export interface DeclaredAction {
  route: string;      // path, for example "/properties"
  role?: string;      // the role that has the action; unset means every role, "anonymous" means signed out
  selector: string;   // CSS selector of the control
  label: string;      // short name for messages, no personal data
}

export interface QaConfig {
  baseURL: string;
  routes: string[];
  roles: Role[];
  scenarios: Scenario[];
  accessMatrix: Record<string, Record<string, "allow" | "deny">>; // route → role → result
  designSystem?: DesignSystemRules;
  copy?: CopyRules;
  ownOrigins?: string[];                   // origins that count as "this app" for the leak scan
  actions?: DeclaredAction[];              // primary actions; qa.step clicks them with actionsAs
  ignore?: IgnoreEntry[];                  // findings to drop, each with a reason
  a11y?: { exclude?: string[] };           // CSS selectors that axe-core does not scan
  /**
   * A check that the run can start, for example that the seed database is clean. runPreflight calls it once, from globalSetup.
   * Return a message (or throw) to stop the run before the first test. Return nothing when the run can start.
   */
  preflight?: () => Promise<string | void>;
}
/**
 * One known finding to drop. A finding is dropped when it matches every field that is set.
 * `selector` is a CSS selector: the finding element must match it or sit inside a match.
 * `route` is a path, for example "/properties".
 */
export interface IgnoreEntry {
  check: CheckId;
  rule?: string;
  selector?: string;
  route?: string;
  reason: string;                          // required: why this finding is not a defect
}
