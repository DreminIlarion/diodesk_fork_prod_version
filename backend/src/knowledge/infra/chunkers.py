from ..application.dtos import ArticleFragment
from ..domain.entities import Article
from .splitters import TextChunk, split_markdown


class MarkdownArticleChunker:
    """Делит Markdown-содержимое статьи на текстовые фрагменты."""

    def __init__(
        self,
        *,
        chunk_size: int = 800,
        chunk_overlap: int = 120,
    ) -> None:
        self._chunk_size = chunk_size
        self._chunk_overlap = chunk_overlap

    def split(self, article: Article) -> list[ArticleFragment]:
        chunks = split_markdown(
            article.content,
            chunk_size=self._chunk_size,
            chunk_overlap=self._chunk_overlap,
        )

        return [
            ArticleFragment(
                position=chunk.order,
                content=chunk.content,
                context_headings=tuple(chunk.context_heading),
            )
            for chunk in chunks
            if isinstance(chunk, TextChunk)
        ]
