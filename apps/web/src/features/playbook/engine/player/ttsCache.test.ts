import { describe, expect, it } from "vitest";
import { TTSAudioCache, ttsCacheKey } from "./ttsCache";

function buf(size: number): ArrayBuffer {
  return new ArrayBuffer(size);
}

describe("ttsCacheKey", () => {
  it("normalizes rate to 2 decimals", () => {
    const a = ttsCacheKey({ voice: "v", rate: 1, text: "t" });
    const b = ttsCacheKey({ voice: "v", rate: 1.0, text: "t" });
    const c = ttsCacheKey({ voice: "v", rate: 1.005, text: "t" });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("distinguishes by voice and text", () => {
    const a = ttsCacheKey({ voice: "alloy", rate: 1, text: "hi" });
    const b = ttsCacheKey({ voice: "echo", rate: 1, text: "hi" });
    const c = ttsCacheKey({ voice: "alloy", rate: 1, text: "hello" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("distinguishes by TTS provider and model without including API keys", () => {
    const a = ttsCacheKey({
      voice: "alloy",
      rate: 1,
      text: "hi",
      baseUrl: "https://a.example/v1",
      model: "tts-a",
    });
    const b = ttsCacheKey({
      voice: "alloy",
      rate: 1,
      text: "hi",
      baseUrl: "https://b.example/v1",
      model: "tts-a",
    });
    const c = ttsCacheKey({
      voice: "alloy",
      rate: 1,
      text: "hi",
      baseUrl: "https://a.example/v1",
      model: "tts-b",
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("sk-");
  });
});

describe("TTSAudioCache", () => {
  it("get returns undefined for missing key and counts miss", () => {
    const c = new TTSAudioCache(1024);
    expect(c.get("k")).toBeUndefined();
    expect(c.stats().misses).toBe(1);
    expect(c.stats().hits).toBe(0);
  });

  it("set then get returns buffer and counts hit", () => {
    const c = new TTSAudioCache(1024);
    const b = buf(10);
    c.set("k", b);
    expect(c.get("k")).toBe(b);
    expect(c.stats()).toMatchObject({ hits: 1, misses: 0, entries: 1, bytes: 10 });
  });

  it("tracks byte usage and evicts when over maxBytes", () => {
    const c = new TTSAudioCache(30);
    c.set("a", buf(10));
    c.set("b", buf(10));
    c.set("c", buf(10));
    expect(c.stats().bytes).toBe(30);
    c.set("d", buf(10));
    // oldest "a" should be evicted
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).not.toBeUndefined();
    expect(c.get("c")).not.toBeUndefined();
    expect(c.get("d")).not.toBeUndefined();
    expect(c.stats().bytes).toBe(30);
  });

  it("evicts multiple entries when a single set overflows", () => {
    const c = new TTSAudioCache(50);
    c.set("a", buf(20));
    c.set("b", buf(20));
    c.set("big", buf(50));
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBeUndefined();
    expect(c.get("big")).not.toBeUndefined();
    expect(c.stats().bytes).toBe(50);
  });

  it("LRU: get moves entry to most-recent", () => {
    const c = new TTSAudioCache(30);
    c.set("a", buf(10));
    c.set("b", buf(10));
    c.set("c", buf(10));
    // touch "a" so it's most-recent
    expect(c.get("a")).not.toBeUndefined();
    // adding "d" should evict "b" now (oldest), not "a"
    c.set("d", buf(10));
    expect(c.get("a")).not.toBeUndefined();
    expect(c.get("b")).toBeUndefined();
  });

  it("re-setting same key replaces buffer and updates bytes", () => {
    const c = new TTSAudioCache(1024);
    c.set("k", buf(10));
    c.set("k", buf(25));
    expect(c.stats().entries).toBe(1);
    expect(c.stats().bytes).toBe(25);
  });

  it("delete removes a single entry and frees bytes", () => {
    const c = new TTSAudioCache(1024);
    c.set("k", buf(40));
    expect(c.delete("k")).toBe(true);
    expect(c.stats()).toMatchObject({ entries: 0, bytes: 0 });
    expect(c.delete("k")).toBe(false);
  });

  it("clear drops everything (bytes counter resets)", () => {
    const c = new TTSAudioCache(1024);
    c.set("a", buf(10));
    c.set("b", buf(10));
    c.clear();
    expect(c.stats()).toMatchObject({ entries: 0, bytes: 0 });
  });

  it("stats hits/misses persist across clear (observability)", () => {
    const c = new TTSAudioCache(1024);
    c.set("a", buf(10));
    c.get("a"); // hit
    c.get("missing"); // miss
    c.clear();
    expect(c.stats().hits).toBe(1);
    expect(c.stats().misses).toBe(1);
  });

  it("multiple instances do not share state", () => {
    const a = new TTSAudioCache(1024);
    const b = new TTSAudioCache(1024);
    a.set("k", buf(10));
    expect(b.get("k")).toBeUndefined();
    expect(a.get("k")).not.toBeUndefined();
  });
});
