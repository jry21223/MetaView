from __future__ import annotations

from app.schemas import ProviderDescriptor, ProviderName
from app.services.providers.base import ModelProvider
from app.services.providers.mock import MockModelProvider
from app.services.providers.openai import OpenAICompatibleProvider


class ProviderUnavailableError(RuntimeError):
    pass


class ProviderRegistry:
    def __init__(
        self,
        *,
        openai_api_key: str | None,
        openai_base_url: str,
        openai_model: str | None,
        openai_timeout_s: float,
    ) -> None:
        self._providers: dict[ProviderName, ModelProvider] = {
            ProviderName.MOCK: MockModelProvider(),
        }
        self._descriptors: list[ProviderDescriptor] = [
            self._providers[ProviderName.MOCK].descriptor
        ]

        if openai_api_key and openai_model:
            openai_provider = OpenAICompatibleProvider(
                api_key=openai_api_key,
                model=openai_model,
                base_url=openai_base_url,
                timeout_s=openai_timeout_s,
            )
            self._providers[ProviderName.OPENAI] = openai_provider
            self._descriptors.append(openai_provider.descriptor)
        else:
            self._descriptors.append(
                ProviderDescriptor(
                    name=ProviderName.OPENAI,
                    model=openai_model or "not-configured",
                    description="OpenAI 兼容 Provider，需配置 API Key 与模型名后启用。",
                    configured=False,
                )
            )

    def get(self, name: ProviderName) -> ModelProvider:
        provider = self._providers.get(name)
        if provider is None:
            raise ProviderUnavailableError(f"Provider {name.value} 未配置。")
        return provider

    def list_descriptors(self) -> list[ProviderDescriptor]:
        return list(self._descriptors)
