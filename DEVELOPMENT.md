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
- `.override-reasons.json`: repository demo's tracked reason store (legacy `override-reasons.json` is also supported as fallback).
- `bun.lock`: Bun workspace lockfile.

## Setup

From the repository root:

```sh
bun install
git config core.hooksPath .githooks
```

The root `preinstall` script runs the enforcer. It reads the root `package.json` and `.override-reasons.json`. Configuring `core.hooksPath` enables the commit message hook (`.githooks/commit-msg`), ensuring commits adhere to Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) for Release Please.

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
- `.override-reasons.json` stores selector paths, explanations, and timestamps, not override targets.
- Selector identity is an array of literal path segments. Do not add npm dependency-tree or semver resolution to the CLI.
- Aging, malformed data, and stale records warn without blocking installation or automatically rewriting developer-authored data.
- The CLI does not modify a consumer's package manifest to install a hook. Consumers explicitly configure their root `preinstall` script; see the package README.

## Repository guidance

- GitHub Issues are the source of tickets and specs.

## Release process

Automated releases and npm publishing are handled by [Google's Release Please](https://github.com/googleapis/release-please-action) via GitHub Actions.

### Branching workflow (Trunk-based)

1. **Feature branches:** Branch off `main` using standard naming (`feat/*`, `fix/*`, `docs/*`, `chore/*`).
2. **Conventional Commits:** All PRs and commits must follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). Release Please uses these prefixes to determine semver bumps (`feat` for minor, `fix` for patch, `!` or `BREAKING CHANGE` for major) and generate changelog entries.
3. **Merge to `main`:** Pull requests are reviewed and merged directly into `main`.
4. **Automated Release PR:**
   - Pushing/merging to `main` triggers `.github/workflows/release-please.yml`, which automatically creates or updates a candidate Release PR (e.g. `chore(main): release X.Y.Z`).
5. **Publish to npm:**
   - When ready to release, merge the Release PR into `main`. Release Please creates the GitHub Release, tags the commit, and automatically publishes to npm (with automatic retries).

### Manual / emergency publish

If an emergency manual publish is required, use GitHub Actions' `workflow_dispatch` on the `Release Please` workflow with `force_publish: true`.

