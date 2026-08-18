"""Full pull of the team registry: Teams + TeamRedirects (~9k rows, ~19 requests),
plus the real URL of every team logo.

Full mirror (DELETE + re-insert) because redirects and renames change upstream and
there is no incremental key. The transform (compute_teams) resolves every raw team
name through this registry; without it, canonicalization degrades to identity.

WARNING: Writes to the live DB -> run AFTER the backfill, BEFORE the transform.

    python -m etl.fetch_teams
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

from etl import config, db
from etl.clients.cargo import CargoSource

API = "https://lol.fandom.com/api.php"
# The API takes 50 titles per call, so ~840 logos cost ~17 requests.
BATCH = 50


def resolve_logo_urls(conn) -> int:
    """Ask the wiki for each logo's real URL instead of hashing its name.

    Fandom builds an image URL from the MD5 of the file name, which is why the
    site could get away with `<Team>logo square.png` -- until it could not: 208 of
    837 logos 404ed. Teams.Image fixes some, but plenty of those values are
    REDIRECTS (`File:LGD logo.png` -> `LGD_Gaminglogo_square.png`) and a redirect
    title hashes to a file that does not exist. imageinfo follows them.
    """
    names = [r[0] for r in conn.execute(
        "SELECT DISTINCT Image FROM teams WHERE Image IS NOT NULL AND Image <> ''")]
    resolved: dict[str, str] = {}
    for i in range(0, len(names), BATCH):
        chunk = names[i:i + BATCH]
        query = urllib.parse.urlencode({
            "action": "query", "format": "json", "prop": "imageinfo",
            "iiprop": "url", "titles": "|".join("File:" + n for n in chunk)})
        req = urllib.request.Request(f"{API}?{query}",
                                     headers={"User-Agent": config.USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.load(response)
        # Titles come back normalized and redirect-resolved, so map both ways.
        pages = data.get("query", {}).get("pages", {})
        alias = {n["from"]: n["to"] for n in data.get("query", {}).get("normalized", [])}
        by_title = {p["title"]: p["imageinfo"][0]["url"].split("/revision")[0]
                    for p in pages.values() if "imageinfo" in p}
        for name in chunk:
            title = alias.get("File:" + name, "File:" + name)
            url = by_title.get(title)
            if url:
                resolved[name] = url
    conn.executemany("UPDATE teams SET ImageURL = ? WHERE Image = ?",
                     [(url, name) for name, url in resolved.items()])
    conn.commit()
    return len(resolved)


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
    resolved = resolve_logo_urls(conn)
    print(f"[teams] logo URLs resolved   {resolved:6d}")
    db.set_meta(conn, "sweep:team_registry", "1")
    conn.close()


if __name__ == "__main__":
    main()
