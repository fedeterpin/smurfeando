"""Full pull of the team registry: Teams + TeamRedirects (~9k rows, ~19 requests).

Full mirror (DELETE + re-insert) because redirects and renames change upstream and
there is no incremental key. The transform (compute_teams) resolves every raw team
name through this registry; without it, canonicalization degrades to identity.

WARNING: Writes to the live DB -> run AFTER the backfill, BEFORE the transform.

    python -m etl.fetch_teams
"""
from __future__ import annotations

from etl import config, db
from etl.clients.cargo import CargoSource


def main() -> None:
    conn = db.connect()
    db.apply_schema(conn)
    src = CargoSource()
    for name in ("teams", "team_redirects"):
        spec = config.TABLES[name]
        rows = src.extract_table(spec, store_key="full")
        conn.execute(f"DELETE FROM {spec.name}")
        n = db.upsert_rows(conn, spec, rows)
        print(f"[teams] {name:16s} {n:6d} rows")
    db.set_meta(conn, "sweep:team_registry", "1")
    conn.close()


if __name__ == "__main__":
    main()
