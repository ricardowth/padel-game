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
  const tDisclaimer = await getTranslations("disclaimer");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <span className="chip label !text-[10px] !text-[color:var(--color-accent)]">
          {t("eyebrow")}
        </span>
        <LanguageSwitcher />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-9 py-12">
        <div className="rise max-w-2xl">
          <h1 className="gradient-text text-5xl font-black leading-[0.95] tracking-tighter sm:text-7xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[color:var(--color-muted)]">
            {t("tagline")}
          </p>
        </div>

        <StartPanel />

        {/* The three numbers that say this is built on real data. */}
        <dl className="flex flex-wrap gap-2.5">
          {(
            [
              [t("facts.players", { count: 400 }), "400"],
              [t("facts.events", { count: 260 }), "260"],
              [t("facts.duration"), "~2"],
            ] as const
          ).map(([text]) => (
            <dd key={text} className="chip text-[11px] text-[color:var(--color-muted)]">
              <span aria-hidden className="text-[color:var(--color-accent)]">
                ◆
              </span>
              {text}
            </dd>
          ))}
        </dl>
      </div>

      <footer className="border-t border-[color:var(--color-line-soft)] pt-4 text-[11px] leading-relaxed text-[color:var(--color-faint)]">
        {tDisclaimer("full")}
      </footer>
    </main>
  );
}
