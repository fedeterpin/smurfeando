import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import CurrentRoster from "@/components/CurrentRoster";
import RosterTable from "@/components/RosterTable";
import {
  getTeamAliases,
  getTeamBySlug,
  getTeamPodiums,
  getTeamRoster,
  listTeams,
} from "@/lib/db";
import { getTeamLineup } from "@/lib/live";
import { T, Num } from "@/lib/i18n";
import { thumb } from "@/lib/icons";
import type { MsgKey } from "@/lib/i18n/messages";

export function generateStaticParams() {
  return listTeams().map((team) => ({ slug: team.slug }));
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = getTeamBySlug(slug);
  if (!team) notFound();

  const roster = getTeamRoster(team.team_id);
  // Two different questions: who plays here now, and who ever did. The live slice
  // answers the first from the wiki's tournament roster (refreshed twice a day);
  // without it we fall back to the almanac's flag, and a disbanded org simply has
  // no current five. The table below always lists everyone, current players
  // included, because that is what an all-time roster means.
  const live = getTeamLineup([team.name, ...getTeamAliases(team.team_id)]);
  const current =
    live?.players ??
    roster
      .filter((r) => r.is_current)
      .map((r) => ({
        player_id: r.player_id,
        name: r.display_id ?? r.player_id,
        slug: r.slug,
        image: r.image_url,
        role: r.role,
        games: r.games,
      }));
  const podiums = getTeamPodiums(team.team_id);
  const years =
    team.first_year === team.last_year
      ? team.first_year
      : `${team.first_year}–${team.last_year}`;

  const tiles: { key: MsgKey; value: React.ReactNode; accent?: boolean }[] = [
    { key: "team.tile.games", value: <Num value={team.games} /> },
    { key: "team.tile.players", value: <Num value={team.players} /> },
    {
      key: "team.tile.titles",
      value: <Num value={team.titles} />,
      accent: team.titles > 0,
    },
    { key: "team.tile.podiums", value: <Num value={team.podiums} /> },
  ];

  return (
    <>
      <BackLink />

      <header className="player-hero">
        <span
          className="avatar av-96 sq"
          style={
            team.logo_url ? { backgroundImage: `url(${thumb(team.logo_url, 192)})` } : undefined
          }
          aria-hidden="true"
        >
          {!team.logo_url && (team.name?.[0] ?? "?")}
        </span>
        <div>
          <h1 className={`player-name${team.titles > 0 ? " gold-text" : ""}`}>
            {team.name}
          </h1>
          <p className="player-chips">
            {team.region && <span className="pchip">{team.region}</span>}
            <span className="pchip">{years}</span>
            <span className="pchip">
              <T k="common.gamesCount" vars={{ n: team.games }} />
            </span>
            {team.is_disbanded ? (
              <span className="pchip retired">
                <T k="team.disbanded" />
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <div className="tile-row">
        {tiles.map((tile) => (
          <div className="cutp cut14 tile" key={tile.key}>
            <div className="cutp-in">
              <div className={`tile-val${tile.accent ? " accent" : ""}`}>
                {tile.value}
              </div>
              <div className="tile-label">
                <T k={tile.key} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="scope-note">
        <T k="scopeNote.official" />
      </p>

      {podiums.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="team.podiums" /> <em>· {podiums.length}</em>
          </h2>
          <div className="trophy-list">
            {podiums.map((p) => (
              <div className="trophy-row" key={p.overview_page}>
                <span className={`rank-chip r${p.place_num}`}>#{p.place}</span>
                <span className="trophy-event">{p.event}</span>
                <span className="trophy-year">{p.year}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {current.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="team.rosterCurrent" />{" "}
            <em>· {live?.tournament?.name ?? current.length}</em>
          </h2>
          <CurrentRoster rows={current} />
        </section>
      )}

      {roster.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="team.roster" /> <em>· {roster.length}</em>
          </h2>
          <RosterTable rows={roster} />
        </section>
      )}

    </>
  );
}
