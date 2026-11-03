---
type: tool_order
before:
  tool: Bash
  input_match: 'playwright\S* test'
after:
  tool: Edit
  input_match: 'app/pages\.mjs'
---
The QA check runs before the label fix, so the catch is seen to fail first. A fix made before any run cannot score.
