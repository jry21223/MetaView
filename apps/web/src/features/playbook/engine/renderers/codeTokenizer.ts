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

const RUST_KEYWORDS = new Set([
  "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else",
  "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop",
  "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self",
  "static", "struct", "super", "trait", "true", "type", "unsafe", "use",
  "where", "while", "box", "do", "final", "macro", "override", "priv",
  "typeof", "unsized", "virtual", "yield", "try",
  // Common macros (matched without trailing `!`)
  "println", "print", "eprintln", "eprint", "format", "write", "writeln",
  "vec", "assert", "assert_eq", "assert_ne", "debug_assert", "panic",
  "dbg", "todo", "unimplemented", "unreachable", "include", "include_str",
  "include_bytes", "env",
  // Common stdlib types frequently treated as keyword-like for highlighting
  "Option", "Result", "Some", "None", "Ok", "Err", "Box", "Vec", "String",
  "str", "bool", "char", "i8", "i16", "i32", "i64", "i128", "isize",
  "u8", "u16", "u32", "u64", "u128", "usize", "f32", "f64",
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
  rust: RUST_KEYWORDS,
  rs: RUST_KEYWORDS,
};

function isPythonLang(lang: string): boolean {
  return lang === "python" || lang === "py";
}

function supportsBlockComment(lang: string): boolean {
  // Python uses # only; everything else we support has /* */
  return !isPythonLang(lang);
}

function lineCommentRe(lang: string): RegExp | null {
  if (isPythonLang(lang)) return /^#.*/;
  return /^\/\/.*/;
}

const RE_STRING_DOUBLE = /^"(?:[^"\\]|\\.)*"/;
const RE_STRING_SINGLE = /^'(?:[^'\\]|\\.)*'/;
const RE_STRING_TRIPLE = /^"""[\s\S]*?"""/;
const RE_NUMBER = /^\b\d+(?:\.\d+)?\b/;
const RE_OPERATOR = /^[=+\-*/<>!&|^%~?:]+/;
const RE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*!?/;
const RE_PUNCT = /^[^\w\s"'#/=+\-*<>!&|^%~?:]+/;
const RE_WS = /^\s+/;
const RE_BLOCK_COMMENT_OPEN = /^\/\*/;

interface TokenizeState {
  inBlockComment: boolean;
}

function tokenizeLine(line: string, language: string, state: TokenizeState): Token[] {
  const lang = language.toLowerCase().trim();
  const keywords = KEYWORDS_BY_LANG[lang] ?? new Set<string>();
  const commentRe = lineCommentRe(lang);
  const hasBlock = supportsBlockComment(lang);
  const isPython = isPythonLang(lang);

  const tokens: Token[] = [];
  let rest = line;

  // If we entered this line inside a block comment, consume until */ or end-of-line
  if (state.inBlockComment) {
    const closeIdx = rest.indexOf("*/");
    if (closeIdx === -1) {
      if (rest.length > 0) tokens.push({ kind: "comment", text: rest });
      return tokens;
    }
    tokens.push({ kind: "comment", text: rest.slice(0, closeIdx + 2) });
    rest = rest.slice(closeIdx + 2);
    state.inBlockComment = false;
  }

  while (rest.length > 0) {
    let m: RegExpExecArray | null;

    if ((m = RE_WS.exec(rest))) {
      tokens.push({ kind: "text", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Block comment open (C-family) — must precede operator match because `/` overlaps
    if (hasBlock && RE_BLOCK_COMMENT_OPEN.test(rest)) {
      const closeIdx = rest.indexOf("*/", 2);
      if (closeIdx === -1) {
        tokens.push({ kind: "comment", text: rest });
        state.inBlockComment = true;
        return tokens;
      }
      tokens.push({ kind: "comment", text: rest.slice(0, closeIdx + 2) });
      rest = rest.slice(closeIdx + 2);
      continue;
    }

    if (commentRe && (m = commentRe.exec(rest))) {
      tokens.push({ kind: "comment", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    if (isPython && (m = RE_STRING_TRIPLE.exec(rest))) {
      tokens.push({ kind: "string", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    if ((m = RE_STRING_DOUBLE.exec(rest))) {
      tokens.push({ kind: "string", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    if ((m = RE_STRING_SINGLE.exec(rest))) {
      tokens.push({ kind: "string", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    if ((m = RE_NUMBER.exec(rest))) {
      tokens.push({ kind: "number", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    if ((m = RE_IDENT.exec(rest))) {
      const raw = m[0];
      // Rust macros: `println!`, `vec!` — keep trailing `!` as part of token if recognized
      const lookup = keywords.has(raw)
        ? raw
        : raw.endsWith("!") && keywords.has(raw.slice(0, -1))
          ? raw.slice(0, -1)
          : raw;
      const kind: TokenKind = keywords.has(lookup) ? "keyword" : "text";
      tokens.push({ kind, text: raw });
      rest = rest.slice(raw.length);
      continue;
    }

    if ((m = RE_OPERATOR.exec(rest))) {
      tokens.push({ kind: "operator", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    if ((m = RE_PUNCT.exec(rest))) {
      tokens.push({ kind: "text", text: m[0] });
      rest = rest.slice(m[0].length);
      continue;
    }

    tokens.push({ kind: "text", text: rest[0] });
    rest = rest.slice(1);
  }

  return tokens;
}

/**
 * Stateless single-line tokenizer. Block comments closed on the same line are
 * recognized; an unclosed `/*` is treated as comment-to-end-of-line.
 */
export function tokenize(line: string, language: string): Token[] {
  return tokenizeLine(line, language, { inBlockComment: false });
}

/**
 * Tokenize a list of lines preserving multi-line block-comment state.
 */
export function tokenizeLines(lines: readonly string[], language: string): Token[][] {
  const state: TokenizeState = { inBlockComment: false };
  return lines.map((line) => tokenizeLine(line, language, state));
}
