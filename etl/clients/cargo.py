"""Cargo client on top of mwcleric: manual pagination + throttle + backoff + bronze.

mwcleric.CargoClient.query auto-paginates but does not throttle or retry on
'ratelimited' (and a failure mid-way loses the progress). Here we paginate page by page
(limit=page_size disables auto_continue), serialize, do exponential backoff and persist
each raw pull (bronze) as gzip so we can rebuild without hitting the API again.
"""
from __future__ import annotations

import gzip
import json
import os
import time
from pathlib import Path
from typing import Iterable

import requests
from mwrogue.esports_client import EsportsClient
from mwcleric.auth_credentials import AuthCredentials
from mwclient.errors import APIError, MaximumRetriesExceeded

from etl import config

RETRYABLE_CODES = {"ratelimited", "maxlag", "readonly", "internal_api_error_DBQueryError"}
# Network-level failures (connection drops, read timeouts) also deserve patient
# retries: a multi-hour backfill must survive a brief internet outage.
NETWORK_ERRORS = (requests.exceptions.RequestException, MaximumRetriesExceeded)


def normalize_keys(row: dict) -> dict:
    """Cargo returns field names with spaces (Foo_Bar -> 'Foo Bar'). We turn them
    back into underscores so they match the requested field names."""
    return {k.replace(" ", "_"): v for k, v in row.items()}


class CargoSource:
    def __init__(self, wiki: str = config.WIKI, raw_dir: Path | None = None,
                 min_interval: float = config.MIN_REQUEST_INTERVAL):
        self.wiki = wiki
        self.raw_dir = raw_dir or config.RAW_DIR
        self.min_interval = min_interval      # floor of the adaptive interval
        self._interval = min_interval         # current interval (AIMD)
        self._last_request_ts = 0.0
        self._client: EsportsClient | None = None
        self._authed = False
        self._has_apihighlimits = False
        self._no_ratelimit = False

    # -- connection (lazy) ------------------------------------------------
    @property
    def client(self) -> EsportsClient:
        if self._client is None:
            self._client = self._connect()
        return self._client

    def _connect(self) -> EsportsClient:
        user = os.environ.get("LEAGUEPEDIA_USERNAME")
        pwd = os.environ.get("LEAGUEPEDIA_PASSWORD")
        creds = None
        if user and pwd:
            creds = AuthCredentials(username=user, password=pwd)
            self._authed = True
        # The mwcleric fork exposes `user_agent` (it maps it to clients_useragent
        # internally); max_lag flows through **kwargs down to mwclient.Site.
        client = EsportsClient(
            self.wiki,
            credentials=creds,
            user_agent=config.USER_AGENT,
            max_lag=config.MAX_LAG,
        )
        # The real cargoquery cap depends on apihighlimits (500 without, 5000 with).
        # We detect it from the session rights to pick the right page_size
        # (avoids the "must be between 1 and 500" warning and an extra empty query).
        try:
            info = client.cargo_client.client.api(
                "query", meta="userinfo", uiprop="rights", format="json")
            rights = info.get("query", {}).get("userinfo", {}).get("rights", [])
            self._has_apihighlimits = "apihighlimits" in rights
            self._no_ratelimit = "noratelimit" in rights
            if self._no_ratelimit:      # bot group: no throttle
                self._interval = 0.0
            elif self._authed:
                # Logged-in sessions are limited at 60 cargo-queries/min, not the
                # harsh anonymous regime -> lower the floor accordingly.
                self.min_interval = min(self.min_interval, config.MIN_REQUEST_INTERVAL_AUTH)
                self._interval = min(self._interval, self.min_interval)
        except Exception:
            self._has_apihighlimits = False
        return client

    @property
    def page_size(self) -> int:
        return config.PAGE_SIZE_BOT if self._has_apihighlimits else config.PAGE_SIZE_ANON

    # -- adaptive throttle / backoff (AIMD) ------------------------------
    def _throttle(self) -> None:
        if self._interval <= 0:            # noratelimit: no throttle
            return
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self._interval:
            time.sleep(self._interval - elapsed)
        self._last_request_ts = time.monotonic()

    def _decay_interval(self) -> None:
        """Success: slowly lower the interval toward the floor (additive-ish / multiplicative)."""
        if not self._no_ratelimit and self._interval > self.min_interval:
            self._interval = max(self.min_interval, self._interval * 0.9)

    def _grow_interval(self) -> None:
        """Rate-limit: raise the interval aggressively (up to the ceiling)."""
        if not self._no_ratelimit:
            self._interval = min(config.MAX_INTERVAL, max(self._interval, 2.0) * 1.5)

    def _query_page(self, *, tables, fields, where=None, join_on=None,
                    group_by=None, order_by=None, limit=None, offset=0) -> list[dict]:
        # RAW call to cargoquery: avoids the recursive/fast retry of the mwcleric fork
        # (it hammers the rate-limit and extends the penalty). Our patient, adaptive
        # backoff handles 'ratelimited'.
        data = {"tables": tables, "fields": fields, "format": "json"}
        if join_on:
            data["join_on"] = join_on
        if where:
            data["where"] = where
        if group_by:
            data["group_by"] = group_by
        if order_by:
            data["order_by"] = order_by
        if limit is not None:
            data["limit"] = limit
        if offset:
            data["offset"] = offset
        site = self.client.cargo_client.client
        last_err = None
        for attempt in range(config.MAX_RETRIES):
            self._throttle()
            try:
                resp = site.api("cargoquery", **data)
                self._decay_interval()
                # Cargo returns the keys with spaces (DateTime_UTC -> 'DateTime UTC').
                # We normalize to underscore so they match the field names.
                return [normalize_keys(item["title"]) for item in resp.get("cargoquery", [])]
            except APIError as e:
                code = getattr(e, "code", "")
                if code not in RETRYABLE_CODES:
                    raise
                last_err = e
                self._grow_interval()
                # Wait QUIETLY (no eager retries that extend the penalty).
                wait = min(90.0, config.RATELIMIT_COOLDOWN * (attempt + 1))
                print(f"    [cargo] {code}; interval->{self._interval:.0f}s; "
                      f"quiet wait {wait:.0f}s ({attempt + 1}/{config.MAX_RETRIES})")
                time.sleep(wait)
            except NETWORK_ERRORS as e:
                # Not a rate limit: leave the AIMD interval alone, just wait out the
                # outage with growing pauses (up to ~5 min per attempt).
                last_err = e
                wait = min(300.0, 30.0 * (attempt + 1))
                print(f"    [cargo] network error ({type(e).__name__}); "
                      f"quiet wait {wait:.0f}s ({attempt + 1}/{config.MAX_RETRIES})")
                time.sleep(wait)
        raise RuntimeError(f"Cargo query exhausted retries: {last_err}")

    # -- public API -------------------------------------------------------
    def query(self, *, tables: str, fields: Iterable[str] | str, where: str | None = None,
              join_on: str | None = None, group_by: str | None = None,
              order_by: str | None = None) -> list[dict]:
        """Full paginated query (all pages)."""
        if not isinstance(fields, str):
            fields = ", ".join(fields)
        # page_size is already the server's real cap (500 without apihighlimits, 5000
        # with) -> a page shorter than ps is the last one. We advance by len(page) for
        # robustness.
        ps = self.page_size
        rows: list[dict] = []
        offset = 0
        while True:
            page = self._query_page(tables=tables, fields=fields, where=where,
                                    join_on=join_on, group_by=group_by,
                                    order_by=order_by, limit=ps, offset=offset)
            if not page:
                break
            rows.extend(page)
            if len(page) < ps:
                break
            offset += len(page)
        return rows

    def extract_table(self, spec: config.TableSpec, where: str | None = None,
                      store_key: str | None = None) -> list[dict]:
        """Extracts a silver table according to its spec, filtering by `where`, and stores bronze."""
        rows = self.query(
            tables=spec.cargo_table,
            fields=spec.cargo_fields or spec.fields,
            where=where,
            order_by=spec.order_by,
        )
        self._store_bronze(spec.name, rows, store_key)
        return rows

    def _store_bronze(self, name: str, rows: list[dict], store_key: str | None) -> Path:
        key = _slug(store_key) if store_key else "full"
        dest = self.raw_dir / name
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / f"{key}.json.gz"
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            json.dump(rows, fh, ensure_ascii=False)
        return path


def _slug(text: str) -> str:
    keep = []
    for ch in text:
        keep.append(ch if ch.isalnum() or ch in "-_" else "_")
    return "".join(keep)[:120] or "full"


def cargo_escape(value: str) -> str:
    """Escapes a value for a Cargo `where` clause (single quotes)."""
    return value.replace("\\", "\\\\").replace("'", "\\'")
