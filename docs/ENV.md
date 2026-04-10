# Environment Reference

This page documents the environment variables exposed by `.env.example`.

## Required variables

None. The repository boots in mock mode by default, but real providers and production deployment require additional values.

## Optional variables

<!-- AUTO-GENERATED: env-table -->
| Variable | Required | Description | Example |
|---|---|---|---|
| `APT_MIRROR` | No | Debian package mirror used during Docker image builds. | `https://mirrors.tuna.tsinghua.edu.cn/debian` |
| `APT_SECURITY_MIRROR` | No | Debian security mirror used during Docker image builds. | `https://mirrors.tuna.tsinghua.edu.cn/debian-security` |
| `APT_PIPELINE_DEPTH` | No | APT pipeline depth override for Docker image builds. | `0` |
| `ALGO_VIS_CORS_ORIGIN_REGEX` | No | Regex for allowed browser origins in the API CORS middleware. | `^https?://(localhost|127\.0\.0\.1)(:\d+)?$` |
| `ALGO_VIS_DEFAULT_PROVIDER` | No | Legacy default generation provider name when a request does not specify one. | `mock` |
| `ALGO_VIS_DEFAULT_ROUTER_PROVIDER` | No | Default provider used for domain routing. | `mock` |
| `ALGO_VIS_DEFAULT_GENERATION_PROVIDER` | No | Default provider used for planning, coding, and critique stages. | `mock` |
| `ALGO_VIS_MOCK_PROVIDER_ENABLED` | No | Enables the built-in deterministic mock provider. | `true` |
| `ALGO_VIS_MAX_REPAIR_ATTEMPTS` | No | Maximum number of CIR auto-repair attempts. | `2` |
| `ALGO_VIS_HISTORY_DB_PATH` | No | SQLite path for persisted pipeline run history. | `data/pipeline_runs.db` |
| `ALGO_VIS_PREVIEW_RENDER_BACKEND` | No | Preview renderer selection mode. Supported values in code are `auto`, `manim`, and `fallback`. | `auto` |
| `ALGO_VIS_MANIM_PYTHON_PATH` | No | Python interpreter used for manim rendering. | `.venv-manim/bin/python` |
| `ALGO_VIS_CJK_FONT_FAMILY` | No | Preferred CJK font family for rendered scenes. | `Noto Sans CJK SC` |
| `ALGO_VIS_CJK_FONT_PATH` | No | Filesystem path to the CJK font used by renderers. | `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` |
| `ALGO_VIS_PREVIEW_TTS_ENABLED` | No | Enables preview narration generation. | `true` |
| `ALGO_VIS_PREVIEW_TTS_BACKEND` | No | TTS backend identifier for preview narration. | `openai_compatible` |
| `ALGO_VIS_PREVIEW_TTS_MODEL` | No | Model name used by the preview TTS backend. | `mimotts-v2` |
| `ALGO_VIS_PREVIEW_TTS_BASE_URL` | No | Base URL for the preview TTS API when using an OpenAI-compatible service. | `https://api.example.com/v1` |
| `ALGO_VIS_PREVIEW_TTS_API_KEY` | No | API key for the preview TTS service. Keep this secret. | `sk-...` |
| `ALGO_VIS_PREVIEW_TTS_VOICE` | No | Voice identifier passed to the TTS backend. | `default` |
| `ALGO_VIS_PREVIEW_TTS_RATE_WPM` | No | Narration pacing in words per minute before synthesis. | `150` |
| `ALGO_VIS_PREVIEW_TTS_SPEED` | No | Playback speed multiplier sent to the preview TTS backend. | `0.88` |
| `ALGO_VIS_PREVIEW_TTS_MAX_CHARS` | No | Maximum narration text length sent in one preview TTS request. | `1500` |
| `ALGO_VIS_PREVIEW_TTS_TIMEOUT_S` | No | Timeout in seconds for preview TTS requests. | `120.0` |
| `ALGO_VIS_OPENAI_API_KEY` | No | API key for the OpenAI-compatible provider. Keep this secret. | `sk-...` |
| `ALGO_VIS_OPENAI_BASE_URL` | No | Base URL for the OpenAI-compatible API. | `https://api.openai.com/v1` |
| `ALGO_VIS_OPENAI_MODEL` | No | Default model name for the OpenAI-compatible provider. | `gpt-4o-mini` |
| `ALGO_VIS_OPENAI_SUPPORTS_VISION` | No | Whether the configured provider can accept image inputs. | `false` |
| `ALGO_VIS_OPENAI_TIMEOUT_S` | No | Timeout in seconds for provider requests. | `300` |
| `VITE_API_BASE_URL` | No | Frontend API base URL for production-like or static deployments. Leave empty in local dev to use the Vite proxy. | `https://example.com/api/v1` |
<!-- END AUTO-GENERATED: env-table -->

## Notes

- Copy `.env.example` to `.env` for local overrides.
- Empty provider fields keep the app in mock-friendly local mode.
- Secrets such as API keys should never be committed.
