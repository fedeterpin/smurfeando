import { listPlayerIndex } from "@/lib/db";
import { T } from "@/lib/i18n";
import PlayerSearch from "@/components/PlayerSearch";

export default function PlayersPage() {
  const players = listPlayerIndex();
  return (
    <>
      <section className="page-head">
        <p className="kicker">
          <T k="players.eyebrow" />
        </p>
        <h1 className="page-title gold-text">
          <T k="players.title" />
        </h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          <T k="players.subtitle" vars={{ count: players.length }} />
        </p>
        <p className="scope-note">
          <T k="scopeNote.official" />
        </p>
      </section>
      <PlayerSearch players={players} />
    </>
  );
}
