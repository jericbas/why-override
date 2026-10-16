# why-override

`why-override` is a CLI that displays and maintains explanations for npm override selectors. Override declarations stay in your project's root `package.json`; explanations live in a tracked root `override-reasons.jsonc` file.

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

Create `override-reasons.jsonc` in the same directory. Each record identifies an exact selector path as an array of literal selector segments, has a non-empty explanation, and includes UTC timestamps:

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

Nested selectors use one array element per key, including the special `.` selector. For example, `parent > .` is stored as `["parent", "."]`. Replacement targets such as npm aliases, Git references, and local paths are not part of selector identity.

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

The tool does not edit the consumer's package manifest or create the reason file automatically. Save and commit both files with the dependency changes.

## Use

Bare local installs run the root hook:

```sh
npm install
npm ci
```

For undocumented selectors, an interactive terminal asks `Why do you need to override this?`. A non-empty answer is saved with matching creation and update timestamps. Empty answers, timeouts, and non-TTY installs do not add a reason. Documented reasons are printed during the check.

Refresh an existing reason from an interactive terminal by passing its exact selector path as a JSON array:

```sh
npx why-override refresh '["is-number"]'
npx why-override refresh '["parent", "."]'
```

A changed explanation preserves `createdAt` and updates `updatedAt`; submitting the same explanation leaves timestamps unchanged.

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

Reasons last updated 30 days ago or more receive a review advisory. Malformed records and records whose selectors are no longer present in root overrides also produce warnings. These conditions do not block installation or automatically rewrite or remove the reason file. Stale records must be cleaned up deliberately.

## Coverage

The automatic npm hook covers bare local `npm install` and `npm ci` when lifecycle scripts are enabled. It does not cover package-argument installs, global installs, or commands run with `--ignore-scripts`.

npm applies overrides from the project root manifest. An override declared in a workspace member is not an independent effective override.

## License

MIT. See [LICENSE](LICENSE).
