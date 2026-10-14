import { importerApi, type ImporterDeclaration } from "@/lib/importer";

export type TariffRate = { taxCode: string; rate: number };
export type TariffLineView = {
  tariffLineId: string; hsCodeId: string; hsCode: string; hsDescription: string; tariffItemNo: string; nationalCode: string;
  description: string; unit: string; duty: string; retired: boolean; chapter: string; chapterName: string; heading: string;
  sectionNumber: string; sectionName: string; rates: TariffRate[];
};

export type OfficerCase = {
  declaration: ImporterDeclaration;
  importer: { name: string; email: string; legalName: string; tradeName: string; tin: string; importerType: string; verificationStatus: string; phone: string };
  branch: { id: string; displayName: string; name: string; officialCode: string; region: string } | null;
  suggestedLine: TariffLineView | null;
  confirmedLine: TariffLineView | null;
  valuation: { id: string; status: string; selectedReferenceValue: number; currency: string; valuationMethod: string; selectedPriceSource: string; recordedAt: string; submittedAt: string | null; justification: string; ownedByMe: boolean } | null;
  assessment: { id: string; status: string; customsValueAmount: number; totalTax: number; finalAmount: number; targetCurrency: string; officerConfirmed: boolean; calculatedAt: string | null } | null;
  history: { occurredAt: string; action: string; username: string; decision: string | null; note: string | null }[];
  allowedActions: string[];
  canValue: boolean;
};

export type QueueRow = {
  id: string; reference: string; status: string; productName: string; brand: string; model: string; quantity: number; unit: string;
  originCountryCode: string; originCountryName: string; importerName: string; importerTin: string; importerType: string;
  hsCode: string; nationalCode: string; hsConfirmed: boolean; branch: string;
  invoiceAmount: number | null; invoiceCurrency: string; assessedPayable: number | null; assessmentCurrency: string; submittedAt: string; updatedAt: string;
};
export type Queue = { counts: Record<string, number>; total: number; items: QueueRow[] };

export type CaseStage = "review" | "valuation" | "tax" | "final";
/** The workflow stage a declaration is in, from the officer's point of view. */
export function stageFor(status: string): CaseStage {
  if (status === "ASSESSMENT_READY") return "valuation";
  if (status === "IN_ASSESSMENT") return "tax";
  if (status === "ASSESSED") return "final";
  return "review";
}

/** Officer-facing wording for declaration statuses. */
export const officerStatus: Record<string, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" | "accent" }> = {
  SUBMITTED: { label: "New", tone: "info" },
  INFORMATION_REQUESTED: { label: "Awaiting importer", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "accent" },
  ASSESSMENT_READY: { label: "Valuation", tone: "accent" },
  IN_ASSESSMENT: { label: "Tax assessment", tone: "accent" },
  ASSESSED: { label: "Assessed", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const loadCase = (id: string) => importerApi<OfficerCase>(`/importer-declarations/${id}/case`);

export function reviewDeclaration(id: string, action: string, version: string, options: { tariffLineId?: string | null; note?: string } = {}) {
  return importerApi<ImporterDeclaration>(`/importer-declarations/${id}/review`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, confirmedTariffLineId: options.tariffLineId ?? null, note: options.note ?? "", expectedVersion: version }),
  });
}

export const lineCode = (line: Pick<TariffLineView, "tariffItemNo" | "hsCode"> | null | undefined) => line ? line.tariffItemNo || line.hsCode : "";
