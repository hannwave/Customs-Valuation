import type { IconType } from "react-icons";
import { FiBox, FiBriefcase, FiHome, FiPackage, FiSettings, FiShoppingBag, FiTool, FiTruck, FiUser } from "react-icons/fi";

/** Product groups shown as cards; the tariff chapter picks the default. */
export const productCategories: { code: string; label: string; chapters: [number, number][]; branded: boolean; brands: string[] }[] = [
  { code: "ELECTRONICS", label: "Electronics & electrical", chapters: [[85, 85]], branded: true, brands: ["Samsung", "Apple", "Huawei", "Xiaomi", "Tecno", "Infinix", "Lenovo", "HP", "Dell", "Sony", "LG", "Hisense"] },
  { code: "MACHINERY", label: "Machinery & equipment", chapters: [[84, 84]], branded: true, brands: ["Caterpillar", "Komatsu", "SANY", "XCMG", "Siemens", "Bosch", "Atlas Copco", "Lister", "Perkins", "Haier"] },
  { code: "VEHICLES", label: "Vehicles & parts", chapters: [[86, 89]], branded: true, brands: ["Toyota", "Hyundai", "Suzuki", "Isuzu", "Nissan", "Mitsubishi", "Volkswagen", "BYD", "Sinotruk", "Bajaj"] },
  { code: "INSTRUMENTS", label: "Medical & optical instruments", chapters: [[90, 92]], branded: true, brands: ["Philips", "GE Healthcare", "Mindray", "Olympus", "Canon", "Siemens Healthineers"] },
  { code: "TEXTILES", label: "Textiles & clothing", chapters: [[50, 63]], branded: false, brands: ["Zara", "H&M", "Levi's", "Uniqlo", "Shein", "LC Waikiki"] },
  { code: "FOOTWEAR", label: "Footwear & accessories", chapters: [[64, 67]], branded: false, brands: ["Nike", "Adidas", "Puma", "Bata", "Skechers", "Clarks"] },
  { code: "FOOD", label: "Food & agriculture", chapters: [[1, 24]], branded: false, brands: ["Nestlé", "Unilever", "Danone", "Coca-Cola", "Wilmar", "Olam"] },
  { code: "CHEMICALS", label: "Chemicals & pharmaceuticals", chapters: [[28, 38]], branded: false, brands: ["Bayer", "Pfizer", "BASF", "Novartis", "GSK", "Yara"] },
  { code: "PLASTICS", label: "Plastics & rubber", chapters: [[39, 40]], branded: false, brands: ["Sinopec", "SABIC", "Dow", "Michelin", "Bridgestone"] },
  { code: "MATERIALS", label: "Metals & building materials", chapters: [[25, 27], [68, 83]], branded: false, brands: ["ArcelorMittal", "Tata Steel", "Baosteel", "Dangote", "Hydro"] },
  { code: "HOUSEHOLD", label: "Furniture & household", chapters: [[94, 96], [41, 49]], branded: false, brands: ["IKEA", "Tefal", "Philips", "Hisense", "Ashley"] },
  { code: "OTHER", label: "Other goods", chapters: [], branded: false, brands: [] },
];

export function categoryForChapter(chapter: string) {
  const number = Number.parseInt(chapter, 10);
  return productCategories.find(item => item.chapters.some(([from, to]) => number >= from && number <= to))?.code ?? "OTHER";
}

export const conditions = [
  { code: "NEW", label: "New" },
  { code: "USED", label: "Used" },
  { code: "REFURBISHED", label: "Refurbished" },
] as const;

/** Shipment units; the ERCA tariff unit picks the default. */
export const units: { value: string; label: string; tariff: string[] }[] = [
  { value: "pieces", label: "Pieces", tariff: ["u", "pcs", "nmb", "no"] },
  { value: "sets", label: "Sets", tariff: ["set"] },
  { value: "pairs", label: "Pairs", tariff: ["pa", "pr", "2u"] },
  { value: "kg", label: "Kilograms (kg)", tariff: ["kg"] },
  { value: "tonnes", label: "Tonnes", tariff: ["t", "tne"] },
  { value: "litres", label: "Litres", tariff: ["l", "ltr"] },
  { value: "metres", label: "Metres", tariff: ["m"] },
  { value: "square metres", label: "Square metres", tariff: ["m2"] },
  { value: "cubic metres", label: "Cubic metres", tariff: ["m3"] },
  { value: "cartons", label: "Cartons", tariff: [] },
];

export function unitForTariff(tariffUnit: string | undefined) {
  const unit = (tariffUnit ?? "").trim().toLowerCase();
  return units.find(item => item.tariff.includes(unit))?.value ?? "pieces";
}

export const purposes: { code: string; label: string; hint: string; icon: IconType }[] = [
  { code: "COMMERCIAL_RESALE", label: "Commercial resale", hint: "Goods you will sell in Ethiopia", icon: FiShoppingBag },
  { code: "MANUFACTURING", label: "Manufacturing", hint: "Machinery or inputs for your own production", icon: FiSettings },
  { code: "PERSONAL", label: "Personal use", hint: "For you or your household, not for sale", icon: FiUser },
  { code: "INSTITUTIONAL", label: "Institutional use", hint: "For an organisation's own operations", icon: FiBriefcase },
  { code: "OTHER", label: "Other", hint: "Anything else; explain in the product details", icon: FiBox },
];

export const manufacturingKinds = [
  { machinery: true, label: "Machinery or equipment", hint: "Capital goods for the production line", icon: FiTool },
  { machinery: false, label: "Raw materials or inputs", hint: "Materials and parts used up in production", icon: FiPackage },
] as const;

/** Invoice terms (Incoterms) decide which costs the importer still has to add to reach the CIF customs value. */
export const incoterms: { code: string; label: string; hint: string; freight: boolean; insurance: boolean; icon: IconType }[] = [
  { code: "CIF", label: "CIF", hint: "Price includes freight and insurance to Ethiopia", freight: false, insurance: false, icon: FiHome },
  { code: "CFR", label: "CFR / CNF", hint: "Price includes freight; insurance is extra", freight: false, insurance: true, icon: FiTruck },
  { code: "FOB", label: "FOB", hint: "Price at the port of loading; add freight and insurance", freight: true, insurance: true, icon: FiPackage },
  { code: "EXW", label: "EXW", hint: "Price at the seller's premises; add all transport", freight: true, insurance: true, icon: FiBox },
];

export const commonCurrencies = ["USD", "EUR", "CNY", "AED", "GBP"];
