"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import type { Pace, Tour } from "../lib/data/types";

/**
 * The career runs entirely in the browser (§13) — there is no account, no
 * server state and nothing to index — so the game is loaded client-only.
 *
 * Beyond saving the server the work, this removes a whole class of hydration
 * mismatches: `Intl.DisplayNames` disagrees between Node's ICU and the
 * browser's (Node says "Hong Kong", Chrome says "Hong Kong, RAE da China" in
 * pt), which desynced the creator's country list on every render.
 */
const Game = dynamic(() => import("./Game").then((m) => m.Game), {
  ssr: false,
  loading: () => <Loading />,
});

function Loading() {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="label animate-pulse">{t("loading")}</p>
    </div>
  );
}

export function GameShell({ tour, pace }: { tour: Tour; pace: Pace }) {
  return <Game tour={tour} pace={pace} />;
}
