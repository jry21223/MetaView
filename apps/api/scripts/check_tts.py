"""Synthesize one sentence with the configured TTS provider and report.

The one command that answers "did I fill in the env vars correctly?" without
starting a render. Reads the same ``METAVIEW_TTS_*`` settings the export
pipeline and the playback proxy use, so a pass here means both work.

    .venv/bin/python apps/api/scripts/check_tts.py
    .venv/bin/python apps/api/scripts/check_tts.py "两个物体同时落地" --out probe.mp3

Exits non-zero with the provider's own words when synthesis fails.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

# Runnable from the repo root, not just from apps/api.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.infrastructure.tts import (  # noqa: E402
    build_tts_request,
    looks_like_audio,
    resolve_base_url,
    response_audio,
)

DEFAULT_TEXT = "同一高度水平抛出和自由落下的两个小球，会同时落地。"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("text", nargs="?", default=DEFAULT_TEXT)
    parser.add_argument("--voice", default=None, help="override METAVIEW_TTS_DEFAULT_VOICE")
    parser.add_argument("--out", default="tts-probe.mp3", help="where to write the audio")
    args = parser.parse_args()

    settings = get_settings()
    provider = settings.tts_provider
    api_key = (settings.tts_api_key or settings.openai_api_key or "").strip()
    if not api_key:
        print("✗ METAVIEW_TTS_API_KEY is empty", file=sys.stderr)
        return 2
    voice = args.voice or settings.tts_default_voice
    base_url = resolve_base_url(provider, settings.tts_base_url)

    try:
        call = build_tts_request(
            provider=provider,
            base_url=base_url,
            api_key=api_key,
            model=settings.tts_model,
            voice=voice,
            text=args.text,
            app_id=settings.tts_app_id,
            cluster=settings.tts_cluster,
        )
    except ValueError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 2

    print(f"provider : {provider}")
    print(f"POST     : {call.url}")
    print(f"voice    : {voice}")
    if provider.strip().lower() == "volcano":
        print(f"appid    : {settings.tts_app_id}   cluster: {settings.tts_cluster}")

    with httpx.Client(timeout=settings.tts_timeout_s) as client:
        try:
            resp = client.post(call.url, headers=call.headers, json=call.body)
        except httpx.HTTPError as exc:
            print(f"✗ upstream unreachable: {exc}", file=sys.stderr)
            return 1
        if resp.status_code >= 400:
            print(f"✗ HTTP {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
            return 1
        try:
            audio, audio_url = response_audio(resp, "probe")
        except RuntimeError as exc:
            print(f"✗ {exc}", file=sys.stderr)
            return 1
        if audio is None and audio_url is not None:
            print(f"fetching : {audio_url}")
            audio = client.get(audio_url).content

    if not audio or not looks_like_audio(audio):
        print("✗ response carried no recognizable audio container", file=sys.stderr)
        return 1

    out = Path(args.out)
    out.write_bytes(audio)
    print(f"✓ wrote {len(audio):,} bytes to {out.resolve()} — play it to confirm the voice.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
