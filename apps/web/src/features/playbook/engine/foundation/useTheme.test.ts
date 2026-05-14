import { describe, expect, it } from "vitest";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  it("returns dark palette when mode='dark'", () => {
    const { palette, isDark } = useTheme("dark");
    expect(isDark).toBe(true);
    expect(palette.text).toBe("#e8ecf4");
  });

  it("returns light palette when mode='light'", () => {
    const { palette, isDark } = useTheme("light");
    expect(isDark).toBe(false);
    expect(palette.text).toBe("#141820");
  });

  it("resolves emphasis -> color", () => {
    const { emphasis } = useTheme("dark");
    expect(emphasis("primary")).toBe("#4de8b0");
    expect(emphasis("secondary")).toContain("200,168,248");
    expect(emphasis("accent")).toBe("#ff9e8a");
    // Unknown level falls back to primary.
    expect(emphasis("nonsense")).toBe("#4de8b0");
    expect(emphasis(undefined)).toBe("#4de8b0");
  });
});
