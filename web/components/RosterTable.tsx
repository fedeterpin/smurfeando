import Link from "next/link";
import RoleIcon from "@/components/RoleIcon";
import { T } from "@/lib/i18n";
import type { TeamRosterRow } from "@/lib/db";
import { thumb } from "@/lib/icons";

/** The all-time roster table: one row per player who ever played for the org. */
export default function RosterTable({ rows }: { rows: TeamRosterRow[] }) {
  return (
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
      {rows.map((r, i) => {
        const cells = (
          <>
            <span className="pcell">
              <span
                className="avatar av-30"
                style={
                  r.image_url ? { backgroundImage: `url(${thumb(r.image_url, 60)})` } : undefined
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
  );
}
