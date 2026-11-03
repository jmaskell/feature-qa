// Page, stylesheet and script text for Harbour Lettings.
// Each function reads ctx = { role, defect, url, landlordId } and builds the clean page.
// A defect changes exactly one thing. Search for ctx.defect to find each one.
import { PROPERTIES, TENANTS } from "./seed.mjs";

const UUID = "3f2b9c1e-7d4a-4f1e-9a3b-2c8d5e6f7a8b";
// Next inspection dates are page-only data. A missing date shows as "None".
const INSPECTIONS = { p1: "12 Nov 2026", p2: null, p3: null };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n) => `£${n} a month`;
const tenantOf = (p) => TENANTS.find((t) => t.id === p.tenantId) ?? null;

const btn = (label, variant, attrs = "") =>
  `<button type="button" data-ds data-slot="button" data-variant="button:${variant}" class="btn btn-${variant}" ${attrs}>${label}</button>`;
const link = (href, label) => `<a data-ds data-slot="link" data-variant="link:default" href="${href}">${label}</a>`;

function shell(ctx, title, main) {
  const brand = ctx.defect === "conformance-root" ? "" : ' data-brand="lettings"';
  const cssHref = ctx.defect === "smoke-css" ? "/missing.css" : "/style.css";
  const cssLink = ctx.defect === "smoke-unstyled" ? "" : `<link rel="stylesheet" href="${cssHref}">`;
  const nav = ctx.role
    ? `${link("/properties", "Properties")}${ctx.role === "agent" ? link("/tenants", "Tenants") : ""}${link("/sign-in", "Switch role")}`
    : link("/sign-in", "Sign in");
  const consoleError = ctx.defect === "smoke-console" ? `<script>console.error("boom")</script>` : "";
  return `<!doctype html>
<html lang="en-GB"${brand}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Harbour Lettings</title>
<link rel="icon" href="data:,">
${cssLink}
</head>
<body>
<header class="top">${link("/", "Harbour Lettings")}<nav aria-label="Main">${nav}</nav></header>
<main>
${main}
</main>
<footer><small>Harbour Lettings is a made-up company used for testing.</small></footer>
${consoleError}
<script src="/app.js" defer></script>
</body>
</html>`;
}

const page = (ctx, status, title, main) => ({ status, type: "text/html", body: shell(ctx, title, main) });
const forbidden = (ctx) =>
  page(ctx, 403, "Not allowed", `<h1>Not allowed</h1><p>Your role cannot open this page.</p><p>${link("/properties", "Back to properties")}</p>`);
const notFound = (ctx) => page(ctx, 404, "Not found", `<h1>Not found</h1><p>This page does not exist.</p><p>${link("/", "Go to the home page")}</p>`);

function home(ctx) {
  const intro = ctx.defect === "copy-banned" ? "A seamless way to manage your homes." : "A simple way to manage your homes.";
  const h1Style = ctx.defect === "layout-type" ? ' style="font-size: 19px"' : "";
  const wide = ctx.defect === "a11y-reflow" ? `<p style="width: 340px">Homes in Cornwall, Yorkshire and Bristol.</p>` : "";
  return page(ctx, 200, "Home", `<h1${h1Style}>Harbour Lettings</h1><p>${intro}</p>${wide}<p>${link("/properties", "See the properties")}</p>`);
}

function signIn(ctx) {
  const as = ctx.url.searchParams.get("as");
  if (as === "agent" || as === "landlord") {
    return { status: 302, location: "/properties", cookies: [`role=${as}; Path=/; SameSite=Lax`] };
  }
  return page(ctx, 200, "Sign in", `<h1>Sign in</h1><p>Choose a role to continue.</p><p>${link("/sign-in?as=agent", "Sign in as an agent")}</p><p>${link("/sign-in?as=landlord", "Sign in as a landlord")}</p>`);
}

function properties(ctx) {
  const visible = PROPERTIES.filter((p) => ctx.role === "agent" || p.landlordId === ctx.landlordId);
  const rows = visible
    .map((p, i) => {
      const t = tenantOf(p);
      let href = `/properties/${p.id}`;
      if (ctx.defect === "leaks-url" && t) href += `?tenant=${encodeURIComponent(t.email)}`;
      const style = ctx.defect === "layout-align" && i === 1 ? ' style="margin-left: 13px"' : "";
      let inspection = INSPECTIONS[p.id] ?? "None";
      if (ctx.defect === "copy-empty-values" && p.id === "p2") inspection = "—";
      if (ctx.defect === "copy-empty-values" && p.id === "p3") inspection = "Not recorded";
      const tenant = ctx.role === "agent" ? `<span>Tenant: ${t ? esc(t.name) : "None"}</span>` : "";
      return `<li class="row"${style}>${link(href, esc(p.address))}<span>${money(p.rent)}</span><span>${p.status}</span>${tenant}<span>Next inspection: ${inspection}</span></li>`;
    })
    .join("\n");
  const addLabel = ctx.defect === "copy-button-length" ? "Click here to add a brand new property" : ctx.defect === "copy-case" ? "Add Property" : "Add property";
  const extras = [];
  if (ctx.defect === "a11y-name") {
    extras.push(`<button type="button" data-ds data-slot="button" data-variant="button:icon" class="btn"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20"><path d="M3 10h14M10 3v14" stroke="currentColor" stroke-width="2" fill="none"/></svg></button>`);
  }
  if (ctx.defect === "a11y-forced-colors") {
    extras.push(`<button type="button" data-ds data-slot="button" data-variant="button:primary" class="btn" aria-label="Show map" style="width:44px;height:44px;padding:0;border:0;background:#0a6"></button>`);
  }
  if (ctx.defect === "conformance-raw") extras.push(`<button type="button" class="raw">Export</button>`);
  if (ctx.defect === "conformance-variants") extras.push(btn("Filter", "secondary").replace("button:secondary", "button:ghost"));
  const table =
    ctx.defect === "layout-overflow"
      ? `<table style="width: 900px"><thead><tr><th scope="col">Address</th><th scope="col">Rent</th><th scope="col">Status</th></tr></thead><tbody><tr><td>12 Harbour Row, Penzance</td><td>£950 a month</td><td>Let</td></tr></tbody></table>`
      : "";
  const form = ctx.role === "agent"
    ? `<form id="add-form" hidden><p>Property details are added on the next screen.</p>${btn("Cancel", "secondary", 'data-action="cancel-add"')}</form>`
    : "";
  const addAttr = ctx.defect === "smoke-action-missing" ? "data-act" : "data-action";
  const addHide = ctx.defect === "smoke-action-hidden" ? ' style="display: none"' : "";
  const add = ctx.role === "agent" ? btn(addLabel, "primary", `${addAttr}="add-property" aria-controls="add-form" aria-expanded="false"${addHide}`) : "";
  // Test-only content that is hidden. No check may report it.
  const hidden = `<div hidden><button class="raw">x..</button> ${UUID}</div>`;
  return page(ctx, 200, "Properties", `<h1>Properties</h1>
<div class="actions">${add}${extras.join("")}</div>
${form}
<ul class="rows">
${rows}
</ul>
${table}
${hidden}`);
}

function detail(ctx, id) {
  const p = PROPERTIES.find((x) => x.id === id);
  if (!p) return notFound(ctx);
  if (ctx.role === "landlord" && ctx.defect !== "access-idor" && p.landlordId !== ctx.landlordId) return forbidden(ctx);
  const t = tenantOf(p);
  const title = ctx.defect === "leaks-title" && t ? t.name : "Property details";
  const status = ctx.defect === "copy-label-echo" ? `Status: ${p.status}` : p.status;
  const rentStyle = ctx.defect === "layout-clip" ? ' style="width: 40px; overflow: hidden; white-space: nowrap"' : "";
  const extra = ctx.defect === "copy-identifier" ? `<dt>tenant_phone_number</dt><dd>${UUID}</dd>` : "";
  const facts = `<dl class="facts"><dt>Address</dt><dd>${esc(p.address)}</dd><dt${rentStyle}>Monthly rent</dt><dd>${money(p.rent)}</dd><dt>Status</dt><dd>${status}</dd>${extra}</dl>`;
  const startText = ctx.defect === "copy-punctuation" ? "The tenancy starts on 1 May.." : "The tenancy starts on 1 May.";
  const history = `<h2 id="rent-history">Rent history</h2><div role="grid" aria-readonly="true" aria-labelledby="rent-history" class="grid"><div role="row"><span role="columnheader">Month</span><span role="columnheader">Paid</span></div><div role="row"><span role="gridcell">October 2026</span><span role="gridcell">£${p.rent}</span></div></div>`;
  const start = p.status === "Let" ? `<p>${startText}</p>` : "";
  let tenantBlock = "";
  if (ctx.role === "agent") {
    tenantBlock = t
      ? `<h2>Tenant</h2><dl class="facts"><dt>Name</dt><dd>${esc(t.name)}</dd><dt>Phone</dt><dd>${esc(t.phone)}</dd></dl>
${btn("Message tenant", "primary", 'data-action="open-dialog" aria-haspopup="dialog"')}
<dialog id="message-dialog" aria-labelledby="dialog-title"><h2 id="dialog-title">Message tenant</h2><p>Messages are not set up in this test app.</p>${btn("Close", "secondary", 'data-action="close-dialog"')}</dialog>`
      : `<h2>Tenant</h2><p>None</p>`;
  }
  const storage = ctx.defect === "leaks-storage" && t ? `<script>localStorage.setItem("last", ${JSON.stringify(t.phone)})</script>` : "";
  const out = page(ctx, 200, title, `<h1>${esc(p.address)}</h1><h2>Facts</h2>${facts}${start}${history}${tenantBlock}${storage}`);
  if (ctx.defect === "leaks-log" && t) out.logExtra = t.email;
  // HttpOnly: page script cannot read it, so only the context cookie API finds it.
  if (ctx.defect === "leaks-cookie" && t) out.cookies = [`last_tenant=${encodeURIComponent(t.email)}; Path=/; HttpOnly; SameSite=Lax`];
  return out;
}

function tenants(ctx) {
  if (!ctx.role) return { status: 302, location: "/sign-in" };
  if (ctx.role !== "agent" && ctx.defect !== "access-landlord-tenants") return forbidden(ctx);
  const rows = TENANTS.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.phone)}</td><td>${esc(t.note)}</td></tr>`).join("");
  return page(ctx, 200, "Tenants", `<h1>Tenants</h1>
<div class="scroll" tabindex="0" role="region" aria-label="Tenants table"><table><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Note</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

export function route(ctx) {
  const path = ctx.url.pathname;
  if (path === "/") return home(ctx);
  if (path === "/sign-in") return signIn(ctx);
  if (path === "/report") return page(ctx, 200, "Report", `<h1>Report</h1><p>This page sends a usage report.</p>`);
  const needsRole = path === "/properties" || path.startsWith("/properties/") || path === "/tenants";
  if (needsRole && !ctx.role) return { status: 302, location: "/sign-in" };
  if (path === "/properties") return properties(ctx);
  if (path.startsWith("/properties/")) return detail(ctx, path.slice("/properties/".length));
  if (path === "/tenants") return tenants(ctx);
  return notFound(ctx);
}

export function css(ctx) {
  let out = `
*, *::before, *::after { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 16px; font-weight: 400; line-height: 1.5; }
body { margin: 0; background: #fff; color: #1a1a1a; }
h1, h2 { margin: 0 0 16px; }
h1 { font-size: 32px; font-weight: 600; line-height: 1.25; }
h2 { font-size: 24px; font-weight: 600; line-height: 1.25; margin-top: 24px; }
small { font-size: 14px; font-weight: 400; color: #4a4a4a; }
p { margin: 0 0 16px; }
.top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #c8c8c8; }
.top nav { display: flex; flex-wrap: wrap; gap: 8px; }
main { padding: 24px 16px; max-width: 960px; margin: 0 auto; }
footer { padding: 16px; border-top: 1px solid #c8c8c8; }
a { color: #0b6862; text-decoration: underline; cursor: pointer; display: inline-block; padding: 4px 0; }
a:hover { color: #08504b; }
a:focus-visible, button:focus-visible, [tabindex]:focus-visible { outline: 2px solid #0b6862; outline-offset: 2px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 0 20px; border: 2px solid #0b6862; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; }
.btn-primary { background: #0b6862; color: #fff; }
.btn-primary:hover { background: #08504b; }
.btn-secondary { background: #fff; color: #0b6862; }
.btn-secondary:hover { background: #e6f2f1; }
.raw { min-height: 44px; padding: 0 20px; background: #fff; color: #1a1a1a; border: 2px solid #1a1a1a; border-radius: 6px; cursor: pointer; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.rows { list-style: none; margin: 0; padding: 0; }
.grid [role=row] { display: flex; gap: 16px; }
li.row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; padding-block: 4px; border-bottom: 1px solid #c8c8c8; }
li.row:hover { background: #f1f5f5; }
.facts { display: grid; grid-template-columns: 10rem 1fr; gap: 4px 16px; margin: 0 0 16px; }
.facts dt, .facts dd { margin: 0; font-size: 16px; font-weight: 400; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; }
th, td { padding: 8px 12px; border: 1px solid #c8c8c8; text-align: left; font-size: 16px; font-weight: 400; }
th { background: #f1f5f5; }
dialog { max-width: calc(100vw - 32px); padding: 24px; border: 2px solid #0b6862; border-radius: 8px; color: #1a1a1a; background: #fff; }
dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
`;
  if (ctx.defect === "layout-overlap") out += ".top nav a + a { margin-left: -40px; }\n";
  if (ctx.defect === "interaction-cursor") out += `.btn { cursor: auto; }\n`;
  if (ctx.defect === "interaction-focus") out += `.btn:focus-visible { outline: none; }\n`;
  if (ctx.defect === "interaction-hover-shift") out += `li.row:hover { padding-block: 6px; }\n`;
  return out;
}

export function js(ctx) {
  const addProperty = ctx.defect === "smoke-dead-action"
    ? ""
    : `  if (action === "add-property") {
    const form = document.getElementById("add-form");
    form.hidden = !form.hidden;
    target.setAttribute("aria-expanded", String(!form.hidden));
  }
  if (action === "cancel-add") {
    document.getElementById("add-form").hidden = true;
    document.querySelector('[data-action="add-property"]').setAttribute("aria-expanded", "false");
  }
`;
  const cancelBlock = ctx.defect === "interaction-escape"
    ? `const dialog = document.getElementById("message-dialog");
if (dialog) dialog.addEventListener("cancel", (event) => event.preventDefault());
`
    : "";
  const report = ctx.defect === "leaks-third-party"
    ? `if (location.pathname === "/report") {
  fetch("http://127.0.0.1:4401/collect?e=grace.hopper@example.test", { mode: "no-cors" }).catch(() => {});
}
`
    : "";
  return `document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
${addProperty}  if (action === "open-dialog") document.getElementById("message-dialog").showModal();
  if (action === "close-dialog") document.getElementById("message-dialog").close();
});
${cancelBlock}${report}`;
}
