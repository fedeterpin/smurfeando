import { roleIcon } from "@/lib/icons";
import { ROLE_SHORT } from "@/lib/stats";

// A role as its position icon (Community Dragon), with the full role name on
// title/aria so it never becomes hover-only for screen readers. Falls back to
// the short text ("JG") when the icon is unknown, and to "—" without a role.
// No hooks, so it renders from both server and client components.
export default function RoleIcon({
  role,
  className = "ic role",
}: {
  role: string | null | undefined;
  className?: string;
}) {
  if (!role) return <>—</>;
  const url = roleIcon(role);
  if (!url) return <>{ROLE_SHORT[role] ?? role}</>;
  return (
    <span
      className={className}
      role="img"
      aria-label={role}
      title={role}
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}
