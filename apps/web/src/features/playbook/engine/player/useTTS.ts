import { useCallback, useEffect, useRef, useState } from "react";

export interface TTSConfig {
  enabled: boolean;
  backend: "system" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  rate: number;
}

const STORAGE_KEY = "mv_tts_settings";

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
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg: TTSConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export interface UseTTSResult {
  enabled: boolean;
  toggle: () => void;
  speaking: boolean;
  speak: (text: string) => void;
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

  const supported = typeof window !== "undefined" && (
    Boolean(window.speechSynthesis) || Boolean(window.AudioContext ?? (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext)
  );

  const stopSystem = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  const stopOpenAI = useCallback(() => {
    audioSrcRef.current?.stop();
    audioSrcRef.current = null;
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    stopSystem();
    stopOpenAI();
    setSpeaking(false);
  }, [stopSystem, stopOpenAI]);

  const speakSystem = useCallback(
    (text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = config.rate;
      utt.onstart = () => setSpeaking(true);
      utt.onend = () => setSpeaking(false);
      utt.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utt);
    },
    [config.rate],
  );

  const speakOpenAI = useCallback(
    async (text: string) => {
      if (!config.apiKey.trim()) return;
      stopOpenAI();
      setSpeaking(true);
      try {
        const res = await fetch(`${config.baseUrl}/audio/speech`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: config.model, input: text, voice: config.voice }),
        });
        if (!res.ok) throw new Error(`TTS API ${res.status}`);
        const buf = await res.arrayBuffer();
        const ActxCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
          audioCtxRef.current = new ActxCtor();
        }
        const decoded = await audioCtxRef.current.decodeAudioData(buf);
        const src = audioCtxRef.current.createBufferSource();
        src.buffer = decoded;
        src.connect(audioCtxRef.current.destination);
        src.onended = () => setSpeaking(false);
        audioSrcRef.current = src;
        src.start();
      } catch {
        setSpeaking(false);
      }
    },
    [config.apiKey, config.baseUrl, config.model, config.voice, stopOpenAI],
  );

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      if (config.backend === "openai") {
        void speakOpenAI(text);
      } else {
        speakSystem(text);
      }
    },
    [config.backend, speakOpenAI, speakSystem],
  );

  const toggle = useCallback(() => {
    setConfig((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      if (prev.enabled) {
        window.speechSynthesis?.cancel();
        audioSrcRef.current?.stop();
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
      audioSrcRef.current?.stop();
    };
  }, []);

  return { enabled: config.enabled, toggle, speaking, speak, stop, supported, config, updateConfig };
}
