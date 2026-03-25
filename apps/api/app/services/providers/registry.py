from __future__ import annotations

from app.schemas import (
    CustomProviderTestResponse,
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
        mock_enabled: bool,
        openai_api_key: str | None,
        openai_base_url: str,
        openai_model: str | None,
        openai_router_model: str | None,
        openai_planning_model: str | None,
        openai_coding_model: str | None,
        openai_critic_model: str | None,
        openai_test_model: str | None,
        openai_supports_vision: bool,
        openai_timeout_s: float | None,
    ) -> None:
        self.custom_provider_repository = custom_provider_repository
        self.mock_enabled = mock_enabled
        self.openai_api_key = openai_api_key
        self.openai_base_url = openai_base_url
        self.openai_model = openai_model
        self.openai_stage_models = self._build_stage_models(
            router_model=openai_router_model,
            planning_model=openai_planning_model,
            coding_model=openai_coding_model,
            critic_model=openai_critic_model,
            test_model=openai_test_model,
        )
        self.openai_supports_vision = openai_supports_vision
        self.openai_timeout_s = openai_timeout_s

    def get(self, name: str) -> ModelProvider:
        if name == ProviderName.MOCK.value:
            if not self.mock_enabled:
                raise ProviderUnavailableError("Provider mock 已禁用。")
            return MockModelProvider()

        if name == ProviderName.OPENAI.value:
            if not (self.openai_api_key and self.openai_model):
                raise ProviderUnavailableError("Provider openai 未配置。")
            return OpenAICompatibleProvider(
                api_key=self.openai_api_key,
                model=self.openai_model,
                stage_models=self.openai_stage_models,
                base_url=self.openai_base_url,
                timeout_s=self.openai_timeout_s,
                provider_id=ProviderName.OPENAI.value,
                label="OpenAI Compatible",
                description="OpenAI 兼容 Provider，使用远程模型生成规划、编码和批评提示。",
                is_custom=False,
                supports_vision=self.openai_supports_vision,
            )

        custom_provider = self.custom_provider_repository.get(name)
        if custom_provider is None or not custom_provider.enabled:
            raise ProviderUnavailableError(f"Provider {name} 未配置。")
        return self._build_custom_provider(custom_provider)

    def list_descriptors(self) -> list[ProviderDescriptor]:
        descriptors: list[ProviderDescriptor] = []
        if self.mock_enabled:
            descriptors.append(MockModelProvider().descriptor)
        descriptors.append(self._openai_descriptor())
        descriptors.extend(
            self._custom_descriptor(provider)
            for provider in self.custom_provider_repository.list_all()
        )
        return descriptors

    def resolve_default_provider(self, preferred_name: str | None = None) -> str | None:
        candidates: list[str] = []
        if preferred_name and preferred_name.strip():
            candidates.append(preferred_name.strip())

        if self._is_provider_available(ProviderName.OPENAI.value):
            candidates.append(ProviderName.OPENAI.value)

        candidates.extend(
            provider.name
            for provider in self.custom_provider_repository.list_all()
            if provider.enabled
        )

        if self.mock_enabled:
            candidates.append(ProviderName.MOCK.value)

        for candidate in candidates:
            if self._is_provider_available(candidate):
                return candidate

        descriptors = self.list_descriptors()
        return descriptors[0].name if descriptors else None

    def upsert_custom_provider(
        self, payload: CustomProviderUpsertRequest
    ) -> ProviderDescriptor:
        if payload.name in {ProviderName.MOCK.value, ProviderName.OPENAI.value}:
            raise ProviderRegistrationError("该 provider 名称已被内置 provider 占用。")

        stored = self.custom_provider_repository.upsert(payload)
        return self._custom_descriptor(stored)

    def test_custom_provider(
        self,
        payload: CustomProviderUpsertRequest,
    ) -> CustomProviderTestResponse:
        if payload.name in {ProviderName.MOCK.value, ProviderName.OPENAI.value}:
            raise ProviderRegistrationError("该 provider 名称已被内置 provider 占用。")

        provider = OpenAICompatibleProvider(
            api_key=payload.api_key or "",
            model=payload.model,
            stage_models=self._build_stage_models(
                router_model=payload.router_model,
                planning_model=payload.planning_model,
                coding_model=payload.coding_model,
                critic_model=payload.critic_model,
                test_model=payload.test_model,
            ),
            base_url=payload.base_url.rstrip("/"),
            timeout_s=self.openai_timeout_s,
            provider_id=payload.name,
            label=payload.label,
            description=payload.description or "自定义 OpenAI 兼容模型提供商。",
            is_custom=True,
            supports_vision=payload.supports_vision,
            temperature=payload.temperature,
        )
        message, raw_output = provider.test_connection()
        return CustomProviderTestResponse(
            ok=True,
            provider=payload.name,
            model=provider.model_for_stage("test"),
            message=message or "连接成功。",
            raw_excerpt=raw_output if raw_output else None,
        )

    def delete_custom_provider(self, name: str) -> bool:
        if name in {ProviderName.MOCK.value, ProviderName.OPENAI.value}:
            raise ProviderRegistrationError("不能删除内置 provider。")
        return self.custom_provider_repository.delete(name)

    def _is_provider_available(self, name: str) -> bool:
        if name == ProviderName.MOCK.value:
            return self.mock_enabled
        if name == ProviderName.OPENAI.value:
            return bool(self.openai_api_key and self.openai_model)
        custom_provider = self.custom_provider_repository.get(name)
        return custom_provider is not None and custom_provider.enabled

    def _openai_descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(
            name=ProviderName.OPENAI.value,
            label="OpenAI Compatible",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model=self.openai_model or "not-configured",
            stage_models=self.openai_stage_models,
            description="OpenAI 兼容 Provider，需配置 API Key 与模型名后启用。",
            configured=bool(self.openai_api_key and self.openai_model),
            is_custom=False,
            supports_vision=self.openai_supports_vision,
            base_url=self.openai_base_url,
            temperature=None,
            api_key_configured=bool(self.openai_api_key),
        )

    def _custom_descriptor(self, provider: StoredCustomProvider) -> ProviderDescriptor:
        return ProviderDescriptor(
            name=provider.name,
            label=provider.label,
            kind=provider.kind,
            model=provider.model,
            stage_models=provider.stage_models,
            description=provider.description or "自定义 OpenAI 兼容模型提供商。",
            configured=provider.enabled,
            is_custom=True,
            supports_vision=provider.supports_vision,
            base_url=provider.base_url,
            temperature=provider.temperature,
            api_key_configured=bool(provider.api_key),
        )

    def _build_custom_provider(
        self, provider: StoredCustomProvider
    ) -> OpenAICompatibleProvider:
        return OpenAICompatibleProvider(
            api_key=provider.api_key or "",
            model=provider.model,
            stage_models=provider.stage_models,
            base_url=provider.base_url,
            timeout_s=self.openai_timeout_s,
            provider_id=provider.name,
            label=provider.label,
            description=provider.description or "自定义 OpenAI 兼容模型提供商。",
            is_custom=True,
            supports_vision=provider.supports_vision,
            temperature=provider.temperature,
        )

    def _build_stage_models(
        self,
        *,
        router_model: str | None,
        planning_model: str | None,
        coding_model: str | None,
        critic_model: str | None,
        test_model: str | None,
    ) -> dict[str, str]:
        stage_models: dict[str, str] = {}
        if router_model and router_model.strip():
            stage_models["router"] = router_model.strip()
        if planning_model and planning_model.strip():
            stage_models["planning"] = planning_model.strip()
        if coding_model and coding_model.strip():
            stage_models["coding"] = coding_model.strip()
        if critic_model and critic_model.strip():
            stage_models["critic"] = critic_model.strip()
        if test_model and test_model.strip():
            stage_models["test"] = test_model.strip()
        return stage_models
