import type { Metadata } from "next";
import Link from "next/link";
import { T } from "@/lib/i18n";

// Rendered into out/404.html by the static export, which is what
// wrangler.jsonc serves (`not_found_handling: "404-page"`). Without this file
// Next ships its own bare default page, outside the site's design.
export const metadata: Metadata = {
  title: "Page not found — smurfeando",
};

export default function NotFound() {
  return (
    <section className="home-hero notfound">
      <p className="nf-code gold-text" aria-hidden="true">
        404
      </p>
      <p className="kicker">
        <T k="notFound.eyebrow" />
      </p>
      <h1 className="page-title gold-text">
        <T k="notFound.title" />
      </h1>
      <div className="divider" aria-hidden="true">
        <span className="diamond" />
      </div>
      <p className="page-sub">
        <T k="notFound.subtitle" />
      </p>
      <div className="home-links">
        <Link href="/" className="btn">
          <span>
            <T k="notFound.search" />
          </span>
        </Link>
        <Link href="/splits" className="btn">
          <span>
            <T k="nav.splits" />
          </span>
        </Link>
        <Link href="/players" className="btn">
          <span>
            <T k="home.link.players" />
          </span>
        </Link>
        <Link href="/records" className="btn">
          <span>
            <T k="home.link.records" />
          </span>
        </Link>
      </div>
    </section>
  );
}
