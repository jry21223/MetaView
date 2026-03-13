from __future__ import annotations

from app.schemas import ProviderDescriptor, ProviderName
from app.services.providers.base import ModelProvider
from app.services.providers.mock import MockModelProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[ProviderName, ModelProvider] = {
            ProviderName.MOCK: MockModelProvider(),
        }

    def get(self, name: ProviderName) -> ModelProvider:
        return self._providers[name]

    def list_descriptors(self) -> list[ProviderDescriptor]:
        return [provider.descriptor for provider in self._providers.values()]

