export const preferredCountryCodes = [
  "CN", "IN", "TR", "AE", "SA", "QA", "OM", "KW", "BH", "JO", "EG", "IQ", "LB", "IL", "IR", "YE",
] as const;

export function compareCountries<T extends { code: string; name: string }>(a: T, b: T) {
  const ai = preferredCountryCodes.indexOf(a.code as (typeof preferredCountryCodes)[number]);
  const bi = preferredCountryCodes.indexOf(b.code as (typeof preferredCountryCodes)[number]);
  return ai >= 0 && bi >= 0 ? ai - bi : ai >= 0 ? -1 : bi >= 0 ? 1 : a.name.localeCompare(b.name, "en");
}
