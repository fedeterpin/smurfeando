"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { thumb } from "@/lib/icons";

// Minimal player shape for the search index (keeps the homepage payload small).
export interface SearchPlayer {
  player_id: string;
  display_id: string;
  name: string | null;
  team: string | null;
  slug: string;
  role: string | null;
  image_url: string | null;
  score: number;
}

export default function HomeSearch({ players }: { players: SearchPlayer[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return players
      .filter((p) =>
        [p.display_id, p.name, p.team]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(n)),
      )
      .slice(0, 8);
  }, [q, players]);

  return (
    <div className="home-search">
      <div className="cutp search-frame">
        <div className="cutp-in">
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            className="search-input"
            type="search"
            placeholder={t("home.search.placeholder")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0])
                router.push(`/players/${results[0].slug}`);
              if (e.key === "Escape") setOpen(false);
            }}
            aria-label={t("home.search.aria")}
            autoComplete="off"
          />
        </div>
      </div>

      {open && q.trim() && (
        <ul className="search-results">
          {results.length === 0 ? (
            <li className="sr-empty">{t("common.noMatch", { q })}</li>
          ) : (
            results.map((p) => (
              <li key={p.player_id}>
                <Link href={`/players/${p.slug}`} className="sr-item">
                  <span
                    className="avatar av-30"
                    style={
                      p.image_url
                        ? { backgroundImage: `url(${thumb(p.image_url, 60)})` }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    {!p.image_url && (p.display_id?.[0] ?? "?")}
                  </span>
                  <span className="sr-id">
                    <span className="pname">{p.display_id}</span>
                    <span className="sr-meta">
                      {[p.role, p.team].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {p.score > 0 && <span className="sr-score">{p.score}</span>}
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
