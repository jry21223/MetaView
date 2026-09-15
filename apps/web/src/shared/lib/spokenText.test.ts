import { describe, expect, it } from "vitest";

import {
  BRACKET_SPOKEN_NAMES,
  READABLE_PUNCTUATION,
  SPOKEN_NULL,
  SPOKEN_REWRITTEN_GLYPHS,
  bracketSpokenName,
  spokenList,
  spokenPath,
  unreadableGlyphs,
} from "./spokenText";

describe("unreadableGlyphs", () => {
  it("accepts prose, digits, Latin and the punctuation TTS reads", () => {
    expect(unreadableGlyphs("第 2 个字符是左圆括号，先压入栈顶等待。")).toEqual([]);
    expect(unreadableGlyphs("时间 O(n)，空间 O(1)。")).toEqual([]);
    expect(unreadableGlyphs("")).toEqual([]);
    for (const char of READABLE_PUNCTUATION) {
      expect(unreadableGlyphs(char), `punctuation ${JSON.stringify(char)}`).toEqual([]);
    }
  });

  it("accepts the glyphs the API rewrites before synthesis", () => {
    for (const char of SPOKEN_REWRITTEN_GLYPHS) {
      expect(unreadableGlyphs(char), `rewritten ${JSON.stringify(char)}`).toEqual([]);
    }
    expect(unreadableGlyphs("暴力做法是 O(n²)，栈里 log₂n ≈ 3.2。")).toEqual([]);
  });

  it("catches the glyphs that vanish on the way to the synthesizer", () => {
    // ∅ and ✓ are drawn on stage but have no reading, so narration must not use them.
    expect(unreadableGlyphs("链表是 1 → 2 → ∅")).toEqual(["∅"]);
    expect(unreadableGlyphs("已排序 ✓ 的前缀")).toEqual(["✓"]);
    expect(unreadableGlyphs("▲ 指向 i")).toEqual(["▲"]);
  });

  it("reports each glyph once, in order of first appearance", () => {
    expect(unreadableGlyphs("∅ ✓ ∅ ✓ ▲")).toEqual(["∅", "✓", "▲"]);
  });
});

describe("spoken forms", () => {
  it("reads a list with the enumeration comma rather than brackets", () => {
    expect(spokenList([4, 2, 5])).toBe("4、2、5");
    expect(spokenList(["左圆括号", "右方括号"])).toBe("左圆括号、右方括号");
    expect(spokenList([])).toBe("");
    expect(unreadableGlyphs(spokenList([1, 2, 3]))).toEqual([]);
  });

  it("reads a path as its nodes, without the arrows the screen draws", () => {
    expect(spokenPath([8, 3, 6, 7])).toBe("8、3、6、7");
    expect(unreadableGlyphs(spokenPath([8, 3, 6, 7]))).toEqual([]);
  });

  it("names every bracket glyph", () => {
    expect(Object.keys(BRACKET_SPOKEN_NAMES)).toEqual(["(", ")", "[", "]", "{", "}"]);
    expect(bracketSpokenName("(")).toBe("左圆括号");
    expect(bracketSpokenName("}")).toBe("右花括号");
    // Anything else passes through unchanged.
    expect(bracketSpokenName("x")).toBe("x");
    for (const name of Object.values(BRACKET_SPOKEN_NAMES)) {
      expect(unreadableGlyphs(name)).toEqual([]);
    }
  });

  it("gives the null pointer a reading", () => {
    expect(SPOKEN_NULL).toBe("空");
    expect(unreadableGlyphs(SPOKEN_NULL)).toEqual([]);
    expect(unreadableGlyphs("∅")).toEqual(["∅"]);
  });
});
