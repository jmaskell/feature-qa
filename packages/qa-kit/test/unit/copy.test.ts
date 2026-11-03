import { describe, expect, it } from "vitest";
import { caseDrift, copyRules, type CopyInput } from "../../src/checks/copy.ts";
import type { CopyRules } from "../../src/types.ts";

const input = (p: Partial<CopyInput> = {}): CopyInput => ({ text: [], buttons: [], labelValuePairs: [], values: [], ...p });
const rulesOf = (i: CopyInput, r?: CopyRules) => copyRules(i, r).map((f) => f.rule);

describe("doubled-punctuation", () => {
  it("hits two full stops", () => expect(rulesOf(input({ text: ["Starts 1 May.."] }))).toContain("doubled-punctuation"));
  it("misses an ellipsis", () => {
    expect(rulesOf(input({ text: ["Wait..."] }))).toEqual([]);
    expect(rulesOf(input({ text: ["Wait…"] }))).toEqual([]);
  });
});

describe("label-echo", () => {
  it("hits a value that starts with its label", () =>
    expect(rulesOf(input({ labelValuePairs: [["Status", "Status: Let"]] }))).toContain("label-echo"));
  it("misses a plain value", () => expect(rulesOf(input({ labelValuePairs: [["Status", "Let"]] }))).toEqual([]));
  it("hits a doubled label in one text node", () =>
    expect(rulesOf(input({ text: ["Status: Status: Let"] }))).toContain("label-echo"));
});

describe("leaked-identifier", () => {
  const hit = (t: string) => rulesOf(input({ text: [t] })).includes("leaked-identifier");
  it("hits a UUID", () => expect(hit("3f2b9c1e-7d4a-4f1e-9a3b-2c8d5e6f7a8b")).toBe(true));
  it("hits snake_case", () => expect(hit("tenant_phone_number")).toBe(true));
  it("hits camelCase", () => expect(hit("tenantPhoneNumber")).toBe(true));
  it("misses iPhone and e-mail", () => {
    expect(hit("iPhone")).toBe(false);
    expect(hit("e-mail")).toBe(false);
  });
  it("misses an email, a URL and a file name", () => {
    expect(hit("grace.hopper@example.test")).toBe(false);
    expect(hit("grace_hopper@example.test")).toBe(false);
    expect(hit("https://x.test/a_b_c")).toBe(false);
    expect(hit("report_2026.pdf")).toBe(false);
  });
  it("misses a CSS-like token", () => {
    expect(hit("btn--primary")).toBe(false);
    expect(hit("-webkit-box")).toBe(false);
  });
});

describe("banned-term", () => {
  const rules = { bannedTerms: ["seamless"] };
  it("hits a whole word", () => expect(rulesOf(input({ text: ["A seamless way"] }), rules)).toContain("banned-term"));
  it("misses a longer word", () => expect(rulesOf(input({ text: ["seamlessly"] }), rules)).toEqual([]));
});

describe("button-length", () => {
  it("warns on a long label", () => {
    const found = copyRules(input({ buttons: ["Click here to add a brand new property"] }));
    expect(found.map((f) => f.rule)).toEqual(["button-length"]);
    expect(found[0]?.severity).toBe("warn");
  });
  it("misses a short label", () => expect(rulesOf(input({ buttons: ["Add property"] }))).toEqual([]));
  it("uses maxButtonWords", () => expect(rulesOf(input({ buttons: ["Add new property"] }), { maxButtonWords: 2 })).toEqual(["button-length"]));
});

describe("mixed-empty-values", () => {
  it("hits two variants in dd or td values", () =>
    expect(rulesOf(input({ values: ["—", "Not recorded"] }))).toContain("mixed-empty-values"));
  it("hits two variants in label/value pairs", () =>
    expect(rulesOf(input({ labelValuePairs: [["Next", "—"], ["Last", "None"]] }))).toContain("mixed-empty-values"));
  it("hits a dd value other than emptyValueWord", () =>
    expect(rulesOf(input({ values: ["—", "None"] }), { emptyValueWord: "None" })).toContain("mixed-empty-values"));
  it("ignores free text that is only an empty word", () =>
    expect(rulesOf(input({ text: ["None", "N/A", "-"] }))).toEqual([]));
  it("misses only None", () => expect(rulesOf(input({ values: ["None", "None"] }))).toEqual([]));
  it("misses a phrase that starts with a variant", () =>
    expect(rulesOf(input({ values: ["None of the above", "—"] }))).toEqual([]));
  it("reads the value after a label prefix", () =>
    expect(rulesOf(input({ text: ["Next inspection: —", "Next inspection: Not recorded"] }))).toContain("mixed-empty-values"));
  it("misses a label prefix with a phrase value", () =>
    expect(rulesOf(input({ text: ["Note: None of the above", "Next: —"] }))).toEqual([]));
  it("keeps the sample short", () => {
    const long = "Wait.. " + "x".repeat(100);
    for (const f of copyRules(input({ text: [long] }))) expect((f.sample ?? "").length).toBeLessThanOrEqual(40);
  });
});

describe("caseDrift", () => {
  it("flags a capital inside a sentence-case label", () => {
    expect(caseDrift("Add Property", "sentence")).toBe(true);
    expect(caseDrift("Add property", "sentence")).toBe(false);
  });
  it("keeps proper nouns, acronyms, I, and a capital after a full stop or a colon", () => {
    expect(caseDrift("Sign in with Harbour Lettings", "sentence", ["Harbour Lettings"])).toBe(false);
    expect(caseDrift("Download the PDF", "sentence")).toBe(false);
    expect(caseDrift("Can I pay now", "sentence")).toBe(false);
    expect(caseDrift("Saved. Next step", "sentence")).toBe(false);
    expect(caseDrift("Status: Let", "sentence")).toBe(false);
  });
  it("matches the longest proper noun first and keeps the word count", () => {
    expect(caseDrift("Harbour Lettings Home", "sentence", ["Harbour", "Harbour Lettings"])).toBe(true);
  });
  it("flags a lower-case word in a title-case label, but not a small word", () => {
    expect(caseDrift("Add New property", "title")).toBe(true);
    expect(caseDrift("Terms of Use", "title")).toBe(false);
  });
});

describe("copyRules with names and labels", () => {
  it("scans accessible names for doubled punctuation and identifiers", () => {
    const out = copyRules({ text: [], buttons: [], labelValuePairs: [], names: ["Close..", "user_id"] });
    expect(out.map((f) => f.rule).sort()).toEqual(["doubled-punctuation", "leaked-identifier"]);
  });
  it("checks the case rule on labels only", () => {
    const i = { text: ["12 Harbour Row, Penzance"], buttons: [], labelValuePairs: [], labels: ["Add Property"] };
    expect(copyRules(i, { caseRule: "sentence" }).map((f) => [f.rule, f.sample])).toEqual([["case-drift", "Add Property"]]);
    expect(copyRules(i, {})).toEqual([]);
  });
});
