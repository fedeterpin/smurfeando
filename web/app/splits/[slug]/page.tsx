import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
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
  const { tournament, rows, patches } = split;
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

      <SplitTable tournament={tournament} rows={rows} patches={patches} />
    </>
  );
}
