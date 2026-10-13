from typing import Any

from functools import lru_cache

import yaml

from .settings import PROMPTS_DIR


@lru_cache(maxsize=128)
def load_prompt(name: str) -> dict[str, Any]:
    """Загружает YAML-промпт из общего каталога проекта."""

    file_path = PROMPTS_DIR / f"{name}.yaml"

    with open(file_path, encoding="utf-8") as file:
        return yaml.safe_load(file)
