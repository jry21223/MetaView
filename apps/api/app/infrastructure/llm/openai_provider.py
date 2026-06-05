from __future__ import annotations

from typing import Any

import httpx


class OpenAIProvider:
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

    async def complete(self, system: str, user: str) -> str:
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
            return data["choices"][0]["message"]["content"]
