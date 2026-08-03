import type { Metadata } from "next";
import { listTeams } from "@/lib/db";
import { T } from "@/lib/i18n";
import TeamSearch from "@/components/TeamSearch";

export const metadata: Metadata = {
  title: "Teams — smurfeando",
  description:
    "Every professional League of Legends team on record: all-time rosters and podium finishes at Worlds, MSI and First Stand.",
};

export default function TeamsPage() {
  const teams = listTeams();
  return (
    <>
      <section className="page-head">
        <p className="kicker">
          <T k="teams.eyebrow" />
        </p>
        <h1 className="page-title gold-text">
          <T k="teams.title" />
        </h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          <T k="teams.subtitle" vars={{ count: teams.length }} />
        </p>
        <p className="scope-note">
          <T k="scopeNote.official" />
        </p>
      </section>
      <TeamSearch teams={teams} />
    </>
  );
}
