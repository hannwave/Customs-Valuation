// Cities, sub-cities and woredas offered in the importer address dropdowns, keyed by the region's officialCode
// (the same codes /api/auth/importer-regions returns). Each city lists only its own sub-cities, and each sub-city
// only its own woredas, so an Addis Ababa address can only take Addis Ababa woredas.
//
// Keep this list in step with the official administrative lists: the 11 Addis Ababa sub-cities are the
// post-2020 structure (with Lemi Kura); the woreda counts per sub-city should be confirmed against the
// Addis Ababa City Administration's current list before production use.

export type SubCity = { name: string; woredas: string[] };
export type City = { name: string; subCities?: SubCity[]; woredas?: string[] };

const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix} ${String(index + 1).padStart(2, "0")}`);
const sub = (name: string, woredaCount: number): SubCity => ({ name, woredas: numbered("Woreda", woredaCount) });

export const OTHER_TOWN = "__other__";

export const placesByRegion: Record<string, City[]> = {
  ADDIS_ABABA: [{
    name: "Addis Ababa",
    subCities: [
      sub("Addis Ketema", 14), sub("Akaky Kaliti", 13), sub("Arada", 10), sub("Bole", 14), sub("Gullele", 10), sub("Kirkos", 11),
      sub("Kolfe Keranio", 15), sub("Lemi Kura", 14), sub("Lideta", 10), sub("Nifas Silk-Lafto", 15), sub("Yeka", 14),
    ],
  }],
  DIRE_DAWA: [{ name: "Dire Dawa", woredas: numbered("Kebele", 9) }],
  AFAR: ["Semera", "Logia", "Asaita", "Awash", "Dubti", "Gewane", "Mille"].map(name => ({ name })),
  AMHARA: ["Bahir Dar", "Gondar", "Dessie", "Debre Birhan", "Debre Markos", "Kombolcha", "Woldia", "Debre Tabor", "Lalibela", "Metema"].map(name => ({ name })),
  BENISHANGUL_GUMUZ: ["Assosa", "Gilgel Beles", "Kamashi", "Bambasi"].map(name => ({ name })),
  CENTRAL_ETHIOPIA: ["Hosaena", "Butajira", "Worabe", "Welkite", "Durame", "Halaba Kulito"].map(name => ({ name })),
  GAMBELA: ["Gambela", "Itang", "Abobo"].map(name => ({ name })),
  HARARI: [{ name: "Harar" }],
  OROMIA: ["Adama", "Bishoftu", "Jimma", "Shashemene", "Nekemte", "Ambo", "Burayu", "Sebeta", "Sululta", "Asella", "Batu", "Mojo", "Dukem", "Gelan", "Holeta", "Robe", "Moyale", "Metu", "Fiche"].map(name => ({ name })),
  SIDAMA: ["Hawassa", "Yirgalem", "Aleta Wondo", "Leku"].map(name => ({ name })),
  SOMALI: ["Jigjiga", "Togochale", "Gode", "Kebri Dehar", "Degehabur", "Dolo Ado"].map(name => ({ name })),
  SOUTH_ETHIOPIA: ["Wolaita Sodo", "Arba Minch", "Dilla", "Jinka", "Sawla", "Konso"].map(name => ({ name })),
  SOUTH_WEST_ETHIOPIA_PEOPLES: ["Bonga", "Mizan Aman", "Tepi", "Tarcha", "Maji"].map(name => ({ name })),
  TIGRAY: ["Mekelle", "Adigrat", "Axum", "Shire", "Adwa", "Humera", "Alamata", "Wukro"].map(name => ({ name })),
};

export const citiesFor = (regionCode: string | undefined) => (regionCode ? placesByRegion[regionCode] : undefined) ?? [];
export const findCity = (regionCode: string | undefined, city: string) => citiesFor(regionCode).find(item => item.name === city);

/** The woreda field stores "Sub-city · Woreda 03" when the city has sub-cities, otherwise the woreda or kebele alone. */
export const joinWoreda = (subCity: string, woreda: string) => [subCity, woreda].filter(Boolean).join(" · ");
export function splitWoreda(city: City | undefined, stored: string): { subCity: string; woreda: string } {
  if (!city?.subCities) return { subCity: "", woreda: stored };
  const [first, ...rest] = stored.split(" · ");
  const match = city.subCities.find(item => item.name === first);
  return match ? { subCity: match.name, woreda: rest.join(" · ") } : { subCity: "", woreda: "" };
}
