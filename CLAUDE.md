# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The code, comments and documentation of this repo are in **English**. Keep that
> convention. The web UI itself is bilingual (English by default, Spanish auto-detected
> from the browser) — its copy lives in `web/lib/i18n/messages.ts`, never inline in JSX.

## What it is

A historical records almanac for professional LoL (Basketball-Reference style).
Current single source: **Leaguepedia** via its **Cargo** API. Philosophy: *"compute on
update, serve static from the edge"* — the data is small, changes slowly and is
read-heavy, so the ETL precomputes EVERYTHING and the web only reads already-aggregated tables.

## Commands

### ETL (Python 3.12, from the repo root)
```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

# Single-tournament slice (development/quick verification, recreates the schema):
python -m etl.run --tournament "2025 First Stand" --fresh

# Backfill (resumable checkpoints in etl_meta; --discover-only to just list):
python -m etl.backfill --leagues "World Championship,Mid-Season Invitational,First Stand"
python -m etl.backfill --mode full --year-from 2011   # complete history (needs a bot account)

# Full data-refresh pipeline (order MATTERS — see below):
python -m etl.backfill --leagues "..."   # 1. extracts Cargo -> data/site.sqlite
python -m etl.fetch_images               # 2. writes players.Image to the live DB
python -m etl.fetch_teams                # 3. team registry (Teams + TeamRedirects)
python -m etl.transform.aggregate        # 4. recomputes GOLD over the fresh silver
python -m etl.build_web_db               # 5. produces data/web.sqlite (slim, committed)

# Daily "live" slice: today's matches + the splits in progress. Independent of
# everything above (it does not read site.sqlite) and stateless, ~5 min from
# scratch, so it runs on a cron in CI:
python -m etl.live --discover            # only lists the tournaments considered live
python -m etl.live                       # writes data/live/*.json (committed)
```

There is no test suite. "Verification" means running a slice (`etl.run`) and inspecting
the counts summary, or bringing up the web. `etl.build_view` generates a consistent snapshot
(`data/site_view.sqlite`) to see the backfill progress without blocking the writer.

### Web (Next.js 15 / React 19, from `web/`)
```bash
cd web && npm install
npm run dev                    # dev server (reads ../data/web.sqlite on each request)
npm run build && npx serve out # static build (SSG) -> web/out
npm run lint                   # ESLint (flat config, eslint.config.mjs) — the repo's only linter
```

## Architecture

### Data pipeline: bronze → silver → gold (medallion)
```
Cargo (Leaguepedia)  --extract-->  bronze  --load-->  SILVER  --transform-->  GOLD
  etl/clients/cargo    data/raw/*.json.gz    site.sqlite   etl/transform/    site.sqlite
                                             (Cargo tables   aggregate.py     (already
                                              verbatim)                        ranked tables)
```

- **`etl/config.py` is the center.** It defines the `TableSpec`: **the SQLite columns of the
  silver layer are named EXACTLY the same as the Cargo fields**, so the loader
  (`db.upsert_rows`) inserts the row-dicts without any mapping. If you add a field, you touch
  the `TableSpec` in `config.py` AND the table in `db/schema.sql`, and they must match.
- **`etl/clients/cargo.py`** makes the RAW call to `cargoquery` (bypassing the recursive
  retry of the mwcleric fork, which hammered the rate-limit) + manual pagination +
  adaptive **AIMD** throttle + bronze persistence. Every raw pull is stored as gzip in
  `data/raw/` so silver can be rebuilt without hitting the API again (`etl.reload_bronze`).
- **`etl/transform/aggregate.py::run_all`** computes the GOLD tables in order:
  **identity** → tiers → career_stats → titles → teams → champions → leaderboards →
  player_index → records → **cleanup** → **audit**. It is all pure SQL over silver (no
  network). The audit prints a warning when profiles have no wiki page behind them or
  two orgs share a display name — the point is that a split identity shows up as a
  number instead of a silent duplicate.

### Two cadences: the almanac and the live slice
The site serves two datasets that are refreshed on completely different clocks and
never share a file:

| | Almanac | Live slice |
|---|---|---|
| What | full history, records, career stats | today's matches, splits in progress |
| Source | `data/web.sqlite` (gold) | `data/live/*.json` |
| Pipeline | `backfill` -> `aggregate` -> `build_web_db` | `etl/live.py` |
| Needs | `site.sqlite` (1.6 GB, local only) | nothing (stateless) |
| Cadence | by hand, rarely | cron 05:00 and 17:00 UTC (`.github/workflows/live.yml`) |

`etl/live.py` discovers what is being played from `MatchSchedule` (a match in the
last 45 / next 30 days), keeps only the tournaments the pro allowlist accepts, and
pulls just those: schedule, `TournamentRosters` (the lineups, available before the
first game) and their scoreboards. That is ~3k games -> ~5 min at 60 queries/min, so
CI rebuilds the slice from zero on every run instead of persisting state. The only
thing it reads from the repo is `web.sqlite`, and only to resolve identity (slug,
photo, team logo) — a rookie without a profile still shows up, just without a link.

The JSON is pretty-printed and key-sorted on purpose: it is committed twice a day
and line-based diffs keep git's history far smaller than a binary blob would.

### Two SQLite files (critical to understand)
- **`data/site.sqlite`** — the ETL's full DB (silver + gold). Gitignored. The one that
  backfill/fetch_images write to.
- **`data/web.sqlite`** — the "slim" DB with **only the GOLD tables** (`build_web_db.py` drops
  the silver ones and VACUUMs). ~2 MB, **committed** (explicit exception in `.gitignore`),
  and the only one the web reads. Regenerate it after each data refresh.

### Non-negotiable domain rules
- **KDA**: always `(ΣKills + ΣAssists) / MAX(ΣDeaths, 1)` from raw totals, **never**
  an average of per-game ratios.
- **Player identity**: the canonical key is `Players.OverviewPage`, and
  `ScoreboardPlayers.Link` is **not** it — Cargo returns whatever an editor typed on
  the match page, so `Yagao`, `YaGao` and `yagao` all arrive verbatim. Grouping by the
  raw `Link` split careers across phantom profiles: 8.600 variants, **70k pro
  player-game rows** misattributed (Xiye alone lost 891). `etl/transform/identity.py`
  resolves every Link to one `player_id` (page → redirect → case-insensitive match →
  cluster of pageless variants; **two pages claiming the same form are never merged**,
  they are reported as `ambiguous`) and materializes `scoreboard_players_canon` /
  `tournament_players_canon`, which is what the gold reads. They are TABLES, not
  views: as a view `Link` is a `COALESCE` over a join, no index applies, and the
  correlated subqueries in the gold turn `run_all` into hours.
  `Name` is the handle shown in that game (may be an old alias).
- **Source escapes**: the wiki stores `&nbsp;` and `&#x2f;` inside plain fields
  (1.519 player names, one team literally called `&#x2f;&#x2f;games`). React escapes
  on render, so they reach the page as text. `etl/transform/cleanup.py` decodes every
  gold display column at the end of `run_all`; identifier columns (`*_id`, `slug`,
  `player_link_map.link`) are skipped because they are matched against raw Cargo.
- **Tiers** (`config.classify_tier`): a tournament is `intl_premier` only if
  `Region='International'` **AND** `League ∈ {World Championship, Mid-Season Invitational,
  First Stand}`. NOTE: Worlds qualifiers/regional-finals carry `League='World
  Championship'` but a regional Region → they are NOT premier. The headline records are
  driven by tier.
- **Legacy Score** (`aggregate._legacy_score`, displayed in the UI as "Smurf score"): a
  composite, interpretable score of international greatness (titles > stage > longevity >
  performance). It is stored with its JSON breakdown in `player_index.score_breakdown` to
  display it transparently.

### Web (pure SSG)
- `next.config.mjs` uses `output: "export"` → a 100% static site, **no server
  runtime**. `better-sqlite3` only runs at build time (`serverExternalPackages`).
- `web/lib/db.ts` opens `web.sqlite` **readonly, one connection per call**, with a fallback
  to empty values if the DB does not exist (so the build does not blow up without data).
- `web/lib/stats.ts::STAT_CATALOG` is the leaderboards catalog (format, whether it has
  per-role variants) — structure only, the copy lives in the dictionaries. Adding a
  leaderboard = touch `aggregate.py` (to compute it), `STAT_CATALOG` (to display it)
  **and** the `stat.<key>.{label,short,help}` keys in **both** dictionaries.
- Player pages via `generateStaticParams` over `player_index.slug`.
- **Live slice**: `web/lib/live.ts` reads `data/live/*.json` at build time (same
  degrade-to-empty contract as `db.ts`). `MatchdayBoard` (home, above the search)
  groups the schedule by the reader's local day — the page is prerendered in UTC and
  swaps to the local zone after hydration, since SSG has no request timezone — and
  expands each match into both lineups with their split line, plus a toggle for the
  patch the match is played on. `/splits` lists what is in progress and
  `/splits/[slug]` is the gol.gg-style table (role chips, patch chips, sortable
  columns). A stage with no games yet (an announced bracket) falls back to the same
  league's split with the most games, and says so.
- **Metrics of the live slice** come from Leaguepedia alone: KDA, KP%, CS/min, DPM,
  GPM and VS/min are all derived from raw totals over minutes played (`etl/live.py`
  `_derive`). GD@15 and friends still need Oracle's Elixir and are not in it.
- **i18n (EN default, ES auto-detected)**: `web/lib/i18n/messages.ts` holds one flat
  dictionary per locale; `en` is the source of truth and `es` is typed against it, so a
  missing key is a compile error. Because the site is pure SSG there is no server to read
  `Accept-Language`: every page is **built in English** and `LocaleProvider` swaps the copy
  in the browser (`navigator.language`, overridable by the header switch and persisted in
  `localStorage`). The provider must therefore start on `DEFAULT_LOCALE` and only switch
  inside an effect — reading the browser during render would break hydration.
  Client components call `useI18n().t("key")`; server components render `<T k="key" />`
  (plus `<Num>` / `<StatValue>` for locale-aware number formatting). Only chrome is
  translated: player handles, teams, champions, countries and roles come from the DB.
  Page `metadata` (title/description) stays English — it is baked in at build time.
- **Images**: not hosted; URLs to external CDNs are built — photos/logos from the
  Fandom CDN by MD5 hash (`aggregate.cdn_image`/`team_logo`), champions from Data
  Dragon (`lib/champion.ts`), roles from Community Dragon and flags from flagcdn
  (`lib/icons.ts`). The mappings for irregular names (champion, country→ISO) live there.
  Every wiki-CDN avatar must go through `icons.thumb(url, width)`: Fandom serves the
  original upload (team logos routinely 100-250 KB) and its edge thumbnailer cuts that
  to ~2 KB at avatar size. Pass 2x the CSS slot width.

## Deploy
Static site served by **Cloudflare Workers Builds** (connected to the repo): every push to
`main` rebuilds from `data/web.sqlite`. `wrangler.jsonc` serves `web/out` as assets.
The `.github/workflows/update-data.yml` workflow (manual dispatch) runs the ETL, regenerates
`web.sqlite` and commits it → the push triggers the rebuild. See `DEPLOY.md`.
`.github/workflows/live.yml` does the same twice a day (05:00 and 17:00 UTC) for
`data/live/`, which is why the matchday is never more than half a day old.

**Branching**: work lands on **`dev`** and only reaches `main` when a batch of
features is ready. Every push to `main` triggers a Cloudflare build that takes
~25 min (~7.4k prerendered pages + asset upload), so batching is what keeps that
cost down. Two consequences:
- The cron commits `data/live/` **straight to `main`** (GitHub schedules only run on
  the default branch). Never commit a local live refresh from `dev`; if a merge
  conflicts on `data/live/*.json`, keep `main`'s copy — it is fresher by definition.
- Merge `main` into `dev` before starting a batch, so the data commits from the cron
  are already there.

## Rate limit
Fandom's **anonymous** API limits very hard (~1 query every 30-40 s with backoff), but a
**logged-in session** (bot password with the Cargo grant + confirmed account email — both
self-service on the wiki) gets a server-side limit of **60 cargo-queries/min** (verified
2026-08-10 via `meta=userinfo&uiprop=ratelimits`; in practice ~3 s per 500-row page). The
full historical backfill is therefore a matter of hours, no special flag needed. The
credentials go in `.env` (root, gitignored) as `LEAGUEPEDIA_USERNAME` /
`LEAGUEPEDIA_PASSWORD` (bot password from `Special:BotPasswords`); the client uses them
automatically, lowers its throttle floor to `MIN_REQUEST_INTERVAL_AUTH` when authed, and
still detects `apihighlimits`/`noratelimit` from the session rights (5000-row pages —
admin-only on today's Leaguepedia, so expect 500).
