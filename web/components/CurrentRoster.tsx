import Link from "next/link";
import RoleIcon from "@/components/RoleIcon";
import { T, Num } from "@/lib/i18n";
import { ROLES } from "@/lib/stats";

/** One card. Fed either by the live lineup or by the almanac's roster flag. */
export interface RosterCard {
  player_id: string;
  name: string;
  slug: string | null;
  image: string | null;
  role: string | null;
  games: number | null;
}

const ORDER = new Map<string, number>(ROLES.map((r, i) => [r as string, i]));

/**
 * The players on the roster right now. Deliberately not the all-time table below
 * it: this answers "who plays for them today", so it reads by position (Top to
 * Support) instead of by career games.
 */
export default function CurrentRoster({ rows }: { rows: RosterCard[] }) {
  const lineup = [...rows].sort(
    (a, b) =>
      (ORDER.get(a.role ?? "") ?? 9) - (ORDER.get(b.role ?? "") ?? 9) ||
      (b.games ?? 0) - (a.games ?? 0),
  );
  return (
    <div className="roster-now">
      {lineup.map((player) => {
        const card = (
          <>
            <span
              className="avatar av-56"
              style={
                player.image ? { backgroundImage: `url(${player.image})` } : undefined
              }
              aria-hidden="true"
            >
              {!player.image && (player.name?.[0] ?? "?")}
            </span>
            <span className="roster-now-role">
              <RoleIcon role={player.role} className="ic role sm" />
            </span>
            <span className="roster-now-name">{player.name}</span>
            {player.games != null && (
              <span className="roster-now-games">
                <Num value={player.games} /> <T k="common.gamesLower" />
              </span>
            )}
          </>
        );
        return player.slug ? (
          <Link
            href={`/players/${player.slug}`}
            className="roster-now-card"
            key={player.player_id}
          >
            {card}
          </Link>
        ) : (
          <div className="roster-now-card" key={player.player_id}>
            {card}
          </div>
        );
      })}
    </div>
  );
}
