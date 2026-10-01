import asyncio
from collections.abc import Callable
from time import monotonic

from openai import AsyncOpenAI
from openai.types import Model

from ..domain.vo import ModelSpec


class ProxyAPIModelCatalog:
    """Загружает и кэширует каталог моделей ProxyAPI"""

    def __init__(
        self,
        client: AsyncOpenAI,
        *,
        ttl_seconds: int,
        default_context_window: int,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._client = client
        self._ttl_seconds = ttl_seconds
        self._default_context_window = (
            default_context_window
        )
        self._clock = clock

        self._cached_models: tuple[ModelSpec, ...] | None = None
        self._expires_at = 0.0
        self._refresh_lock = asyncio.Lock()

    async def list_models(self) -> tuple[ModelSpec, ...]:
        cached_models = self._get_valid_cache()
        if cached_models is not None:
            return cached_models

        async with self._refresh_lock:
            cached_models = self._get_valid_cache()
            if cached_models is not None:
                return cached_models

            response = await self._client.models.list()

            models = tuple(
                sorted(
                    (
                        self._to_model_spec(model)
                        for model in response.data
                    ),
                    key=lambda model: model.id,
                )
            )

            self._cached_models = models
            self._expires_at = (
                self._clock() + self._ttl_seconds
            )

            return models

    async def get_model(
        self,
        model_id: str,
    ) -> ModelSpec | None:
        models = await self.list_models()

        return next(
            (
                model
                for model in models
                if model.id == model_id
            ),
            None,
        )

    def _get_valid_cache(
        self,
    ) -> tuple[ModelSpec, ...] | None:
        if self._cached_models is None:
            return None

        if self._clock() >= self._expires_at:
            return None

        return self._cached_models

    def _to_model_spec(
        self,
        model: Model,
    ) -> ModelSpec:
        provider = (
            model.owned_by
            or model.id.partition("/")[0]
        )

        return ModelSpec(
            id=model.id,
            provider=provider,
            api_model=model.id,
            context_window=self._default_context_window,
        )
