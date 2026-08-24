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

## Branching: batch on `dev`, deploy from `main`
Every push to `main` rebuilds the whole site on Cloudflare, and with ~7.4k
prerendered pages that takes **~25 minutes**. So feature work goes to **`dev`** and
`main` only receives finished batches:

```bash
git checkout dev
# ... work, commit, push to dev as often as you like (no production build)
git checkout main && git merge dev && git push    # one build, one deploy
```

Two things to keep in mind:
- **The daily cron commits to `main`**, not `dev` (GitHub schedules only run on the
  default branch). Do not commit a local `data/live/` refresh from `dev`; on a merge
  conflict there, keep `main`'s copy. Merging `main` into `dev` before each batch
  avoids the situation entirely.
- If **non-production branch builds** are enabled for the Worker (dashboard →
  Worker → Settings → Builds), every push to `dev` also builds a preview. Useful for
  reviewing before merging, wasteful if the point is to save build time — decide one
  way and set it there; it is dashboard config, not `wrangler.jsonc`.

## Keeping the matchday fresh (daily)
The **`.github/workflows/live.yml`** workflow runs on a cron at **05:00 and 17:00
UTC** (plus manual dispatch) and refreshes only `data/live/*.json`: the schedule of
the days around it, the lineups and the stats of the splits in progress. It uses the
same two secrets and takes ~5 minutes, because it pulls only the tournaments being
played (~3k games) and keeps no state between runs — a bare checkout is enough.

The two workflows are independent: `update-data.yml` rewrites the almanac
(`web.sqlite`), `live.yml` rewrites the live slice. Both push to `main`, which is why
`live.yml` rebases before pushing.

> **Never tag those commits `[skip ci]`.** Cloudflare Workers Builds honours that
> marker too, not just GitHub Actions, so it skips the deploy — and the cron's whole
> point is that its push deploys. It cost six days once: between 18 and 24 Aug 2026
> the cron committed a fresh slice twice a day and the site stayed on the 18 Aug
> build, showing a matchday that ran out on the 22nd. The marker was not buying
> anything either: a push made with `GITHUB_TOKEN` does not retrigger workflows.

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
