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
