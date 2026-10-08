__all__ = ["router"]

from fastapi import APIRouter

from .articles import router as articles_router
from .search import router as search_router

router = APIRouter(  # noqa: RUF067
    prefix="/knowledge",
    tags=["База знаний"],
)

router.include_router(articles_router)  # noqa: RUF067
router.include_router(search_router)  # noqa: RUF067
