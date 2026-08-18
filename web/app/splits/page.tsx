import type { Metadata } from "next";
import Link from "next/link";
import { getLiveMeta, getLiveTournaments } from "@/lib/live";
import { T } from "@/lib/i18n";
import UpdatedAt from "@/components/UpdatedAt";

export const metadata: Metadata = {
  title: "Splits in progress — smurfeando",
  description:
    "Player stats for every professional League of Legends split currently being played: KDA, kill participation, CS per minute, DPM and gold per minute, filterable by patch.",
};

export default function SplitsPage() {
  // Announced brackets with no games yet are not in progress; their page still
  // builds (a match card can link to it), it just does not headline this index.
  const tournaments = getLiveTournaments().filter((t) => t.games > 0);
  const meta = getLiveMeta();

  return (
    <>
      <section className="page-head">
        <p className="kicker">
          <T k="splits.eyebrow" />
        </p>
        <h1 className="page-title gold-text">
          <T k="splits.title" />
        </h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          <T k="splits.subtitle" vars={{ count: tournaments.length }} />
        </p>
        {meta && <UpdatedAt stamp={meta.generated_at} />}
      </section>

      {tournaments.length === 0 ? (
        <p className="mday-empty">
          <T k="live.noData" />
        </p>
      ) : (
        <div className="split-cards">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.slug}
              href={`/splits/${tournament.slug}`}
              className="cutp split-card"
            >
              <span className="cutp-in">
                <span className="split-card-league">
                  {tournament.league_short}
                </span>
                <span className="split-card-name">{tournament.name}</span>
                <span className="split-card-meta">
                  {tournament.region_label && (
                    <em>{tournament.region_label}</em>
                  )}
                  <T k="live.gamesPlayed" vars={{ n: tournament.games }} />
                </span>
                {tournament.patches.length > 0 && (
                  <span className="split-card-patches">
                    <T
                      k="live.patchRange"
                      vars={{
                        from: tournament.patches[0],
                        to: tournament.patches[tournament.patches.length - 1],
                      }}
                    />
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
