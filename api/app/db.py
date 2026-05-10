import os
from psycopg_pool import ConnectionPool

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aegis:aegis@db:5432/aegis")
pool = ConnectionPool(DB_URL, min_size=1, max_size=8, kwargs={"autocommit": True})


def query(sql: str, params: tuple = ()) -> list[dict]:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        if cur.description is None:
            return []
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def execute(sql: str, params: tuple = ()) -> int:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount
