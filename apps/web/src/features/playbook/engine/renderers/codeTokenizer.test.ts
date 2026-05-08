import { describe, expect, it } from "vitest";
import { tokenize } from "./codeTokenizer";

describe("tokenize — JavaScript", () => {
  it("classifies function keyword", () => {
    const tokens = tokenize("function foo() { return 42; }", "javascript");
    expect(tokens[0]).toEqual({ kind: "keyword", text: "function" });
  });

  it("classifies return keyword", () => {
    const tokens = tokenize("function foo() { return 42; }", "javascript");
    const returnTok = tokens.find((t) => t.text === "return");
    expect(returnTok?.kind).toBe("keyword");
  });

  it("classifies number literal", () => {
    const tokens = tokenize("function foo() { return 42; }", "javascript");
    const numTok = tokens.find((t) => t.text === "42");
    expect(numTok?.kind).toBe("number");
  });

  it("classifies double-quoted string", () => {
    const tokens = tokenize('const s = "hello";', "javascript");
    const strTok = tokens.find((t) => t.text === '"hello"');
    expect(strTok?.kind).toBe("string");
  });

  it("classifies single-line comment", () => {
    const tokens = tokenize("// this is a comment", "javascript");
    expect(tokens[0]).toEqual({ kind: "comment", text: "// this is a comment" });
  });

  it("classifies operator", () => {
    const tokens = tokenize("a = b + c;", "javascript");
    const eq = tokens.find((t) => t.text === "=");
    expect(eq?.kind).toBe("operator");
  });

  it("string with escape sequences stays one token", () => {
    const tokens = tokenize('"hello \\"world\\""', "javascript");
    expect(tokens[0].kind).toBe("string");
    expect(tokens[0].text).toBe('"hello \\"world\\""');
  });

  it("const keyword is highlighted", () => {
    const tokens = tokenize("const x = 1;", "typescript");
    expect(tokens[0]).toEqual({ kind: "keyword", text: "const" });
  });
});

describe("tokenize — Python", () => {
  it("classifies # comment", () => {
    const tokens = tokenize("# hello world", "python");
    expect(tokens[0]).toEqual({ kind: "comment", text: "# hello world" });
  });

  it("classifies def keyword", () => {
    const tokens = tokenize("def foo(x):", "python");
    expect(tokens[0]).toEqual({ kind: "keyword", text: "def" });
  });

  it("classifies None keyword", () => {
    const tokens = tokenize("return None", "python");
    const noneTok = tokens.find((t) => t.text === "None");
    expect(noneTok?.kind).toBe("keyword");
  });

  it("classifies float number", () => {
    const tokens = tokenize("x = 3.14", "python");
    const num = tokens.find((t) => t.text === "3.14");
    expect(num?.kind).toBe("number");
  });
});

describe("tokenize — Go", () => {
  it("classifies func keyword", () => {
    const tokens = tokenize("func main() {", "go");
    expect(tokens[0]).toEqual({ kind: "keyword", text: "func" });
  });

  it("// comment in Go", () => {
    const tokens = tokenize("// go comment", "golang");
    expect(tokens[0].kind).toBe("comment");
  });
});

describe("tokenize — unknown language fallback", () => {
  it("still tokenizes strings and numbers", () => {
    const tokens = tokenize('"hello" 42', "cobol");
    expect(tokens[0]).toEqual({ kind: "string", text: '"hello"' });
    const num = tokens.find((t) => t.text === "42");
    expect(num?.kind).toBe("number");
  });

  it("treats identifiers as text when no keyword set", () => {
    const tokens = tokenize("foo bar", "cobol");
    expect(tokens.filter((t) => t.kind === "keyword")).toHaveLength(0);
  });
});
