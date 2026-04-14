import type { RuntimeSettings } from "../types";

export interface TtsAvailability {
  available: boolean;
  reason: string;
}

export function computeTtsAvailability(settings: RuntimeSettings): TtsAvailability {
  const { backend, api_key_configured, base_url } = settings.tts;

  if (backend === "system") {
    return { available: true, reason: "使用本地系统 TTS（say/espeak）" };
  }

  if (backend === "openai_compatible") {
    if (!base_url) {
      return { available: false, reason: "未配置 TTS Base URL" };
    }
    if (!api_key_configured) {
      return { available: false, reason: "未配置 TTS API Key" };
    }
    return { available: true, reason: "使用远程 TTS 服务" };
  }

  if (base_url && api_key_configured) {
    return { available: true, reason: "优先使用远程 TTS，可回退到本地" };
  }
  return { available: true, reason: "将使用本地系统 TTS（需系统支持）" };
}
