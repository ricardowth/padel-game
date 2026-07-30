import { getTranslations, setRequestLocale } from "next-intl/server";

import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { StartPanel } from "../../components/StartPanel";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("landing");
  const tCommon = await getTranslations("disclaimer");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <span className="label">{t("eyebrow")}</span>
        <LanguageSwitcher />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        <div className="rise max-w-2xl">
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[color:var(--color-muted)]">
            {t("tagline")}
          </p>
        </div>

        <StartPanel />

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-[color:var(--color-faint)]">
          <dd>{t("facts.players", { count: 400 })}</dd>
          <dd>{t("facts.events", { count: 260 })}</dd>
          <dd>{t("facts.duration")}</dd>
        </dl>
      </div>

      <footer className="border-t border-[color:var(--color-line-soft)] pt-4 text-[11px] leading-relaxed text-[color:var(--color-faint)]">
        {tCommon("full")}
      </footer>
    </main>
  );
}
