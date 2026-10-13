from functools import lru_cache

from opensearchpy import AsyncOpenSearch

from .settings import settings


@lru_cache(maxsize=1)
def get_opensearch_client() -> AsyncOpenSearch:
    config = settings.opensearch

    kwargs: dict = {
        "hosts": [
            {
                "host": config.host,
                "port": config.port,
                "scheme": "https" if config.use_ssl else "http",
            }
        ],
        "use_ssl": config.use_ssl,
        "verify_certs": config.verify_certs,
        "ssl_show_warn": False,
        "http_compress": True,
        "timeout": 30,
        "max_retries": 3,
        "retry_on_timeout": True,
    }

    if config.username and config.password:
        kwargs["http_auth"] = (
            config.username,
            config.password.get_secret_value(),
        )

    return AsyncOpenSearch(**kwargs)


async def close_opensearch_client() -> None:
    client = get_opensearch_client()
    await client.close()
    get_opensearch_client.cache_clear()
