---
type: regex
target:
  source: file
  path: app/pages.mjs
match: contains
---
const addLabel = (?:.*: )?"Add property";
