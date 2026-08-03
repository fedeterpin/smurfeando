"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// Wraps a team name (or logo + name) with a link to its team page. `slug` is
// null for teams without a page (academy orgs, unresolved OE spellings) — those
// render as a plain span. `nested` is for spots where the surrounding row is
// already an <a> (player links in tables): a real anchor there would be invalid
// HTML, so we navigate from a role="link" span instead.
export default function TeamLink({
  slug,
  className,
  nested,
  children,
}: {
  slug: string | null;
  className?: string;
  nested?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  if (!slug) return <span className={className}>{children}</span>;
  const href = `/teams/${slug}`;
  if (nested) {
    const go = (e: { preventDefault(): void; stopPropagation(): void }) => {
      e.preventDefault();
      e.stopPropagation();
      router.push(href);
    };
    return (
      <span
        role="link"
        tabIndex={0}
        className={`${className ? `${className} ` : ""}team-link`}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === "Enter") go(e);
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${className ? `${className} ` : ""}team-link`}>
      {children}
    </Link>
  );
}
