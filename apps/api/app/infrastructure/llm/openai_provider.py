from __future__ import annotations

from typing import Any

import httpx

from app.domain.models.run_span import TokenUsage


class OpenAIProvider:
    provider_name = "openai-compatible"

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        timeout: float | None = 300.0,
        max_tokens: int | None = None,
        reasoning_effort: str | None = None,
        temperature: float = 0.3,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout
        self._max_tokens = max_tokens
        self._reasoning_effort = reasoning_effort
        self._temperature = temperature

    @property
    def model_name(self) -> str:
        return self._model

    async def complete(self, system: str, user: str) -> str:
        text, _usage = await self.complete_with_usage(system, user)
        return text

    async def complete_with_usage(self, system: str, user: str) -> tuple[str, TokenUsage]:
        """Same request as :meth:`complete`, additionally returning token usage.

        Usage is returned rather than stored on the instance: providers are
        built through an ``lru_cache`` in ``dependencies.py``, so one instance
        is shared across concurrent runs and instance state would attribute
        one run's tokens to another.
        """
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": self._temperature,
        }
        if self._max_tokens is not None:
            payload["max_tokens"] = self._max_tokens
        if self._reasoning_effort:
            # OpenAI gpt-5/o-series accept this; providers that don't will
            # usually 400. Keep behind an explicit env var so the default
            # remains compatible with non-OpenAI servers.
            payload["reasoning_effort"] = self._reasoning_effort
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"], _parse_usage(data.get("usage"))


def _parse_usage(raw: Any) -> TokenUsage:
    """Map an OpenAI-compatible ``usage`` block onto :class:`TokenUsage`.

    Cached-token reporting is not uniform across OpenAI-compatible servers, so
    several documented spellings are accepted. Anything absent stays ``None``.
    """
    if not isinstance(raw, dict):
        return TokenUsage()
    prompt_details = raw.get("prompt_tokens_details")
    cache_read = _int_or_none(raw.get("cache_read_input_tokens"))
    if cache_read is None and isinstance(prompt_details, dict):
        cache_read = _int_or_none(prompt_details.get("cached_tokens"))
    cache_write = _int_or_none(raw.get("cache_creation_input_tokens"))
    return TokenUsage(
        input_tokens=_first_int(raw, "prompt_tokens", "input_tokens"),
        output_tokens=_first_int(raw, "completion_tokens", "output_tokens"),
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
    )


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _first_int(raw: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        if key in raw:
            value = _int_or_none(raw[key])
            if value is not None:
                return value
    return None
