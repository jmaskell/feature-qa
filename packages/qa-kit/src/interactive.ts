/**
 * The one definition of a control (an interactive element). collect.ts, the interaction check and the
 * conformance check all use it.
 *
 * An element is a control when it is natively interactive, or when it has a widget role.
 * A tabindex alone does not make a control: a focusable scroll region, tab panel or code block is not one.
 */
export const WIDGET_ROLES = [
  "button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "slider", "spinbutton", "combobox", "listbox", "tablist", "textbox", "searchbox",
] as const;

const NATIVE = ["a[href]", "area[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary"];

/**
 * Item roles inside a grid or a tree. An item is a control only when it has a tabindex.
 * An interactive grid gives each cell a tabindex (0 or -1, a roving tabindex). A read-only grid gives none.
 */
export const ITEM_ROLES = ["gridcell", "treeitem"] as const;

/** CSS selector for a control. Use it with Element.matches() in the browser. */
export const INTERACTIVE_SELECTOR = [
  ...NATIVE,
  ...WIDGET_ROLES.map((r) => `[role=${r}]`),
  ...ITEM_ROLES.map((r) => `[role=${r}][tabindex]`),
].join(",");

/** Input types that take typed text. A text field keeps the text cursor, so the pointer-cursor rule skips it. */
export const TEXT_ENTRY_TYPES = ["text", "email", "tel", "number", "search", "password", "url", "date", "time", "datetime-local", "month", "week"] as const;
