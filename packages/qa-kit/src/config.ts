import type { QaConfig } from "./types.ts";

/** The access check uses this role name for a signed-out visitor. A config role must not use it. */
export const ANONYMOUS_ROLE = "anonymous";

export function defineQaConfig(config: QaConfig): QaConfig {
  if (!/^https?:\/\//.test(config.baseURL)) throw new Error("baseURL must start with http:// or https://");
  const roles = new Set<string>();
  for (const r of config.roles) {
    if (r.name === ANONYMOUS_ROLE) throw new Error(`roles: ${ANONYMOUS_ROLE} is reserved for the signed-out visitor`);
    if (roles.has(r.name)) throw new Error(`roles: ${r.name} is listed twice`);
    roles.add(r.name);
  }
  for (const [route, byRole] of Object.entries(config.accessMatrix)) {
    if (!config.routes.includes(route)) throw new Error(`accessMatrix: route ${route} is not in routes`);
    for (const role of Object.keys(byRole)) {
      if (role !== ANONYMOUS_ROLE && !roles.has(role)) throw new Error(`accessMatrix: role ${role} is not in roles`);
    }
  }
  for (const entry of config.ignore ?? []) {
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") throw new Error("ignore: each entry needs a reason");
  }
  return config;
}
