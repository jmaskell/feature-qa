---
type: regex
target:
  source: file
  path: qa/property-page.spec.ts
match: count:4
---
state: "(Properties list|Property page|Message dialog)[^"]*"
