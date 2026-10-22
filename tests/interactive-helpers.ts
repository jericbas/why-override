export async function spawnInteractive(
  cmd: string[],
  cwd: string,
  onData: (terminal: { write: (text: string) => void }, output: string) => void,
  env: Record<string, string> = {},
  safetyTimeoutMs = 5000,
) {
  let output = "";
  const decoder = new TextDecoder();
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    terminal: {
      cols: 100,
      rows: 30,
      data(terminal, data) {
        output += decoder.decode(data, { stream: true });
        onData(terminal, output);
      },
    },
  });
  const timer = setTimeout(() => child.kill(), safetyTimeoutMs);
  const exitCode = await child.exited;
  clearTimeout(timer);
  child.terminal.close();
  return { output: `${output}${decoder.decode()}`, exitCode };
}

export async function runInteractiveEnforcer(
  fixtureRoot: string,
  args: string[],
  answer: string,
  safetyTimeoutMs = 5000,
) {
  let prompted = false;
  const res = await spawnInteractive(
    ["node", "packages/why-override/dist/cli.js", ...args],
    fixtureRoot,
    (terminal, output) => {
      if (!prompted && output.includes("Why do you need to override this?")) {
        prompted = true;
        terminal.write(`${answer}\r`);
      }
    },
    {},
    safetyTimeoutMs,
  );
  return { ...res, prompted };
}

export async function runInteractiveNpm(
  fixtureRoot: string,
  args: string[],
  answer?: string,
  env: Record<string, string> = {},
  safetyTimeoutMs = 5000,
) {
  let prompted = false;
  let answered = false;
  const res = await spawnInteractive(
    ["npm", ...args],
    fixtureRoot,
    (terminal, output) => {
      if (!prompted && output.includes("Why do you need to override this?")) {
        prompted = true;
        if (answer !== undefined) {
          answered = true;
          terminal.write(`${answer}\r`);
        }
      }
    },
    env,
    safetyTimeoutMs,
  );
  return { ...res, prompted, answered };
}

export async function runInteractiveRefreshSelection(
  fixtureRoot: string,
  selectionInput: string,
  reasonInput?: string,
  safetyTimeoutMs = 5000,
) {
  let selectionPrompted = false;
  let reasonPrompted = false;
  const res = await spawnInteractive(
    ["node", "packages/why-override/dist/cli.js", "refresh"],
    fixtureRoot,
    (terminal, output) => {
      if (
        !selectionPrompted &&
        output.includes("Which package(s) do you want to refresh?")
      ) {
        selectionPrompted = true;
        terminal.write(`${selectionInput}\r`);
      } else if (
        selectionPrompted &&
        !reasonPrompted &&
        output.includes("Why do you need to override this?")
      ) {
        reasonPrompted = true;
        if (reasonInput !== undefined) {
          terminal.write(`${reasonInput}\r`);
        }
      }
    },
    {},
    safetyTimeoutMs,
  );
  return { ...res, selectionPrompted, reasonPrompted };
}

