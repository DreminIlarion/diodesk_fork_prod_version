from uuid import uuid4

from src.knowledge.domain.entities import Article
from src.knowledge.domain.vo import ArticleSource
from src.knowledge.infra.chunkers import MarkdownArticleChunker


def build_article(content: str) -> Article:
    return Article.create(
        title="Инструкция",
        content=content,
        source=ArticleSource(
            kind="documentation",
            ref="/docs/instruction",
        ),
        author_id=uuid4(),
    )


def test_markdown_chunker_returns_only_text_fragments():
    media_id = uuid4()
    article = build_article(
        "# Настройка\n\n"
        "Откройте раздел настроек.\n\n"
        f"![Схема](media://{media_id})\n\n"
        "Сохраните изменения."
    )

    fragments = MarkdownArticleChunker().split(article)

    assert len(fragments) == 1
    assert fragments[0].position == 0
    assert fragments[0].context_headings == ("Настройка",)
    assert "media://" not in fragments[0].content
    assert "Схема" in fragments[0].content


def test_markdown_chunker_returns_empty_list_for_empty_article():
    article = build_article("")

    assert MarkdownArticleChunker().split(article) == []
