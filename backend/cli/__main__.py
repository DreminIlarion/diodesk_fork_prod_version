import argparse
import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import Any

from .commands import create_first_admin, init_s3_buckets
from .demo import create_test_users, seed_demo_data

Command = Callable[[], Coroutine[Any, Any, None]]

COMMANDS: dict[str, tuple[Command, str]] = {
    "create-first-admin": (create_first_admin, "Создать первого администратора"),
    "create-test-users": (create_test_users, "Создать тестовых сотрудников (dev)"),
    "seed-demo-data": (seed_demo_data, "Заполнить демо-задачами и заявкой (dev)"),
    "init-s3-buckets": (init_s3_buckets, "Инициализация S3 хранилища"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description="CLI утилиты для diocon-tickets")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for name, (_, description) in COMMANDS.items():
        subparsers.add_parser(name, help=description)

    args = parser.parse_args()
    command, _ = COMMANDS[args.command]
    asyncio.run(command())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
