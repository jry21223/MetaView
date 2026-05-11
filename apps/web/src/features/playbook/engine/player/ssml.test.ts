import { describe, expect, it } from "vitest";
import { isSSML, normalizeSSML } from "./ssml";

describe("isSSML", () => {
  it.each([
    ["<speak>hi</speak>", true],
    ["  <speak>hi</speak>", true],
    ["<speak attr='x'>hi</speak>", true],
    ["plain text", false],
    ["<other>x</other>", false],
    ["", false],
  ])("isSSML(%p) === %p", (input, expected) => {
    expect(isSSML(input)).toBe(expected);
  });
});

describe("normalizeSSML", () => {
  it("returns plain text unchanged", () => {
    expect(normalizeSSML("hello world")).toBe("hello world");
  });

  it.each([
    ["<speak>Pause<break/>here</speak>", "Pause , here"],
    ["<speak>Pause<break />here</speak>", "Pause , here"],
    ["<speak>Pause<break time=\"1s\"/>here</speak>", "Pause , here"],
    ["<speak>Pause<break></break>here</speak>", "Pause , here"],
    ["<speak>A<break time=\"500ms\"/>B<break/>C</speak>", "A , B , C"],
  ])("normalizes break form %p", (input, expected) => {
    expect(normalizeSSML(input)).toBe(expected);
  });

  it("strips emphasis and say-as tags", () => {
    const input = '<speak>比较 <say-as interpret-as="cardinal">7</say-as> 和 <emphasis level="strong">3</emphasis>。</speak>';
    expect(normalizeSSML(input)).toBe("比较 7 和 3。");
  });

  it("decodes XML entities", () => {
    expect(normalizeSSML("<speak>A &amp; B &lt; C</speak>")).toBe("A & B < C");
  });

  it("collapses surrounding whitespace", () => {
    expect(normalizeSSML("<speak>  hi   there  </speak>")).toBe("hi there");
  });
});
