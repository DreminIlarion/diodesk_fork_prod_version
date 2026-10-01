from typing import Protocol

from collections.abc import Sequence

from .vo import ModelSpec


class EmbeddingProvider(Protocol):
    """Порт генерации векторных представлений текста"""

    @property
    def model_id(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    async def embed(
        self,
        texts: Sequence[str],
    ) -> list[tuple[float, ...]]: ...


class ModelCatalog(Protocol):
    """Порт каталога доступных генеративных моделей"""

    async def list_models(self) -> tuple[ModelSpec, ...]: ...

    async def get_model(
        self,
        model_id: str,
    ) -> ModelSpec | None: ...
