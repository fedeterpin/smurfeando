import Link from "next/link";
import type { Metadata } from "next";
import { getRecords } from "@/lib/db";
import { STAT_BY_KEY, statCoverageKey, statLabelKey, type StatDef } from "@/lib/stats";
import { T, StatValue } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Hall of Records — smurfeando",
  description:
    "The all-time record book of professional League of Legends: single-game and career headline records.",
};

export default function RecordsPage() {
  const records = getRecords();

  return (
    <>
      <section className="page-head">
        <p className="kicker">
          <T k="records.eyebrow" />
        </p>
        <h1 className="page-title gold-text">
          <T k="records.title" />
        </h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          <T k="records.subtitle" />
        </p>
        <p className="scope-note">
          <T k="scopeNote.official" />
        </p>
      </section>

      {records.length === 0 ? (
        <p className="empty">
          <T k="records.empty" />
        </p>
      ) : (
        <div className="record-grid">
          {records.map((rec) => {
            const statKey = rec.record_key.replace(/^most_/, "");
            const def: StatDef | undefined = STAT_BY_KEY[statKey];
            const kind = def?.kind ?? "count";
            const featured = statKey === "legacy_score";
            let games: number | null = null;
            try {
              games = JSON.parse(rec.context ?? "{}")?.games ?? null;
            } catch {
              /* noop */
            }
            return (
              <article
                className={`cutp record-card${featured ? " featured" : " cut14"}`}
                key={rec.record_key}
              >
                <div className="cutp-in">
                  <span className="rec-label">
                    {def ? <T k={statLabelKey(statKey)} /> : rec.label}
                  </span>
                  <div className="rec-holder">
                    {rec.slug ? (
                      <Link href={`/players/${rec.slug}`}>{rec.display_id}</Link>
                    ) : (
                      rec.display_id
                    )}
                  </div>
                  <div className="rec-value gold-text">
                    <StatValue kind={kind} value={rec.value} signed={def?.signed} />
                  </div>
                  {games != null && (
                    <div className="rec-meta">
                      <T k="common.gamesCount" vars={{ n: games }} />
                    </div>
                  )}
                  {/* Say so when the source does not cover every game, rather than
                      letting the record read as complete. */}
                  {def?.coverage && (
                    <div className="rec-meta caveat">
                      <T k={statCoverageKey(statKey)} />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
