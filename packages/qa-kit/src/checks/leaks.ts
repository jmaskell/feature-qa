import type { Page } from "@playwright/test";
import { finding } from "../findings.ts";
import type { Finding } from "../types.ts";

const MIN_LENGTH = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function plainPattern(form: string): RegExp {
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(form)}(?![\p{L}\p{N}])`, "iu");
}

// Separators that can sit between the digits of a phone: space, dash, dot, brackets, and their URL-encoded forms.
const PHONE_SEP = String.raw`(?:[\s\-().]|%20|%28|%29)`;

/**
 * Build one pattern for a phone-like value. A phone-like value has 9 to 15 digits once spaces, dashes, dots,
 * brackets and a leading "+" are gone. Up to 3 separators can sit between two digits.
 * A national number (leading 0) also matches with the 0 replaced by a country code: "+<1-3 digits>",
 * "%2B<1-3 digits>", "00<1-3 digits>", or " <1-3 digits>" (a "+" that a URL decoder turned into a space).
 * The pattern needs a digit boundary at each end. Return null for a value that is not phone-like.
 */
function phonePattern(value: string): RegExp | null {
  const compact = value.replace(/[\s\-().]/g, "");
  const digits = compact.replace(/^\+/, "");
  if (!/^\d{9,15}$/.test(digits)) return null;
  const join = (d: string) => d.split("").join(`${PHONE_SEP}{0,3}`);
  let body: string;
  if (!compact.startsWith("+") && digits.startsWith("0")) {
    const code = String.raw`(?:\+|%2B|00|\s)\d{1,3}`;
    body = String.raw`(?:0|${code}${PHONE_SEP}{0,3})${join(digits.slice(1))}`;
  } else {
    body = String.raw`(?:\+|%2B|00)?${join(digits)}`;
  }
  return new RegExp(String.raw`(?<!\d)${body}(?!\d)`, "i");
}

/**
 * Pure. Return the values that occur in the text: plain, URL-encoded, with "+" for a space, in any case.
 * A phone also matches with other separators and with a country code (see phonePattern).
 */
// The patterns of each value. A scan calls findValues for each URL, request and field, with the same values each time.
const patterns = new Map<string, RegExp[]>();

function patternsOf(value: string): RegExp[] {
  let list = patterns.get(value);
  if (!list) {
    const encoded = encodeURIComponent(value);
    const forms = new Set([value, encoded, encoded.replace(/%20/g, "+"), value.replace(/ /g, "+")]);
    const phone = phonePattern(value);
    list = [...[...forms].map(plainPattern), ...(phone ? [phone] : [])];
    patterns.set(value, list);
  }
  return list;
}

export function findValues(haystack: string, values: string[]): string[] {
  const hits: string[] = [];
  for (const value of values) {
    if (value.length < MIN_LENGTH) continue;
    if (patternsOf(value).some((p) => p.test(haystack))) hits.push(value);
  }
  return hits;
}

/** Pure. A sample holds the field name and the value with all but the first 2 characters masked. */
export function maskSample(field: string, value: string): string {
  return `${field}: ${value.slice(0, 2)}${"*".repeat(Math.max(0, value.length - 2))}`;
}

export interface LeakWatch {
  /** Add a page title that the caller read, for example at a qa.step. */
  addTitle(title: string): void;
  stop(): Promise<Finding[]>;
}

export interface LeakOptions {
  values: string[];
  ownOrigins: string[];
  serverLog?: () => Promise<string>;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Start to record requests, page URLs and page titles. Call stop() to get the findings. */
export async function watchLeaks(page: Page, opts: LeakOptions): Promise<LeakWatch> {
  const urls = new Set<string>();
  const titles = new Set<string>();
  const requests: Array<{ url: string; body: string }> = [];
  const own = new Set(opts.ownOrigins.map((o) => originOf(o) ?? o));
  const logStart = opts.serverLog ? (await opts.serverLog()).length : 0;

  const readTitle = async () => {
    try {
      const title = await page.title();
      if (title) titles.add(title);
    } catch {
      // The page closed or moved. Skip this read.
    }
  };
  const onRequest = (req: import("@playwright/test").Request) => {
    requests.push({ url: req.url(), body: req.postData() ?? "" });
  };
  // A same-document navigation (history.pushState) also fires framenavigated, with no load event.
  const onNavigated = (frame: import("@playwright/test").Frame) => {
    if (frame !== page.mainFrame()) return;
    urls.add(frame.url());
    void readTitle();
  };
  const onLoad = () => { void readTitle(); };
  urls.add(page.url());
  page.on("request", onRequest);
  page.on("framenavigated", onNavigated);
  page.on("domcontentloaded", onLoad);
  page.on("load", onLoad);

  const hits: Finding[] = [];
  let stopped = false;
  const seen = new Set<string>();
  const maskField = (field: string): string => {
    let out = field;
    for (const v of findValues(field, opts.values)) {
      out = out.replace(new RegExp(escapeRegExp(v), "gi"), (m) => m.slice(0, 2) + "*".repeat(Math.max(0, m.length - 2)));
    }
    return findValues(out, opts.values).length > 0 ? out.slice(0, 2) + "*".repeat(Math.max(0, out.length - 2)) : out;
  };
  // Report each value found in the text. Return the values found. Skip the values in `skip`.
  const report = (rule: string, message: string, rawField: string, text: string, skip: ReadonlySet<string> = new Set()): string[] => {
    const field = maskField(rawField);
    const found = findValues(text, opts.values).filter((v) => !skip.has(v));
    for (const value of found) {
      const sample = maskSample(field, value);
      const key = `${rule}|${sample}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(finding({ check: "leaks", rule, severity: "fail", message, sample }));
    }
    return found;
  };
  const checkUrl = (rule: string, message: string, raw: string) => {
    let parsed: URL | null = null;
    try { parsed = new URL(raw); } catch { /* not a URL: scan the text */ }
    if (!parsed) return void report(rule, message, "url", raw);
    const inParams = new Set<string>();
    for (const [name, v] of parsed.searchParams) for (const hit of report(rule, message, name, v)) inParams.add(hit);
    // The raw query string catches a value that the parameter parser splits or changes, for example "a=+44 7700".
    report(rule, message, "query", parsed.search, inParams);
    let path = parsed.pathname;
    try { path = decodeURIComponent(path); } catch { /* keep the raw path */ }
    report(rule, message, "path", path + " " + parsed.hash);
  };

  return {
    addTitle(title: string) {
      if (title) titles.add(title);
    },
    async stop() {
      if (stopped) return hits;
      stopped = true;
      page.off("request", onRequest);
      page.off("framenavigated", onNavigated);
      page.off("domcontentloaded", onLoad);
      page.off("load", onLoad);
      urls.add(page.url());
      await readTitle();

      for (const url of urls) checkUrl("url", "A page URL holds a personal value.", url);
      for (const r of requests) {
        const origin = originOf(r.url);
        if (origin !== null && own.has(origin)) {
          checkUrl("url", "A request URL to this app holds a personal value.", r.url);
        } else if (origin !== null && /^https?:$/.test(new URL(r.url).protocol)) {
          checkUrl("third-party", "A request to another origin holds a personal value.", r.url);
          report("third-party", "A request to another origin holds a personal value.", "body", r.body);
        }
      }
      for (const title of titles) report("title", "A page title holds a personal value.", "title", title);

      try {
        const dom = await page.evaluate(() => {
          const read = (s: Storage): Array<[string, string]> => Array.from({ length: s.length }, (_, i) => [s.key(i) ?? "", s.getItem(s.key(i) ?? "") ?? ""] as [string, string]);
          return { local: read(localStorage), session: read(sessionStorage) };
        });
        for (const [k, v] of [...dom.local, ...dom.session]) report("storage", "Browser storage holds a personal value.", k, v);
      } catch {
        // The page has no document. Skip the storage reads.
      }
      try {
        // The context API also returns HttpOnly cookies, which document.cookie hides.
        for (const c of await page.context().cookies()) {
          let value = c.value;
          try { value = decodeURIComponent(value); } catch { /* keep the raw value */ }
          report("cookie", "A cookie holds a personal value.", c.name, value);
        }
      } catch {
        // The context closed. Skip the cookie read.
      }

      if (opts.serverLog) {
        const added = (await opts.serverLog()).slice(logStart);
        report("server-log", "The server log holds a personal value.", "log", added);
      }
      return hits;
    },
  };
}
