import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import PlayerSplit from "@/components/PlayerSplit";
import TeamLink from "@/components/TeamLink";
import {
  getPlayerBySlug,
  getPlayerChampions,
  getPlayerTitles,
  getPlayerTeams,
  getPlayerRankings,
  getPlayerRegions,
  getScoreRank,
  listPlayerSlugs,
} from "@/lib/db";
import { getPlayerLive } from "@/lib/live";
import { championSquare } from "@/lib/champion";
import { roleIcon, countryFlag } from "@/lib/icons";
import { STAT_BY_KEY, statLabelKey } from "@/lib/stats";
import { T, Num, StatValue, ScopeLabel } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/messages";

export function generateStaticParams() {
  return listPlayerSlugs().map((p) => ({ slug: p.slug }));
}

// The legacy-score split, shown as micro-label + mono pairs (design spec).
const BD_PARTS: { key: string; label: MsgKey }[] = [
  { key: "titles", label: "player.breakdown.titles" },
  { key: "stage", label: "player.breakdown.stage" },
  { key: "longevity", label: "player.breakdown.longevity" },
  { key: "performance", label: "player.breakdown.performance" },
];

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const player = getPlayerBySlug(slug);
  if (!player) notFound();

  // The only part of this page that is not all-time: what they are playing now.
  const live = getPlayerLive(player.player_id);
  const champs = getPlayerChampions(player.player_id, 12);
  const titles = getPlayerTitles(player.player_id);
  const teams = getPlayerTeams(player.player_id);
  const scoreRank = getScoreRank(player.score);
  const breakdown: Record<string, number> = (() => {
    try {
      return JSON.parse(player.score_breakdown ?? "{}");
    } catch {
      return {};
    }
  })();
  const rankings = getPlayerRankings(player.player_id, 10).filter(
    (r) => STAT_BY_KEY[r.stat],
  );
  const held = rankings.sort((a, b) => a.rank - b.rank).slice(0, 8);
  // Gold-gradient name is earned: only for players holding a #1 record.
  const hasFirst = rankings.some((r) => r.rank === 1);
  const maxPoolGames = Math.max(...champs.map((c) => c.games), 1);

  const isOe = player.source === "oe";
  // Biggest regional career; drives the featured panel for regional-only players.
  const mainRegion = isOe ? getPlayerRegions(player.player_id)[0] : undefined;

  const regionalParts: { key: MsgKey; value: React.ReactNode }[] = [
    {
      key: "player.tile.careerKda",
      value: <StatValue kind="ratio" value={player.kda} />,
    },
    {
      key: "player.tile.winRate",
      value: <StatValue kind="percent" value={player.win_rate} />,
    },
    {
      key: "player.tile.gd15",
      value:
        mainRegion?.gd15 == null ? (
          "—"
        ) : (
          <StatValue kind="count" value={mainRegion.gd15} signed />
        ),
    },
    {
      key: "player.tile.csPerMin",
      value:
        mainRegion?.cs_per_min == null ? (
          "—"
        ) : (
          <StatValue kind="ratio" value={mainRegion.cs_per_min} />
        ),
    },
  ];

  const tiles: { key: MsgKey; value: React.ReactNode; accent?: boolean }[] = [
    { key: "player.tile.games", value: <Num value={player.games} /> },
    {
      key: "player.tile.careerKda",
      value: <StatValue kind="ratio" value={player.kda} />,
      accent: true,
    },
    {
      key: "player.tile.winRate",
      value: <StatValue kind="percent" value={player.win_rate} />,
    },
    // Regional-only players have no international record to show here.
    ...(isOe
      ? [
          {
            key: "player.tile.csPerMin" as MsgKey,
            value:
              mainRegion?.cs_per_min == null ? (
                "—"
              ) : (
                <StatValue kind="ratio" value={mainRegion.cs_per_min} />
              ),
          },
          {
            key: "player.tile.gd15" as MsgKey,
            value:
              mainRegion?.gd15 == null ? (
                "—"
              ) : (
                <StatValue kind="count" value={mainRegion.gd15} signed />
              ),
          },
        ]
      : [
          {
            key: "player.tile.intlTitles" as MsgKey,
            value: <Num value={player.intl_titles} />,
          },
          {
            key: "player.tile.worldsTitles" as MsgKey,
            value: <Num value={player.worlds_titles} />,
          },
        ]),
  ];

  return (
    <>
      <BackLink />

      <header className="player-hero">
        <span
          className="avatar av-96"
          style={
            player.image_url ? { backgroundImage: `url(${player.image_url})` } : undefined
          }
          aria-hidden="true"
        >
          {!player.image_url && (player.display_id?.[0] ?? "?")}
        </span>
        <div>
          <h1 className={`player-name${hasFirst ? " gold-text" : ""}`}>
            {player.display_id}
          </h1>
          {player.name && player.name !== player.display_id && (
            <p className="player-real">{player.name}</p>
          )}
          <p className="player-chips">
            {player.role && (
              <span className="pchip" title={player.role}>
                {roleIcon(player.role) && (
                  <span
                    className="ic role"
                    style={{ backgroundImage: `url(${roleIcon(player.role)})` }}
                  />
                )}
                {player.role}
              </span>
            )}
            {player.team && (
              <TeamLink slug={player.team_slug} className="pchip">
                {player.team_logo_url && (
                  <span
                    className="ic team"
                    style={{ backgroundImage: `url(${player.team_logo_url})` }}
                  />
                )}
                {player.team}
              </TeamLink>
            )}
            {player.country && (
              <span className="pchip">
                {countryFlag(player.country) && (
                  <span
                    className="ic flag"
                    style={{ backgroundImage: `url(${countryFlag(player.country)})` }}
                  />
                )}
                {player.country}
              </span>
            )}
            {player.is_retired ? (
              <span className="pchip retired">
                <T k="player.retired" />
              </span>
            ) : null}
          </p>
        </div>
      </header>

      {/* Regional-only players have no Smurf Score to show — it measures
          international competition and they have none — so the same featured panel
          carries their domestic career instead of standing empty at zero. */}
      <section className="cutp featured score-panel">
        <div className="cutp-in">
          <div className="score-main">
            <div className="score-num gold-text">
              <Num value={isOe ? player.games : player.score} />
            </div>
            <div className="score-cap">
              <div className="score-label">
                <T k={isOe ? "player.regionalCareer" : "player.legacyScore"} />
              </div>
              {isOe
                ? mainRegion?.region_label && (
                    <div className="score-rank">{mainRegion.region_label}</div>
                  )
                : scoreRank.rank > 0 && (
                    <div className="score-rank">
                      <T
                        k="player.rank"
                        vars={{ rank: scoreRank.rank, total: scoreRank.total }}
                      />
                    </div>
                  )}
            </div>
          </div>
          <div className="score-parts">
            {isOe
              ? regionalParts.map((p) => (
                  <div className="spart" key={p.key}>
                    <span className="spart-label">
                      <T k={p.key} />
                    </span>
                    <span className="spart-val">{p.value}</span>
                  </div>
                ))
              : BD_PARTS.map((p) => (
                  <div className="spart" key={p.key}>
                    <span className="spart-label">
                      <T k={p.label} />
                    </span>
                    <span className="spart-val">{breakdown[p.key] || 0}</span>
                  </div>
                ))}
          </div>
        </div>
      </section>
      {isOe && (
        <p className="rail-note caveat">
          <T k="player.regionalOnly" />
        </p>
      )}

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
        <T k={isOe ? "scopeNote.official" : "scopeNote.intl"} />
      </p>

      {live.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.currentSplit" />
          </h2>
          {live.map((entry) => (
            <PlayerSplit entry={entry} key={entry.line.tournament} />
          ))}
        </section>
      )}

      {held.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.recordsHeld" />
          </h2>
          <div className="held-list">
            {held.map((r) => (
              <div className="held-row" key={`${r.stat}-${r.scope}`}>
                <span className={`rank-chip${r.rank <= 3 ? ` r${r.rank}` : ""}`}>
                  #{r.rank}
                </span>
                <span className="held-name">
                  <T k={statLabelKey(r.stat)} />
                  {r.scope !== "all" && (
                    <em>
                      {" "}
                      · <ScopeLabel scope={r.scope} label={r.scope_label} />
                    </em>
                  )}
                </span>
                <span className="held-val">
                  <StatValue kind={STAT_BY_KEY[r.stat].kind} value={r.value} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {teams.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.teamHistory" />
          </h2>
          <div className="th-list">
            {teams.map((team) => (
              <div className="th-row" key={team.team}>
                {team.team_logo_url && (
                  <span
                    className="th-logo"
                    style={{ backgroundImage: `url(${team.team_logo_url})` }}
                    aria-hidden="true"
                  />
                )}
                <TeamLink slug={team.team_slug} className="th-name">
                  {team.team}
                </TeamLink>
                <span className="th-years">
                  {team.first_year === team.last_year
                    ? team.first_year
                    : `${team.first_year}–${team.last_year}`}{" "}
                  · <T k="common.gamesCount" vars={{ n: team.games }} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {titles.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.trophyCase" /> <em>· {titles.length}</em>
          </h2>
          <div className="trophy-list">
            {titles.map((title) => (
              <div className="trophy-row" key={title.overview_page}>
                <span className="diamond" aria-hidden="true" />
                <span className="trophy-event">
                  {title.event}
                  {title.team && (
                    <TeamLink slug={title.team_slug}>
                      <em>{title.team}</em>
                    </TeamLink>
                  )}
                </span>
                <span className="trophy-year">{title.year}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {champs.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.championPool" />
          </h2>
          <div className="pool-list">
            {champs.map((c) => (
              <div className="pool-row" key={c.champion}>
                <span
                  className="champ-icon"
                  style={{ backgroundImage: `url(${championSquare(c.champion)})` }}
                  aria-hidden="true"
                />
                <span className="pool-name">{c.champion}</span>
                <span className="pool-num">
                  <T k="common.gamesCount" vars={{ n: c.games }} />
                </span>
                <span className="pool-num pool-wl">
                  {c.wins}
                  <T k="common.winShort" /> {c.games - c.wins}
                  <T k="common.lossShort" />
                </span>
                <span className="pool-num pool-kda">
                  <b>
                    <StatValue kind="ratio" value={c.kda} />
                  </b>{" "}
                  <T k="common.kda" />
                </span>
                <span className="pool-bar" aria-hidden="true">
                  <i style={{ width: `${(c.games / maxPoolGames) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
