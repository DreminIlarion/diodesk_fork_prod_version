import json
from collections.abc import Sequence

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, ValidationError

from src.core.prompts import load_prompt

from ..application.dtos import ArticleFragment, ChunkClassification
from ..domain.vo import ChunkKind

DEFAULT_CLASSIFICATION_BATCH_SIZE = 20
DEFAULT_CLASSIFICATION_MAX_TOKENS = 2048
CLASSIFICATION_PROMPT_NAME = "classify_knowledge_chunks"


class InvalidChunkClassificationError(RuntimeError):
    """AI Tunnel вернул некорректную классификацию фрагментов."""


class _ClassificationItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: int
    kind: ChunkKind


class _ClassificationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    classifications: list[_ClassificationItem]


class AITunnelChunkClassifier:
    """Классифицирует фрагменты через OpenAI-совместимый API AI Tunnel."""

    def __init__(
        self,
        client: AsyncOpenAI,
        *,
        model_id: str,
        batch_size: int = DEFAULT_CLASSIFICATION_BATCH_SIZE,
        max_tokens: int = DEFAULT_CLASSIFICATION_MAX_TOKENS,
    ) -> None:
        self._client = client
        self._model_id = model_id
        self._batch_size = batch_size
        self._max_tokens = max_tokens
        self._system_prompt = load_prompt(
            CLASSIFICATION_PROMPT_NAME
        )["system"]

    @property
    def model_id(self) -> str:
        return self._model_id

    async def classify(
        self,
        *,
        article_title: str,
        fragments: Sequence[ArticleFragment],
    ) -> list[ChunkClassification]:
        if not fragments:
            return []

        positions = [fragment.position for fragment in fragments]
        if len(positions) != len(set(positions)):
            raise InvalidChunkClassificationError(
                "Fragment positions must be unique"
            )

        classifications: list[ChunkClassification] = []

        for start in range(0, len(fragments), self._batch_size):
            batch = fragments[start : start + self._batch_size]
            classifications.extend(
                await self._classify_batch(
                    article_title=article_title,
                    fragments=batch,
                )
            )

        return classifications

    async def _classify_batch(
        self,
        *,
        article_title: str,
        fragments: Sequence[ArticleFragment],
    ) -> list[ChunkClassification]:
        response = await self._client.chat.completions.create(
            model=self._model_id,
            messages=[
                {
                    "role": "system",
                    "content": self._system_prompt,
                },
                {
                    "role": "user",
                    "content": _classification_payload(
                        article_title,
                        fragments,
                    ),
                },
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "article_chunk_classifications",
                    "strict": True,
                    "schema": _ClassificationResponse.model_json_schema(),
                },
            },
            max_tokens=self._max_tokens,
        )

        if not response.choices:
            raise InvalidChunkClassificationError(
                "AI Tunnel returned no classification choices"
            )

        content = response.choices[0].message.content
        if not content:
            raise InvalidChunkClassificationError(
                "AI Tunnel returned an empty classification"
            )

        try:
            parsed = _ClassificationResponse.model_validate_json(content)
        except (ValidationError, ValueError) as exc:
            raise InvalidChunkClassificationError(
                "AI Tunnel returned invalid classification JSON"
            ) from exc

        expected_positions = [fragment.position for fragment in fragments]
        actual_positions = [item.position for item in parsed.classifications]

        if (
            len(actual_positions) != len(set(actual_positions))
            or set(actual_positions) != set(expected_positions)
        ):
            raise InvalidChunkClassificationError(
                "AI Tunnel returned unexpected classification positions: "
                f"{actual_positions}, expected {expected_positions}"
            )

        kinds_by_position = {
            item.position: item.kind
            for item in parsed.classifications
        }
        return [
            ChunkClassification(
                position=fragment.position,
                kind=kinds_by_position[fragment.position],
            )
            for fragment in fragments
        ]


def _classification_payload(
    article_title: str,
    fragments: Sequence[ArticleFragment],
) -> str:
    payload = {
        "article_title": article_title,
        "fragments": [
            {
                "position": fragment.position,
                "context_headings": fragment.context_headings,
                "content": fragment.content,
            }
            for fragment in fragments
        ],
    }
    return json.dumps(payload, ensure_ascii=False)
