from uuid import UUID

from pydantic import BaseModel, Field

from src.knowledge.domain.vo import ChunkKind


class KnowledgeSource(BaseModel):
    """Источник материал базы знаний."""

    kind: str = Field(
        description="Тип источника, например ticket или documentation",
    )
    ref: str = Field(
        description="Ссылка или внешний идентификатор источника",
    )


class KnowledgeSearchResult(BaseModel):
    """Фрагмент базы знаний, найденный гибридный поиском."""

    chunk_id: str = Field(
        description="Идентификатор найденного фрагмент",
    )
    article_id: UUID = Field(
        description="Идетификатор статьи",
    )

    title: str = Field(
        description="Название статьи",
    )
    content: str = Field(
        description="Текст релеватного фрагмента",
    )

    source: KnowledgeSource = Field(
        description="Источник статьи",
    )
    kind: ChunkKind = Field(
        description=(
            "Смысловая роль фрагмента: проблема, причина, "
            "решение, проверка или справочная информация"
        ),
    )

    rank_score: float = Field(
        description="Итоговая оценка релевантности после RRF",
    )
    exact_terms: list[str] = Field(
        default_factory=list,
        description="Точные совпавшие термины",
    )
