/**
 * Localised OG share image (§13, §14).
 *
 * The career lives only in the browser, so the finished card hands its summary
 * to this route as query params rather than the server re-simulating anything.
 * Everything is drawn with Satori primitives — no external fonts or images, so
 * it renders identically on every deploy.
 *
 *   /api/og?name=…&tier=champion&ovr=84&titles=24&finals=41&weeks=18&earnings=€4.7M&peak=1&locale=en
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 630;

/** Same rating ramp as the app, inlined — Satori cannot read CSS variables. */
function ratingTone(value: number): string {
  if (value >= 88) return "#059669";
  if (value >= 80) return "#16a34a";
  if (value >= 72) return "#65a30d";
  if (value >= 63) return "#ca8a04";
  if (value >= 52) return "#d97706";
  return "#64748b";
}

/**
 * Tier and stat labels are duplicated here rather than read from the message
 * catalog: this route runs on the edge, and pulling a whole locale bundle in to
 * render six words would dominate its cold start.
 */
const STRINGS = {
  en: {
    complete: "CAREER COMPLETE",
    titles: "TITLES",
    finals: "FINALS",
    weeks: "WEEKS AT #1",
    earned: "EARNED",
    peak: "PEAK",
    tier: {
      journeyman: "JOURNEYMAN",
      contender: "CONTENDER",
      champion: "CHAMPION",
      legend: "LEGEND",
    },
    footer: "Unofficial fan-made padel career simulator",
  },
  pt: {
    complete: "CARREIRA COMPLETA",
    titles: "TÍTULOS",
    finals: "FINAIS",
    weeks: "SEMANAS EM #1",
    earned: "GANHOS",
    peak: "MELHOR",
    tier: {
      journeyman: "PROFISSIONAL",
      contender: "CANDIDATO",
      champion: "CAMPEÃO",
      legend: "LENDA",
    },
    footer: "Simulador de carreira de padel não oficial",
  },
  es: {
    complete: "CARRERA COMPLETA",
    titles: "TÍTULOS",
    finals: "FINALES",
    weeks: "SEMANAS EN #1",
    earned: "GANANCIAS",
    peak: "MEJOR",
    tier: {
      journeyman: "PROFESIONAL",
      contender: "ASPIRANTE",
      champion: "CAMPEÓN",
      legend: "LEYENDA",
    },
    footer: "Simulador de carrera de pádel no oficial",
  },
} as const;

type TierKey = keyof (typeof STRINGS)["en"]["tier"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const get = (key: string, fallback = "") => searchParams.get(key) ?? fallback;
  const num = (key: string) => Number(get(key, "0")) || 0;

  const locale = (["en", "pt", "es"] as const).includes(get("locale", "en") as "en")
    ? (get("locale", "en") as keyof typeof STRINGS)
    : "en";
  const s = STRINGS[locale];

  const name = get("name", "—").slice(0, 28);
  const tierKey = get("tier", "journeyman") as TierKey;
  const tier = s.tier[tierKey] ?? s.tier.journeyman;
  const ovr = num("ovr");
  const side = get("side") === "drive" ? "DRIVE" : "REVÉS";
  const country = get("country", "").toUpperCase().slice(0, 3);

  const stats: [string, string][] = [
    [s.titles, String(num("titles"))],
    [s.finals, String(num("finals"))],
    [s.weeks, String(num("weeks"))],
    [s.earned, get("earnings", "€0")],
    [s.peak, `#${num("peak") || "—"}`],
  ];

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
          color: "#e8edf7",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 6,
              fontWeight: 700,
              color: "#38e2b0",
            }}
          >
            {s.complete}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 28 }}>
            <div
              style={{
                display: "flex",
                width: 168,
                height: 168,
                borderRadius: 28,
                background: ratingTone(ovr),
                color: "#ffffff",
                fontSize: 82,
                fontWeight: 900,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {ovr}
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {country ? (
                  <div
                    style={{
                      display: "flex",
                      border: "1px solid #232c3c",
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#8b97ad",
                    }}
                  >
                    {country}
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    border: "1px solid #232c3c",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: 3,
                    color: "#8b97ad",
                  }}
                >
                  {side}
                </div>
              </div>

              <div style={{ display: "flex", fontSize: 76, fontWeight: 900, marginTop: 8 }}>
                {name}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 30,
              padding: "18px 28px",
              borderRadius: 16,
              border: "1px solid rgba(56,226,176,0.3)",
              background: "rgba(56,226,176,0.08)",
              fontSize: 46,
              fontWeight: 900,
              letterSpacing: 4,
              color: "#38e2b0",
            }}
          >
            {tier}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 44 }}>
            {stats.map(([label, value]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>{value}</div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 16,
                    letterSpacing: 2,
                    fontWeight: 700,
                    color: "#5a657a",
                    marginTop: 6,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", fontSize: 16, color: "#5a657a" }}>{s.footer}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
