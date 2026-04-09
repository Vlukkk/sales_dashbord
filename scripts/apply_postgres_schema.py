#!/usr/bin/env python3
"""Apply the PostgreSQL schema SQL file using psycopg."""

from __future__ import annotations

import os
from pathlib import Path

try:
    import psycopg
except ModuleNotFoundError as exc:  # pragma: no cover - runtime dependency
    raise SystemExit(
        "psycopg is required to apply the PostgreSQL schema. Install it with: pip install psycopg[binary]"
    ) from exc


BASE_DIR = Path(__file__).resolve().parent.parent
SCHEMA_PATH = BASE_DIR / "backend" / "sql" / "001_init.sql"


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    if not SCHEMA_PATH.exists():
        raise SystemExit(f"Schema file not found: {SCHEMA_PATH}")

    sql = SCHEMA_PATH.read_text(encoding="utf-8")

    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)

    print(f"PostgreSQL schema applied from {SCHEMA_PATH}")


if __name__ == "__main__":
    main()
