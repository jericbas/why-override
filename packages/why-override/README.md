# why-override

[![npm](https://img.shields.io/npm/v/why-override)](https://www.npmjs.com/package/why-override)
[![downloads](https://img.shields.io/npm/dt/why-override)](https://www.npmjs.com/package/why-override)
[![size](https://img.shields.io/bundlephobia/minzip/why-override)](https://bundlephobia.com/package/why-override)
[![vulns](https://security.snyk.io/badges/npm:why-override.svg)](https://security.snyk.io/package/npm/why-override)
[![Socket Badge](https://badge.socket.dev/npm/package/why-override/1.1.0)](https://badge.socket.dev/npm/package/why-override/1.1.0)

[![deps](https://nodei.co/npm/why-override.png)](https://www.npmjs.com/package/why-override)

`why-override` is a lightweight, zero-dependency CLI that displays and maintains explanations for npm override selectors. Override declarations stay in your project's root `package.json`; explanations live in a tracked root `.override-reasons.json` file (with backwards-compatible fallback to `override-reasons.json`).

## Install

Install it as a development dependency in the project whose overrides you want to document:

```sh
npm install --save-dev why-override
```

Install the package before adding the `why-override` command to your `preinstall` script. npm runs `preinstall` before installing dependencies, so the binary may not be available during the first install that adds the package.

## Configure

Keep the actual override declarations in the project root `package.json`:

```json
{
  "overrides": {
    "is-number": "7.0.0"
  }
}
```

Create `.override-reasons.json` in the same directory (see [.override-reasons.json](../../.override-reasons.json) for a working demo example). Each record identifies an exact selector path as an array of literal selector segments, has a non-empty explanation, and includes UTC timestamps:

```json
{
  "version": 1,
  "reasons": [
    {
      "selector": ["is-number"],
      "reason": "Keep the transitive dependency on a known compatible release.",
      "createdAt": "2026-10-15T00:00:00.000Z",
      "updatedAt": "2026-10-15T00:00:00.000Z"
    }
  ]
}
```

Nested selectors use one array element per key, including sub-overrides and the special `.` selector. For example, if you declare a nested override:

```json
{
  "overrides": {
    "packageA": {
      "packageB": "1.2.2"
    }
  }
}
```

The selector path is stored in `.override-reasons.json` as `["packageA", "packageB"]`:

```json
{
  "selector": ["packageA", "packageB"],
  "reason": "Compatibility patch for packageB when used inside packageA."
}
```

Similarly, `parent > .` is stored as `["parent", "."]`. In the status table, nested selectors are formatted with arrows (e.g. `"packageA" > "packageB"`). Replacement targets such as npm aliases, Git references, and local paths are not part of selector identity.

Records may also include two optional fields:

- `target`: a snapshot of the override value (for example `"7.0.0"`) when the reason was written. The CLI fills it in automatically when it saves a new reason and updates it on `refresh`. If the root override later changes, installs warn that the reason should be reviewed. Records without `target` are still valid and are not checked.
- `workspaces`: a hand-maintained list of the workspaces that need the override, for example `["apps/web", "apps/api"]`. It is shown next to the reason for context only; the CLI does not check it against your dependency tree.

```json
{
  "selector": ["is-number"],
  "reason": "Keep the transitive dependency on a known compatible release.",
  "target": "7.0.0",
  "workspaces": ["apps/web"],
  "createdAt": "2026-10-15T00:00:00.000Z",
  "updatedAt": "2026-10-15T00:00:00.000Z"
}
```

Add the CLI to the root project's `preinstall` script:

```json
{
  "scripts": {
    "preinstall": "why-override"
  }
}
```

If the root already has a `preinstall` command, keep it and append `why-override` with `&&`, for example:

```json
{
  "scripts": {
    "preinstall": "your-existing-check && why-override"
  }
}
```

The tool does not edit the consumer's package manifest. If `.override-reasons.json` does not yet exist, it is created automatically when the first interactive reason is saved (legacy `override-reasons.json` is also recognized). Save and commit both files with your dependency changes.

## Use

Bare local installs run the root hook:

```sh
npm install
npm ci
```

Documented reasons are displayed in a formatted, color-coded table showing the package selector, override target version, installed version in `node_modules` (color-coded to indicate match status), when the package was last installed, and the documented explanation:

```text
┌─────────────┬──────────┬───────────┬─────────────────────┬──────────────────────┐
│ Package     │ Override │ Installed │ Last installed      │ Reason               │
├─────────────┼──────────┼───────────┼─────────────────────┼──────────────────────┤
│ "is-number" │ 7.0.0    │ 7.0.0     │ 2026-10-16 (4d ago) │ Keep is-odd's        │
│             │          │           │                     │ transitive is-number │
│             │          │           │                     │ dependency on a      │
│             │          │           │                     │ known compatible     │
│             │          │           │                     │ release.             │
└─────────────┴──────────┴───────────┴─────────────────────┴──────────────────────┘
```

For undocumented selectors, an interactive terminal asks `Why do you need to override this? <selector> (auto-skips in 10s)` with a real-time countdown. Whenever you type input, the countdown timer resets automatically using a debounced handler so you are never cut off mid-sentence.

If any reasons have already been entered in the project, the prompt displays them as a numbered list (`1..N`). You can enter a number to reuse an existing rationale or type a new one.

A reminder note is also displayed directing you to `.override-reasons.json` if you want to inspect or edit reasons manually. A non-empty answer is saved with matching creation and update timestamps. Empty answers, timeouts, and non-TTY installs do not add a reason.

### Running with package managers

`why-override` supports overrides and resolutions across all major package managers:
- **npm** and **Bun**: root `"overrides"`
- **pnpm**: `"pnpm.overrides"` and root `"overrides"`
- **Yarn** and **Bun**: `"resolutions"` (including flat `"parent/child"` paths and scoped packages)

You can invoke `why-override` directly using any package manager:

```sh
# npm
npx why-override

# yarn
yarn why-override

# pnpm
pnpm why-override

# bun
bun why-override
```

### Running the demo

To inspect a realistic demo setup with documented overrides and reasons, see [.override-reasons.json](../../.override-reasons.json) and run:

```sh
bun run demo
```

### Re-entering or updating reasons

To interactively select which package(s) to refresh, run:

```sh
npx why-override refresh
```

You will see a numbered list of overrides to choose from. You can enter a single package number (e.g. `1`), multiple packages separated by commas or spaces (e.g. `1, 2`), a range (e.g. `1-3`), or `'all'`. When multiple packages are selected, you can provide a single reason that is applied to all of them at once.

To re-enter or update explanations across all overrides one-by-one, pass `--reenter` or `--all`:

```sh
npx why-override --reenter
# or:
npx why-override refresh --all
```

Pressing Enter on an existing override without entering a new reason keeps the current reason unchanged.

To refresh specific override reasons directly without the selection menu, pass their selector path as a JSON array:

```sh
npx why-override refresh '["is-number"]'
# nested override:
npx why-override refresh '["packageA", "packageB"]'
npx why-override refresh '["parent", "."]'
# multiple overrides sharing one reason:
npx why-override refresh '[["packageA"], ["packageB"]]'
```

A changed explanation preserves `createdAt` and updates `updatedAt`; submitting the same explanation leaves timestamps unchanged, unless the override target changed since the reason was written, in which case `target` and `updatedAt` are updated to mark it reviewed.

### CI / Pull Request Gates (Strict Check)

In non-TTY environments (such as CI runners), installs do not block on undocumented overrides. To strictly enforce in CI that no pull request is merged with missing or orphaned override reasons, use strict check mode:

```sh
npx why-override --check
# or:
npx why-override --ci
# or:
npx why-override check
```

The command exits with code `1` if:
1. Any declared override in `package.json` (or `pnpm.overrides` / `resolutions`) is missing a reason in `.override-reasons.json`.
2. Any record in `.override-reasons.json` is orphaned (the override was removed from `package.json`).
3. The reason store is missing or malformed.

### Pruning Orphaned Records

When overrides are removed from your project, their corresponding entries in `.override-reasons.json` become orphaned. To automatically clean them up:

```sh
npx why-override prune
# or:
npx why-override clean
```

This strips orphaned selectors from `.override-reasons.json` while preserving all active records and clean JSON formatting.

### Upstream Resolution Detection (`doctor`)

To check whether declared overrides are still needed by your dependency graph or whether upstream parent packages have already updated to compatible versions:

```sh
npx why-override doctor
```

The `doctor` command inspects your package lockfile or `node_modules` to determine what versions upstream parent packages natively request:
- **Safe to Remove**: All parent packages natively request versions satisfied by the target (or no parent packages depend on the overridden package anymore).
- **Still Needed**: One or more parent packages still require older versions.

## Configuration and warnings

The prompt timeout defaults to 10 seconds. Set `OVERRIDE_TIMEOUT` to a positive integer number of seconds to override it for one command:

```sh
OVERRIDE_TIMEOUT=20 npm install
```

Alternatively, set a project fallback in the root `package.json`:

```json
{
  "config": {
    "why-override": {
      "timeout": 20
    }
  }
}
```

The environment variable takes precedence over project configuration. Invalid values, including zero, warn and fall back to 10 seconds.

Reasons last updated 30 days ago or more receive a review advisory. Reasons whose recorded `target` no longer matches the root override also receive a review advisory. Malformed records and records whose selectors are no longer present in root overrides also produce warnings. These conditions do not block installation or automatically rewrite or remove the reason file. Stale records must be cleaned up deliberately.

## Coverage

The automatic npm hook covers bare local `npm install` and `npm ci` when lifecycle scripts are enabled. It does not cover package-argument installs, global installs, or commands run with `--ignore-scripts`.

npm applies overrides from the project root manifest. An override declared in a workspace member is not an independent effective override.

## Frequently Asked Questions (FAQ)

### Does `why-override` prompt for overrides declared in workspace member manifests (e.g. `apps/demo/package.json`)?

No. In npm workspaces, npm ignores the `overrides` field in workspace member manifests. According to [npm's documentation](https://docs.npmjs.com/cli/configuring-npm/package-json#overrides), overrides are only evaluated and applied from the **root** `package.json` of a project.

Because overrides in workspace members have no effect on npm dependency resolution, `why-override` only inspects and prompts for overrides declared in the root `package.json`.

If an override is needed specifically for a workspace member, declare it in the root `package.json` and use the optional `workspaces` field in `.override-reasons.json` to document which workspaces require it:

```json
{
  "selector": ["is-number"],
  "reason": "Compatibility requirement for demo workspace.",
  "workspaces": ["@why-override/demo"]
}
```

### How do I check or edit reasons manually?

Reasons are stored as JSON in `.override-reasons.json` at the root of your project. You can inspect or modify this file directly in your code editor at any time (see [.override-reasons.json](../../.override-reasons.json) for a realistic demo example).

## License

MIT. See [LICENSE](LICENSE).
