from __future__ import annotations

from app.schemas import (
    CustomProviderUpsertRequest,
    ProviderDescriptor,
    ProviderKind,
    ProviderName,
)
from app.services.history import CustomProviderRepository, StoredCustomProvider
from app.services.providers.base import ModelProvider
from app.services.providers.mock import MockModelProvider
from app.services.providers.openai import OpenAICompatibleProvider


class ProviderUnavailableError(RuntimeError):
    pass


class ProviderRegistrationError(RuntimeError):
    pass


class ProviderRegistry:
    def __init__(
        self,
        *,
        custom_provider_repository: CustomProviderRepository,
        openai_api_key: str | None,
        openai_base_url: str,
        openai_model: str | None,
        openai_timeout_s: float,
    ) -> None:
        self.custom_provider_repository = custom_provider_repository
        self.openai_api_key = openai_api_key
        self.openai_base_url = openai_base_url
        self.openai_model = openai_model
        self.openai_timeout_s = openai_timeout_s

    def get(self, name: str) -> ModelProvider:
        if name == ProviderName.MOCK.value:
            return MockModelProvider()

        if name == ProviderName.OPENAI.value:
            if not (self.openai_api_key and self.openai_model):
                raise ProviderUnavailableError("Provider openai 未配置。")
            return OpenAICompatibleProvider(
                api_key=self.openai_api_key,
                model=self.openai_model,
                base_url=self.openai_base_url,
                timeout_s=self.openai_timeout_s,
                provider_id=ProviderName.OPENAI.value,
                label="OpenAI Compatible",
                description="OpenAI 兼容 Provider，使用远程模型生成规划、编码和批评提示。",
                is_custom=False,
            )

        custom_provider = self.custom_provider_repository.get(name)
        if custom_provider is None or not custom_provider.enabled:
            raise ProviderUnavailableError(f"Provider {name} 未配置。")
        return self._build_custom_provider(custom_provider)

    def list_descriptors(self) -> list[ProviderDescriptor]:
        descriptors = [
            MockModelProvider().descriptor,
            self._openai_descriptor(),
        ]
        descriptors.extend(
            self._custom_descriptor(provider)
            for provider in self.custom_provider_repository.list_all()
        )
        return descriptors

    def upsert_custom_provider(
        self, payload: CustomProviderUpsertRequest
    ) -> ProviderDescriptor:
        if payload.name in {ProviderName.MOCK.value, ProviderName.OPENAI.value}:
            raise ProviderRegistrationError("该 provider 名称已被内置 provider 占用。")

        stored = self.custom_provider_repository.upsert(payload)
        return self._custom_descriptor(stored)

    def delete_custom_provider(self, name: str) -> bool:
        if name in {ProviderName.MOCK.value, ProviderName.OPENAI.value}:
            raise ProviderRegistrationError("不能删除内置 provider。")
        return self.custom_provider_repository.delete(name)

    def _openai_descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(
            name=ProviderName.OPENAI.value,
            label="OpenAI Compatible",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model=self.openai_model or "not-configured",
            description="OpenAI 兼容 Provider，需配置 API Key 与模型名后启用。",
            configured=bool(self.openai_api_key and self.openai_model),
            is_custom=False,
            base_url=self.openai_base_url,
        )

    def _custom_descriptor(self, provider: StoredCustomProvider) -> ProviderDescriptor:
        return ProviderDescriptor(
            name=provider.name,
            label=provider.label,
            kind=provider.kind,
            model=provider.model,
            description=provider.description or "自定义 OpenAI 兼容模型提供商。",
            configured=provider.enabled,
            is_custom=True,
            base_url=provider.base_url,
        )

    def _build_custom_provider(
        self, provider: StoredCustomProvider
    ) -> OpenAICompatibleProvider:
        return OpenAICompatibleProvider(
            api_key=provider.api_key or "",
            model=provider.model,
            base_url=provider.base_url,
            timeout_s=self.openai_timeout_s,
            provider_id=provider.name,
            label=provider.label,
            description=provider.description or "自定义 OpenAI 兼容模型提供商。",
            is_custom=True,
            temperature=provider.temperature,
        )
