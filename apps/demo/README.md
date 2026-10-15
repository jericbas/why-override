# Demo

This app depends on `is-odd`, which depends on `is-number`, and installs the
`why-override` CLI from the local package using a `file:` dependency. The root
`package.json` owns the effective `is-number` override; npm does not apply
independent override fields from workspace members.

Run `bun run demo` from the repository root to see the app and the installed
CLI. A published consumer can install the CLI with
`npm install --save-dev why-override` and add `why-override` to the consumer
root's `preinstall` script.
