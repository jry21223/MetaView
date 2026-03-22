import { Fragment } from "react";

type CodeLanguage = "python" | "cpp" | "text";
type TokenKind = "plain" | "keyword" | "string" | "comment" | "number" | "type" | "call";

interface HighlightedCodeProps {
  code: string;
  language?: CodeLanguage;
  maxLines?: number;
  emphasizeLine?: (line: string, index: number) => boolean;
  className?: string;
}

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "class",
  "def",
  "elif",
  "else",
  "except",
  "False",
  "for",
  "from",
  "if",
  "import",
  "in",
  "is",
  "None",
  "not",
  "or",
  "return",
  "self",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

const CPP_KEYWORDS = new Set([
  "auto",
  "bool",
  "break",
  "case",
  "class",
  "const",
  "continue",
  "else",
  "false",
  "for",
  "if",
  "include",
  "int",
  "namespace",
  "nullptr",
  "public",
  "return",
  "std",
  "struct",
  "switch",
  "template",
  "true",
  "using",
  "vector",
  "void",
  "while",
]);

const TOKEN_PATTERN =
  /(#.*$|\/\/.*$|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|\s+|.)/g;

function detectLanguage(code: string, language?: string): CodeLanguage {
  if (language === "python" || language === "cpp" || language === "text") {
    return language;
  }
  if (code.includes("#include") || code.includes("std::") || code.includes("vector<")) {
    return "cpp";
  }
  if (code.includes("from manim import") || code.includes("def ") || code.includes("self.")) {
    return "python";
  }
  return "text";
}

function classifyToken(token: string, line: string, startIndex: number, language: CodeLanguage): TokenKind {
  if (!token.trim()) {
    return "plain";
  }
  if (token.startsWith("#") || token.startsWith("//")) {
    return "comment";
  }
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith("`") && token.endsWith("`"))
  ) {
    return "string";
  }
  if (/^\d/.test(token)) {
    return "number";
  }
  if (/^[A-Z]/.test(token)) {
    return "type";
  }

  const keywordSet = language === "cpp" ? CPP_KEYWORDS : PYTHON_KEYWORDS;
  if (keywordSet.has(token)) {
    return "keyword";
  }

  const endIndex = startIndex + token.length;
  if (line.slice(endIndex).startsWith("(")) {
    return "call";
  }
  return "plain";
}

function tokenizeLine(line: string, language: CodeLanguage): Array<{ text: string; kind: TokenKind }> {
  const tokens: Array<{ text: string; kind: TokenKind }> = [];
  const matches = line.matchAll(TOKEN_PATTERN);
  for (const match of matches) {
    const text = match[0];
    const startIndex = match.index ?? 0;
    tokens.push({
      text,
      kind: classifyToken(text, line, startIndex, language),
    });
  }
  return tokens;
}

export function HighlightedCode({
  code,
  language,
  maxLines,
  emphasizeLine,
  className,
}: HighlightedCodeProps) {
  const resolvedLanguage = detectLanguage(code, language);
  const lines = code.replace(/\t/g, "    ").split("\n");
  const visibleLines = maxLines ? lines.slice(0, maxLines) : lines;

  return (
    <div className={`highlighted-code ${className ?? ""}`.trim()}>
      {visibleLines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          className={`highlighted-code-line ${
            emphasizeLine?.(line, index) ? "is-emphasized" : ""
          }`}
        >
          <span className="highlighted-code-line-no">{index + 1}</span>
          <code>
            {tokenizeLine(line, resolvedLanguage).map((token, tokenIndex) => (
              <Fragment key={`${tokenIndex}-${token.text}`}>
                <span className={`code-token token-${token.kind}`}>{token.text}</span>
              </Fragment>
            ))}
          </code>
        </div>
      ))}
    </div>
  );
}
