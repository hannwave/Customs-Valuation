export function recommendedHsCode(product: string): string | null {
  const normalized = product.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const phoneAccessory = /\b(case|cover|charger|charging|cable|adapter|screen protector|display|battery|earbuds?|headphones?|holder|mount|parts?)\b/.test(normalized);
  if (/\b(iphones?|i phones?|smartphones?|smart phones?|mobile phones?|cellular phones?|galaxy(?: s| a| z)?|pixel phones?|redmi phones?)\b/.test(normalized) && !phoneAccessory) return "851713";

  const nonCigarProduct = /\b(electronic|e cigar|holder|case|cutter|humidor|lighter|ashtray|parts?)\b/.test(normalized);
  if (/\b(cigar|cigars|habano|habanos|cohiba|montecristo|romeo y julieta|partagas|bolivar|punch|hoyo de monterrey)\b/.test(normalized) && !nonCigarProduct) return "240210";

  const nonTobaccoProduct = /\b(electronic|e cigarette|ecigarette|vape|vaping|holder|paper|filter|case|machine|parts?)\b/.test(normalized);
  if (/\b(cigarette|cigarettes|cigaret|cigarets|cigarate|cigarates|cigerette|cigerettes)\b/.test(normalized) && !nonTobaccoProduct) return "240220";
  if (/\b(laptop|notebook|macbook|thinkpad|chromebook)\b/.test(normalized)) return "847130";
  return null;
}

export function displayHsCode(item: { tariffItemNo?: string | null; code?: string | null }): string {
  return item.tariffItemNo || item.code || "";
}
