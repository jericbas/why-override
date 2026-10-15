# Demo

This app depends on `is-odd`, which depends on `is-number`. The effective
`is-number` override is declared in the workspace root `package.json`; npm does
not apply independent override fields from workspace members.
