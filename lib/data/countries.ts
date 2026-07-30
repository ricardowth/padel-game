/**
 * FIP publishes IOC-style alpha-3 codes; flags and `Intl.DisplayNames` want ISO
 * 3166-1 alpha-2. Country *names* are localised by the i18n layer (§14), so all
 * we need here is the code mapping.
 *
 * Covers every code present in the current FIP snapshots plus the common padel
 * nations, so a ranking refresh is unlikely to introduce an unmapped code.
 */
export const IOC_TO_ISO: Record<string, string> = {
  ALG: "DZ", AND: "AD", ARG: "AR", ARM: "AM", AUS: "AU", AUT: "AT", BEL: "BE",
  BOL: "BO", BOT: "BW", BRA: "BR", BRN: "BH", BUL: "BG", CAN: "CA", CHI: "CL",
  CHN: "CN", COL: "CO", CRC: "CR", CRO: "HR", CUB: "CU", CYP: "CY", CZE: "CZ",
  DEN: "DK", DOM: "DO", ECU: "EC", EGY: "EG", ESA: "SV", ESP: "ES", EST: "EE",
  FIN: "FI", FRA: "FR", GBR: "GB", GER: "DE", GRE: "GR", GUA: "GT", HUN: "HU",
  INA: "ID", IND: "IN", IRI: "IR", IRL: "IE", ISL: "IS", ISR: "IL", ITA: "IT",
  JPN: "JP", KAZ: "KZ", KEN: "KE", KOR: "KR", KSA: "SA", KUW: "KW", LAT: "LV",
  LBN: "LB", LTU: "LT", LUX: "LU", MAD: "MG", MAR: "MA", MAS: "MY", MEX: "MX",
  MLT: "MT", MON: "MC", NED: "NL", NGR: "NG", NOR: "NO", NZL: "NZ", OMA: "OM",
  PAN: "PA", PAR: "PY", PER: "PE", PHI: "PH", POL: "PL", POR: "PT", PUR: "PR",
  QAT: "QA", ROU: "RO", RSA: "ZA", RUS: "RU", SGP: "SG", SLO: "SI", SRB: "RS",
  SUI: "CH", SVK: "SK", SWE: "SE", THA: "TH", TUN: "TN", TUR: "TR", UAE: "AE",
  UKR: "UA", URU: "UY", USA: "US", UZB: "UZ", VEN: "VE", ZAM: "ZM", ZIM: "ZW",
};

/** Falls back to the first two letters so an unmapped code degrades gracefully. */
export function toIsoAlpha2(iocCode: string): string {
  const key = iocCode?.trim().toUpperCase() ?? "";
  return IOC_TO_ISO[key] ?? key.slice(0, 2);
}

/** Regional-indicator flag emoji for an ISO alpha-2 code. */
export function flagEmoji(isoAlpha2: string): string {
  const code = isoAlpha2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)),
  );
}
