// Harbour Lettings fixture server. No npm dependencies.
// Start it with: node fixtures/lettings-app/server.mjs
import { createServer } from "node:http";
import { createApp } from "./respond.mjs";

const PORT = Number(process.env.PORT ?? 4400);
const app = createApp();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { status, headers, body } = app.respond({ method: req.method, url, cookie: req.headers.cookie });
  res.writeHead(status, headers);
  res.end(body);
});

// The sink is a second origin. It answers every request with 204, so the leaks-third-party
// request succeeds and writes no console error. The main server owns it and closes it too.
const SINK_PORT = Number(process.env.SINK_PORT ?? 4401);
const sink = createServer((req, res) => {
  res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
  res.end();
});
// Both servers bind to the loopback address only, so no other machine can reach them.
const HOST = "127.0.0.1";
sink.listen(SINK_PORT, HOST);
server.on("close", () => sink.close());
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));

server.listen(PORT, HOST, () => console.log(`Harbour Lettings fixture on http://localhost:${PORT}`));
