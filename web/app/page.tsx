import Link from "next/link";
import { listPlayerIndex } from "@/lib/db";
import { getMatchday } from "@/lib/live";
import { T } from "@/lib/i18n";
import HomeSearch, { type SearchPlayer } from "@/components/HomeSearch";
import MatchdayBoard from "@/components/MatchdayBoard";

export default function Home() {
  const players: SearchPlayer[] = listPlayerIndex().map((p) => ({
    player_id: p.player_id,
    display_id: p.display_id,
    name: p.name,
    team: p.team,
    slug: p.slug,
    role: p.role,
    image_url: p.image_url,
    score: p.score,
  }));
  const matchday = getMatchday();

  return (
    <section className="home-hero">
      <div className="home-logo" aria-hidden="true">
        <i />
      </div>
      <p className="kicker">
        <T k="home.eyebrow" />
      </p>
      <h1 className="page-title gold-text">
        <T k="home.title" />
      </h1>
      <div className="divider" aria-hidden="true">
        <span className="diamond" />
      </div>
      <p className="page-sub">
        <T k="home.subtitle" />
      </p>
      <HomeSearch players={players} />
      <div className="home-links">
        <Link href="/records" className="btn">
          <span>
            <T k="home.link.records" />
          </span>
        </Link>
        <Link href="/leaderboards" className="btn">
          <span>
            <T k="home.link.leaderboards" />
          </span>
        </Link>
        <Link href="/players" className="btn">
          <span>
            <T k="home.link.players" />
          </span>
        </Link>
        <Link href="/teams" className="btn">
          <span>
            <T k="home.link.teams" />
          </span>
        </Link>
        <Link href="/champions" className="btn">
          <span>
            <T k="home.link.champions" />
          </span>
        </Link>
      </div>
      <MatchdayBoard {...matchday} />
    </section>
  );
}
