"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/messages";

const LINKS: { href: string; k: MsgKey }[] = [
  { href: "/", k: "nav.search" },
  { href: "/leaderboards", k: "nav.leaderboards" },
  { href: "/players", k: "nav.players" },
  { href: "/teams", k: "nav.teams" },
  { href: "/champions", k: "nav.champions" },
  { href: "/records", k: "nav.records" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const links = LINKS.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      className={isActive(l.href) ? "active" : undefined}
      onClick={() => setOpen(false)}
    >
      {t(l.k)}
    </Link>
  ));

  return (
    <>
      <nav className="nav">{links}</nav>
      <button
        type="button"
        className="nav-toggle"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i aria-hidden="true" />
      </button>
      {open && (
        <div className="nav-overlay" role="dialog" aria-label="Site navigation">
          <button
            type="button"
            className="nav-close"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
          {links}
        </div>
      )}
    </>
  );
}
