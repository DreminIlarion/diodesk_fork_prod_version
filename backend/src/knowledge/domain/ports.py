from typing import Protocol

from collections.abc import Sequence


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
