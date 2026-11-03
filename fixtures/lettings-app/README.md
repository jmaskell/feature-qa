# Harbour Lettings fixture app

Harbour Lettings is a fake lettings company. It is the same world as the product-design evals.
The app has no npm dependencies. The QA kit tests run against it.

## Start it

Run `node fixtures/lettings-app/server.mjs`, or `npm run fixture`.
The server listens on `PORT` at `127.0.0.1` only. The default is 4400.
The third-party sink listens on `SINK_PORT` (default 4401), also at `127.0.0.1` only.

`respond.mjs` holds the request handler without a socket. `server.mjs` serves it over HTTP.
The eval harbour project serves it inside the browser, because the eval sandbox cannot open a port.

## Roles

- `GET /sign-in?as=agent` signs you in as an agent. An agent sees every page.
- `GET /sign-in?as=landlord` signs you in as landlord `l2`. A landlord sees only the properties of `l2`.
- A signed-out person who opens `/properties` or `/tenants` goes to `/sign-in`.
- A landlord who opens `/tenants` gets a 403 page.

## Routes

`/`, `/sign-in`, `/properties`, `/properties/<id>`, `/tenants`, `/report`, `/style.css`, `/app.js`.
`/__log` returns the server log as plain text. The leak scan reads it.

## Defects

Add `?defect=<id>` to any URL. The server sets the cookie `qa_defect` and applies the defect.
Add `?defect=none` to clear it. The list of ids is in `defects.mjs`.

## Rule

Every defect changes one thing. The clean app has no defects and passes every check.
When you add a defect, change one value only, and add a row to `defects.mjs`.
