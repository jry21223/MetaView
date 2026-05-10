import { useCallback, useEffect, useRef, useState } from "react";
import { isSSML, normalizeSSML } from "./ssml";

export interface TTSConfig {
  enabled: boolean;
  backend: "system" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
  /** "auto" = follow domain mapping; otherwise an explicit voice id */
  voice: string;
  rate: number;
}

export interface SpeakOptions {
  /** Per-utterance rate override (else uses config.rate) */
  rate?: number;
  /** Per-utterance voice override (else uses config.voice or auto-mapped) */
  voice?: string;
}

const STORAGE_KEY = "mv_tts_settings";

export const OPENAI_VOICES = [
  { id: "alloy", label: "Alloy", description: "中性、清晰" },
  { id: "echo", label: "Echo", description: "沉稳、男声" },
  { id: "fable", label: "Fable", description: "温和、英式" },
  { id: "onyx", label: "Onyx", description: "有力、低沉" },
  { id: "nova", label: "Nova", description: "温暖、女声" },
  { id: "shimmer", label: "Shimmer", description: "明亮、女声" },
] as const;

export const DOMAIN_VOICE_MAP: Record<string, string> = {
  algorithm: "alloy",
  math: "echo",
  code: "onyx",
  physics: "nova",
  chemistry: "shimmer",
};

export const AUTO_VOICE = "auto";

export function resolveVoice(configVoice: string, domain: string | undefined): string {
  if (configVoice !== AUTO_VOICE) return configVoice;
  if (domain && DOMAIN_VOICE_MAP[domain]) return DOMAIN_VOICE_MAP[domain];
  return "alloy";
}

const DEFAULT_CONFIG: TTSConfig = {
  enabled: false,
  backend: "system",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "tts-1",
  voice: "alloy",
  rate: 1.0,
};

function loadConfig(): TTSConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return { ...DEFAULT_CONFIG, ...(parsed as Partial<TTSConfig>) };
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg: TTSConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore quota errors
  }
}

// ── In-memory LRU cache for OpenAI TTS audio ────────────────────────────────
// Keyed by `${baseUrl}|${model}|${voice}|${rate}|${text}`. Bounded to 50 entries
// to avoid unbounded memory growth on long sessions.
const TTS_CACHE_MAX = 50;
const ttsAudioCache = new Map<string, ArrayBuffer>();

function cacheKey(baseUrl: string, model: string, voice: string, rate: number, text: string): string {
  return `${baseUrl}|${model}|${voice}|${rate.toFixed(2)}|${text}`;
}

function cacheGet(key: string): ArrayBuffer | undefined {
  const buf = ttsAudioCache.get(key);
  if (buf) {
    // re-insert to mark as recently used
    ttsAudioCache.delete(key);
    ttsAudioCache.set(key, buf);
  }
  return buf;
}

function cacheSet(key: string, buf: ArrayBuffer): void {
  if (ttsAudioCache.has(key)) ttsAudioCache.delete(key);
  ttsAudioCache.set(key, buf);
  while (ttsAudioCache.size > TTS_CACHE_MAX) {
    const oldest = ttsAudioCache.keys().next().value;
    if (oldest === undefined) break;
    ttsAudioCache.delete(oldest);
  }
}

export interface UseTTSResult {
  enabled: boolean;
  toggle: () => void;
  speaking: boolean;
  speak: (text: string, options?: SpeakOptions) => void;
  stop: () => void;
  supported: boolean;
  config: TTSConfig;
  updateConfig: (patch: Partial<TTSConfig>) => void;
}

export function useTTS(): UseTTSResult {
  const [config, setConfig] = useState<TTSConfig>(loadConfig);
  const [speaking, setSpeaking] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const supported =
    typeof window !== "undefined" &&
    (Boolean(window.speechSynthesis) ||
      Boolean(
        window.AudioContext ??
          (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext,
      ));

  const stopSystem = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  const stopOpenAI = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      audioSrcRef.current?.stop();
    } catch {
      // stop() throws if source never started
    }
    audioSrcRef.current = null;
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    stopSystem();
    stopOpenAI();
    setSpeaking(false);
  }, [stopSystem, stopOpenAI]);

  const speakSystem = useCallback(
    (text: string, rate: number) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = rate;
      utt.onstart = () => setSpeaking(true);
      utt.onend = () => setSpeaking(false);
      utt.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utt);
    },
    [],
  );

  const playArrayBuffer = useCallback(async (buf: ArrayBuffer, signal: AbortSignal): Promise<void> => {
    const ActxCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new ActxCtor();
    }
    // decodeAudioData mutates the source buffer, so clone before decoding so cache stays usable
    const decoded = await audioCtxRef.current.decodeAudioData(buf.slice(0));
    if (signal.aborted) return;

    const src = audioCtxRef.current.createBufferSource();
    src.buffer = decoded;
    src.connect(audioCtxRef.current.destination);
    src.onended = () => setSpeaking(false);
    audioSrcRef.current = src;
    src.start();
  }, []);

  const speakOpenAI = useCallback(
    async (text: string, rate: number, voice: string) => {
      if (!config.apiKey.trim()) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        audioSrcRef.current?.stop();
      } catch {
        // ignore
      }
      audioSrcRef.current = null;
      setSpeaking(true);

      const key = cacheKey(config.baseUrl, config.model, voice, rate, text);
      const cached = cacheGet(key);
      if (cached) {
        try {
          await playArrayBuffer(cached, ac.signal);
        } catch {
          setSpeaking(false);
        }
        return;
      }

      try {
        const res = await fetch(`${config.baseUrl}/audio/speech`, {
          method: "POST",
          signal: ac.signal,
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: config.model, input: text, voice, speed: rate }),
        });
        if (ac.signal.aborted) return;
        if (!res.ok) throw new Error(`TTS API ${res.status}`);

        const buf = await res.arrayBuffer();
        if (ac.signal.aborted) return;
        cacheSet(key, buf);
        await playArrayBuffer(buf, ac.signal);
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
        setSpeaking(false);
      }
    },
    [config.apiKey, config.baseUrl, config.model, playArrayBuffer],
  );

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const normalized = isSSML(trimmed) ? normalizeSSML(trimmed) : trimmed;
      const rate = options?.rate ?? config.rate;
      // When caller doesn't pass a voice, defer to resolveVoice (without domain context,
      // AUTO collapses to the default "alloy"). Callers that know the domain should
      // resolve voice themselves via resolveVoice(config.voice, domain) and pass it in.
      const voice = options?.voice ?? resolveVoice(config.voice, undefined);
      if (config.backend === "openai") {
        void speakOpenAI(normalized, rate, voice);
      } else {
        speakSystem(normalized, rate);
      }
    },
    [config.backend, config.rate, config.voice, speakOpenAI, speakSystem],
  );

  const toggle = useCallback(() => {
    setConfig((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      if (prev.enabled) {
        window.speechSynthesis?.cancel();
        abortRef.current?.abort();
        try {
          audioSrcRef.current?.stop();
        } catch {
          // ignore
        }
        setSpeaking(false);
      }
      saveConfig(next);
      return next;
    });
  }, []);

  const updateConfig = useCallback((patch: Partial<TTSConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      abortRef.current?.abort();
      try {
        audioSrcRef.current?.stop();
      } catch {
        // ignore
      }
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

  return { enabled: config.enabled, toggle, speaking, speak, stop, supported, config, updateConfig };
}
