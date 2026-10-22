export const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

export const ansi = (code) => (text) =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text;

export const color = {
  bold: ansi("1"),
  dim: ansi("2"),
  cyan: ansi("36;1"),
  green: ansi("32"),
  yellow: ansi("33"),
  magenta: ansi("35;1"),
};

export function warnDiagnostic(message) {
  console.warn(`\u001b[33;1m[why-override] Warning: ${message}\u001b[0m`);
}

