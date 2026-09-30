from collections.abc import Sequence

from openai import AsyncOpenAI

DEFAULT_EMBEDDING_BATCH_SIZE = 64


class InvalidEmbeddingResponseError(RuntimeError):
    """ProxyAPI вернул некорректный набор embeddings"""


class ProxyAPIEmbeddingProvider:
    """Генерирует embeddings через OpenAI-совместимый API ProxyAPI"""

    def __init__(
        self,
        client: AsyncOpenAI,
        *,
        model_id: str,
        dimensions: int,
        batch_size: int = DEFAULT_EMBEDDING_BATCH_SIZE,
    ) -> None:
        self._client = client
        self._model_id = model_id
        self._dimensions = dimensions
        self._batch_size = batch_size

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(
        self,
        texts: Sequence[str],
    ) -> list[tuple[float, ...]]:
        if not texts:
            return []

        embeddings: list[tuple[float, ...]] = []

        for start in range(0, len(texts), self._batch_size):
            batch = list(
                texts[start : start + self._batch_size]
            )

            response = await self._client.embeddings.create(
                model=self._model_id,
                input=batch,
                encoding_format="float",
            )

            response_items = sorted(
                response.data,
                key=lambda item: item.index,
            )

            actual_indices = [
                item.index
                for item in response_items
            ]
            expected_indices = list(range(len(batch)))

            if actual_indices != expected_indices:
                raise InvalidEmbeddingResponseError(
                    "ProxyAPI returned invalid embedding indices: "
                    f"{actual_indices}, expected {expected_indices}"
                )

            for item in response_items:
                embedding = tuple(item.embedding)

                if len(embedding) != self._dimensions:
                    raise InvalidEmbeddingResponseError(
                        "ProxyAPI returned embedding dimension "
                        f"{len(embedding)}, expected "
                        f"{self._dimensions}"
                    )

                embeddings.append(embedding)

        return embeddings
