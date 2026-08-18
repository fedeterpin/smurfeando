"""Daily 'live' slice: the day's matches + the stats of the splits in progress.

Deliberately independent from the historical almanac (`site.sqlite`: 1.6 GB of
silver + gold, refreshed by hand). This pulls ONLY the tournaments currently being
played straight from Cargo (~20 tournaments, ~3k games, ~5 min) and writes small
JSON files under `data/live/`, which the web reads at build time.

Nothing is persisted between runs, so it works from a bare checkout and can run
twice a day in CI (.github/workflows/live.yml) while the almanac keeps its own slow
refresh cadence. The only thing it reads from the repo is `data/web.sqlite`, and
only to resolve identity (slug/photo/logo) for players and teams that already have
a page.

    python -m etl.live                # full refresh of data/live/
    python -m etl.live --discover     # only list the tournaments considered live
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from etl import config
from etl.clients.cargo import CargoSource, cargo_escape
from etl.transform.aggregate import _slugify, team_logo

LIVE_DIR = config.DATA_DIR / "live"
WEB_DB = config.DATA_DIR / "web.sqlite"

# Schedule window shipped to the web. Backwards covers "yesterday" in every
# timezone (the site is static and the reader picks the day in their own clock);
# forwards covers the upcoming week of the split.
WINDOW_BACK_DAYS = 3
WINDOW_FWD_DAYS = 8
# Discovery window: a tournament counts as "in progress" if it has a match in it.
# Splits play weekly and take mid-split breaks, so a tight window would drop a
# league on a bye week; playoffs are announced weeks ahead, hence the asymmetry.
ACTIVE_BACK_DAYS = 45
ACTIVE_FWD_DAYS = 30

PLAYING_ROLES = ("Top", "Jungle", "Mid", "Bot", "Support")
CHAMPS_PER_SPLIT = 5   # champion pool kept per player and split
IN_CHUNK = 20          # OverviewPages per `IN (...)` clause (keeps URLs sane)


# --- small helpers --------------------------------------------------------
def _fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _chunks(seq, n):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def _in_clause(field: str, values) -> str:
    return f"{field} IN (" + ", ".join(f"'{cargo_escape(v)}'" for v in values) + ")"


def _int(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _round(v, digits=2):
    return None if v is None else round(v, digits)


# --- extraction -----------------------------------------------------------
def fetch_schedule(src: CargoSource, start: datetime, end: datetime) -> list[dict]:
    return src.query(
        tables="MatchSchedule=MS",
        fields=("MS.OverviewPage=OverviewPage,MS.MatchId=MatchId,MS.Team1=Team1,"
                "MS.Team2=Team2,MS.DateTime_UTC=DateTime_UTC,MS.BestOf=BestOf,"
                "MS.Winner=Winner,MS.Team1Score=Team1Score,MS.Team2Score=Team2Score,"
                "MS.Tab=Tab,MS.Patch=Patch,MS.Stream=Stream"),
        where=f"MS.DateTime_UTC >= '{_fmt(start)}' AND MS.DateTime_UTC < '{_fmt(end)}'",
        order_by="MS.DateTime_UTC",
    )


def fetch_tournaments(src: CargoSource, pages) -> list[dict]:
    rows: list[dict] = []
    for chunk in _chunks(sorted(pages), IN_CHUNK):
        rows += src.query(
            tables="Tournaments=T",
            fields=("T.OverviewPage=OverviewPage,T.Name=Name,T.League=League,"
                    "T.Region=Region,T.Year=Year,T.Split=Split,T.IsPlayoffs=IsPlayoffs,"
                    "T.DateStart=DateStart,T.Date=Date"),
            where=_in_clause("T.OverviewPage", chunk),
        )
    return rows


def fetch_leagues(src: CargoSource) -> list[dict]:
    return src.query(tables="Leagues=L",
                     fields="L.League=League,L.League_Short=League_Short,L.Region=Region")


def fetch_games(src: CargoSource, pages) -> list[dict]:
    rows: list[dict] = []
    for chunk in _chunks(sorted(pages), IN_CHUNK):
        rows += src.query(
            tables="ScoreboardGames=SG",
            fields=("SG.GameId=GameId,SG.OverviewPage=OverviewPage,SG.Patch=Patch,"
                    "SG.DateTime_UTC=DateTime_UTC,SG.Gamelength_Number=Gamelength_Number,"
                    "SG.MatchId=MatchId,SG.WinTeam=WinTeam"),
            where=_in_clause("SG.OverviewPage", chunk),
            order_by="SG.DateTime_UTC",
        )
    return rows


def fetch_player_games(src: CargoSource, pages) -> list[dict]:
    rows: list[dict] = []
    for chunk in _chunks(sorted(pages), IN_CHUNK):
        rows += src.query(
            tables="ScoreboardPlayers=SP",
            fields=("SP.GameId=GameId,SP.OverviewPage=OverviewPage,SP.Link=Link,"
                    "SP.Name=Name,SP.Champion=Champion,SP.Kills=Kills,SP.Deaths=Deaths,"
                    "SP.Assists=Assists,SP.Gold=Gold,SP.CS=CS,"
                    "SP.DamageToChampions=DamageToChampions,SP.VisionScore=VisionScore,"
                    "SP.Role=Role,SP.Team=Team,SP.TeamKills=TeamKills,"
                    "SP.PlayerWin=PlayerWin,SP.DateTime_UTC=DateTime_UTC"),
            where=_in_clause("SP.OverviewPage", chunk),
            order_by="SP.DateTime_UTC",
        )
    return rows


def fetch_rosters(src: CargoSource, pages) -> list[dict]:
    rows: list[dict] = []
    for chunk in _chunks(sorted(pages), IN_CHUNK):
        rows += src.query(
            tables="TournamentRosters=TR",
            fields=("TR.OverviewPage=OverviewPage,TR.Team=Team,TR.RosterLinks=RosterLinks,"
                    "TR.Roles=Roles"),
            where=_in_clause("TR.OverviewPage", chunk),
        )
    return rows


# --- identity (from the committed web.sqlite) -----------------------------
def load_identity() -> tuple[dict, dict, dict]:
    """player_id -> profile, team alias -> team card, region key -> label.

    Everything degrades to None: a rookie who has never appeared in the almanac
    still shows up in today's matches, just without a link or a photo.
    """
    players: dict[str, dict] = {}
    teams: dict[str, dict] = {}
    regions: dict[str, str] = {}
    if not WEB_DB.exists():
        print("[live] warning: data/web.sqlite missing -> no slugs, photos or logos")
        return players, teams, regions
    conn = sqlite3.connect(f"file:{WEB_DB}?mode=ro", uri=True)
    try:
        for pid, did, slug, image, role, country in conn.execute(
                "SELECT player_id, display_id, slug, image_url, role, country FROM player_index"):
            players[pid] = {"player_id": did or pid, "slug": slug,
                            "image": image, "role": role, "country": country}
        cards = {tid: {"name": name, "slug": slug, "logo": logo, "short": short}
                 for tid, name, slug, logo, short in conn.execute(
                     "SELECT team_id, name, slug, logo_url, short FROM team_index")}
        for alias, team_id in conn.execute("SELECT alias, team_id FROM team_aliases"):
            card = cards.get(team_id)
            if card:
                teams[alias] = card
        for region, label in conn.execute(
                "SELECT DISTINCT region, region_label FROM oe_leagues"):
            regions[region] = label
    finally:
        conn.close()
    return players, teams, regions


def team_card(name: str | None, teams: dict) -> dict:
    if not name:
        return {"name": None, "slug": None, "logo": None, "short": None}
    card = teams.get(name)
    if card:
        return {"name": name, "slug": card["slug"], "logo": card["logo"],
                "short": card["short"]}
    # Unknown org (promoted this split, renamed): the Fandom logo is still built by
    # convention, only the profile link is missing.
    return {"name": name, "slug": None, "logo": team_logo(name), "short": None}


# --- aggregation ----------------------------------------------------------
def _blank() -> dict:
    return {"games": 0, "wins": 0, "kills": 0, "deaths": 0, "assists": 0, "cs": 0,
            "gold": 0, "damage": 0, "vision": 0, "team_kills": 0, "minutes": 0.0}


def _accumulate(acc: dict, row: dict, minutes: float) -> None:
    acc["games"] += 1
    acc["wins"] += 1 if str(row.get("PlayerWin", "")).strip().lower() == "yes" else 0
    acc["kills"] += _int(row.get("Kills"))
    acc["deaths"] += _int(row.get("Deaths"))
    acc["assists"] += _int(row.get("Assists"))
    acc["cs"] += _int(row.get("CS"))
    acc["gold"] += _int(row.get("Gold"))
    acc["damage"] += _int(row.get("DamageToChampions"))
    acc["vision"] += _int(row.get("VisionScore"))
    acc["team_kills"] += _int(row.get("TeamKills"))
    acc["minutes"] += minutes


def _derive(acc: dict) -> dict:
    games, minutes = acc["games"], acc["minutes"]
    kills, deaths, assists = acc["kills"], acc["deaths"], acc["assists"]
    # KDA from raw totals, never an average of per-game ratios (see CLAUDE.md).
    out = {
        "games": games,
        "wins": acc["wins"],
        "losses": games - acc["wins"],
        "kills": kills,
        "deaths": deaths,
        "assists": assists,
        "kda": _round((kills + assists) / max(deaths, 1)),
        "win_rate": _round(acc["wins"] / games, 4) if games else None,
        "minutes": _round(minutes, 1),
    }
    # Per-minute rates come from the totals too; a game with no length recorded
    # would otherwise inflate them.
    out["cspm"] = _round(acc["cs"] / minutes) if minutes else None
    out["gpm"] = _round(acc["gold"] / minutes, 1) if minutes else None
    out["dpm"] = _round(acc["damage"] / minutes, 1) if minutes else None
    out["vspm"] = _round(acc["vision"] / minutes) if minutes else None
    out["kp"] = _round((kills + assists) / acc["team_kills"], 4) if acc["team_kills"] else None
    return out


def _mode(counter: dict) -> str | None:
    return max(counter.items(), key=lambda kv: (kv[1], kv[0]))[0] if counter else None


def build_stats(player_rows: list[dict], games_by_id: dict) -> tuple[list[dict], list[dict], dict]:
    """(player, tournament) and (player, tournament, patch) aggregates."""
    splits: dict[tuple[str, str], dict] = defaultdict(_blank)
    patches: dict[tuple[str, str, str], dict] = defaultdict(_blank)
    champs: dict[tuple[str, str], dict] = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    roles: dict[tuple[str, str], dict] = defaultdict(lambda: defaultdict(int))
    teams: dict[tuple[str, str], tuple[str, str]] = {}
    names: dict[str, str] = {}
    seen_patches: dict[str, set] = defaultdict(set)

    for row in player_rows:
        link = (row.get("Link") or "").strip()
        page = (row.get("OverviewPage") or "").strip()
        if not link or not page:
            continue
        game = games_by_id.get(row.get("GameId")) or {}
        minutes = _float(game.get("Gamelength_Number"))
        patch = (game.get("Patch") or "").strip()
        key = (link, page)
        _accumulate(splits[key], row, minutes)
        if patch:
            _accumulate(patches[(link, page, patch)], row, minutes)
            seen_patches[page].add(patch)
        champion = (row.get("Champion") or "").strip()
        if champion:
            slot = champs[key][champion]
            slot[0] += 1
            slot[1] += 1 if str(row.get("PlayerWin", "")).strip().lower() == "yes" else 0
        role = (row.get("Role") or "").strip()
        if role:
            roles[key][role] += 1
        team = (row.get("Team") or "").strip()
        stamp = row.get("DateTime_UTC") or ""
        if team and (key not in teams or stamp >= teams[key][1]):
            teams[key] = (team, stamp)
        names.setdefault(link, (row.get("Name") or link).strip())

    split_rows = []
    for (link, page), acc in splits.items():
        pool = sorted(champs[(link, page)].items(),
                      key=lambda kv: (-kv[1][0], kv[0]))[:CHAMPS_PER_SPLIT]
        split_rows.append({
            "tournament": page,
            "player": link,
            "name": names.get(link, link),
            "role": _mode(roles[(link, page)]),
            "team": teams.get((link, page), (None, ""))[0],
            **_derive(acc),
            "champions": [{"champion": c, "games": v[0], "wins": v[1]} for c, v in pool],
        })
    patch_rows = [{"tournament": page, "player": link, "patch": patch, **_derive(acc)}
                  for (link, page, patch), acc in patches.items()]
    split_rows.sort(key=lambda r: (r["tournament"], -r["games"], r["player"]))
    patch_rows.sort(key=lambda r: (r["tournament"], r["patch"], -r["games"], r["player"]))
    return split_rows, patch_rows, {p: sorted(v) for p, v in seen_patches.items()}


def build_lineups(roster_rows: list[dict], split_rows: list[dict]) -> list[dict]:
    """Five starters per team and tournament.

    `TournamentRosters` is the declared roster (available before the first game of
    the split); where the wiki has no roster yet, fall back to whoever actually
    played the most games in that role — better than an empty card.
    """
    out: list[dict] = []
    declared: set[tuple[str, str]] = set()
    for row in roster_rows:
        page = (row.get("OverviewPage") or "").strip()
        team = (row.get("Team") or "").strip()
        links = [x.strip() for x in (row.get("RosterLinks") or "").split(";;")]
        roles = [x.strip() for x in (row.get("Roles") or "").split(";;")]
        taken: set[str] = set()
        for link, role in zip(links, roles):
            # Coaches and subs share the field; only the five playing roles here.
            if not link or role not in PLAYING_ROLES or role in taken:
                continue
            taken.add(role)
            out.append({"tournament": page, "team": team, "role": role,
                        "player": link, "source": "roster"})
        if taken:
            declared.add((page, team))

    played: dict[tuple[str, str], dict] = defaultdict(dict)
    for row in split_rows:
        team, role = row.get("team"), row.get("role")
        if not team or role not in PLAYING_ROLES:
            continue
        key = (row["tournament"], team)
        if key in declared:
            continue
        best = played[key].get(role)
        if not best or row["games"] > best["games"]:
            played[key][role] = row
    for (page, team), by_role in played.items():
        for role, row in by_role.items():
            out.append({"tournament": page, "team": team, "role": role,
                        "player": row["player"], "source": "played"})
    order = {role: i for i, role in enumerate(PLAYING_ROLES)}
    out.sort(key=lambda r: (r["tournament"], r["team"], order.get(r["role"], 9)))
    return out


# --- output ---------------------------------------------------------------
def write_json(name: str, payload) -> None:
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    path = LIVE_DIR / name
    # Pretty-printed and key-sorted on purpose: this file is committed twice a day,
    # and line-based JSON deltas keep the git history far smaller than a blob.
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                    encoding="utf-8")
    print(f"[live] {path.relative_to(config.ROOT)}  {path.stat().st_size // 1024} KB")


def main() -> None:
    ap = argparse.ArgumentParser(description="Daily live slice (today's matches + splits in progress)")
    ap.add_argument("--discover", action="store_true",
                    help="only list the tournaments considered in progress")
    ap.add_argument("--now", help="ISO timestamp used as 'now' (testing)")
    args = ap.parse_args()

    now = (datetime.fromisoformat(args.now).replace(tzinfo=timezone.utc) if args.now
           else datetime.now(timezone.utc))
    src = CargoSource()

    # 1. Discovery: everything scheduled around now, narrowed to the pro allowlist.
    schedule = fetch_schedule(src, now - timedelta(days=ACTIVE_BACK_DAYS),
                              now + timedelta(days=ACTIVE_FWD_DAYS))
    pages = {r.get("OverviewPage") for r in schedule if r.get("OverviewPage")}
    tinfo = {t["OverviewPage"]: t for t in fetch_tournaments(src, pages)}
    active = {page: t for page, t in tinfo.items()
              if config.classify_tier(t.get("League"), t.get("Region"),
                                      t.get("IsPlayoffs")) in config.PRO_TIERS}
    print(f"[live] {len(schedule)} scheduled matches / {len(pages)} tournaments "
          f"-> {len(active)} in progress (pro)")
    if args.discover:
        for page, t in sorted(active.items()):
            print(f"  {t.get('Name') or page}   [{t.get('League')}]")
        return

    shorts = {row["League"]: row.get("League_Short")
              for row in fetch_leagues(src) if row.get("League")}
    games = fetch_games(src, active)
    games_by_id = {g["GameId"]: g for g in games if g.get("GameId")}
    player_rows = fetch_player_games(src, active)
    rosters = fetch_rosters(src, active)
    print(f"[live] {len(games)} games / {len(player_rows)} player rows / "
          f"{len(rosters)} roster rows")

    split_rows, patch_rows, patches_by_page = build_stats(player_rows, games_by_id)
    lineups = build_lineups(rosters, split_rows)
    players, teams, regions = load_identity()

    # Identity onto the split rows (the web links straight from the table).
    for row in split_rows:
        profile = players.get(row["player"]) or {}
        row["player_id"] = profile.get("player_id") or row.pop("name", row["player"])
        row.pop("name", None)
        row["slug"] = profile.get("slug")
        row["image"] = profile.get("image")
        card = team_card(row.get("team"), teams)
        row["team_slug"] = card["slug"]
        row["team_logo"] = card["logo"]
        # The split table is dense: it prints the tricode and keeps the full name
        # on the title attribute.
        row["team_short"] = card["short"]
    for row in lineups:
        profile = players.get(row["player"]) or {}
        row["player_id"] = profile.get("player_id") or row["player"]
        row["slug"] = profile.get("slug")
        row["image"] = profile.get("image")

    # 2. Tournament cards.
    game_counts: dict[str, int] = defaultdict(int)
    for g in games:
        game_counts[g.get("OverviewPage")] += 1
    tournaments = []
    for page, t in active.items():
        league = t.get("League") or ""
        region = config.LP_PRO_LEAGUES.get(league)
        tournaments.append({
            "overview_page": page,
            "slug": _slugify(page),
            "name": t.get("Name") or page,
            "league": league,
            "league_short": shorts.get(league) or league,
            "region": region or ("international" if t.get("Region") == config.INTERNATIONAL_REGION else None),
            "region_label": regions.get(region) if region else t.get("Region"),
            "split": t.get("Split"),
            "year": t.get("Year"),
            "is_playoffs": str(t.get("IsPlayoffs") or "0") in {"1", "Yes", "true"},
            "patches": patches_by_page.get(page, []),
            "games": game_counts.get(page, 0),
        })
    tournaments.sort(key=lambda r: (r["region"] or "zz", r["name"]))

    # 3. Matches inside the display window.
    lo, hi = _fmt(now - timedelta(days=WINDOW_BACK_DAYS)), _fmt(now + timedelta(days=WINDOW_FWD_DAYS))
    matches = []
    for row in schedule:
        page = row.get("OverviewPage")
        stamp = row.get("DateTime_UTC") or ""
        if page not in active or not (lo <= stamp < hi):
            continue
        matches.append({
            "match_id": row.get("MatchId"),
            "tournament": page,
            "datetime_utc": stamp,
            "best_of": _int(row.get("BestOf")) or None,
            "tab": row.get("Tab"),
            "patch": row.get("Patch") or None,
            "team1": team_card(row.get("Team1"), teams),
            "team2": team_card(row.get("Team2"), teams),
            "team1_score": _int(row.get("Team1Score")) if row.get("Team1Score") else None,
            "team2_score": _int(row.get("Team2Score")) if row.get("Team2Score") else None,
            "winner": _int(row.get("Winner")) or None,
        })
    matches.sort(key=lambda r: (r["datetime_utc"], r["tournament"], r["match_id"] or ""))

    write_json("meta.json", {
        "generated_at": _fmt(now),
        "window_from": lo,
        "window_to": hi,
        "tournaments": len(tournaments),
        "matches": len(matches),
        "games": len(games),
        "players": len({r["player"] for r in split_rows}),
    })
    write_json("tournaments.json", tournaments)
    write_json("matches.json", matches)
    write_json("lineups.json", lineups)
    write_json("player_splits.json", split_rows)
    write_json("player_patches.json", patch_rows)


if __name__ == "__main__":
    main()
