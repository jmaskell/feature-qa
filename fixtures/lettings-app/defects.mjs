// One planted defect for each rule. Task 12 proves each one fails its own rule and no other check.
// "rule" is the exact rule id that the defect must trigger.
export const DEFECTS = [
  { id: "smoke-css", check: "smoke", rule: "asset-failed", route: "/", description: "The stylesheet link answers 404.",
    // Without the stylesheet the page shows browser fonts and small links, so layout and a11y also fail.
    // WebKit gives an unstyled link cursor "auto", so interaction (pointer-cursor) also fails there.
    alsoFails: ["layout", "a11y", "interaction"] },
  { id: "smoke-unstyled", check: "smoke", rule: "unstyled", route: "/", description: "The page has no stylesheet link, so no asset fails.",
    // Without a stylesheet the page shows browser fonts and small links, so layout and a11y also fail.
    // WebKit gives an unstyled link cursor "auto", so interaction (pointer-cursor) also fails there.
    alsoFails: ["layout", "a11y", "interaction"] },
  { id: "smoke-console", check: "smoke", rule: "console-error", route: "/", description: "The page writes a console error." },
  { id: "smoke-dead-action", check: "smoke", rule: "dead-action", route: "/properties", role: "agent", description: "The primary button does nothing." },
  { id: "layout-overflow", check: "layout", rule: "horizontal-overflow", route: "/properties", role: "agent", description: "A table is wider than a phone screen.",
    // A 900px table also does not reflow at 320 CSS px, so a11y (reflow) also fails.
    alsoFails: ["a11y"] },
  { id: "layout-align", check: "layout", rule: "misaligned-sibling", route: "/properties", role: "agent", description: "One list row starts 13px to the right." },
  { id: "layout-type", check: "layout", rule: "off-scale-type", route: "/", description: "One heading uses 19px, which is not in the type scale." },
  { id: "layout-clip", check: "layout", rule: "clipped-text", route: "/properties/p1", role: "agent", description: "A label is clipped by overflow hidden." },
  { id: "interaction-cursor", check: "interaction", rule: "pointer-cursor", route: "/properties", role: "agent", description: "Buttons show the default cursor." },
  { id: "interaction-focus", check: "interaction", rule: "focus-visible", route: "/properties", role: "agent", description: "Buttons remove the focus outline." },
  { id: "interaction-hover-shift", check: "interaction", rule: "hover-shift", route: "/properties", role: "agent", description: "A row grows 4px on hover." },
  { id: "interaction-escape", check: "interaction", rule: "escape-closes", route: "/properties/p1", role: "agent", description: "Escape does not close the dialog." },
  { id: "a11y-name", check: "a11y", rule: "axe-button-name", route: "/properties", role: "agent", description: "An icon button has no accessible name.",
    // The icon button is a third button variant, so conformance also fails (too-many-variants).
    alsoFails: ["conformance"] },
  { id: "a11y-reflow", check: "a11y", rule: "reflow", route: "/", description: "A 340px box fits a 375px phone but not 320 CSS px." },
  { id: "a11y-forced-colors", check: "a11y", rule: "forced-colors", route: "/properties", role: "agent", description: "A map toggle is a coloured square with no border, text or icon." },
  { id: "copy-punctuation", check: "copy", rule: "doubled-punctuation", route: "/properties/p1", role: "agent", description: "A sentence ends with two full stops." },
  { id: "copy-label-echo", check: "copy", rule: "label-echo", route: "/properties/p1", role: "agent", description: "A value repeats its label: 'Status: Status: Let'." },
  { id: "copy-identifier", check: "copy", rule: "leaked-identifier", route: "/properties/p1", role: "agent", description: "A UUID and a snake_case field name show as text." },
  { id: "copy-banned", check: "copy", rule: "banned-term", route: "/", description: "The page uses the banned term 'seamless'." },
  { id: "copy-button-length", check: "copy", rule: "button-length", route: "/properties", role: "agent", description: "A button label has eight words." },
  { id: "copy-empty-values", check: "copy", rule: "mixed-empty-values", route: "/properties", role: "agent", description: "Empty values show as both '—' and 'Not recorded'." },
  { id: "copy-case", check: "copy", rule: "case-drift", route: "/properties", role: "agent", description: "The add button says 'Add Property' in a sentence-case app." },
  { id: "conformance-raw", check: "conformance", rule: "not-a-component", route: "/properties", role: "agent", description: "One button is a raw button, not a design-system component." },
  { id: "conformance-variants", check: "conformance", rule: "too-many-variants", route: "/properties", role: "agent", description: "The page uses three button variants; two are allowed." },
  { id: "conformance-root", check: "conformance", rule: "root-attribute", route: "/", description: "The html element has no data-brand attribute." },
  { id: "leaks-url", check: "leaks", rule: "url", route: "/properties/p1", role: "agent", description: "The tenant email is in the URL." },
  { id: "leaks-title", check: "leaks", rule: "title", route: "/properties/p1", role: "agent", description: "The page title holds the tenant name." },
  { id: "leaks-storage", check: "leaks", rule: "storage", route: "/properties/p1", role: "agent", description: "localStorage holds the tenant phone." },
  { id: "leaks-third-party", check: "leaks", rule: "third-party", route: "/report", role: "agent", description: "A request to another origin carries the tenant email." },
  { id: "leaks-cookie", check: "leaks", rule: "cookie", route: "/properties/p1", role: "agent", description: "An HttpOnly cookie holds the tenant email." },
  { id: "leaks-log", check: "leaks", rule: "server-log", route: "/properties/p1", role: "agent", description: "The server log holds the tenant email." },
  { id: "layout-overlap", check: "layout", rule: "overlap", route: "/properties", role: "agent", description: "The second nav link sits 40px over the first." },
  { id: "smoke-action-hidden", check: "smoke", rule: "action-not-clickable", route: "/properties", role: "agent", description: "The add button has display: none, so it cannot take a click." },
  { id: "smoke-action-missing", check: "smoke", rule: "action-missing", route: "/properties", role: "agent", description: "The add button lost its data-action attribute." },
  { id: "access-landlord-tenants", check: "access", rule: "denied-but-allowed", route: "/tenants", role: "landlord", description: "A landlord can open the tenants list." },
  { id: "access-idor", check: "access", rule: "denied-but-allowed", route: "/properties/p3", role: "landlord", description: "Landlord l2 can open a property of landlord l1." },
];
