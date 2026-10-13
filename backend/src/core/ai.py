from typing import Literal

from dataclasses import dataclass

from langchain_openai import ChatOpenAI

from .settings import settings


@dataclass(frozen=True)
class LLMConfig:
    """Конфигурация LLM модели"""

    provider: Literal["yandex-cloud", "openai", "deepseek"]
    model_name: str
    base_url: str | None = None
    api_key: str | None = None
    temperature: float = 0.5
    max_tokens: int | None = None


# Подготовленные конфиги моделей
YANDEX_GPT_CONFIG = LLMConfig(
    provider="yandex-cloud",
    model_name=settings.yandex_cloud.yandexgpt_rc,
    base_url=settings.yandex_cloud.base_url,
    api_key=settings.yandex_cloud.api_key,
    temperature=0.2,
)


def get_llm(config: LLMConfig) -> ChatOpenAI:
    """Фабрика для создания LLM моделей"""

    return ChatOpenAI(
        api_key=config.api_key,
        base_url=config.base_url,
        model=config.model_name,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
    )
