import { notFound } from "next/navigation";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import RoleIcon from "@/components/RoleIcon";
import { getTeamBySlug, getTeamPodiums, getTeamRoster, listTeams } from "@/lib/db";
import { T, Num } from "@/lib/i18n";
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
            team.logo_url ? { backgroundImage: `url(${team.logo_url})` } : undefined
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

      {roster.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="team.roster" /> <em>· {roster.length}</em>
          </h2>
          <div className="tbl tbl-roster">
            <div className="tbl-head">
              <span className="th-lab">
                <T k="common.player" />
              </span>
              <span className="th-lab col-role">
                <T k="common.role" />
              </span>
              <span className="th-lab th-num col-years">
                <T k="teams.col.years" />
              </span>
              <span className="th-lab th-num">
                <T k="common.games" />
              </span>
            </div>
            {roster.map((r, i) => {
              const cells = (
                <>
                  <span className="pcell">
                    <span
                      className="avatar av-30"
                      style={
                        r.image_url
                          ? { backgroundImage: `url(${r.image_url})` }
                          : undefined
                      }
                      aria-hidden="true"
                    >
                      {!r.image_url && ((r.display_id ?? r.player_id)?.[0] ?? "?")}
                    </span>
                    <span className="pcell-id">
                      <span className="pname">{r.display_id ?? r.player_id}</span>
                      {r.is_current ? (
                        <span className="ptag">
                          <T k="team.current" />
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="cell-role col-role">
                    <RoleIcon role={r.role} />
                  </span>
                  <span className="cell-num col-years">
                    {r.first_year === r.last_year
                      ? r.first_year
                      : `${r.first_year}–${r.last_year}`}
                  </span>
                  <span className="cell-games cell-num">{r.games}</span>
                </>
              );
              const cls = `tbl-row${i === 0 ? " first" : ""}`;
              return r.slug ? (
                <Link href={`/players/${r.slug}`} className={cls} key={r.player_id}>
                  {cells}
                </Link>
              ) : (
                <div className={cls} key={r.player_id}>
                  {cells}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
