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
SQL_DIR = BASE_DIR / "backend" / "sql"


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    sql_files = sorted(SQL_DIR.glob("*.sql"))
    if not sql_files:
        raise SystemExit(f"No SQL files found in {SQL_DIR}")

    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            for sql_path in sql_files:
                sql = sql_path.read_text(encoding="utf-8")
                cur.execute(sql)
                print(f"Applied {sql_path.name}")

    print(f"PostgreSQL schema applied ({len(sql_files)} files from {SQL_DIR})")


if __name__ == "__main__":
    main()
