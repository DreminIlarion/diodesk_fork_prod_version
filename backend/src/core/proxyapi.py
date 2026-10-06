from functools import lru_cache

from openai import AsyncOpenAI

from .settings import settings


@lru_cache(maxsize=1)
def get_proxyapi_embedding_client() -> AsyncOpenAI:
    config = settings.proxy_api
    return AsyncOpenAI(
        api_key=config.embedding_api_key.get_secret_value(),
        base_url=config.base_url,
        timeout=config.request_timeout_seconds,
        max_retries=0,
    )


async def close_proxyapi_embedding_client() -> None:
    client = get_proxyapi_embedding_client()

    await client.close()

    get_proxyapi_embedding_client.cache_clear()
