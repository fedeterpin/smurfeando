"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { parseUtc } from "@/lib/livefmt";

/**
 * "Updated <when>" for the daily slice. The static HTML is prerendered on the
 * build machine, so the first paint says UTC and the reader's own zone is applied
 * after hydration — rendering local time straight away would not match the
 * prerendered markup.
 */
export default function UpdatedAt({ stamp }: { stamp: string }) {
  const { t, locale } = useI18n();
  const [zone, setZone] = useState<string | undefined>("UTC");
  useEffect(() => setZone(undefined), []);
  return (
    <p className="mday-updated">
      {t("live.updated", {
        when: parseUtc(stamp).toLocaleString(locale, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: zone,
        }),
      })}
    </p>
  );
}
