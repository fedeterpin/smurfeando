import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import SplitRounds from "@/components/SplitRounds";
import SplitStandings from "@/components/SplitStandings";
import SplitTable from "@/components/SplitTable";
import UpdatedAt from "@/components/UpdatedAt";
import { getLiveMeta, getLiveTournaments, getSplit } from "@/lib/live";
import { T } from "@/lib/i18n";

export function generateStaticParams() {
  return getLiveTournaments().map((tournament) => ({ slug: tournament.slug }));
}

export default async function SplitPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const split = getSplit(slug);
  if (!split) notFound();
  const { tournament, rows, patches, standings, matches } = split;
  const meta = getLiveMeta();

  return (
    <>
      <BackLink />
      <section className="page-head">
        <p className="kicker">
          {tournament.league_short}
          {tournament.region_label ? ` · ${tournament.region_label}` : ""}
        </p>
        <h1 className="page-title gold-text">{tournament.name}</h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          <T
            k="split.subtitle"
            vars={{ games: tournament.games, players: rows.length }}
          />
        </p>
        {meta && <UpdatedAt stamp={meta.generated_at} />}
        <p className="scope-note">
          <T k="split.scopeNote" />
        </p>
      </section>

      {standings.length > 0 ? (
        <section className="block">
          <h2 className="block-title">
            <T k="split.standings" />
          </h2>
          <SplitStandings rows={standings} />
        </section>
      ) : (
        matches.length > 0 && (
          <p className="scope-note">
            <T k="split.noStandings" />
          </p>
        )
      )}

      {matches.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="split.rounds" />
          </h2>
          <SplitRounds matches={matches} />
        </section>
      )}

      <section className="block">
        <h2 className="block-title">
          <T k="split.players" /> <em>· {rows.length}</em>
        </h2>
        <SplitTable tournament={tournament} rows={rows} patches={patches} />
      </section>
    </>
  );
}
