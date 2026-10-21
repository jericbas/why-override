# why-override

`why-override` is a CLI that displays and maintains explanations for npm override selectors. Override declarations stay in your project's root `package.json`; explanations live in a tracked root `.override-reasons.jsonc` file (with backwards-compatible fallback to `override-reasons.jsonc`).

> **Publication status:** `why-override` is prepared as an npm package, but has not yet been published to the npm registry. The installation command below will work once it is published.

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

Create `.override-reasons.jsonc` in the same directory. Each record identifies an exact selector path as an array of literal selector segments, has a non-empty explanation, and includes UTC timestamps:

```jsonc
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

The selector path is stored in `.override-reasons.jsonc` as `["packageA", "packageB"]`:

```jsonc
{
  "selector": ["packageA", "packageB"],
  "reason": "Compatibility patch for packageB when used inside packageA."
}
```

Similarly, `parent > .` is stored as `["parent", "."]`. In the status table, nested selectors are formatted with arrows (e.g. `"packageA" > "packageB"`). Replacement targets such as npm aliases, Git references, and local paths are not part of selector identity.

Records may also include two optional fields:

- `target`: a snapshot of the override value (for example `"7.0.0"`) when the reason was written. The CLI fills it in automatically when it saves a new reason and updates it on `refresh`. If the root override later changes, installs warn that the reason should be reviewed. Records without `target` are still valid and are not checked.
- `workspaces`: a hand-maintained list of the workspaces that need the override, for example `["apps/web", "apps/api"]`. It is shown next to the reason for context only; the CLI does not check it against your dependency tree.

```jsonc
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

The tool does not edit the consumer's package manifest. If `.override-reasons.jsonc` does not yet exist, it is created automatically when the first interactive reason is saved (legacy `override-reasons.jsonc` is also recognized). Save and commit both files with your dependency changes.

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

For undocumented selectors, an interactive terminal asks `Why do you need to override this? <selector> (auto-skips in 10s)` with a real-time countdown. A non-empty answer is saved with matching creation and update timestamps. Empty answers, timeouts, and non-TTY installs do not add a reason.

### Running with package managers

You can invoke `why-override` directly using any major package manager:

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

### Re-entering or updating reasons

To re-enter or update explanations across all overrides interactively, pass `--reenter`:

```sh
npx why-override --reenter
# or:
npx why-override refresh --all
```

Pressing Enter on an existing override without entering a new reason keeps the current reason unchanged.

To refresh a single specific override reason, pass its selector path as a JSON array:

```sh
npx why-override refresh '["is-number"]'
# nested override:
npx why-override refresh '["packageA", "packageB"]'
npx why-override refresh '["parent", "."]'
```

A changed explanation preserves `createdAt` and updates `updatedAt`; submitting the same explanation leaves timestamps unchanged, unless the override target changed since the reason was written, in which case `target` and `updatedAt` are updated to mark it reviewed.

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

## License

MIT. See [LICENSE](LICENSE).
