import { getLeaderboard, getRegions, type LeaderboardRow } from "@/lib/db";
import { STAT_CATALOG, ROLES } from "@/lib/stats";
import { T } from "@/lib/i18n";
import LeaderboardExplorer from "@/components/LeaderboardExplorer";

export type Boards = Record<string, Record<string, LeaderboardRow[]>>;

export default function LeaderboardsPage() {
  const regions = getRegions();
  const boards: Boards = {};
  for (const s of STAT_CATALOG) {
    boards[s.key] = {};
    if (s.universes.includes("intl")) {
      boards[s.key].all = getLeaderboard(s.key, "all", 100);
      if (s.roleScoped) {
        for (const r of ROLES) {
          boards[s.key][`role:${r}`] = getLeaderboard(s.key, `role:${r}`, 100);
        }
      }
    }
    if (s.universes.includes("regional")) {
      boards[s.key].regional = getLeaderboard(s.key, "regional", 100);
      for (const r of regions) {
        boards[s.key][`region:${r.region}`] = getLeaderboard(
          s.key,
          `region:${r.region}`,
          100,
        );
      }
    }
  }
  return (
    <>
      <section className="page-head">
        <p className="kicker">
          <T k="leaderboards.eyebrow" />
        </p>
        <h1 className="page-title gold-text">
          <T k="leaderboards.title" />
        </h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          <T k="leaderboards.subtitle" />
        </p>
        <p className="scope-note">
          <T k="scopeNote.official" />
        </p>
      </section>
      <LeaderboardExplorer boards={boards} catalog={STAT_CATALOG} regions={regions} />
    </>
  );
}
