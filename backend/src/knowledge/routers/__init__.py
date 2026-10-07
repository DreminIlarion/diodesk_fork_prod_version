__all__ = ["router"]

from fastapi import APIRouter

from .search import router as search_router

router = APIRouter(  # noqa: RUF067
    prefix="/knowledge",
    tags=["База знаний"],
)

router.include_router(search_router)  # noqa: RUF067
