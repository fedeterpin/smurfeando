# Deploy — Cloudflare (Workers Builds) + GitHub

The site is **static** (Next.js `output: export`) and is built from
`data/web.sqlite` (a slim, gold-only SQLite, committed, ~2 MB).

**Cloudflare Workers Builds** is connected to the GitHub repo: on every push to
`main`, Cloudflare clones, builds and publishes. The `wrangler.jsonc` serves `web/out`
as a static-assets Worker.

## Cloudflare setup (one-time)
When connecting the repo (Workers & Pages → Import a repository):
- **Project name**: `smurfeando`
- **Build command**: `cd web && npm ci && npm run build`
- **Deploy command**: `npx wrangler deploy` (default — uses `wrangler.jsonc`)
- Deploy.

The site lives at `https://smurfeando.federicoterpin.workers.dev` — the canonical
URL for now (`metadataBase` in `web/app/layout.tsx` must match it). If a custom
domain is attached later (Worker → Domains & Routes), update `metadataBase` too.
The 2026-07 rename from `lol-pro-stats` is fully migrated: old Worker deleted,
repo renamed to `fedeterpin/smurfeando` and reconnected.

## Updating data (after a Worlds/MSI)
The **`.github/workflows/update-data.yml`** workflow (GitHub Actions, manual dispatch)
runs the ETL, regenerates `data/web.sqlite` and commits it → the push triggers the
Cloudflare rebuild. Requires secrets in the GitHub repo:
- `LEAGUEPEDIA_USERNAME` — `YourUser@lol-pro-stats` (the bot-password label predates the rebrand; it names a real Leaguepedia bot password, so renaming it would require creating a new one on `Special:BotPasswords`)
- `LEAGUEPEDIA_PASSWORD` — the bot password

Or run the ETL locally and push:
```bash
python -m etl.backfill --leagues "World Championship,Mid-Season Invitational,First Stand"
python -m etl.fetch_images
python -m etl.build_web_db
git add -f data/web.sqlite && git commit -m "chore(data): refresh" && git push
```

## Keeping the matchday fresh (daily)
The **`.github/workflows/live.yml`** workflow runs on a cron at **05:00 and 17:00
UTC** (plus manual dispatch) and refreshes only `data/live/*.json`: the schedule of
the days around it, the lineups and the stats of the splits in progress. It uses the
same two secrets and takes ~5 minutes, because it pulls only the tournaments being
played (~3k games) and keeps no state between runs — a bare checkout is enough.

The two workflows are independent: `update-data.yml` rewrites the almanac
(`web.sqlite`), `live.yml` rewrites the live slice. Both push to `main`, which is why
`live.yml` rebases before pushing.

Locally:
```bash
python -m etl.live --discover   # which tournaments count as in progress right now
python -m etl.live              # writes data/live/*.json
git add data/live && git commit -m "chore(live): refresh" && git push
```

## Notes
- The full ETL DB (`data/site.sqlite`) and the bronze (`data/raw/`) are
  gitignored; only `data/web.sqlite` (~2 MB) and `data/live/*.json` are committed.
- Local build: `cd web && npm run build && npx serve out`.
- `wrangler.jsonc` uses `not_found_handling: "404-page"` to serve `out/404.html`.
