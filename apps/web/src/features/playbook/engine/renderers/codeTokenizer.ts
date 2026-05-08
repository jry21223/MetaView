export type TokenKind = "keyword" | "string" | "number" | "comment" | "operator" | "text";

export interface Token {
  kind: TokenKind;
  text: string;
}

const JS_KEYWORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "export", "extends", "finally", "for", "function",
  "if", "import", "in", "instanceof", "let", "new", "of", "return", "static",
  "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while",
  "with", "yield", "async", "await", "from", "true", "false", "null", "undefined",
  "type", "interface", "enum", "implements", "abstract", "readonly",
]);

const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await",
  "break", "class", "continue", "def", "del", "elif", "else", "except",
  "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
  "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new", "null",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "true", "false",
  "var", "record", "sealed", "permits", "yield",
]);

const GO_KEYWORDS = new Set([
  "break", "case", "chan", "const", "continue", "default", "defer", "else",
  "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
  "map", "package", "range", "return", "select", "struct", "switch", "type",
  "var", "nil", "true", "false",
]);

const C_KEYWORDS = new Set([
  "auto", "break", "case", "char", "class", "const", "continue", "default",
  "delete", "do", "double", "else", "enum", "explicit", "extern", "false",
  "float", "for", "friend", "goto", "if", "inline", "int", "long",
  "mutable", "namespace", "new", "nullptr", "operator", "private", "protected",
  "public", "register", "return", "short", "signed", "sizeof", "static",
  "struct", "switch", "template", "this", "throw", "true", "try", "typedef",
  "union", "unsigned", "using", "virtual", "void", "volatile", "while",
]);

const KEYWORDS_BY_LANG: Record<string, Set<string>> = {
  javascript: JS_KEYWORDS,
  typescript: JS_KEYWORDS,
  js: JS_KEYWORDS,
  ts: JS_KEYWORDS,
  python: PYTHON_KEYWORDS,
  py: PYTHON_KEYWORDS,
  java: JAVA_KEYWORDS,
  go: GO_KEYWORDS,
  golang: GO_KEYWORDS,
  c: C_KEYWORDS,
  cpp: C_KEYWORDS,
  "c++": C_KEYWORDS,
  "c/c++": C_KEYWORDS,
};

function langComment(lang: string): RegExp {
  return lang === "python" || lang === "py"
    ? /^#.*/
    : /^\/\/.*/;
}

const RE_STRING_DOUBLE = /^"(?:[^"\\]|\\.)*"/;
const RE_STRING_SINGLE = /^'(?:[^'\\]|\\.)*'/;
const RE_STRING_TRIPLE = /^"""[\s\S]*?"""/;
const RE_NUMBER = /^\b\d+(?:\.\d+)?\b/;
const RE_OPERATOR = /^[=+\-*/<>!&|^%~?:]+/;
const RE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const RE_PUNCT = /^[^\w\s"'#/=+\-*<>!&|^%~?:]+/;
const RE_WS = /^\s+/;

export function tokenize(line: string, language: string): Token[] {
  const lang = language.toLowerCase().trim();
  const keywords = KEYWORDS_BY_LANG[lang] ?? new Set<string>();
  const commentRe = langComment(lang);
  const isPython = lang === "python" || lang === "py";

  const tokens: Token[] = [];
  let rest = line;

  while (rest.length > 0) {
    let m: RegExpExecArray | null;

    // Whitespace — preserve as text
    if ((m = RE_WS.exec(rest))) {
      tokens.push({ kind: "text", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Comment
    if ((m = commentRe.exec(rest))) {
      tokens.push({ kind: "comment", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Triple-quoted string (Python)
    if (isPython && (m = RE_STRING_TRIPLE.exec(rest))) {
      tokens.push({ kind: "string", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Double-quoted string
    if ((m = RE_STRING_DOUBLE.exec(rest))) {
      tokens.push({ kind: "string", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Single-quoted string
    if ((m = RE_STRING_SINGLE.exec(rest))) {
      tokens.push({ kind: "string", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Number
    if ((m = RE_NUMBER.exec(rest))) {
      tokens.push({ kind: "number", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Identifier or keyword
    if ((m = RE_IDENT.exec(rest))) {
      const kind: TokenKind = keywords.has(m[0]) ? "keyword" : "text";
      tokens.push({ kind, text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Operator
    if ((m = RE_OPERATOR.exec(rest))) {
      tokens.push({ kind: "operator", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Punctuation / other — consume one char
    if ((m = RE_PUNCT.exec(rest))) {
      tokens.push({ kind: "text", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Fallback: consume one char to avoid infinite loop
    tokens.push({ kind: "text", text: rest[0] });
    rest = rest.slice(1);
  }

  return tokens;
}
