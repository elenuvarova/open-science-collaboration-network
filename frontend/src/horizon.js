// Horizon Europe participation rules, as plain data. ISO-2 codes (OpenAlex uses GR, not EL).
// Lists reflect the Horizon Europe association agreements in force in 2025 — the
// UI says so and links to the official list, because associations keep changing.

export const EU_MEMBER_STATES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export const ASSOCIATED_COUNTRIES = [
  "AL", "AM", "BA", "CA", "CH", "FO", "GB", "GE", "IL", "IS", "KR", "MD", "ME", "MK",
  "NO", "NZ", "RS", "TN", "TR", "UA", "XK",
];

// Widening countries: Member States and associated countries with lower R&I performance,
// eligible for the Widening actions and often sought to strengthen a consortium.
export const WIDENING_COUNTRIES = [
  "BG", "HR", "CY", "CZ", "EE", "GR", "HU", "LV", "LT", "MT", "PL", "PT", "RO", "SK", "SI",
  "AL", "AM", "BA", "FO", "GE", "MD", "ME", "MK", "RS", "TN", "TR", "UA", "XK",
];

export const ASSOCIATED_LIST_URL =
  "https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/list-3rd-country-participation_horizon-euratom_en.pdf";

const EU = new Set(EU_MEMBER_STATES);
const AC = new Set(ASSOCIATED_COUNTRIES);
const WIDENING = new Set(WIDENING_COUNTRIES);

export const isMemberState = (c) => EU.has((c || "").toUpperCase());
export const isAssociated = (c) => AC.has((c || "").toUpperCase());
export const isWidening = (c) => WIDENING.has((c || "").toUpperCase());

let names;
export function countryName(code) {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code === "XK" ? "XK" : code) || code;
  } catch {
    return code;
  }
}

// The general admissibility rule for Research & Innovation and Innovation Actions:
// at least three independent legal entities, each in a different Member State or
// Associated Country, with at least one of them in a Member State.
// Independence can't be checked from open data, so the result says "indicative".
export function checkEligibility(partners) {
  const countries = new Set(partners.map((p) => (p.country || "").toUpperCase()).filter(Boolean));
  const eligible = [...countries].filter((c) => EU.has(c) || AC.has(c));
  const memberStates = [...countries].filter((c) => EU.has(c));
  const outside = [...countries].filter((c) => !EU.has(c) && !AC.has(c));
  const checks = [
    {
      key: "partners",
      ok: partners.length >= 3,
      label: "At least 3 partners",
      detail: `${partners.length} selected`,
    },
    {
      key: "countries",
      ok: eligible.length >= 3,
      label: "In 3 different Member States or Associated Countries",
      detail: eligible.length ? `${eligible.length}: ${eligible.sort().join(", ")}` : "none yet",
    },
    {
      key: "member-state",
      ok: memberStates.length >= 1,
      label: "At least 1 in an EU Member State",
      detail: memberStates.length ? memberStates.sort().join(", ") : "none yet",
    },
  ];
  return { ok: checks.every((c) => c.ok), checks, outside };
}
