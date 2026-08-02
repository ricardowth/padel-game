/**
 * Localised share image (§13, §14).
 *
 * The career lives only in the browser, so the finished card hands its summary
 * to this route as query params rather than the server re-simulating anything.
 * Everything is drawn with Satori primitives — no external fonts or images, so
 * it renders identically on every deploy.
 *
 * Mirrors the on-screen result card: an identity strip, then PATH (the run of
 * partners) and TROPHIES (titles by circuit level, plus individual honours).
 * Portrait, because this is made to be posted rather than unfurled in a link.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";

const WIDTH = 1080;
const HEIGHT = 1250;

/** Same rating ramp as the app, inlined — Satori cannot read CSS variables. */
function ratingTone(value: number): string {
  if (value >= 88) return "#059669";
  if (value >= 80) return "#16a34a";
  if (value >= 72) return "#65a30d";
  if (value >= 63) return "#ca8a04";
  if (value >= 52) return "#d97706";
  return "#64748b";
}

const TROPHY_GLYPH: Record<string, string> = {
  major: "🏆",
  finals: "🏆",
  p1: "🥇",
  p2: "🥈",
  platinum: "🥉",
  gold: "🏅",
  silver: "🎖️",
  bronze: "🏵️",
};

const AWARD_GLYPH: Record<string, string> = {
  fip_no1: "👑",
  best_smash: "💥",
  breakout: "⭐",
};

/**
 * Labels are duplicated here rather than read from the message catalog: this
 * route runs on the edge, and pulling a whole locale bundle in to render a
 * dozen words would dominate its cold start.
 */
const STRINGS = {
  en: {
    complete: "CAREER COMPLETE",
    ovr: "PEAK OVR",
    titles: "TITLES",
    finals: "FINALS",
    weeks: "WEEKS AT #1",
    earned: "EARNED",
    peak: "PEAK",
    path: "PATH",
    trophies: "TROPHIES",
    empty: "EMPTY TROPHY CASE",
    tier: {
      journeyman: "JOURNEYMAN",
      contender: "CONTENDER",
      champion: "CHAMPION",
      legend: "LEGEND",
    },
    awards: { fip_no1: "FIP #1", best_smash: "BEST SMASH", breakout: "BREAKOUT" },
    footer: "Unofficial fan-made padel career simulator",
  },
  pt: {
    complete: "CARREIRA COMPLETA",
    ovr: "OVR MÁXIMO",
    titles: "TÍTULOS",
    finals: "FINAIS",
    weeks: "SEMANAS EM #1",
    earned: "GANHOS",
    peak: "MELHOR",
    path: "PERCURSO",
    trophies: "TROFÉUS",
    empty: "VITRINE VAZIA",
    tier: {
      journeyman: "PROFISSIONAL",
      contender: "CANDIDATO",
      champion: "CAMPEÃO",
      legend: "LENDA",
    },
    awards: { fip_no1: "FIP #1", best_smash: "MELHOR REMATE", breakout: "REVELAÇÃO" },
    footer: "Simulador de carreira de padel não oficial",
  },
  es: {
    complete: "CARRERA COMPLETA",
    ovr: "OVR MÁXIMO",
    titles: "TÍTULOS",
    finals: "FINALES",
    weeks: "SEMANAS EN #1",
    earned: "GANANCIAS",
    peak: "MEJOR",
    path: "TRAYECTORIA",
    trophies: "TROFEOS",
    empty: "VITRINA VACÍA",
    tier: {
      journeyman: "PROFESIONAL",
      contender: "ASPIRANTE",
      champion: "CAMPEÓN",
      legend: "LEYENDA",
    },
    awards: { fip_no1: "FIP #1", best_smash: "MEJOR REMATE", breakout: "REVELACIÓN" },
    footer: "Simulador de carrera de pádel no oficial",
  },
} as const;

type TierKey = keyof (typeof STRINGS)["en"]["tier"];

const CATEGORY_LABEL: Record<string, string> = {
  major: "MAJOR",
  finals: "FINALS",
  p1: "P1",
  p2: "P2",
  platinum: "PLATINUM",
  gold: "GOLD",
  silver: "SILVER",
  bronze: "BRONZE",
};

/** `Name|CC|titles;Name|CC|titles` */
function parsePath(raw: string) {
  if (!raw) return [];
  return raw
    .split(";")
    .filter(Boolean)
    .map((entry) => {
      const [name = "", country = "", titles = "0"] = entry.split("|");
      return { name, country, titles: Number(titles) || 0 };
    })
    .slice(0, 8);
}

/** `key|count;key|count` */
function parseCounts(raw: string) {
  if (!raw) return [];
  return raw
    .split(";")
    .filter(Boolean)
    .map((entry) => {
      const [key = "", count = "0"] = entry.split("|");
      return { key, count: Number(count) || 0 };
    })
    .slice(0, 10);
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** A bordered stat capsule. */
function Chip({ label, value }: { label?: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: "1px solid #232c3c",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 14,
        padding: "10px 18px",
      }}
    >
      {label ? (
        <span style={{ fontSize: 17, letterSpacing: 2, color: "#5a657a" }}>{label}</span>
      ) : null}
      <span style={{ fontSize: 26, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        fontSize: 20,
        letterSpacing: 10,
        fontWeight: 700,
        color: "#5a657a",
      }}
    >
      {children}
    </div>
  );
}

/** The count bubble that hangs off a crest or a trophy. */
function CountBadge({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 40,
        height: 40,
        padding: "0 9px",
        borderRadius: 20,
        border: "2px solid #070a10",
        background: accent ? "#38e2b0" : "#141a26",
        color: accent ? "#070a10" : "#e8edf7",
        fontSize: 20,
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const get = (key: string, fallback = "") => searchParams.get(key) ?? fallback;
  const num = (key: string) => Number(get(key, "0")) || 0;

  const locale = (["en", "pt", "es"] as const).includes(get("locale", "en") as "en")
    ? (get("locale", "en") as keyof typeof STRINGS)
    : "en";
  const s = STRINGS[locale];

  const name = get("name", "—").slice(0, 22);
  const tierKey = get("tier", "journeyman") as TierKey;
  const tier = s.tier[tierKey] ?? s.tier.journeyman;
  const ovr = num("ovr");
  const side = get("side") === "drive" ? "DRIVE" : "REVÉS";
  const country = get("country", "").toUpperCase().slice(0, 3);

  const path = parsePath(get("path"));
  const trophies = parseCounts(get("trophies"));
  const awards = parseCounts(get("awards"));
  const hasSilverware = trophies.length > 0 || awards.length > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070a10",
          backgroundImage:
            "radial-gradient(880px 620px at 8% -6%, rgba(139,92,246,0.34), transparent 60%), radial-gradient(720px 560px at 106% 104%, rgba(56,226,176,0.2), transparent 62%)",
          color: "#e8edf7",
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        {/* Identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 172,
              height: 172,
              borderRadius: 32,
              background: `linear-gradient(150deg, rgba(255,255,255,0.34), rgba(255,255,255,0) 52%), ${ratingTone(ovr)}`,
              color: "#ffffff",
            }}
          >
            <span style={{ fontSize: 17, letterSpacing: 3, opacity: 0.8 }}>{s.ovr}</span>
            <span style={{ fontSize: 84, fontWeight: 700, lineHeight: 1 }}>{ovr}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {country ? <Chip value={country} /> : null}
              <Chip value={side} />
              <Chip label={s.peak} value={`#${num("peak") || "—"}`} />
            </div>
            <div style={{ display: "flex", fontSize: 58, fontWeight: 700, lineHeight: 1 }}>
              {name}
            </div>
          </div>
        </div>

        {/* Career totals */}
        <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
          <Chip label={s.titles} value={String(num("titles"))} />
          <Chip label={s.finals} value={String(num("finals"))} />
          <Chip label={s.weeks} value={String(num("weeks"))} />
          <Chip label={s.earned} value={get("earnings", "€0")} />
        </div>

        {/* Legacy tier */}
        <div
          style={{
            display: "flex",
            marginTop: 26,
            padding: "20px 30px",
            borderRadius: 18,
            border: "1px solid rgba(56,226,176,0.3)",
            background: "rgba(56,226,176,0.08)",
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 5,
            color: "#38e2b0",
          }}
        >
          {tier}
        </div>

        {/* PATH — the partners */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, gap: 24 }}>
          <SectionTitle>{s.path}</SectionTitle>
          <div style={{ display: "flex", justifyContent: "center", gap: 22, flexWrap: "wrap" }}>
            {path.map((p, i) => (
              <div
                key={`${p.name}-${i}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 118,
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    position: "relative",
                    width: 100,
                    height: 92,
                    alignItems: "flex-start",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 84,
                      height: 84,
                      borderRadius: 42,
                      border: "1px solid #232c3c",
                      background: "rgba(255,255,255,0.06)",
                      fontSize: 30,
                      fontWeight: 700,
                    }}
                  >
                    {initials(p.name)}
                  </div>
                  {p.titles > 0 ? <CountBadge text={String(p.titles)} accent /> : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 16,
                    color: "#8b97ad",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name.length > 13 ? `${p.name.slice(0, 12)}…` : p.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TROPHIES — titles by level and individual honours */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, gap: 24 }}>
          <SectionTitle>{s.trophies}</SectionTitle>

          {hasSilverware ? (
            <div style={{ display: "flex", justifyContent: "center", gap: 30, flexWrap: "wrap" }}>
              {trophies.map((tr) => (
                <div
                  key={tr.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 112,
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", position: "relative", width: 96, height: 78, alignItems: "center", justifyContent: "center" }}>
                    <div style={{ display: "flex", fontSize: 62 }}>
                      {TROPHY_GLYPH[tr.key] ?? "🏆"}
                    </div>
                    {tr.count > 1 ? <CountBadge text={`×${tr.count}`} /> : null}
                  </div>
                  <div style={{ display: "flex", fontSize: 15, letterSpacing: 1, color: "#5a657a" }}>
                    {CATEGORY_LABEL[tr.key] ?? tr.key.toUpperCase()}
                  </div>
                </div>
              ))}

              {awards.map((a) => (
                <div
                  key={a.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 122,
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", position: "relative", width: 96, height: 78, alignItems: "center", justifyContent: "center" }}>
                    <div style={{ display: "flex", fontSize: 62 }}>
                      {AWARD_GLYPH[a.key] ?? "🏅"}
                    </div>
                    {a.count > 1 ? <CountBadge text={`×${a.count}`} /> : null}
                  </div>
                  <div style={{ display: "flex", fontSize: 15, letterSpacing: 1, color: "#5a657a" }}>
                    {(s.awards as Record<string, string>)[a.key] ?? a.key.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                fontSize: 22,
                letterSpacing: 3,
                color: "#5a657a",
              }}
            >
              {s.empty}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #1b2230",
            paddingTop: 24,
          }}
        >
          <span style={{ fontSize: 18, letterSpacing: 2, color: "#5a657a" }}>{s.complete}</span>
          <span style={{ fontSize: 17, color: "#5a657a" }}>{s.footer}</span>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
