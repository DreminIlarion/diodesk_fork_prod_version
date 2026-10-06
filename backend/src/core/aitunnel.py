from functools import lru_cache

from openai import AsyncOpenAI

from .settings import settings


@lru_cache(maxsize=1)
def get_aitunnel_embedding_client() -> AsyncOpenAI:
    config = settings.ai_tunnel

    return AsyncOpenAI(
        api_key=config.api_key.get_secret_value(),
        base_url=config.base_url,
        timeout=config.request_timeout_seconds,
        max_retries=config.max_retries,
    )


async def close_aitunnel_embedding_client() -> None:
    client = get_aitunnel_embedding_client()

    await client.close()

    get_aitunnel_embedding_client.cache_clear()
