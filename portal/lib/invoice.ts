import { importerApi } from "@/lib/importer";

/**
 * The customs assessment invoice. FINAL comes from GET /api/invoices/{kind}/{id} exactly as recorded;
 * PROVISIONAL is the officer's draft on the review step before confirming.
 */
export type InvoiceKind = "declaration" | "valuation";
export type InvoiceLine = { name: string; calculationType: string; rate: number; calculationBasis: string; baseAmount: number; amount: number; isApplicable: boolean; status: string };
export type FinalInvoice = {
  kind: InvoiceKind; reference: string; issuedAt: string; status: "FINAL" | "PROVISIONAL";
  office: { name: string; code: string }; officer: string; importer: { name: string; tin: string } | null;
  goods: {
    name: string; detail: string; hsCode: string; nationalCode: string; description: string; origin: string; quantity: number; unit: string;
    pricePaid: number | null; priceCurrency: string; condition?: string; terms?: string;
  };
  valuation: { method: string; customsValue: number; currency: string; exchangeRate: number | null; exchangeRateSource: string };
  lines: InvoiceLine[]; totalTax: number; payable: number; currency: string;
};

export const loadInvoice = (kind: InvoiceKind, id: string) => importerApi<FinalInvoice>(`/invoices/${kind}/${id}`);

/** Opens the invoice viewer in a new tab; `print` opens the print dialog straight away. */
export function openInvoice(kind: InvoiceKind, id: string, print = false) {
  window.open(`/invoice-viewer?kind=${kind}&id=${encodeURIComponent(id)}${print ? "&print=1" : ""}`, "_blank", "noopener");
}

export const basisLabels: Record<string, string> = {
  CIF: "Customs value", InitialDuty: "Customs value", CIFPlusDuty: "Value + duty", CIFPlusDutyPlusExcise: "Value + duty + excise",
  CIFPlusDutyPlusExcisePlusSurtax: "Value + duty + excise + surtax", CIF_PLUS_DUTY: "Value + duty", CIF_PLUS_DUTY_EXCISE: "Value + duty + excise",
  CIF_PLUS_DUTY_EXCISE_SURTAX: "Value + duty + excise + surtax", UNIT_RATE_ETB: "Per unit", UNIT_RATE_ETB_GREATER_OF: "Per unit",
};
export const methodLabels: Record<string, string> = {
  FOB_CIF: "FOB + freight and insurance", FOB: "FOB + freight and insurance", DECLARED: "Price paid by the customer", TRANSACTION_VALUE: "Transaction value",
  MARKET: "Global market price", BASE_MARKET: "Global base market price", INTERNATIONAL_MEAN: "International mean price", OFFICER_DETERMINED: "Officer-determined value",
};
export const methodLabel = (method: string) => methodLabels[method] ?? (!method ? "Customs value (CIF)" : /[a-z]/.test(method) ? method : method.replaceAll("_", " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()));
export const invoiceFileName = (invoice: FinalInvoice) => `${invoice.reference.replace(/[^\w-]+/g, "-")}-assessment-invoice.pdf`;

/** 1,234.50 — amounts carry their currency in the column or label, not on every figure. */
export const amount = (value: number | null | undefined) => (value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const invoiceDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
export const lineRate = (line: InvoiceLine) => line.calculationType === "PerUnit" || line.calculationBasis.startsWith("UNIT_RATE") ? `${amount(line.rate)} / unit` : line.calculationType === "Fixed" ? amount(line.rate) : `${line.rate}%`;
export const lineBasis = (line: InvoiceLine) => basisLabels[line.calculationBasis] ?? line.calculationBasis.replace(/([a-z])([A-Z])/g, "$1 $2");
export const unitLabel = (quantity: number, unit: string) => {
  const lower = unit.trim().toLowerCase();
  if (lower === "pcs" || lower === "pieces" || lower === "piece") return `${quantity.toLocaleString("en-US")} ${quantity === 1 ? "piece" : "pieces"}`;
  return `${quantity.toLocaleString("en-US")} ${quantity === 1 && lower.endsWith("s") && lower !== "kg" ? lower.slice(0, -1) : lower}`;
};
export const statusFooter = (invoice: FinalInvoice) => invoice.status === "FINAL" ? `FINAL ASSESSMENT · ${invoice.reference}` : "PROVISIONAL - NOT VALID UNTIL CONFIRMED";
export const chargedNote = (invoice: FinalInvoice) => `${invoice.lines.filter(line => line.isApplicable).length} of ${invoice.lines.length} taxes charged  |  Rates from ERCA national tariff`;

/* ---------- PDF (colour) ---------- */

type Rgb = [number, number, number];
const navy: Rgb = [22, 50, 92];
const gold: Rgb = [196, 145, 22];
const muted: Rgb = [104, 118, 138];
const ink: Rgb = [30, 41, 59];
const panel: Rgb = [238, 242, 248];
const rule: Rgb = [221, 228, 238];
const white: Rgb = [255, 255, 255];

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}

/** Logo and the bilingual commission name drawn on a canvas, so the Amharic renders with the system's Ethiopic font. */
async function brandHeader() {
  const scale = 3, width = 520, height = 92;
  const canvas = document.createElement("canvas"); canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  const ethiopic = "'Noto Sans Ethiopic', Nyala, Ebrima, 'Abyssinica SIL', sans-serif";
  try { const logo = await loadImage("/images/customs-logo-dark.png"); ctx.drawImage(logo, 4, 0, 82, 64); } catch { /* the name still identifies the issuer */ }
  ctx.textAlign = "center"; ctx.fillStyle = "#1e3a8a";
  ctx.font = `700 9px ${ethiopic}`; ctx.fillText("ጉምሩክ ኮሚሽን", 45, 74);
  ctx.font = "700 5.5px Helvetica, Arial, sans-serif"; ctx.fillText("CUSTOMS COMMISSION", 45, 81);
  ctx.textAlign = "left"; ctx.fillStyle = "#16325c";
  ctx.font = `600 25px ${ethiopic}`; ctx.fillText("የኢትዮጵያ ጉምሩክ ኮሚሽን", 108, 30);
  ctx.font = "700 19px Helvetica, Arial, sans-serif"; ctx.fillText("ETHIOPIAN CUSTOMS COMMISSION", 108, 56);
  ctx.fillStyle = "#68768a"; ctx.font = "500 8px Helvetica, Arial, sans-serif";
  ctx.fillText("FACILITATE TRADE   |   PROTECT OUR BORDERS   |   SERVE OUR NATION", 108, 76);
  return { data: canvas.toDataURL("image/jpeg", 0.9), width, height };
}

/** Builds the colour invoice as a vector A4 PDF and saves it. */
export async function downloadInvoicePdf(invoice: FinalInvoice) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth(), left = 44, right = pageWidth - 44, width = right - left;
  const final = invoice.status === "FINAL";
  const text = (value: string, x: number, y: number, size: number, style: "normal" | "bold" = "normal", color: Rgb = ink, align: "left" | "right" | "center" = "left", spacing = 0) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color); doc.text(value, x, y, { align, charSpace: spacing });
  };
  const label = (value: string, x: number, y: number) => text(value.toUpperCase(), x, y, 7, "bold", muted, "left", 0.6);

  // Flag stripe and brand header.
  ([[7, 137, 48], [252, 209, 22], [218, 18, 26]] as Rgb[]).forEach((color, index) => { doc.setFillColor(...color); doc.rect(right - 54 + index * 18, 30, 18, 3, "F"); });
  const header = await brandHeader();
  if (header) doc.addImage(header.data, "JPEG", left, 38, header.width * 0.84, header.height * 0.84);
  else text("ETHIOPIAN CUSTOMS COMMISSION", left, 80, 16, "bold", navy);
  doc.setDrawColor(...navy); doc.setLineWidth(0.8); doc.line(left, 122, right, 122);
  doc.setFillColor(...gold); doc.rect(left, 120.5, 58, 3, "F");

  // Title block.
  label("Customs assessment notice", left, 146);
  text("Assessment invoice", left, 171, 24, "bold", navy);
  text(`Reference: ${invoice.reference}`, left, 187, 8.5, "normal", muted);
  const pill = final ? { fill: [222, 245, 232] as Rgb, ink: [21, 128, 61] as Rgb, text: "FINAL" } : { fill: [252, 241, 214] as Rgb, ink: [161, 98, 7] as Rgb, text: "PROVISIONAL" };
  doc.setFillColor(...pill.fill); doc.roundedRect(right - 96, 136, 96, 20, 10, 10, "F");
  text(pill.text, right - 48, 149.5, 7.5, "bold", pill.ink, "center", 0.8);
  text(invoiceDate(invoice.issuedAt), right, 174, 12, "bold", navy, "right");
  doc.setDrawColor(...rule); doc.setLineWidth(0.6); doc.line(left, 200, right, 200);

  // Parties.
  const parties: [string, string, string][] = [["Issuing office", "Ethiopian Customs Commission", invoice.office.name + (invoice.office.code ? ` · ${invoice.office.code}` : "")],
    ["Assessing officer", invoice.officer || "Customs Officer", ""]];
  if (invoice.importer) parties.push(["Importer", invoice.importer.name, invoice.importer.tin ? `TIN ${invoice.importer.tin}` : ""]);
  const column = width / parties.length;
  parties.forEach(([title, main, sub], index) => {
    const x = left + index * column;
    label(title, x, 220);
    text(String(doc.splitTextToSize(main, column - 14)[0]), x, 236, 10, "bold", ink);
    if (sub) text(String(doc.splitTextToSize(sub, column - 14)[0]), x, 250, 8.5, "normal", muted);
  });

  const section = (number: string, title: string, y: number) => {
    doc.setFillColor(...panel); doc.roundedRect(left, y - 11, 22, 16, 3, 3, "F");
    text(number, left + 11, y, 7.5, "bold", navy, "center");
    text(title, left + 32, y + 0.5, 11, "bold", navy);
  };

  // 01 Goods & tariff details.
  section("01", "Goods & tariff details", 278);
  const goodsTop = 292, goodsHeight = 96, split = left + width * 0.6;
  doc.setFillColor(...panel); doc.roundedRect(left, goodsTop, width, goodsHeight, 6, 6, "F");
  label("Item description", left + 16, goodsTop + 22);
  text(String(doc.splitTextToSize(invoice.goods.name, split - left - 30)[0]), left + 16, goodsTop + 42, 14, "bold", navy);
  doc.setFontSize(9);
  const described = (doc.splitTextToSize(invoice.goods.description || invoice.goods.detail, split - left - 40) as string[]).slice(0, 2);
  described.forEach((part, index) => text(part, left + 16, goodsTop + 60 + index * 12, 9, "normal", ink));
  const facts = [invoice.goods.condition ? `Condition: ${invoice.goods.condition}` : "", invoice.goods.detail && invoice.goods.description ? invoice.goods.detail : ""].filter(Boolean).join("  ·  ");
  if (facts) text(facts, left + 16, goodsTop + 62 + described.length * 12, 8.5, "normal", muted);
  doc.setDrawColor(...rule); doc.line(split, goodsTop + 14, split, goodsTop + goodsHeight - 14);
  label("HS tariff code", split + 18, goodsTop + 22);
  text(invoice.goods.hsCode || "—", split + 18, goodsTop + 44, 17, "bold", navy);
  if (invoice.goods.nationalCode) text(`ERCA ${invoice.goods.nationalCode}`, split + 18, goodsTop + 57, 7.5, "normal", muted);
  label("Origin", split + 18, goodsTop + 70); label("Qty", split + 112, goodsTop + 70);
  text(invoice.goods.origin || "—", split + 18, goodsTop + 85, 10, "bold", ink);
  text(unitLabel(invoice.goods.quantity, invoice.goods.unit), split + 112, goodsTop + 85, 10, "normal", ink);

  // Values.
  const valuesTop = goodsTop + goodsHeight + 10, valuesHeight = 56, middle = left + width / 2;
  doc.setDrawColor(...rule); doc.setLineWidth(0.8); doc.roundedRect(left, valuesTop, width, valuesHeight, 6, 6, "S");
  doc.line(middle, valuesTop + 12, middle, valuesTop + valuesHeight - 12);
  label(`Price paid${invoice.goods.terms ? ` (${invoice.goods.terms})` : ""}`, left + 16, valuesTop + 20);
  if (invoice.goods.pricePaid != null) text(invoice.goods.priceCurrency || invoice.currency, left + 16, valuesTop + 43, 9, "bold", muted);
  text(invoice.goods.pricePaid != null ? amount(invoice.goods.pricePaid) : "—", left + 46, valuesTop + 44, 18, "bold", navy);
  label("Assessed customs value (CIF)", middle + 16, valuesTop + 20);
  text(invoice.valuation.currency || invoice.currency, middle + 16, valuesTop + 43, 9, "bold", muted);
  text(amount(invoice.valuation.customsValue), middle + 46, valuesTop + 44, 18, "bold", navy);

  // 02 Duties, taxes & fees.
  let y = valuesTop + valuesHeight + 26;
  section("02", "Duties, taxes & fees", y);
  y += 14;
  const cols = { name: left + 14, basis: left + 190, rate: left + 388, amount: right - 14 };
  doc.setFillColor(...navy); doc.rect(left, y, width, 21, "F");
  ([["Duty / tax", cols.name, "left"], ["Basis", cols.basis, "left"], ["Rate", cols.rate, "right"], [`Amount (${invoice.currency})`, cols.amount, "right"]] as [string, number, "left" | "right"][])
    .forEach(([value, x, align]) => text(value.toUpperCase(), x, y + 13.5, 7, "bold", white, align, 0.4));
  y += 21;
  invoice.lines.forEach((row, index) => {
    const off = !row.isApplicable, height = off ? 27 : 23, baseline = y + (off ? 15.5 : 15);
    if (index % 2 === 0) { doc.setFillColor(248, 250, 253); doc.rect(left, y, width, height, "F"); }
    text(row.name, cols.name, y + (off ? 12 : 15), 9.5, "bold", ink);
    if (off) text("NOT APPLICABLE", cols.name, y + 21.5, 6, "normal", gold, "left", 0.3);
    text(lineBasis(row), cols.basis, baseline, 8.5, "normal", muted);
    text(lineRate(row), cols.rate, baseline, 8.5, "normal", muted, "right");
    text(amount(off ? 0 : row.amount), cols.amount, baseline, 9.5, "bold", ink, "right");
    y += height;
    doc.setDrawColor(...rule); doc.setLineWidth(0.5); doc.line(left, y, right, y);
    if (y > 740 && index < invoice.lines.length - 1) { doc.addPage(); y = 60; }
  });

  // Total (moves to a new page only when it cannot fit above the footer).
  y += 12;
  if (y + 54 > 786) { doc.addPage(); y = 60; }
  doc.setFillColor(...navy); doc.roundedRect(left, y, width, 54, 6, 6, "F");
  doc.setFillColor(...gold); doc.rect(left + 16, y + 15, 3, 22, "F");
  text("TOTAL DUTIES & TAXES PAYABLE", left + 30, y + 24, 8.5, "bold", white, "left", 0.4);
  if (Math.abs(invoice.totalTax - invoice.payable) > 0.004) text(`Before exemptions ${invoice.currency} ${amount(invoice.totalTax)}`, left + 30, y + 38, 7.5, "normal", [203, 213, 225]);
  text(`${invoice.currency} ${amount(invoice.payable)}`, right - 16, y + 35, 21, "bold", white, "right");
  y += 68;
  text(chargedNote(invoice), left, y, 7.5, "normal", muted);

  // Footer on every page, with page numbers.
  const pages = doc.getNumberOfPages(), footerY = doc.internal.pageSize.getHeight() - 34;
  for (let number = 1; number <= pages; number++) {
    doc.setPage(number);
    doc.setDrawColor(...rule); doc.setLineWidth(0.6); doc.line(left, footerY - 12, right, footerY - 12);
    text(statusFooter(invoice), left, footerY, 7, "bold", final ? navy : gold, "left", 0.3);
    text(`${number} / ${pages}`, right, footerY, 7.5, "normal", muted, "right");
  }
  doc.save(invoiceFileName(invoice));
}
