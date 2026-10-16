# Development

This document describes how to work on the `why-override` repository. Consumer installation and configuration instructions are in [README.md](README.md).

## Prerequisites

- Bun 1.4.2, as pinned by the root `package.json` `packageManager` field.
- Node.js and npm for executing the built CLI and testing npm lifecycle behavior.
- Git for version control.

## Repository layout

- `packages/why-override/src/cli.js`: CLI source.
- `packages/why-override/dist/cli.js`: Node-executable bundle used by the npm package and root lifecycle hook. This generated bundle is committed because it must be present when npm runs `preinstall` from a checkout or installed package.
- `packages/why-override/package.json`: npm package metadata, executable mapping, and package contents.
- `apps/demo/`: workspace consumer demonstrating the root override and locally installed CLI.
- `tests/lifecycle.test.ts`: subprocess integration tests, including real npm installs and pseudo-terminal prompt scenarios.
- `override-reasons.jsonc`: repository demo's tracked reason store.
- `bun.lock`: Bun workspace lockfile.

## Setup

From the repository root:

```sh
bun install
```

The root `preinstall` script runs the enforcer. It reads the root `package.json` and `override-reasons.jsonc`.

## Common commands

Run these from the repository root:

```sh
bun run build
bun run test
bun run lint
bun run format
bun run demo
```

- `build` bundles the CLI for Node into `packages/why-override/dist/cli.js`.
- `test` runs the complete integration suite. The test timeout is set to 20 seconds because some tests intentionally exercise the 10-second prompt fallback.
- `lint` checks authored source, tests, manifests, and configuration with Biome.
- `format` formats those authored files.
- `demo` runs the demo app and invokes its locally installed `why-override` command.

When changing CLI source, rebuild the bundle before running lifecycle tests. Those tests copy the generated bundle into temporary workspace fixtures and invoke real `npm install` and `npm ci` commands.

## Testing and package checks

Run the full suite with:

```sh
bun run test
```

To run a focused test file or name pattern:

```sh
bun test --timeout=20000 tests/lifecycle.test.ts
bun test --timeout=20000 --test-name-pattern='timeout' tests/lifecycle.test.ts
```

The integration suite uses temporary workspaces so tests do not mutate the repository's reason store. It covers the actual npm lifecycle hook, a pseudo-terminal for interactive prompts, non-TTY behavior, selector matching, timestamps, timeout configuration, refresh, and non-blocking diagnostics.

Inspect what npm would publish without publishing:

```sh
npm pack --dry-run --workspace=packages/why-override
```

This checks that the tarball includes the package README, license, manifest, and built CLI. Do not run `npm publish` as part of routine development.

## Making changes

1. Update CLI source and the relevant integration test.
2. Run `bun run format` if formatting is needed.
3. Run `bun run build` so the committed package bundle matches source.
4. Run the focused test, then `bun run lint`.
5. Before finishing a ticket, run `bun run test` and `npm pack --dry-run --workspace=packages/why-override`.
6. Review `git status` and the diff. Keep unrelated user changes, including untracked files, out of the commit.

## Design constraints

- The consumer's root `package.json` is the authoritative override source. Do not treat workspace member overrides as independently effective.
- `override-reasons.jsonc` stores selector paths, explanations, and timestamps, not override targets.
- Selector identity is an array of literal path segments. Do not add npm dependency-tree or semver resolution to the CLI.
- Aging, malformed data, and stale records warn without blocking installation or automatically rewriting developer-authored data.
- The CLI does not modify a consumer's package manifest to install a hook. Consumers explicitly configure their root `preinstall` script; see the package README.

## Repository guidance

- GitHub Issues are the source of tickets and specs; workflow conventions are in [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- Glossary and ADR consumption conventions are in [docs/agents/domain.md](docs/agents/domain.md). Create domain documents when vocabulary or decisions need to be recorded, not as placeholders.
- [AGENTS.md](AGENTS.md) points coding agents to these repository-specific guides.
