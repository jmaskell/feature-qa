import { defineQaConfig } from "../../src/config.ts";
import { runPreflight } from "../../src/preflight.ts";

// QA_PREFLIGHT_DIRTY=1 plays a seed database that an earlier run left dirty.
const config = defineQaConfig({
  baseURL: "http://localhost:4400", routes: [], roles: [], scenarios: [], accessMatrix: {},
  preflight: async () => (process.env.QA_PREFLIGHT_DIRTY === "1" ? "The seed database has rows from an earlier run. Reset it." : undefined),
});

export default () => runPreflight(config);
