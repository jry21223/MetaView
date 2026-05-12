import { describe, expect, it } from "vitest";
import { tokenize, tokenizeLines } from "./codeTokenizer";

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

describe("tokenize — block comments (#32)", () => {
  it("recognizes inline /* */ as a single comment token in C++", () => {
    const tokens = tokenize("/* hello */ int x = 1;", "cpp");
    expect(tokens[0]).toEqual({ kind: "comment", text: "/* hello */" });
    expect(tokens.find((t) => t.text === "int")?.kind).toBe("keyword");
  });

  it("recognizes /* */ inline in Java", () => {
    const tokens = tokenize("public /* note */ void run() {}", "java");
    expect(tokens.find((t) => t.text === "/* note */")?.kind).toBe("comment");
  });

  it("recognizes /* */ inline in JavaScript", () => {
    const tokens = tokenize("const x = /* inline */ 42;", "javascript");
    expect(tokens.find((t) => t.text === "/* inline */")?.kind).toBe("comment");
  });

  it("unclosed /* on a single line tokenize() treats rest as comment", () => {
    const tokens = tokenize("foo /* unclosed forever", "cpp");
    expect(tokens.find((t) => t.text === "/* unclosed forever")?.kind).toBe("comment");
  });

  it("Python does not treat /* as block comment", () => {
    const tokens = tokenize("a / b", "python");
    expect(tokens.every((t) => t.kind !== "comment")).toBe(true);
  });

  it("tokenizeLines preserves block comment across lines", () => {
    const lines = ["/* start", "  body", "  end */ int z;"];
    const result = tokenizeLines(lines, "cpp");
    expect(result[0][0].kind).toBe("comment");
    expect(result[1][0].kind).toBe("comment");
    expect(result[2][0].kind).toBe("comment");
    expect(result[2].find((t) => t.text === "int")?.kind).toBe("keyword");
  });

  it("tokenizeLines: code before and after multi-line block stays normal", () => {
    const lines = ["int a;", "/* block", "still */", "int b;"];
    const result = tokenizeLines(lines, "cpp");
    expect(result[0].find((t) => t.text === "int")?.kind).toBe("keyword");
    expect(result[3].find((t) => t.text === "int")?.kind).toBe("keyword");
    expect(result[1].some((t) => t.kind === "comment")).toBe(true);
    expect(result[2].some((t) => t.kind === "comment")).toBe(true);
  });
});

describe("tokenize — Rust (#37)", () => {
  it("classifies fn keyword", () => {
    const tokens = tokenize("fn main() {}", "rust");
    expect(tokens[0]).toEqual({ kind: "keyword", text: "fn" });
  });

  it("classifies let mut as keywords", () => {
    const tokens = tokenize("let mut x = 0;", "rust");
    expect(tokens.find((t) => t.text === "let")?.kind).toBe("keyword");
    expect(tokens.find((t) => t.text === "mut")?.kind).toBe("keyword");
  });

  it("recognizes match, impl, trait", () => {
    expect(tokenize("match x {}", "rust")[0].kind).toBe("keyword");
    expect(tokenize("impl Foo {}", "rust")[0].kind).toBe("keyword");
    expect(tokenize("trait Bar {}", "rust")[0].kind).toBe("keyword");
  });

  it("recognizes Self/Result/Option", () => {
    const tokens = tokenize("fn f() -> Result<Self, Option<u32>> {}", "rust");
    expect(tokens.find((t) => t.text === "Result")?.kind).toBe("keyword");
    expect(tokens.find((t) => t.text === "Self")?.kind).toBe("keyword");
    expect(tokens.find((t) => t.text === "Option")?.kind).toBe("keyword");
    expect(tokens.find((t) => t.text === "u32")?.kind).toBe("keyword");
  });

  it("recognizes macros like println!", () => {
    const tokens = tokenize('println!("hi");', "rust");
    expect(tokens[0]).toEqual({ kind: "keyword", text: "println!" });
  });

  it("rs alias works", () => {
    const tokens = tokenize("fn x() {}", "rs");
    expect(tokens[0].kind).toBe("keyword");
  });

  it("supports /* */ block comments in Rust", () => {
    const tokens = tokenize("/* doc */ fn x() {}", "rust");
    expect(tokens[0]).toEqual({ kind: "comment", text: "/* doc */" });
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
