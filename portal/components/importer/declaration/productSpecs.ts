import type { IconType } from "react-icons";
import { FiActivity, FiBox, FiCoffee, FiCpu, FiDroplet, FiHome, FiLayers, FiPackage, FiScissors, FiSettings, FiShoppingBag, FiTruck } from "react-icons/fi";

/**
 * Category-specific product details. Each product group asks the questions an officer needs to value
 * and classify that kind of goods; the answers are written into the declaration description.
 */
export type ProductSpec = {
  key: string;
  label: string;
  type: "choice" | "text" | "number";
  options?: string[];
  unit?: string;
  placeholder?: string;
  hint?: string;
};

export const categoryIcons: Record<string, IconType> = {
  ELECTRONICS: FiCpu, MACHINERY: FiSettings, VEHICLES: FiTruck, INSTRUMENTS: FiActivity, TEXTILES: FiScissors, FOOTWEAR: FiShoppingBag,
  FOOD: FiCoffee, CHEMICALS: FiDroplet, PLASTICS: FiLayers, MATERIALS: FiBox, HOUSEHOLD: FiHome, OTHER: FiPackage,
};

export const categorySpecs: Record<string, ProductSpec[]> = {
  ELECTRONICS: [
    { key: "type", label: "Product type", type: "choice", options: ["Mobile phone", "Laptop or computer", "Tablet", "TV or display", "Audio equipment", "Home appliance", "Solar or power equipment", "Networking", "Cables and components"] },
    { key: "storage", label: "Storage", type: "text", placeholder: "e.g. 256 GB" },
    { key: "memory", label: "Memory (RAM)", type: "text", placeholder: "e.g. 8 GB" },
    { key: "screen", label: "Screen size", type: "number", unit: "inches", placeholder: "e.g. 6.7" },
    { key: "power", label: "Power rating", type: "number", unit: "W", placeholder: "e.g. 65" },
    { key: "voltage", label: "Voltage", type: "choice", options: ["220–240 V", "110–120 V", "Battery or DC"] },
  ],
  MACHINERY: [
    { key: "type", label: "Machine type", type: "choice", options: ["Construction", "Agricultural", "Industrial or factory", "Generator", "Pump or compressor", "Food processing", "Printing or packaging", "Spare parts"] },
    { key: "power", label: "Engine or motor power", type: "number", unit: "kW", placeholder: "e.g. 160" },
    { key: "fuel", label: "Power source", type: "choice", options: ["Diesel", "Petrol", "Electric", "Hybrid", "Manual"] },
    { key: "capacity", label: "Capacity or output", type: "text", placeholder: "e.g. 20 t/h, 500 L, 200 kVA" },
    { key: "year", label: "Year of manufacture", type: "number", placeholder: "e.g. 2024" },
  ],
  VEHICLES: [
    { key: "type", label: "Vehicle type", type: "choice", options: ["Passenger car", "SUV or pickup", "Bus or minibus", "Truck", "Motorcycle or three-wheeler", "Trailer", "Spare parts"] },
    { key: "year", label: "Year of manufacture", type: "number", placeholder: "e.g. 2021" },
    { key: "engine", label: "Engine capacity", type: "number", unit: "cc", placeholder: "e.g. 1500" },
    { key: "fuel", label: "Fuel", type: "choice", options: ["Petrol", "Diesel", "Electric", "Hybrid"] },
    { key: "transmission", label: "Transmission", type: "choice", options: ["Manual", "Automatic"] },
    { key: "mileage", label: "Mileage", type: "number", unit: "km", placeholder: "0 for new" },
    { key: "vin", label: "Chassis or VIN", type: "text", placeholder: "17-character VIN" },
  ],
  INSTRUMENTS: [
    { key: "type", label: "Instrument type", type: "choice", options: ["Diagnostic imaging", "Laboratory", "Patient monitoring", "Surgical", "Dental", "Optical or eyewear", "Measuring or testing", "Musical instrument"] },
    { key: "approval", label: "Regulatory approval", type: "choice", options: ["EFDA registered", "CE marked", "FDA cleared", "Not registered"] },
    { key: "power", label: "Power supply", type: "choice", options: ["Mains powered", "Battery powered", "No power needed"] },
    { key: "use", label: "Intended use", type: "text", placeholder: "e.g. hospital ultrasound scanning" },
  ],
  TEXTILES: [
    { key: "type", label: "Product type", type: "choice", options: ["Garments", "Fabric in rolls", "Yarn or fibre", "Home textiles", "Second-hand clothing", "Bags"] },
    { key: "fibre", label: "Main fibre", type: "choice", options: ["Cotton", "Polyester", "Cotton–polyester blend", "Wool", "Silk", "Nylon", "Linen"] },
    { key: "construction", label: "Construction", type: "choice", options: ["Knitted", "Woven", "Non-woven"] },
    { key: "for", label: "Made for", type: "choice", options: ["Men", "Women", "Children", "Unisex"] },
    { key: "weight", label: "Fabric weight", type: "number", unit: "gsm", placeholder: "e.g. 180" },
  ],
  FOOTWEAR: [
    { key: "type", label: "Product type", type: "choice", options: ["Sports shoes", "Casual shoes", "Formal shoes", "Sandals or slippers", "Boots", "Safety footwear", "Hats or headwear", "Umbrellas"] },
    { key: "upper", label: "Upper material", type: "choice", options: ["Leather", "Textile", "Rubber or plastic", "Synthetic leather"] },
    { key: "sole", label: "Sole", type: "choice", options: ["Rubber", "Plastic", "Leather"] },
    { key: "for", label: "Made for", type: "choice", options: ["Men", "Women", "Children", "Unisex"] },
    { key: "sizes", label: "Size range", type: "text", placeholder: "e.g. EU 39–45" },
  ],
  FOOD: [
    { key: "type", label: "Product type", type: "choice", options: ["Cereals and grains", "Edible oil", "Sugar", "Flour or pasta", "Dairy", "Meat or fish", "Fruit and vegetables", "Beverages", "Coffee, tea or spices", "Animal feed", "Seeds for sowing"] },
    { key: "packaging", label: "Packaging", type: "choice", options: ["Bulk", "Bags or sacks", "Cartons", "Cans", "Bottles", "Jars"] },
    { key: "pack", label: "Net content per package", type: "text", placeholder: "e.g. 50 kg bag, 1 L bottle" },
    { key: "storage", label: "Storage", type: "choice", options: ["Ambient", "Chilled", "Frozen"] },
    { key: "expiry", label: "Best before", type: "text", placeholder: "e.g. 03/2027" },
  ],
  CHEMICALS: [
    { key: "type", label: "Product type", type: "choice", options: ["Pharmaceutical", "Fertiliser", "Pesticide", "Industrial chemical", "Cosmetics or soap", "Paint or coating", "Detergent", "Laboratory reagent"] },
    { key: "form", label: "Form", type: "choice", options: ["Powder", "Liquid", "Granules", "Tablets or capsules", "Paste", "Gas"] },
    { key: "purity", label: "Purity or strength", type: "text", placeholder: "e.g. 98%, 500 mg" },
    { key: "cas", label: "CAS number", type: "text", placeholder: "e.g. 7732-18-5", hint: "On the safety data sheet" },
    { key: "hazard", label: "Hazard class", type: "choice", options: ["Not hazardous", "Hazardous (UN listed)"] },
    { key: "permit", label: "Import permit", type: "choice", options: ["EFDA", "Ministry of Agriculture", "None required"] },
  ],
  PLASTICS: [
    { key: "material", label: "Material", type: "choice", options: ["Polyethylene (PE)", "Polypropylene (PP)", "PVC", "PET", "ABS", "Natural rubber", "Synthetic rubber"] },
    { key: "form", label: "Form", type: "choice", options: ["Granules or resin", "Sheets or film", "Pipes or tubes", "Bags or packaging", "Tyres", "Finished articles"] },
    { key: "size", label: "Thickness or size", type: "text", placeholder: "e.g. 2 mm sheet, 110 mm pipe, 195/65 R15" },
    { key: "grade", label: "Grade", type: "choice", options: ["Virgin", "Recycled"] },
  ],
  MATERIALS: [
    { key: "material", label: "Material", type: "choice", options: ["Steel", "Iron", "Copper", "Aluminium", "Zinc", "Cement", "Ceramic tiles", "Glass", "Stone or marble", "Coal or fuel"] },
    { key: "form", label: "Form", type: "choice", options: ["Bars or rods", "Sheets or coils", "Pipes or tubes", "Wire", "Cathodes or ingots", "Beams or profiles", "Powder or bulk", "Tiles or slabs"] },
    { key: "grade", label: "Grade or purity", type: "text", placeholder: "e.g. 99.99% Cu, Grade 60, OPC 42.5" },
    { key: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g. 12 mm × 12 m" },
    { key: "weight", label: "Net weight", type: "number", unit: "kg", placeholder: "Total for the shipment" },
  ],
  HOUSEHOLD: [
    { key: "type", label: "Product type", type: "choice", options: ["Furniture", "Kitchenware", "Lighting", "Toys", "Stationery or paper", "Leather goods", "Décor", "Mattresses or bedding"] },
    { key: "material", label: "Main material", type: "choice", options: ["Wood", "Metal", "Plastic", "Glass", "Leather", "Fabric", "Ceramic"] },
    { key: "assembly", label: "Supplied", type: "choice", options: ["Assembled", "Flat-pack"] },
    { key: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g. 200 × 90 × 75 cm" },
  ],
  OTHER: [
    { key: "type", label: "What the goods are", type: "text", placeholder: "e.g. promotional banners" },
    { key: "material", label: "Main material", type: "text", placeholder: "e.g. vinyl" },
    { key: "size", label: "Size or weight per unit", type: "text", placeholder: "e.g. 2 × 1 m, 300 g" },
  ],
};

export const specsFor = (category: string) => categorySpecs[category] ?? [];

const formatSpec = (spec: ProductSpec, value: string) => `${spec.label}: ${value}${spec.type === "number" && spec.unit ? ` ${spec.unit}` : ""}`;

/** "Fibre: Cotton; Fabric weight: 180 gsm" — the answered details, in the order they are asked. */
export function describeSpecs(category: string, attributes: Record<string, string>) {
  return specsFor(category).filter(spec => attributes[spec.key]?.trim()).map(spec => formatSpec(spec, attributes[spec.key].trim().replace(/[;]/g, ","))).join("; ");
}

/** Reads describeSpecs output back into attribute values for the given category. */
export function parseSpecs(category: string, text: string) {
  const specs = specsFor(category), attributes: Record<string, string> = {};
  for (const part of text.split("; ")) {
    const at = part.indexOf(": ");
    if (at < 0) continue;
    const spec = specs.find(item => item.label === part.slice(0, at));
    if (!spec) continue;
    let value = part.slice(at + 2).trim();
    if (spec.type === "number" && spec.unit && value.endsWith(` ${spec.unit}`)) value = value.slice(0, -spec.unit.length - 1);
    attributes[spec.key] = value;
  }
  return attributes;
}
