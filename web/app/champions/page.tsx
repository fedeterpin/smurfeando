import { getChampionStats } from "@/lib/db";
import { T } from "@/lib/i18n";
import ChampionTable from "@/components/ChampionTable";

export default function ChampionsPage() {
  const champions = getChampionStats(1, 2000);
  return (
    <>
      <section className="page-head">
        <p className="kicker">
          <T k="champions.eyebrow" />
        </p>
        <h1 className="page-title gold-text">
          <T k="champions.title" />
        </h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          <T k="champions.subtitle" />
        </p>
        <p className="scope-note">
          <T k="scopeNote.intl" />
        </p>
      </section>
      <ChampionTable champions={champions} />
    </>
  );
}
