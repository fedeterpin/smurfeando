"use client";

import { useId } from "react";
import { useI18n } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/messages";

// Small ⓘ trigger with a CSS-only tooltip: shown on hover and :focus-within
// (keyboard reachable), dismissed with Escape via blur. Must be rendered as a
// SIBLING of sortable header buttons, never inside them.
export default function InfoTip({
  k,
  align = "center",
}: {
  k: MsgKey;
  align?: "center" | "end";
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <span className={`infotip${align === "end" ? " infotip-end" : ""}`}>
      <span
        className="infotip-tri"
        tabIndex={0}
        aria-describedby={id}
        aria-label={t("tip.more")}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
      >
        i
      </span>
      <span className="infotip-bubble" role="tooltip" id={id}>
        {t(k)}
      </span>
    </span>
  );
}
