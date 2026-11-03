---
type: regex
target:
  source: file
  path: app/pages.mjs
match: not_contains
---
const title = t \? t\.name : "Property details"
