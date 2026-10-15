# why-override

The `why-override` CLI displays the saved explanations for npm overrides in a
project's root `package.json`.

Install it in the project:

```sh
npm install --save-dev why-override
```

Add the CLI to the root package's install hook so bare local `npm install` and
`npm ci` display the explanations:

```json
{
  "scripts": {
    "preinstall": "why-override"
  }
}
```

Override declarations remain in the project root `package.json`. Explanations
are read from the root `override-reasons.jsonc` file. The CLI does not install a
hook into the consumer's project automatically. Package-argument installs,
global installs, and installs run with `--ignore-scripts` are not covered by the
root lifecycle hook.

Interactive prompt timeout defaults to 10 seconds. Set `OVERRIDE_TIMEOUT` to a
positive integer number of seconds, or configure the project fallback in
`package.json`:

```json
{
  "config": {
    "why-override": {
      "timeout": 15
    }
  }
}
```

The environment variable takes precedence over the project setting. Invalid
values warn and fall back to 10 seconds.

Refresh an existing explanation from an interactive terminal by passing its
exact selector path as a JSON string array:

```sh
why-override refresh '["is-number"]'
```

Changing the explanation preserves `createdAt` and updates `updatedAt`. Entering
the existing explanation again leaves both timestamps unchanged.
