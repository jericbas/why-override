#!/usr/bin/env node

// packages/why-override/src/cli.js
import { readFileSync as readFileSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { basename, resolve as resolve3 } from "node:path";
import { createInterface } from "node:readline/promises";

// packages/why-override/src/color.js
var useColor = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";
var ansi = (code) => (text) => useColor ? `\x1B[${code}m${text}\x1B[0m` : text;
var color = {
  bold: ansi("1"),
  dim: ansi("2"),
  cyan: ansi("36;1"),
  green: ansi("32"),
  yellow: ansi("33"),
  magenta: ansi("35;1")
};
function warnDiagnostic(message) {
  console.warn(`\x1B[33;1m[why-override] Warning: ${message}\x1B[0m`);
}

// packages/why-override/src/enforce.js
import { writeFileSync as writeFileSync2 } from "node:fs";

// node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
function createScanner(text, ignoreTrivia = false) {
  const len = text.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value = 0;
    while (digits < count || !exact) {
      let ch = text.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) {
        value = value * 16 + ch - 48;
      } else if (ch >= 65 && ch <= 70) {
        value = value * 16 + ch - 65 + 10;
      } else if (ch >= 97 && ch <= 102) {
        value = value * 16 + ch - 97 + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      value = -1;
    }
    return value;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }
  function scanNumber() {
    let start = pos;
    if (text.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text.length && text.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text.length && (text.charCodeAt(pos) === 69 || text.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text.length && text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text.charCodeAt(pos);
      if (ch === 34) {
        result += text.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text.charCodeAt(pos++);
        switch (ch2) {
          case 34:
            result += '"';
            break;
          case 92:
            result += "\\";
            break;
          case 47:
            result += "/";
            break;
          case 98:
            result += "\b";
            break;
          case 102:
            result += "\f";
            break;
          case 110:
            result += `
`;
            break;
          case 114:
            result += "\r";
            break;
          case 116:
            result += "\t";
            break;
          case 117:
            const ch3 = scanHexDigits(4, true);
            if (ch3 >= 0) {
              result += String.fromCharCode(ch3);
            } else {
              scanError = 4;
            }
            break;
          default:
            scanError = 5;
        }
        start = pos;
        continue;
      }
      if (ch >= 0 && ch <= 31) {
        if (isLineBreak(ch)) {
          result += text.substring(start, pos);
          scanError = 2;
          break;
        } else {
          scanError = 6;
        }
      }
      pos++;
    }
    return result;
  }
  function scanNext() {
    value = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17;
    }
    let code = text.charCodeAt(pos);
    if (isWhiteSpace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text.charCodeAt(pos);
      } while (isWhiteSpace(code));
      return token = 15;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 && text.charCodeAt(pos) === 10) {
        pos++;
        value += `
`;
      }
      lineNumber++;
      tokenLineStartOffset = pos;
      return token = 14;
    }
    switch (code) {
      case 123:
        pos++;
        return token = 1;
      case 125:
        pos++;
        return token = 2;
      case 91:
        pos++;
        return token = 3;
      case 93:
        pos++;
        return token = 4;
      case 58:
        pos++;
        return token = 6;
      case 44:
        pos++;
        return token = 5;
      case 34:
        pos++;
        value = scanString();
        return token = 10;
      case 47:
        const start = pos - 1;
        if (text.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text.substring(start, pos);
          return token = 12;
        }
        if (text.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text.charCodeAt(pos);
            if (ch === 42 && text.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text.charCodeAt(pos) === 10) {
                pos++;
              }
              lineNumber++;
              tokenLineStartOffset = pos;
            }
          }
          if (!commentClosed) {
            pos++;
            scanError = 1;
          }
          value = text.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
      case 45:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text.charCodeAt(pos))) {
          return token = 16;
        }
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        value += scanNumber();
        return token = 11;
      default:
        while (pos < len && isUnknownContentCharacter(code)) {
          pos++;
          code = text.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text.substring(tokenOffset, pos);
          switch (value) {
            case "true":
              return token = 8;
            case "false":
              return token = 9;
            case "null":
              return token = 7;
          }
          return token = 16;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
    }
  }
  function isUnknownContentCharacter(code) {
    if (isWhiteSpace(code) || isLineBreak(code)) {
      return false;
    }
    switch (code) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return false;
    }
    return true;
  }
  function scanNextNonTrivia() {
    let result;
    do {
      result = scanNext();
    } while (result >= 12 && result <= 15);
    return result;
  }
  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError
  };
}
function isWhiteSpace(ch) {
  return ch === 32 || ch === 9;
}
function isLineBreak(ch) {
  return ch === 10 || ch === 13;
}
function isDigit(ch) {
  return ch >= 48 && ch <= 57;
}
var CharacterCodes;
(function(CharacterCodes) {
  CharacterCodes[CharacterCodes["lineFeed"] = 10] = "lineFeed";
  CharacterCodes[CharacterCodes["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes[CharacterCodes["space"] = 32] = "space";
  CharacterCodes[CharacterCodes["_0"] = 48] = "_0";
  CharacterCodes[CharacterCodes["_1"] = 49] = "_1";
  CharacterCodes[CharacterCodes["_2"] = 50] = "_2";
  CharacterCodes[CharacterCodes["_3"] = 51] = "_3";
  CharacterCodes[CharacterCodes["_4"] = 52] = "_4";
  CharacterCodes[CharacterCodes["_5"] = 53] = "_5";
  CharacterCodes[CharacterCodes["_6"] = 54] = "_6";
  CharacterCodes[CharacterCodes["_7"] = 55] = "_7";
  CharacterCodes[CharacterCodes["_8"] = 56] = "_8";
  CharacterCodes[CharacterCodes["_9"] = 57] = "_9";
  CharacterCodes[CharacterCodes["a"] = 97] = "a";
  CharacterCodes[CharacterCodes["b"] = 98] = "b";
  CharacterCodes[CharacterCodes["c"] = 99] = "c";
  CharacterCodes[CharacterCodes["d"] = 100] = "d";
  CharacterCodes[CharacterCodes["e"] = 101] = "e";
  CharacterCodes[CharacterCodes["f"] = 102] = "f";
  CharacterCodes[CharacterCodes["g"] = 103] = "g";
  CharacterCodes[CharacterCodes["h"] = 104] = "h";
  CharacterCodes[CharacterCodes["i"] = 105] = "i";
  CharacterCodes[CharacterCodes["j"] = 106] = "j";
  CharacterCodes[CharacterCodes["k"] = 107] = "k";
  CharacterCodes[CharacterCodes["l"] = 108] = "l";
  CharacterCodes[CharacterCodes["m"] = 109] = "m";
  CharacterCodes[CharacterCodes["n"] = 110] = "n";
  CharacterCodes[CharacterCodes["o"] = 111] = "o";
  CharacterCodes[CharacterCodes["p"] = 112] = "p";
  CharacterCodes[CharacterCodes["q"] = 113] = "q";
  CharacterCodes[CharacterCodes["r"] = 114] = "r";
  CharacterCodes[CharacterCodes["s"] = 115] = "s";
  CharacterCodes[CharacterCodes["t"] = 116] = "t";
  CharacterCodes[CharacterCodes["u"] = 117] = "u";
  CharacterCodes[CharacterCodes["v"] = 118] = "v";
  CharacterCodes[CharacterCodes["w"] = 119] = "w";
  CharacterCodes[CharacterCodes["x"] = 120] = "x";
  CharacterCodes[CharacterCodes["y"] = 121] = "y";
  CharacterCodes[CharacterCodes["z"] = 122] = "z";
  CharacterCodes[CharacterCodes["A"] = 65] = "A";
  CharacterCodes[CharacterCodes["B"] = 66] = "B";
  CharacterCodes[CharacterCodes["C"] = 67] = "C";
  CharacterCodes[CharacterCodes["D"] = 68] = "D";
  CharacterCodes[CharacterCodes["E"] = 69] = "E";
  CharacterCodes[CharacterCodes["F"] = 70] = "F";
  CharacterCodes[CharacterCodes["G"] = 71] = "G";
  CharacterCodes[CharacterCodes["H"] = 72] = "H";
  CharacterCodes[CharacterCodes["I"] = 73] = "I";
  CharacterCodes[CharacterCodes["J"] = 74] = "J";
  CharacterCodes[CharacterCodes["K"] = 75] = "K";
  CharacterCodes[CharacterCodes["L"] = 76] = "L";
  CharacterCodes[CharacterCodes["M"] = 77] = "M";
  CharacterCodes[CharacterCodes["N"] = 78] = "N";
  CharacterCodes[CharacterCodes["O"] = 79] = "O";
  CharacterCodes[CharacterCodes["P"] = 80] = "P";
  CharacterCodes[CharacterCodes["Q"] = 81] = "Q";
  CharacterCodes[CharacterCodes["R"] = 82] = "R";
  CharacterCodes[CharacterCodes["S"] = 83] = "S";
  CharacterCodes[CharacterCodes["T"] = 84] = "T";
  CharacterCodes[CharacterCodes["U"] = 85] = "U";
  CharacterCodes[CharacterCodes["V"] = 86] = "V";
  CharacterCodes[CharacterCodes["W"] = 87] = "W";
  CharacterCodes[CharacterCodes["X"] = 88] = "X";
  CharacterCodes[CharacterCodes["Y"] = 89] = "Y";
  CharacterCodes[CharacterCodes["Z"] = 90] = "Z";
  CharacterCodes[CharacterCodes["asterisk"] = 42] = "asterisk";
  CharacterCodes[CharacterCodes["backslash"] = 92] = "backslash";
  CharacterCodes[CharacterCodes["closeBrace"] = 125] = "closeBrace";
  CharacterCodes[CharacterCodes["closeBracket"] = 93] = "closeBracket";
  CharacterCodes[CharacterCodes["colon"] = 58] = "colon";
  CharacterCodes[CharacterCodes["comma"] = 44] = "comma";
  CharacterCodes[CharacterCodes["dot"] = 46] = "dot";
  CharacterCodes[CharacterCodes["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes[CharacterCodes["minus"] = 45] = "minus";
  CharacterCodes[CharacterCodes["openBrace"] = 123] = "openBrace";
  CharacterCodes[CharacterCodes["openBracket"] = 91] = "openBracket";
  CharacterCodes[CharacterCodes["plus"] = 43] = "plus";
  CharacterCodes[CharacterCodes["slash"] = 47] = "slash";
  CharacterCodes[CharacterCodes["formFeed"] = 12] = "formFeed";
  CharacterCodes[CharacterCodes["tab"] = 9] = "tab";
})(CharacterCodes || (CharacterCodes = {}));

// node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js
var cachedSpaces = new Array(20).fill(0).map((_, index) => {
  return " ".repeat(index);
});
var maxCachedValues = 200;
var cachedBreakLinesWithSpaces = {
  " ": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return `
` + " ".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + " ".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return `\r
` + " ".repeat(index);
    })
  },
  "\t": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return `
` + "\t".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + "\t".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return `\r
` + "\t".repeat(index);
    })
  }
};
var supportedEols = [`
`, "\r", `\r
`];

// node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/format.js
function format(documentText, range, options) {
  let initialIndentLevel;
  let formatText;
  let formatTextStart;
  let rangeStart;
  let rangeEnd;
  if (range) {
    rangeStart = range.offset;
    rangeEnd = rangeStart + range.length;
    formatTextStart = rangeStart;
    while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
      formatTextStart--;
    }
    let endOffset = rangeEnd;
    while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
      endOffset++;
    }
    formatText = documentText.substring(formatTextStart, endOffset);
    initialIndentLevel = computeIndentLevel(formatText, options);
  } else {
    formatText = documentText;
    initialIndentLevel = 0;
    formatTextStart = 0;
    rangeStart = 0;
    rangeEnd = documentText.length;
  }
  const eol = getEOL(options, documentText);
  const eolFastPathSupported = supportedEols.includes(eol);
  let numberLineBreaks = 0;
  let indentLevel = 0;
  let indentValue;
  if (options.insertSpaces) {
    indentValue = cachedSpaces[options.tabSize || 4] ?? repeat(cachedSpaces[1], options.tabSize || 4);
  } else {
    indentValue = "\t";
  }
  const indentType = indentValue === "\t" ? "\t" : " ";
  let scanner = createScanner(formatText, false);
  let hasError = false;
  function newLinesAndIndent() {
    if (numberLineBreaks > 1) {
      return repeat(eol, numberLineBreaks) + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    const amountOfSpaces = indentValue.length * (initialIndentLevel + indentLevel);
    if (!eolFastPathSupported || amountOfSpaces > cachedBreakLinesWithSpaces[indentType][eol].length) {
      return eol + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    if (amountOfSpaces <= 0) {
      return eol;
    }
    return cachedBreakLinesWithSpaces[indentType][eol][amountOfSpaces];
  }
  function scanNext() {
    let token = scanner.scan();
    numberLineBreaks = 0;
    while (token === 15 || token === 14) {
      if (token === 14 && options.keepLines) {
        numberLineBreaks += 1;
      } else if (token === 14) {
        numberLineBreaks = 1;
      }
      token = scanner.scan();
    }
    hasError = token === 16 || scanner.getTokenError() !== 0;
    return token;
  }
  const editOperations = [];
  function addEdit(text, startOffset, endOffset) {
    if (!hasError && (!range || startOffset < rangeEnd && endOffset > rangeStart) && documentText.substring(startOffset, endOffset) !== text) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
    }
  }
  let firstToken = scanNext();
  if (options.keepLines && numberLineBreaks > 0) {
    addEdit(repeat(eol, numberLineBreaks), 0, 0);
  }
  if (firstToken !== 17) {
    let firstTokenStart = scanner.getTokenOffset() + formatTextStart;
    let initialIndent = indentValue.length * initialIndentLevel < 20 && options.insertSpaces ? cachedSpaces[indentValue.length * initialIndentLevel] : repeat(indentValue, initialIndentLevel);
    addEdit(initialIndent, formatTextStart, firstTokenStart);
  }
  while (firstToken !== 17) {
    let firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
    let secondToken = scanNext();
    let replaceContent = "";
    let needsLineBreak = false;
    while (numberLineBreaks === 0 && (secondToken === 12 || secondToken === 13)) {
      let commentTokenStart = scanner.getTokenOffset() + formatTextStart;
      addEdit(cachedSpaces[1], firstTokenEnd, commentTokenStart);
      firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
      needsLineBreak = secondToken === 12;
      replaceContent = needsLineBreak ? newLinesAndIndent() : "";
      secondToken = scanNext();
    }
    if (secondToken === 2) {
      if (firstToken !== 1) {
        indentLevel--;
      }
      if (options.keepLines && numberLineBreaks > 0 || !options.keepLines && firstToken !== 1) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1];
      }
    } else if (secondToken === 4) {
      if (firstToken !== 3) {
        indentLevel--;
      }
      if (options.keepLines && numberLineBreaks > 0 || !options.keepLines && firstToken !== 3) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1];
      }
    } else {
      switch (firstToken) {
        case 3:
        case 1:
          indentLevel++;
          if (options.keepLines && numberLineBreaks > 0 || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 5:
          if (options.keepLines && numberLineBreaks > 0 || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 12:
          replaceContent = newLinesAndIndent();
          break;
        case 13:
          if (numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 6:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 10:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (secondToken === 6 && !needsLineBreak) {
            replaceContent = "";
          }
          break;
        case 7:
        case 8:
        case 9:
        case 11:
        case 2:
        case 4:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else {
            if ((secondToken === 12 || secondToken === 13) && !needsLineBreak) {
              replaceContent = cachedSpaces[1];
            } else if (secondToken !== 5 && secondToken !== 17) {
              hasError = true;
            }
          }
          break;
        case 16:
          hasError = true;
          break;
      }
      if (numberLineBreaks > 0 && (secondToken === 12 || secondToken === 13)) {
        replaceContent = newLinesAndIndent();
      }
    }
    if (secondToken === 17) {
      if (options.keepLines && numberLineBreaks > 0) {
        replaceContent = newLinesAndIndent();
      } else {
        replaceContent = options.insertFinalNewline ? eol : "";
      }
    }
    const secondTokenStart = scanner.getTokenOffset() + formatTextStart;
    addEdit(replaceContent, firstTokenEnd, secondTokenStart);
    firstToken = secondToken;
  }
  return editOperations;
}
function repeat(s, count) {
  let result = "";
  for (let i = 0;i < count; i++) {
    result += s;
  }
  return result;
}
function computeIndentLevel(content, options) {
  let i = 0;
  let nChars = 0;
  const tabSize = options.tabSize || 4;
  while (i < content.length) {
    let ch = content.charAt(i);
    if (ch === cachedSpaces[1]) {
      nChars++;
    } else if (ch === "\t") {
      nChars += tabSize;
    } else {
      break;
    }
    i++;
  }
  return Math.floor(nChars / tabSize);
}
function getEOL(options, text) {
  for (let i = 0;i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text.length && text.charAt(i + 1) === `
`) {
        return `\r
`;
      }
      return "\r";
    } else if (ch === `
`) {
      return `
`;
    }
  }
  return options && options.eol || `
`;
}
function isEOL(text, offset) {
  return `\r
`.indexOf(text.charAt(offset)) !== -1;
}

// node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions) {
  ParseOptions.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
function parse(text, errors = [], options = ParseOptions.DEFAULT) {
  let currentProperty = null;
  let currentParent = [];
  const previousParents = [];
  function onValue(value) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty !== null) {
      currentParent[currentProperty] = value;
    }
  }
  const visitor = {
    onObjectBegin: () => {
      const object = {};
      onValue(object);
      previousParents.push(currentParent);
      currentParent = object;
      currentProperty = null;
    },
    onObjectProperty: (name) => {
      currentProperty = name;
    },
    onObjectEnd: () => {
      currentParent = previousParents.pop();
    },
    onArrayBegin: () => {
      const array = [];
      onValue(array);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: () => {
      currentParent = previousParents.pop();
    },
    onLiteralValue: onValue,
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text, visitor, options);
  return currentParent[0];
}
function parseTree(text, errors = [], options = ParseOptions.DEFAULT) {
  let currentParent = { type: "array", offset: -1, length: -1, children: [], parent: undefined };
  function ensurePropertyComplete(endOffset) {
    if (currentParent.type === "property") {
      currentParent.length = endOffset - currentParent.offset;
      currentParent = currentParent.parent;
    }
  }
  function onValue(valueNode) {
    currentParent.children.push(valueNode);
    return valueNode;
  }
  const visitor = {
    onObjectBegin: (offset) => {
      currentParent = onValue({ type: "object", offset, length: -1, parent: currentParent, children: [] });
    },
    onObjectProperty: (name, offset, length) => {
      currentParent = onValue({ type: "property", offset, length: -1, parent: currentParent, children: [] });
      currentParent.children.push({ type: "string", value: name, offset, length, parent: currentParent });
    },
    onObjectEnd: (offset, length) => {
      ensurePropertyComplete(offset + length);
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onArrayBegin: (offset, length) => {
      currentParent = onValue({ type: "array", offset, length: -1, parent: currentParent, children: [] });
    },
    onArrayEnd: (offset, length) => {
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onLiteralValue: (value, offset, length) => {
      onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
      ensurePropertyComplete(offset + length);
    },
    onSeparator: (sep, offset, length) => {
      if (currentParent.type === "property") {
        if (sep === ":") {
          currentParent.colonOffset = offset;
        } else if (sep === ",") {
          ensurePropertyComplete(offset);
        }
      }
    },
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text, visitor, options);
  const result = currentParent.children[0];
  if (result) {
    delete result.parent;
  }
  return result;
}
function findNodeAtLocation(root, path) {
  if (!root) {
    return;
  }
  let node = root;
  for (let segment of path) {
    if (typeof segment === "string") {
      if (node.type !== "object" || !Array.isArray(node.children)) {
        return;
      }
      let found = false;
      for (const propertyNode of node.children) {
        if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment && propertyNode.children.length === 2) {
          node = propertyNode.children[1];
          found = true;
          break;
        }
      }
      if (!found) {
        return;
      }
    } else {
      const index = segment;
      if (node.type !== "array" || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
        return;
      }
      node = node.children[index];
    }
  }
  return node;
}
function visit(text, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text, false);
  const _jsonPath = [];
  let suppressedCallbacks = 0;
  function toNoArgVisit(visitFunction) {
    return visitFunction ? () => suppressedCallbacks === 0 && visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisit(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisitWithPath(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice()) : () => true;
  }
  function toBeginVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks++;
      } else {
        let cbReturn = visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice());
        if (cbReturn === false) {
          suppressedCallbacks = 1;
        }
      }
    } : () => true;
  }
  function toEndVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks--;
      }
      if (suppressedCallbacks === 0) {
        visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter());
      }
    } : () => true;
  }
  const onObjectBegin = toBeginVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisitWithPath(visitor.onObjectProperty), onObjectEnd = toEndVisit(visitor.onObjectEnd), onArrayBegin = toBeginVisit(visitor.onArrayBegin), onArrayEnd = toEndVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
  const disallowComments = options && options.disallowComments;
  const allowTrailingComma = options && options.allowTrailingComma;
  function scanNext() {
    while (true) {
      const token = _scanner.scan();
      switch (_scanner.getTokenError()) {
        case 4:
          handleError(14);
          break;
        case 5:
          handleError(15);
          break;
        case 3:
          handleError(13);
          break;
        case 1:
          if (!disallowComments) {
            handleError(11);
          }
          break;
        case 2:
          handleError(12);
          break;
        case 6:
          handleError(16);
          break;
      }
      switch (token) {
        case 12:
        case 13:
          if (disallowComments) {
            handleError(10);
          } else {
            onComment();
          }
          break;
        case 16:
          handleError(1);
          break;
        case 15:
        case 14:
          break;
        default:
          return token;
      }
    }
  }
  function handleError(error, skipUntilAfter = [], skipUntil = []) {
    onError(error);
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = _scanner.getToken();
      while (token !== 17) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext();
          break;
        } else if (skipUntil.indexOf(token) !== -1) {
          break;
        }
        token = scanNext();
      }
    }
  }
  function parseString(isValue) {
    const value = _scanner.getTokenValue();
    if (isValue) {
      onLiteralValue(value);
    } else {
      onObjectProperty(value);
      _jsonPath.push(value);
    }
    scanNext();
    return true;
  }
  function parseLiteral() {
    switch (_scanner.getToken()) {
      case 11:
        const tokenValue = _scanner.getTokenValue();
        let value = Number(tokenValue);
        if (isNaN(value)) {
          handleError(2);
          value = 0;
        }
        onLiteralValue(value);
        break;
      case 7:
        onLiteralValue(null);
        break;
      case 8:
        onLiteralValue(true);
        break;
      case 9:
        onLiteralValue(false);
        break;
      default:
        return false;
    }
    scanNext();
    return true;
  }
  function parseProperty() {
    if (_scanner.getToken() !== 10) {
      handleError(3, [], [2, 5]);
      return false;
    }
    parseString(false);
    if (_scanner.getToken() === 6) {
      onSeparator(":");
      scanNext();
      if (!parseValue()) {
        handleError(4, [], [2, 5]);
      }
    } else {
      handleError(5, [], [2, 5]);
    }
    _jsonPath.pop();
    return true;
  }
  function parseObject() {
    onObjectBegin();
    scanNext();
    let needsComma = false;
    while (_scanner.getToken() !== 2 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 2 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (!parseProperty()) {
        handleError(4, [], [2, 5]);
      }
      needsComma = true;
    }
    onObjectEnd();
    if (_scanner.getToken() !== 2) {
      handleError(7, [2], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseArray() {
    onArrayBegin();
    scanNext();
    let isFirstElement = true;
    let needsComma = false;
    while (_scanner.getToken() !== 4 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 4 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (isFirstElement) {
        _jsonPath.push(0);
        isFirstElement = false;
      } else {
        _jsonPath[_jsonPath.length - 1]++;
      }
      if (!parseValue()) {
        handleError(4, [], [4, 5]);
      }
      needsComma = true;
    }
    onArrayEnd();
    if (!isFirstElement) {
      _jsonPath.pop();
    }
    if (_scanner.getToken() !== 4) {
      handleError(8, [4], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseValue() {
    switch (_scanner.getToken()) {
      case 3:
        return parseArray();
      case 1:
        return parseObject();
      case 10:
        return parseString(true);
      default:
        return parseLiteral();
    }
  }
  scanNext();
  if (_scanner.getToken() === 17) {
    if (options.allowEmptyContent) {
      return true;
    }
    handleError(4, [], []);
    return false;
  }
  if (!parseValue()) {
    handleError(4, [], []);
    return false;
  }
  if (_scanner.getToken() !== 17) {
    handleError(9, [], []);
  }
  return true;
}
function getNodeType(value) {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object": {
      if (!value) {
        return "null";
      } else if (Array.isArray(value)) {
        return "array";
      }
      return "object";
    }
    default:
      return "null";
  }
}

// node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/edit.js
function setProperty(text, originalPath, value, options) {
  const path = originalPath.slice();
  const errors = [];
  const root = parseTree(text, errors);
  let parent = undefined;
  let lastSegment = undefined;
  while (path.length > 0) {
    lastSegment = path.pop();
    parent = findNodeAtLocation(root, path);
    if (parent === undefined && value !== undefined) {
      if (typeof lastSegment === "string") {
        value = { [lastSegment]: value };
      } else {
        value = [value];
      }
    } else {
      break;
    }
  }
  if (!parent) {
    if (value === undefined) {
      throw new Error("Can not delete in empty document");
    }
    return withFormatting(text, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, options);
  } else if (parent.type === "object" && typeof lastSegment === "string" && Array.isArray(parent.children)) {
    const existing = findNodeAtLocation(parent, [lastSegment]);
    if (existing !== undefined) {
      if (value === undefined) {
        if (!existing.parent) {
          throw new Error("Malformed AST");
        }
        const propertyIndex = parent.children.indexOf(existing.parent);
        let removeBegin;
        let removeEnd = existing.parent.offset + existing.parent.length;
        if (propertyIndex > 0) {
          let previous = parent.children[propertyIndex - 1];
          removeBegin = previous.offset + previous.length;
        } else {
          removeBegin = parent.offset + 1;
          if (parent.children.length > 1) {
            let next = parent.children[1];
            removeEnd = next.offset;
          }
        }
        return withFormatting(text, { offset: removeBegin, length: removeEnd - removeBegin, content: "" }, options);
      } else {
        return withFormatting(text, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, options);
      }
    } else {
      if (value === undefined) {
        return [];
      }
      const newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value)}`;
      const index = options.getInsertionIndex ? options.getInsertionIndex(parent.children.map((p) => p.children[0].value)) : parent.children.length;
      let edit;
      if (index > 0) {
        let previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      } else if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty + "," };
      }
      return withFormatting(text, edit, options);
    }
  } else if (parent.type === "array" && typeof lastSegment === "number" && Array.isArray(parent.children)) {
    const insertIndex = lastSegment;
    if (insertIndex === -1) {
      const newProperty = `${JSON.stringify(value)}`;
      let edit;
      if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        const previous = parent.children[parent.children.length - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text, edit, options);
    } else if (value === undefined && parent.children.length >= 0) {
      const removalIndex = lastSegment;
      const toRemove = parent.children[removalIndex];
      let edit;
      if (parent.children.length === 1) {
        edit = { offset: parent.offset + 1, length: parent.length - 2, content: "" };
      } else if (parent.children.length - 1 === removalIndex) {
        let previous = parent.children[removalIndex - 1];
        let offset = previous.offset + previous.length;
        let parentEndOffset = parent.offset + parent.length;
        edit = { offset, length: parentEndOffset - 2 - offset, content: "" };
      } else {
        edit = { offset: toRemove.offset, length: parent.children[removalIndex + 1].offset - toRemove.offset, content: "" };
      }
      return withFormatting(text, edit, options);
    } else if (value !== undefined) {
      let edit;
      const newProperty = `${JSON.stringify(value)}`;
      if (!options.isArrayInsertion && parent.children.length > lastSegment) {
        const toModify = parent.children[lastSegment];
        edit = { offset: toModify.offset, length: toModify.length, content: newProperty };
      } else if (parent.children.length === 0 || lastSegment === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: parent.children.length === 0 ? newProperty : newProperty + "," };
      } else {
        const index = lastSegment > parent.children.length ? parent.children.length : lastSegment;
        const previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text, edit, options);
    } else {
      throw new Error(`Can not ${value === undefined ? "remove" : options.isArrayInsertion ? "insert" : "modify"} Array index ${insertIndex} as length is not sufficient`);
    }
  } else {
    throw new Error(`Can not add ${typeof lastSegment !== "number" ? "index" : "property"} to parent of type ${parent.type}`);
  }
}
function withFormatting(text, edit, options) {
  if (!options.formattingOptions) {
    return [edit];
  }
  let newText = applyEdit(text, edit);
  let begin = edit.offset;
  let end = edit.offset + edit.content.length;
  if (edit.length === 0 || edit.content.length === 0) {
    while (begin > 0 && !isEOL(newText, begin - 1)) {
      begin--;
    }
    while (end < newText.length && !isEOL(newText, end)) {
      end++;
    }
  }
  const edits = format(newText, { offset: begin, length: end - begin }, { ...options.formattingOptions, keepLines: false });
  for (let i = edits.length - 1;i >= 0; i--) {
    const edit = edits[i];
    newText = applyEdit(newText, edit);
    begin = Math.min(begin, edit.offset);
    end = Math.max(end, edit.offset + edit.length);
    end += edit.content.length - edit.length;
  }
  const editLength = text.length - (newText.length - end) - begin;
  return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text, edit) {
  return text.substring(0, edit.offset) + edit.content + text.substring(edit.offset + edit.length);
}

// node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js
var ScanError;
(function(ScanError) {
  ScanError[ScanError["None"] = 0] = "None";
  ScanError[ScanError["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError[ScanError["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError[ScanError["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError[ScanError["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError[ScanError["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError[ScanError["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
var SyntaxKind;
(function(SyntaxKind) {
  SyntaxKind[SyntaxKind["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind[SyntaxKind["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind[SyntaxKind["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind[SyntaxKind["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind[SyntaxKind["CommaToken"] = 5] = "CommaToken";
  SyntaxKind[SyntaxKind["ColonToken"] = 6] = "ColonToken";
  SyntaxKind[SyntaxKind["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind[SyntaxKind["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind[SyntaxKind["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind[SyntaxKind["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind[SyntaxKind["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind[SyntaxKind["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind[SyntaxKind["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind[SyntaxKind["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind[SyntaxKind["Trivia"] = 15] = "Trivia";
  SyntaxKind[SyntaxKind["Unknown"] = 16] = "Unknown";
  SyntaxKind[SyntaxKind["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
var parse2 = parse;
var ParseErrorCode;
(function(ParseErrorCode) {
  ParseErrorCode[ParseErrorCode["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode[ParseErrorCode["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode[ParseErrorCode["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode[ParseErrorCode["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode[ParseErrorCode["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode[ParseErrorCode["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode[ParseErrorCode["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode[ParseErrorCode["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode[ParseErrorCode["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode[ParseErrorCode["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode[ParseErrorCode["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode[ParseErrorCode["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode[ParseErrorCode["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode[ParseErrorCode["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode[ParseErrorCode["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode[ParseErrorCode["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));
function modify(text, path, value, options) {
  return setProperty(text, path, value, options);
}
function applyEdits(text, edits) {
  let sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text.length;
  for (let i = sortedEdits.length - 1;i >= 0; i--) {
    let e = sortedEdits[i];
    if (e.offset + e.length <= lastModifiedOffset) {
      text = applyEdit(text, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text;
}

// packages/why-override/src/prompt.js
import { clearLine, cursorTo, moveCursor } from "node:readline";

// packages/why-override/src/store.js
import { readFileSync as readFileSync2 } from "node:fs";

// packages/why-override/src/selectors.js
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
function collectOverrideSelectors(overrides, parentPath = []) {
  const selectors = [];
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const selector = [...parentPath, key];
    if (key.includes("*")) {
      console.warn(`Warning: unsupported wildcard override selector ${JSON.stringify(selector)}; skipping.`);
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      selectors.push(...collectOverrideSelectors(value, selector));
    } else if (typeof value === "string") {
      selectors.push(selector);
    }
  }
  return selectors;
}
function selectorKey(selector) {
  return JSON.stringify(selector);
}
function formatSelector(selector) {
  return selector.map((segment) => JSON.stringify(segment)).join(" > ");
}
function packageNameFromSegment(segment) {
  const versionAt = segment.indexOf("@", segment.startsWith("@") ? 1 : 0);
  return versionAt > 0 ? segment.slice(0, versionAt) : segment;
}
function getInstalledInfo(selector, workspaceRoot) {
  const segments = selector.filter((segment) => segment !== ".");
  const name = packageNameFromSegment(segments.at(-1) ?? "");
  const packageDir = resolve(workspaceRoot, "node_modules", name);
  try {
    const { version } = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));
    return { name, version, installedAt: statSync(packageDir).mtime };
  } catch {
    return { name };
  }
}
function formatInstalledAt(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const elapsedMinutes = Math.max(0, (Date.now() - date.getTime()) / 60000);
  const relative = elapsedMinutes < 1 ? "just now" : elapsedMinutes < 60 ? `${Math.floor(elapsedMinutes)}m ago` : elapsedMinutes < 60 * 24 ? `${Math.floor(elapsedMinutes / 60)}h ago` : `${Math.floor(elapsedMinutes / (60 * 24))}d ago`;
  return `${stamp} (${relative})`;
}
function getOverrideTarget(manifest, selector) {
  let value = manifest.overrides;
  for (const segment of selector) {
    value = value?.[segment];
  }
  return typeof value === "string" ? value : undefined;
}

// packages/why-override/src/store.js
function getRecordSelector(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return;
  }
  if (typeof record.selector === "string" && record.selector.length > 0) {
    return [record.selector];
  }
  if (Array.isArray(record.selector) && record.selector.length > 0 && record.selector.every((segment) => typeof segment === "string" && segment.length > 0)) {
    return record.selector;
  }
  return;
}
function isUtcTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
function isValidReasonRecord(record) {
  const selector = getRecordSelector(record);
  if (selector === undefined || typeof record.reason === "string" && record.reason.trim() === "" || typeof record.reason !== "string" || !isUtcTimestamp(record.createdAt) || !isUtcTimestamp(record.updatedAt)) {
    return false;
  }
  if (record.target !== undefined && typeof record.target !== "string") {
    return false;
  }
  if (record.workspaces !== undefined && (!Array.isArray(record.workspaces) || record.workspaces.length === 0 || !record.workspaces.every((workspace) => typeof workspace === "string" && workspace.length > 0))) {
    return false;
  }
  return true;
}
function getPromptTimeoutSeconds(manifest) {
  const defaultTimeout = 10;
  const envTimeout = process.env.OVERRIDE_TIMEOUT;
  const projectTimeout = manifest.config?.["why-override"]?.timeout;
  const configured = envTimeout !== undefined ? envTimeout : projectTimeout;
  if (configured === undefined) {
    return defaultTimeout;
  }
  const timeoutSeconds = Number(configured);
  if ((typeof configured === "string" || typeof configured === "number") && Number.isFinite(timeoutSeconds) && Number.isInteger(timeoutSeconds) && timeoutSeconds > 0) {
    return timeoutSeconds;
  }
  console.warn(`Warning: invalid override prompt timeout ${JSON.stringify(configured)}; using default ${defaultTimeout} seconds.`);
  return defaultTimeout;
}
function getExistingReasons(reasonDocument) {
  const reasons = [];
  const seen = new Set;
  for (const record of reasonDocument?.reasons ?? []) {
    if (isValidReasonRecord(record) && typeof record.reason === "string" && record.reason.trim() !== "") {
      const trimmed = record.reason.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        reasons.push(trimmed);
      }
    }
  }
  return reasons;
}
function loadReasonStore(reasonStorePath, reasonStoreFilename) {
  let reasonText = "";
  let reasonStoreMissing = false;
  try {
    reasonText = readFileSync2(reasonStorePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      reasonStoreMissing = true;
    } else {
      throw error;
    }
  }
  const parseErrors = [];
  let reasonDocument = reasonStoreMissing ? undefined : parse2(reasonText, parseErrors, { allowTrailingComma: true });
  let reasonStoreWritable = true;
  if (reasonStoreMissing) {
    warnDiagnostic(`${reasonStoreFilename} is missing; it will be created when you save a reason.`);
    reasonDocument = { version: 1, reasons: [] };
    reasonText = `${JSON.stringify(reasonDocument, null, 2)}
`;
  } else if (parseErrors.length > 0 || !Array.isArray(reasonDocument?.reasons)) {
    warnDiagnostic(`${reasonStoreFilename} is malformed; saved reasons cannot be read or updated.`);
    reasonDocument = { version: 1, reasons: [] };
    reasonStoreWritable = false;
  }
  return {
    reasonText,
    reasonDocument,
    reasonStoreMissing,
    reasonStoreWritable
  };
}
function validateReasons({
  reasonDocument,
  selectors,
  manifest,
  minimumReviewAgeMs = 30 * 24 * 60 * 60 * 1000
}) {
  const activeSelectorKeys = new Set(selectors.map(selectorKey));
  const reasonsBySelector = new Map;
  const workspacesBySelector = new Map;
  for (const record of reasonDocument.reasons) {
    const selector = getRecordSelector(record);
    const displaySelector = selector ? formatSelector(selector) : "unknown selector";
    if (!isValidReasonRecord(record)) {
      warnDiagnostic(`malformed override reason record for ${displaySelector}; treating it as undocumented and preserving the record.`);
      continue;
    }
    const key = selectorKey(selector);
    if (!activeSelectorKeys.has(key)) {
      warnDiagnostic(`stale override reason for ${displaySelector}; preserving the record.`);
      continue;
    }
    reasonsBySelector.set(key, record.reason);
    if (Array.isArray(record.workspaces) && record.workspaces.length > 0) {
      workspacesBySelector.set(key, ` [workspaces: ${record.workspaces.join(", ")}]`);
    }
    const currentTarget = getOverrideTarget(manifest, selector);
    if (record.target !== undefined && currentTarget !== undefined && record.target !== currentTarget) {
      warnDiagnostic(`override target for ${displaySelector} changed from "${record.target}" to "${currentTarget}".`);
    }
    if (Date.now() - Date.parse(record.updatedAt) >= minimumReviewAgeMs) {
      warnDiagnostic(`Review this override rationale for ${displaySelector}; it was last updated ${record.updatedAt}.`);
    }
  }
  return { reasonsBySelector, workspacesBySelector };
}

// packages/why-override/src/prompt.js
function debounce(fn, waitMs = 300) {
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
async function promptWithCountdown({
  promptInterface,
  promptTimeoutSeconds,
  formatQuestion,
  timeoutMessage
}) {
  if (!promptInterface) {
    return;
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
    process.stdout.write("\x1B7");
    moveCursor(process.stdout, 0, -rowsBelowQuestion);
    cursorTo(process.stdout, 0);
    clearLine(process.stdout, 0);
    process.stdout.write(formatQuestion(secondsLeft));
    process.stdout.write("\x1B8");
  };
  let resolveTimeoutPromise;
  const timeoutPromise = new Promise((resolve) => {
    resolveTimeoutPromise = resolve;
  });
  const armTimeout = () => {
    clearTimeout(timeoutHandle);
    const msRemaining = Math.max(0, deadline - Date.now());
    timeoutHandle = setTimeout(() => resolveTimeoutPromise(timeoutToken), msRemaining);
  };
  armTimeout();
  if (process.stdout.isTTY) {
    countdownHandle = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
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
    const questionPromise = promptInterface.question(`${formatQuestion(promptTimeoutSeconds)}
`).catch(() => closeToken);
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
    return;
  }
  if (response === closeToken) {
    return;
  }
  return response;
}
async function askForExplanation({
  promptInterface,
  promptTimeoutSeconds,
  reasonDocument,
  displaySelector
}) {
  if (!promptInterface) {
    return;
  }
  const existingReasons = getExistingReasons(reasonDocument);
  if (existingReasons.length > 0) {
    console.log("Existing reasons:");
    existingReasons.forEach((reason, index) => {
      console.log(`  ${index + 1}) ${reason}`);
    });
    console.log(color.dim(`Type a reason, or enter 1-${existingReasons.length} to select an existing one.`));
  }
  const formatQuestion = (secondsLeft) => `${color.cyan("Why do you need to override this?")} ${color.yellow(color.bold(displaySelector))} ${color.dim(`(auto-skips in ${secondsLeft}s)`)}`;
  const timeoutMessage = `Timed out after ${promptTimeoutSeconds} seconds; skipping ${displaySelector}.`;
  const response = await promptWithCountdown({
    promptInterface,
    promptTimeoutSeconds,
    formatQuestion,
    timeoutMessage
  });
  if (response === undefined) {
    return;
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

// packages/why-override/src/refresh.js
import { writeFileSync } from "node:fs";

// packages/why-override/src/selection.js
function parsePackageSelection(input, selectors) {
  const trimmed = input.trim();
  if (trimmed === "") {
    return [];
  }
  if (trimmed.toLowerCase() === "all" || trimmed === "*") {
    return [...selectors];
  }
  const exactIndex = selectors.findIndex((sel) => formatSelector(sel) === trimmed || formatSelector(sel).replace(/"/g, "") === trimmed || sel.join(" > ") === trimmed);
  if (exactIndex >= 0) {
    return [selectors[exactIndex]];
  }
  const selectedIndices = new Set;
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end > selectors.length || start > end) {
        return;
      }
      for (let i = start;i <= end; i++) {
        selectedIndices.add(i - 1);
      }
    } else {
      const singleMatch = token.match(/^#?(\d+)$/);
      if (singleMatch) {
        const index = Number(singleMatch[1]) - 1;
        if (index < 0 || index >= selectors.length) {
          return;
        }
        selectedIndices.add(index);
      } else {
        const unquoted = token.replace(/^["']|["']$/g, "");
        const matchedIndex = selectors.findIndex((sel) => sel.includes(unquoted) || formatSelector(sel).replace(/"/g, "") === unquoted);
        if (matchedIndex >= 0) {
          selectedIndices.add(matchedIndex);
        } else {
          return;
        }
      }
    }
  }
  if (selectedIndices.size === 0) {
    return;
  }
  return selectors.filter((_, idx) => selectedIndices.has(idx));
}
async function askForPackageSelection({
  promptInterface,
  promptTimeoutSeconds,
  selectors,
  reasonsBySelector
}) {
  if (!promptInterface) {
    return;
  }
  console.log("Select package(s) to refresh:");
  selectors.forEach((selector, index) => {
    const key = selectorKey(selector);
    const existing = reasonsBySelector.get(key);
    const reasonPreview = existing ? color.dim(` (${existing.trim()})`) : "";
    console.log(`  ${index + 1}) ${color.bold(formatSelector(selector))}${reasonPreview}`);
  });
  console.log(color.dim(`Enter package number(s) separated by commas (e.g. 1, 2), a range (e.g. 1-${selectors.length}), or 'all'. Press Enter to cancel.`));
  while (true) {
    const formatQuestion = (secondsLeft) => `${color.cyan("Which package(s) do you want to refresh?")} ${color.dim(`(auto-skips in ${secondsLeft}s)`)}`;
    const timeoutMessage = `Timed out after ${promptTimeoutSeconds} seconds; skipping refresh.`;
    const response = await promptWithCountdown({
      promptInterface,
      promptTimeoutSeconds,
      formatQuestion,
      timeoutMessage
    });
    if (response === undefined) {
      return;
    }
    if (response.trim() === "") {
      console.log("No packages selected; skipping.");
      return;
    }
    const selected = parsePackageSelection(response, selectors);
    if (selected && selected.length > 0) {
      return selected;
    }
    console.warn(color.yellow(`Invalid selection "${response.trim()}". Please enter numbers 1-${selectors.length}, ranges, or 'all'.`));
  }
}

// packages/why-override/src/refresh.js
function updateSelectorReason(context, selector, explanation) {
  const { manifest, reasonDocument, reasonsBySelector, reasonStorePath } = context;
  const key = selectorKey(selector);
  const recordIndex = reasonDocument.reasons.findLastIndex((record) => isValidReasonRecord(record) && selectorKey(getRecordSelector(record)) === key);
  const displaySelector = formatSelector(selector);
  const currentTarget = getOverrideTarget(manifest, selector);
  const formattingOptions = {
    formattingOptions: { insertSpaces: true, tabSize: 2 }
  };
  if (recordIndex >= 0) {
    const record = reasonDocument.reasons[recordIndex];
    const targetChanged = currentTarget !== undefined && currentTarget !== record.target;
    if (explanation === record.reason && !targetChanged) {
      console.log(`Reason unchanged for ${displaySelector}.`);
      return false;
    }
    const updatedAt = new Date().toISOString();
    context.reasonText = applyEdits(context.reasonText, modify(context.reasonText, ["reasons", recordIndex, "reason"], explanation, formattingOptions));
    context.reasonText = applyEdits(context.reasonText, modify(context.reasonText, ["reasons", recordIndex, "updatedAt"], updatedAt, formattingOptions));
    if (currentTarget !== undefined) {
      context.reasonText = applyEdits(context.reasonText, modify(context.reasonText, ["reasons", recordIndex, "target"], currentTarget, formattingOptions));
    }
    record.reason = explanation;
    record.updatedAt = updatedAt;
    if (currentTarget !== undefined) {
      record.target = currentTarget;
    }
    reasonsBySelector.set(key, explanation);
    console.log(`Refreshed reason for ${displaySelector}.`);
    return true;
  }
  const timestamp = new Date().toISOString();
  const record = {
    selector,
    reason: explanation,
    ...currentTarget !== undefined ? { target: currentTarget } : {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const edits = modify(context.reasonText, ["reasons", reasonDocument.reasons.length], record, formattingOptions);
  context.reasonText = applyEdits(context.reasonText, edits);
  if (context.reasonStoreMissing) {
    console.log(`Created ${reasonStorePath}.`);
    context.reasonStoreMissing = false;
  }
  reasonDocument.reasons.push(record);
  reasonsBySelector.set(key, explanation);
  console.log(`Refreshed reason for ${displaySelector}.`);
  return true;
}
async function refreshReason(context, selector) {
  const { reasonDocument, promptInterface, reasonStorePath } = context;
  const key = selectorKey(selector);
  const recordIndex = reasonDocument.reasons.findLastIndex((record) => isValidReasonRecord(record) && selectorKey(getRecordSelector(record)) === key);
  const displaySelector = formatSelector(selector);
  if (recordIndex < 0) {
    console.error(`No saved reason exists for ${displaySelector}.`);
    process.exitCode = 1;
    return;
  }
  if (!promptInterface) {
    console.error("Refreshing a reason requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }
  const explanation = await askForExplanation({
    promptInterface,
    promptTimeoutSeconds: context.promptTimeoutSeconds,
    reasonDocument,
    displaySelector
  });
  if (explanation === undefined || explanation === "") {
    return;
  }
  const changed = updateSelectorReason(context, selector, explanation);
  if (changed) {
    writeFileSync(reasonStorePath, context.reasonText);
  }
}
async function refreshInteractive(context) {
  const {
    promptInterface,
    selectors,
    reasonsBySelector,
    promptTimeoutSeconds,
    reasonDocument,
    reasonStorePath,
    reasonStoreFilename
  } = context;
  if (!promptInterface) {
    console.error("Refreshing a reason requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }
  if (selectors.length === 0) {
    console.log("No overrides found.");
    return;
  }
  const selectedSelectors = await askForPackageSelection({
    promptInterface,
    promptTimeoutSeconds,
    selectors,
    reasonsBySelector
  });
  if (!selectedSelectors || selectedSelectors.length === 0) {
    return;
  }
  const displaySelector = selectedSelectors.map(formatSelector).join(", ");
  const explanation = await askForExplanation({
    promptInterface,
    promptTimeoutSeconds,
    reasonDocument,
    displaySelector
  });
  if (explanation === undefined || explanation === "") {
    return;
  }
  let anyChanged = false;
  for (const selector of selectedSelectors) {
    const changed = updateSelectorReason(context, selector, explanation);
    if (changed) {
      anyChanged = true;
    }
  }
  if (anyChanged) {
    writeFileSync(reasonStorePath, context.reasonText);
  }
  console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
}

// packages/why-override/src/table.js
function wrapText(text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let remaining = word;
    while (remaining.length > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    if (!line) {
      line = remaining;
    } else if (line.length + 1 + remaining.length <= width) {
      line += ` ${remaining}`;
    } else {
      lines.push(line);
      line = remaining;
    }
  }
  if (line || lines.length === 0) {
    lines.push(line);
  }
  return lines;
}
function printOverrideTable(entries, workspaceRoot, manifest) {
  if (entries.length === 0) {
    return;
  }
  const headers = [
    "Package",
    "Override",
    "Installed",
    "Last installed",
    "Reason"
  ];
  const rows = entries.map(({ selector, reason }) => {
    const target = getOverrideTarget(manifest, selector) ?? "";
    const installed = getInstalledInfo(selector, workspaceRoot);
    const versionStyle = installed.version === undefined ? color.dim : installed.version === target ? color.green : color.yellow;
    return [
      { text: formatSelector(selector), style: color.bold },
      { text: target, style: color.magenta },
      { text: installed.version ?? "not installed", style: versionStyle },
      {
        text: installed.installedAt ? formatInstalledAt(installed.installedAt) : "-",
        style: color.dim
      },
      { text: reason.trim(), style: (text) => text }
    ];
  });
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => column === 4 ? 0 : row[column].text.length)));
  const fixedWidth = widths.slice(0, 4).reduce((sum, width) => sum + width + 3, 0) + 4;
  const longestReason = Math.max(headers[4].length, ...rows.map((row) => row[4].text.length));
  widths[4] = process.stdout.isTTY && process.stdout.columns ? Math.max(20, Math.min(longestReason, process.stdout.columns - fixedWidth)) : longestReason;
  const border = (left, middle, right) => color.dim(`${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`);
  const bar = color.dim("│");
  const renderLine = (cells) => `${bar}${cells.map(({ text, style }, column) => ` ${style(text)}${" ".repeat(widths[column] - text.length)} `).join(bar)}${bar}`;
  const output = [
    border("┌", "┬", "┐"),
    renderLine(headers.map((text) => ({ text, style: color.cyan }))),
    border("├", "┼", "┤")
  ];
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      output.push(border("├", "┼", "┤"));
    }
    const reasonLines = wrapText(row[4].text, widths[4]);
    reasonLines.forEach((reasonLine, index) => {
      output.push(renderLine(row.map((cell, column) => column === 4 ? { text: reasonLine, style: cell.style } : index === 0 ? cell : { text: "", style: cell.style })));
    });
  });
  output.push(border("└", "┴", "┘"));
  console.log(output.join(`
`));
  for (const entry of entries) {
    if (entry.workspacesText) {
      console.log(`Override ${formatSelector(entry.selector)}${entry.workspacesText}: ${entry.reason}`);
    }
  }
}

// packages/why-override/src/enforce.js
async function runEnforce(context, isReenter) {
  const {
    selectors,
    reasonsBySelector,
    workspacesBySelector,
    workspaceRoot,
    manifest,
    promptInterface,
    promptTimeoutSeconds,
    reasonDocument,
    reasonStorePath,
    reasonStoreFilename
  } = context;
  printOverrideTable(selectors.map((selector) => {
    const key = selectorKey(selector);
    return {
      selector,
      reason: reasonsBySelector.get(key),
      workspacesText: workspacesBySelector.get(key)
    };
  }).filter(({ reason }) => typeof reason === "string" && reason.trim() !== ""), workspaceRoot, manifest);
  for (const selector of selectors) {
    const key = selectorKey(selector);
    const displaySelector = formatSelector(selector);
    const reason = reasonsBySelector.get(key);
    if (typeof reason === "string" && reason.trim() !== "") {
      if (isReenter) {
        await refreshReason(context, selector);
      }
      continue;
    }
    if (!promptInterface) {
      continue;
    }
    const explanation = await askForExplanation({
      promptInterface,
      promptTimeoutSeconds,
      reasonDocument,
      displaySelector
    });
    if (explanation === undefined) {
      break;
    }
    if (explanation === "") {
      continue;
    }
    if (!context.reasonStoreWritable) {
      warnDiagnostic(`cannot save a reason for ${displaySelector} because the reason store is malformed; leaving it unchanged.`);
      continue;
    }
    const timestamp = new Date().toISOString();
    const currentTarget = getOverrideTarget(manifest, selector);
    const record = {
      selector,
      reason: explanation,
      ...currentTarget !== undefined ? { target: currentTarget } : {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const edits = modify(context.reasonText, ["reasons", reasonDocument.reasons.length], record, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
    context.reasonText = applyEdits(context.reasonText, edits);
    writeFileSync2(reasonStorePath, context.reasonText);
    if (context.reasonStoreMissing) {
      console.log(`Created ${reasonStorePath}.`);
      context.reasonStoreMissing = false;
    }
    reasonDocument.reasons.push(record);
    reasonsBySelector.set(key, explanation);
  }
  if (selectors.length > 0) {
    console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
  }
}

// packages/why-override/src/workspace.js
import { existsSync, readFileSync as readFileSync3 } from "node:fs";
import { dirname, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
function findWorkspaceRoot() {
  let currentDir = resolve2(process.cwd());
  let nearestManifestDir;
  let workspaceRootDir;
  while (true) {
    const manifestPath = resolve2(currentDir, "package.json");
    if (existsSync(manifestPath)) {
      nearestManifestDir ??= currentDir;
      try {
        const parsed = JSON.parse(readFileSync3(manifestPath, "utf8"));
        if (parsed?.workspaces !== undefined) {
          workspaceRootDir = currentDir;
        }
      } catch {}
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return workspaceRootDir ?? nearestManifestDir ?? resolve2(dirname(fileURLToPath(import.meta.url)), "../../..");
}
function findReasonStorePath(root) {
  const dotPath = resolve2(root, ".override-reasons.jsonc");
  if (existsSync(dotPath)) {
    return dotPath;
  }
  const regularPath = resolve2(root, "override-reasons.jsonc");
  if (existsSync(regularPath)) {
    return regularPath;
  }
  return dotPath;
}

// packages/why-override/src/cli.js
var workspaceRoot = findWorkspaceRoot();
var manifest = JSON.parse(readFileSync4(resolve3(workspaceRoot, "package.json"), "utf8"));
var reasonStorePath = findReasonStorePath(workspaceRoot);
var reasonStoreFilename = basename(reasonStorePath);
var storeData = loadReasonStore(reasonStorePath, reasonStoreFilename);
var { reasonDocument, reasonStoreMissing, reasonStoreWritable } = storeData;
var promptTimeoutSeconds = getPromptTimeoutSeconds(manifest);
var promptInterface = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
var selectors = collectOverrideSelectors(manifest.overrides);
var { reasonsBySelector, workspacesBySelector } = validateReasons({
  reasonDocument,
  selectors,
  manifest
});
var context = {
  workspaceRoot,
  manifest,
  reasonStorePath,
  reasonStoreFilename,
  reasonText: storeData.reasonText,
  reasonDocument,
  reasonStoreMissing,
  reasonStoreWritable,
  promptTimeoutSeconds,
  promptInterface,
  selectors,
  reasonsBySelector,
  workspacesBySelector
};
try {
  if (process.argv[2] === "refresh") {
    if (process.argv[3] === "--all" || process.argv[3] === "-a") {
      for (const selector of selectors) {
        await refreshReason(context, selector);
      }
      if (selectors.length > 0) {
        console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
      }
    } else if (process.argv.length === 3) {
      await refreshInteractive(context);
    } else {
      let selector;
      try {
        selector = JSON.parse(process.argv[3] ?? "");
      } catch {
        selector = undefined;
      }
      const isSingle = Array.isArray(selector) && selector.length > 0 && selector.every((seg) => typeof seg === "string" && seg.length > 0);
      const isMulti = Array.isArray(selector) && selector.length > 0 && selector.every((item) => Array.isArray(item) && item.length > 0 && item.every((seg) => typeof seg === "string" && seg.length > 0));
      if (process.argv.length !== 4 || !isSingle && !isMulti) {
        console.error(`Usage: why-override refresh '["package", "nested-selector"]' or why-override refresh --all`);
        process.exitCode = 1;
      } else if (isSingle) {
        await refreshReason(context, selector);
        console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
      } else if (isMulti) {
        const displaySelector = selector.map(formatSelector).join(", ");
        const explanation = await askForExplanation({
          promptInterface,
          promptTimeoutSeconds,
          reasonDocument,
          displaySelector
        });
        if (explanation !== undefined && explanation !== "") {
          let anyChanged = false;
          for (const item of selector) {
            if (updateSelectorReason(context, item, explanation)) {
              anyChanged = true;
            }
          }
          if (anyChanged) {
            writeFileSync3(reasonStorePath, context.reasonText);
          }
        }
        console.log(color.dim(`Note: please check ${reasonStoreFilename} if you want to check and edit reasons manually.`));
      }
    }
  } else {
    const isReenter = process.argv.includes("--reenter") || process.argv.includes("--re-enter");
    await runEnforce(context, isReenter);
  }
} finally {
  promptInterface?.close();
}
