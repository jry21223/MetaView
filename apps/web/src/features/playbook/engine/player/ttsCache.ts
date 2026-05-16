/**
 * LRU cache for OpenAI TTS audio buffers, bounded by total bytes.
 *
 * Why: see issue #33. The previous module-level `Map` was untestable, unclear-able,
 * and unobservable. It also counted entries, not bytes — so 50 long utterances
 * could pin ~2.5 GB in memory.
 *
 * This class:
 *   - tracks total bytes and evicts oldest until under `maxBytes`
 *   - reports hit/miss counts via `stats()`
 *   - supports `clear()` for tests and player teardown
 *   - is constructible: multiple instances do NOT share state
 */

export interface TTSCacheStats {
  hits: number;
  misses: number;
  entries: number;
  bytes: number;
  maxBytes: number;
}

export interface TTSCacheKeyParts {
  voice: string;
  rate: number;
  text: string;
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024; // 64 MB — generous but bounded

export function ttsCacheKey(parts: TTSCacheKeyParts): string {
  // Issue #40 dropped baseUrl/model from the key — the backend proxy owns
  // those choices now, so the client never sees them flux.
  return `${parts.voice}|${parts.rate.toFixed(2)}|${parts.text}`;
}

export class TTSAudioCache {
  private readonly store = new Map<string, ArrayBuffer>();
  private readonly maxBytes: number;
  private currentBytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  get(key: string): ArrayBuffer | undefined {
    const buf = this.store.get(key);
    if (buf === undefined) {
      this.misses += 1;
      return undefined;
    }
    // LRU touch
    this.store.delete(key);
    this.store.set(key, buf);
    this.hits += 1;
    return buf;
  }

  set(key: string, buf: ArrayBuffer): void {
    const existing = this.store.get(key);
    if (existing) {
      this.currentBytes -= existing.byteLength;
      this.store.delete(key);
    }
    this.store.set(key, buf);
    this.currentBytes += buf.byteLength;
    this.evictIfNeeded();
  }

  /** Drop a single entry (e.g. corrupted). Returns true if removed. */
  delete(key: string): boolean {
    const existing = this.store.get(key);
    if (!existing) return false;
    this.currentBytes -= existing.byteLength;
    this.store.delete(key);
    return true;
  }

  clear(): void {
    this.store.clear();
    this.currentBytes = 0;
  }

  stats(): TTSCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.store.size,
      bytes: this.currentBytes,
      maxBytes: this.maxBytes,
    };
  }

  private evictIfNeeded(): void {
    while (this.currentBytes > this.maxBytes) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      const buf = this.store.get(oldest.value);
      if (!buf) break;
      this.currentBytes -= buf.byteLength;
      this.store.delete(oldest.value);
    }
  }
}

/**
 * Shared instance used by `useTTS`. Exported so callers can `clear()` or
 * `stats()` it from devtools / settings UI, and so tests can reset state.
 */
export const sharedTTSCache = new TTSAudioCache();
