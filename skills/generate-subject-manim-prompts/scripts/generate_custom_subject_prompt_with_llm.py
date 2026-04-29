#!/usr/bin/env python3
"""Generate a standalone custom-subject prompt pack with an OpenAI-compatible LLM."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[3]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.prompt_authoring import (  # noqa: E402
    build_custom_subject_authoring_system_prompt,
    build_custom_subject_authoring_user_prompt,
    custom_subject_output_path,
    normalize_custom_subject_name,
    validate_custom_subject_markdown,
)


def build_system_prompt() -> str:
    return build_custom_subject_authoring_system_prompt()


def build_user_prompt(
    subject_name: str,
    summary: str | None = None,
    notes: str | None = None,
) -> str:
    return build_custom_subject_authoring_user_prompt(
        subject_name,
        summary=summary,
        notes=notes,
    )


def post_chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    timeout_s: float | None,
) -> dict[str, Any]:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }

    last_error: Exception | None = None
    for trust_env in (True, False):
        try:
            response = httpx.post(
                endpoint,
                headers=headers,
                json=request_body,
                timeout=timeout_s,
                follow_redirects=True,
                trust_env=trust_env,
            )
            response.raise_for_status()
            return response.json()
        except (httpx.ConnectError, httpx.RemoteProtocolError) as exc:
            last_error = exc
            continue
        except httpx.TimeoutException as exc:
            raise RuntimeError(f"请求模型超时：{exc}") from exc
        except httpx.HTTPStatusError as exc:
            excerpt = " ".join(exc.response.text.split())[:1200]
            raise RuntimeError(
                f"模型请求失败，HTTP {exc.response.status_code}。响应片段：{excerpt}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("模型响应不是合法 JSON。") from exc
    raise RuntimeError(f"连接模型失败：{last_error}")


def extract_text_content(payload: dict[str, Any]) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("模型响应缺少 `choices[0].message.content`。") from exc

    if isinstance(content, list):
        chunks = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        content = "\n".join(chunk for chunk in chunks if chunk)

    if not isinstance(content, str):
        raise RuntimeError("模型返回的 content 不是字符串。")
    return content


def load_runtime_defaults() -> dict[str, Any]:
    from app.config import Settings  # noqa: PLC0415

    settings = Settings(_env_file=REPO_ROOT / ".env")
    return {
        "base_url": settings.openai_base_url,
        "api_key": settings.openai_api_key or "",
        "model": settings.openai_planning_model or settings.openai_model or "",
        "timeout_s": settings.openai_timeout_s,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a standalone prompt pack for a new subject with an OpenAI-compatible LLM.",
    )
    parser.add_argument(
        "--subject-name",
        required=True,
        help="新学科名称，例如 Economics / Transport Phenomena / 历史学。",
    )
    parser.add_argument(
        "--summary",
        default="",
        help="学科范围或目标说明，会帮助模型推断核心对象与易错点。",
    )
    parser.add_argument("--notes", default="", help="补充要求，会并入用户提示词。")
    parser.add_argument("--base-url", default="", help="覆盖 OpenAI-compatible base URL。")
    parser.add_argument("--api-key", default="", help="覆盖 API Key。")
    parser.add_argument("--model", default="", help="覆盖模型名。")
    parser.add_argument("--temperature", type=float, default=0.2, help="采样温度。")
    parser.add_argument("--timeout-s", type=float, default=None, help="请求超时秒数。")
    parser.add_argument(
        "--output",
        default="",
        help="输出路径；默认指向 skills/generated-subject-prompts/<slug>.md。",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="将验证通过后的结果写入文件；默认只打印到 stdout。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="不调用模型，只打印 system/user prompt 和目标输出路径。",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    defaults = load_runtime_defaults()

    subject_name = normalize_custom_subject_name(args.subject_name)
    base_url = (args.base_url or defaults["base_url"]).strip()
    api_key = (args.api_key or defaults["api_key"]).strip()
    model = (args.model or defaults["model"]).strip()
    timeout_s = args.timeout_s if args.timeout_s is not None else defaults["timeout_s"]

    output_path = (
        Path(args.output).expanduser()
        if args.output
        else custom_subject_output_path(subject_name)
    )
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(
        subject_name,
        summary=args.summary or None,
        notes=args.notes or None,
    )

    if args.dry_run:
        print("=== output_path ===")
        print(output_path)
        print("\n=== system_prompt ===")
        print(system_prompt)
        print("\n=== user_prompt ===")
        print(user_prompt)
        return

    if not base_url:
        raise SystemExit("缺少 base_url。请设置 --base-url 或 ALGO_VIS_OPENAI_BASE_URL。")
    if not model:
        raise SystemExit(
            "缺少 model。请设置 --model 或 ALGO_VIS_OPENAI_MODEL / ALGO_VIS_OPENAI_PLANNING_MODEL。"
        )
    if not api_key:
        raise SystemExit("缺少 api_key。请设置 --api-key 或 ALGO_VIS_OPENAI_API_KEY。")

    payload = post_chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=args.temperature,
        timeout_s=timeout_s,
    )
    content = extract_text_content(payload)
    validated = validate_custom_subject_markdown(subject_name, content)

    if args.write:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(validated + "\n", encoding="utf-8")
        print(f"已写入 {output_path}")
        return

    print(validated)


if __name__ == "__main__":
    main()
