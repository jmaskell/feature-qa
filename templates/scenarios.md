# QA scenarios: <feature>

Each scenario is a named seed record. A test reaches a state from a scenario, never from other data.

| Scenario | Seed record (name in the seed) | States it reaches | Known values for the leak scan |
|---|---|---|---|

## Content stress

| Scenario | What it stresses |
|---|---|
| long-values | The longest real value of each field |
| accents | Names with accents and apostrophes |
