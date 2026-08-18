import TeamLink from "@/components/TeamLink";
import { T } from "@/lib/i18n";
import type { LiveStanding } from "@/lib/live";

/**
 * Where every team stands in the phase being played. This is what a split page
 * opens with: the competitive picture first, player numbers after it.
 *
 * The wiki emits one flat list per page even when the phase runs several tables
 * (LCK 2026 plays two groups), so the ETL numbers them and we only print a group
 * heading when there is more than one.
 */
export default function SplitStandings({ rows }: { rows: LiveStanding[] }) {
  const groups = [...new Set(rows.map((r) => r.group))].sort((a, b) => a - b);
  return (
    <>
      {groups.map((group) => {
        const table = rows.filter((r) => r.group === group);
        return (
          <div className="standings" key={group}>
            {groups.length > 1 && (
              <h3 className="standings-group">
                <T k="split.group" vars={{ n: group }} />
              </h3>
            )}
            <div className="tbl tbl-standings">
              <div className="tbl-head">
                <span className="th-lab col-place">#</span>
                <span className="th-lab">
                  <T k="common.team" />
                </span>
                <span className="th-lab th-num">
                  <T k="split.series" />
                </span>
                <span className="th-lab th-num col-games">
                  <T k="split.gamesRecord" />
                </span>
                <span className="th-lab th-num col-streak">
                  <T k="split.streak" />
                </span>
              </div>
              {table.map((row, i) => (
                <div
                  className={`tbl-row${i === 0 ? " first" : ""}`}
                  key={`${row.team.name}-${row.place}`}
                >
                  <span className={`cell-place${row.place && row.place <= 3 ? ` p${row.place}` : ""}`}>
                    {row.place_label ?? row.place ?? "—"}
                  </span>
                  <span className="pcell">
                    <span
                      className="avatar av-30 sq"
                      style={
                        row.team.logo
                          ? { backgroundImage: `url(${row.team.logo})` }
                          : undefined
                      }
                      aria-hidden="true"
                    >
                      {!row.team.logo && (row.team.name?.[0] ?? "?")}
                    </span>
                    <TeamLink slug={row.team.slug} className="pname">
                      {row.team.name ?? "—"}
                    </TeamLink>
                  </span>
                  <span className="cell-num">
                    {row.win_series}–{row.loss_series}
                  </span>
                  <span className="cell-num col-games">
                    {row.win_games}–{row.loss_games}
                  </span>
                  <span className="cell-num col-streak">
                    {row.streak > 0 && row.streak_direction ? (
                      <span className={`streak s-${row.streak_direction.toLowerCase()}`}>
                        {row.streak_direction}
                        {row.streak}
                      </span>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
