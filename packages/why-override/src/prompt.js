import { clearLine, cursorTo, moveCursor } from "node:readline";
import { color } from "./color.js";
import { getExistingReasons } from "./store.js";

export function debounce(fn, waitMs = 300) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
}

export async function promptWithCountdown({
  promptInterface,
  promptTimeoutSeconds,
  formatQuestion,
  timeoutMessage,
}) {
  if (!promptInterface) {
    return undefined;
  }

  let timeoutHandle;
  let countdownHandle;
  const timeoutToken = Symbol("prompt-timeout");
  const closeToken = Symbol("prompt-close");
  let deadline = Date.now() + promptTimeoutSeconds * 1000;

  const renderQuestion = (secondsLeft) => {
    if (!process.stdout.isTTY) {
      return;
    }
    const rowsBelowQuestion = promptInterface.getCursorPos().rows;
    process.stdout.write("\x1b7");
    moveCursor(process.stdout, 0, -rowsBelowQuestion);
    cursorTo(process.stdout, 0);
    clearLine(process.stdout, 0);
    process.stdout.write(formatQuestion(secondsLeft));
    process.stdout.write("\x1b8");
  };

  let resolveTimeoutPromise;
  const timeoutPromise = new Promise((resolve) => {
    resolveTimeoutPromise = resolve;
  });

  const armTimeout = () => {
    clearTimeout(timeoutHandle);
    const msRemaining = Math.max(0, deadline - Date.now());
    timeoutHandle = setTimeout(
      () => resolveTimeoutPromise(timeoutToken),
      msRemaining,
    );
  };

  armTimeout();

  if (process.stdout.isTTY) {
    countdownHandle = setInterval(() => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000),
      );
      renderQuestion(secondsLeft);
    }, 1000);
  }

  const debouncedResetTimer = debounce(() => {
    deadline = Date.now() + promptTimeoutSeconds * 1000;
    armTimeout();
    renderQuestion(promptTimeoutSeconds);
  }, 300);

  const onInput = () => {
    deadline = Date.now() + promptTimeoutSeconds * 1000;
    clearTimeout(timeoutHandle);
    debouncedResetTimer();
  };

  process.stdin.on("data", onInput);

  let response;
  try {
    const questionPromise = promptInterface
      .question(`${formatQuestion(promptTimeoutSeconds)}\n`)
      .catch(() => closeToken);

    response = await Promise.race([questionPromise, timeoutPromise]);
  } finally {
    process.stdin.removeListener("data", onInput);
    debouncedResetTimer.cancel();
    clearTimeout(timeoutHandle);
    clearInterval(countdownHandle);
  }

  if (response === timeoutToken) {
    if (timeoutMessage) {
      console.warn(timeoutMessage);
    }
    promptInterface.close();
    return undefined;
  }
  if (response === closeToken) {
    return undefined;
  }

  return response;
}

export async function askForExplanation({
  promptInterface,
  promptTimeoutSeconds,
  reasonDocument,
  displaySelector,
}) {
  if (!promptInterface) {
    return undefined;
  }

  const existingReasons = getExistingReasons(reasonDocument);
  if (existingReasons.length > 0) {
    console.log("Existing reasons:");
    existingReasons.forEach((reason, index) => {
      console.log(`  ${index + 1}) ${reason}`);
    });
    console.log(
      color.dim(
        `Type a reason, or enter 1-${existingReasons.length} to select an existing one.`,
      ),
    );
  }

  const formatQuestion = (secondsLeft) =>
    `${color.cyan("Why do you need to override this?")} ${color.yellow(color.bold(displaySelector))} ${color.dim(`(auto-skips in ${secondsLeft}s)`)}`;
  const timeoutMessage = `Timed out after ${promptTimeoutSeconds} seconds; skipping ${displaySelector}.`;

  const response = await promptWithCountdown({
    promptInterface,
    promptTimeoutSeconds,
    formatQuestion,
    timeoutMessage,
  });
  if (response === undefined) {
    return undefined;
  }

  const trimmed = response.trim();
  const optionMatch = trimmed.match(/^#?([1-9]\d*)$/);
  if (optionMatch) {
    const optionIndex = Number(optionMatch[1]) - 1;
    if (optionIndex >= 0 && optionIndex < existingReasons.length) {
      const selected = existingReasons[optionIndex];
      console.log(`Selected: ${selected}`);
      return selected;
    }
  }

  return trimmed;
}

