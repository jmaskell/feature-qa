---
type: regex
target:
  source: file
  path: qa.config.ts
match: contains
---
caseRule:\s*["']sentence["']
