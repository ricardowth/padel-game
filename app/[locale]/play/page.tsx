import { setRequestLocale } from "next-intl/server";

import { GameShell } from "../../../components/GameShell";
import type { Pace, Tour } from "../../../lib/data/types";

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tour?: string; pace?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const tour: Tour = query.tour === "women" ? "women" : "men";
  const pace: Pace = query.pace === "quick" ? "quick" : "story";

  return <GameShell tour={tour} pace={pace} />;
}
