// The request handler of the Harbour Lettings fixture, without a socket.
// server.mjs uses it over HTTP. A test can also use it inside the browser context (see the eval harbour project).
import { css, js, route } from "./pages.mjs";
import { LANDLORDS, PROPERTIES, TENANTS } from "./seed.mjs";

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Skip a cookie that does not decode.
    }
  }
  return out;
}

// The landlord role is the landlord with id l2.
const LANDLORD_ID = LANDLORDS[1].id;

/**
 * Make one app with its own log.
 * respond({ method, url, cookie }) returns { status, headers, body }. `url` is a URL object, `cookie` is the Cookie header.
 */
export function createApp() {
  const log = [];

  function respond({ method = "GET", url, cookie }) {
    const cookies = parseCookies(cookie);
    const send = (status, headers, body = "") => {
      log.push(`${method} ${url.pathname} ${status}`);
      return { status, headers: { "Cache-Control": "no-store", ...headers }, body };
    };

    // ?defect=<id> sets or clears the defect cookie, then redirects.
    if (url.searchParams.has("defect")) {
      const id = url.searchParams.get("defect");
      const setCookie = id === "none" ? "qa_defect=; Path=/; Max-Age=0; SameSite=Lax" : `qa_defect=${encodeURIComponent(id)}; Path=/; SameSite=Lax`;
      const target = new URL(url);
      target.searchParams.delete("defect");
      let location = target.pathname + target.search;
      if (id === "leaks-url") {
        const match = /^\/properties\/(\w+)$/.exec(target.pathname);
        const property = match && PROPERTIES.find((p) => p.id === match[1]);
        const tenant = property && TENANTS.find((t) => t.id === property.tenantId);
        if (tenant) location = `${target.pathname}?tenant=${encodeURIComponent(tenant.email)}`;
      }
      return send(302, { Location: location, "Set-Cookie": setCookie });
    }

    const role = cookies.role === "agent" || cookies.role === "landlord" ? cookies.role : undefined;
    const ctx = { role, defect: cookies.qa_defect || "none", url, landlordId: role === "landlord" ? LANDLORD_ID : undefined };

    if (url.pathname === "/style.css") return send(200, { "Content-Type": "text/css; charset=utf-8" }, css(ctx));
    if (url.pathname === "/app.js") return send(200, { "Content-Type": "text/javascript; charset=utf-8" }, js(ctx));
    if (url.pathname === "/__log") return send(200, { "Content-Type": "text/plain; charset=utf-8" }, log.join("\n"));

    const result = route(ctx);
    if (result.logExtra) log.push(`detail tenant ${result.logExtra}`);
    const headers = {};
    if (result.location) headers.Location = result.location;
    if (result.cookies) headers["Set-Cookie"] = result.cookies;
    if (result.type) headers["Content-Type"] = `${result.type}; charset=utf-8`;
    return send(result.status, headers, result.body ?? "");
  }

  return { respond, log };
}
