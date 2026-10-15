# Why Override

This npm workspace demonstrates documenting root-level dependency overrides.
The root `package.json` is the authoritative source of override declarations,
and `override-reasons.jsonc` stores their explanations.

## Development

Use Bun for workspace installation and routine scripts:

```sh
bun install
bun run build
bun run test
bun run lint
bun run format
bun run demo
```

The root npm `preinstall` hook runs the enforcer for bare local `npm install`
and `npm ci`. It does not cover package-argument installs, global installs, or
commands run with `--ignore-scripts`.
