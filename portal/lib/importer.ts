import { getSessionAccessToken } from "@/lib/auth/session";

export type ImporterDeclaration = {
  id: string; reference: string; status: string; importerId: string; locationId: string;
  suggestedHsCodeId: string; suggestedTariffLineId: string; suggestedTariffDescription: string; confirmedHsCodeId: string | null; confirmedTariffLineId: string | null;
  suggestedTariffCode?: string | null; confirmedTariffCode?: string | null; confirmedTariffDescription?: string | null;
  originCountryCode: string; originCountryName: string; importPurpose: string; purposeDetails: string;
  isCommercialProduct: boolean; isMachineryOrEquipment: boolean; requestedTreatments: string[];
  brand: string; model: string; productName: string; description: string; manufacturer: string;
  serialOrPartNumber: string; specifications: string; quantity: number; unit: string;
  invoiceAmount: number | null; invoiceCurrency: string; freightAmount: number | null; insuranceAmount: number | null;
  assessedAt: string | null; assessmentCurrency: string; assessedCustomsValue: number | null; assessedTotalTax: number | null; assessedPayable: number | null;
  assessmentLines: AssessmentLine[];
  reviewNote: string; submittedAt: string; updatedAt: string; version: string;
  documents: { kind: string; fileName: string; contentType: string; size: number; uploadedAt: string }[];
  /** True while the importer may still change it: waiting for an officer to open it, or more information requested. */
  canEdit?: boolean; reviewStartedAt?: string | null;
};

export type AssessmentLine = { name: string; calculationType: string; rate: number; currency: string; calculationBasis: string; baseAmount: number; amount: number; isApplicable: boolean; status: string };

export type CatalogOption = { code: string; name: string; count: number };
export type TariffOption = { tariffLineId: string; hsCodeId: string; hsCode: string; hsDescription: string; tariffItemNo: string; description: string; sectionNumber: string; sectionName: string; chapter: string; chapterName: string; heading: string };

export const importerApiBase = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080"}/api`;

function responseErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const payload = body as { message?: unknown; detail?: unknown; title?: unknown; errors?: unknown };
  const values = [payload.message, payload.detail];
  if (payload.errors && typeof payload.errors === "object") {
    for (const value of Object.values(payload.errors as Record<string, unknown>)) {
      values.push(...(Array.isArray(value) ? value : [value]));
    }
  }
  values.push(payload.title);
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

export async function importerApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionAccessToken();
  if (!token) throw new Error("Sign in to the Importer Portal to continue.");
  let response: Response;
  try {
    response = await fetch(`${importerApiBase}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
  } catch (reason) {
    if (reason instanceof TypeError) throw new Error("Could not reach the Customs service. Check your connection and try again.");
    throw reason;
  }
  if (response.status === 401) throw new Error("Your session expired. Please sign in again.");
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const serverMessage = responseErrorMessage(body);
    const genericServerTitle = serverMessage && /^(internal server error|server error|an error occurred while processing your request)$/i.test(serverMessage);
    const fallback = response.status >= 500
      ? "The Customs service is temporarily unavailable. Please retry. If you submitted a declaration, check your Submissions before trying again."
      : response.statusText || "The request could not be completed.";
    throw new Error(serverMessage && !genericServerTitle ? serverMessage : fallback);
  }
  return body as T;
}

export type ImporterType = "BUSINESS" | "INDIVIDUAL" | "CUSTOMS_AGENT";
export type VerificationStatus = "PENDING" | "INFORMATION_REQUESTED" | "VERIFIED" | "SUSPENDED" | "REJECTED";
export type ImporterDocumentKind = "TRADE_LICENSE" | "TIN_CERTIFICATE" | "COMMERCIAL_REGISTRATION" | "VAT_CERTIFICATE" | "AGENT_LICENSE" | "IDENTITY_DOCUMENT" | "PROOF_OF_RESIDENCE" | "AUTHORIZATION_LETTER";

export type ImporterProfile = {
  id: string; accountId: string; importerType: ImporterType; verificationStatus: VerificationStatus;
  legalName: string; tradeName: string; tin: string; tradeLicenseNumber: string; tradeLicenseExpiry: string | null;
  businessRegistrationNumber: string; vatNumber: string; agentLicenseNumber: string; agentLicenseExpiry: string | null;
  idType: string; idNumber: string; nationality: string; residencyStatus: string; representativeRole: string; phone: string;
  regionLocationId: string; regionName: string | null; city: string; woreda: string; addressLine: string;
  reviewNote: string; reviewedAt: string | null; submittedAt: string; updatedAt: string; version: string;
  requiredDocuments: ImporterDocumentKind[];
  documents: { kind: ImporterDocumentKind; fileName: string; contentType: string; size: number; uploadedAt: string }[];
};

export type ImporterRegion = { id: string; name: string; displayName: string; officialCode: string };

export const importerTypes: { value: ImporterType; title: string; summary: string }[] = [
  { value: "BUSINESS", title: "Business importer", summary: "A company or sole trader importing under a trade licence with import activity." },
  { value: "INDIVIDUAL", title: "Individual", summary: "A person importing goods for personal use, including returning residents and the diaspora." },
  { value: "CUSTOMS_AGENT", title: "Customs agent", summary: "A licensed customs broker who lodges declarations on behalf of importers." },
];

export const documentLabels: Record<ImporterDocumentKind, { label: string; hint: string }> = {
  TRADE_LICENSE: { label: "Trade licence", hint: "Renewed licence that lists import as a licensed activity." },
  TIN_CERTIFICATE: { label: "TIN certificate", hint: "Taxpayer registration certificate showing the 10-digit TIN." },
  COMMERCIAL_REGISTRATION: { label: "Commercial registration certificate", hint: "Issued by the Ministry of Trade or regional trade bureau." },
  VAT_CERTIFICATE: { label: "VAT registration certificate", hint: "If the business is VAT registered." },
  AGENT_LICENSE: { label: "Customs agent licence", hint: "Valid licence issued by the Customs Commission." },
  IDENTITY_DOCUMENT: { label: "Identity document", hint: "Fayda card, passport, residence permit or kebele ID of the applicant." },
  PROOF_OF_RESIDENCE: { label: "Proof of residence", hint: "Residence permit, returnee letter or utility bill, if relevant." },
  AUTHORIZATION_LETTER: { label: "Letter of authorisation", hint: "Needed when you act for the business but are not its general manager." },
};

export const documentsByType: Record<ImporterType, { required: ImporterDocumentKind[]; optional: ImporterDocumentKind[] }> = {
  BUSINESS: { required: ["TRADE_LICENSE", "TIN_CERTIFICATE", "COMMERCIAL_REGISTRATION", "IDENTITY_DOCUMENT"], optional: ["VAT_CERTIFICATE", "AUTHORIZATION_LETTER"] },
  CUSTOMS_AGENT: { required: ["AGENT_LICENSE", "TIN_CERTIFICATE", "IDENTITY_DOCUMENT"], optional: ["AUTHORIZATION_LETTER"] },
  INDIVIDUAL: { required: ["IDENTITY_DOCUMENT"], optional: ["TIN_CERTIFICATE", "PROOF_OF_RESIDENCE"] },
};

/** Form field names the API binds each document upload to. */
export const documentFieldNames: Record<ImporterDocumentKind, string> = {
  TRADE_LICENSE: "TradeLicense", TIN_CERTIFICATE: "TinCertificate", COMMERCIAL_REGISTRATION: "CommercialRegistration", VAT_CERTIFICATE: "VatCertificate",
  AGENT_LICENSE: "AgentLicense", IDENTITY_DOCUMENT: "IdentityDocument", PROOF_OF_RESIDENCE: "ProofOfResidence", AUTHORIZATION_LETTER: "AuthorizationLetter",
};

export const idTypeLabels: Record<string, string> = { FAYDA: "Fayda national ID", PASSPORT: "Passport", RESIDENCE_PERMIT: "Residence permit", KEBELE_ID: "Kebele ID" };
export const residencyLabels: Record<string, string> = {
  RESIDENT_CITIZEN: "Ethiopian citizen living in Ethiopia", RETURNING_RESIDENT: "Returning resident", DIASPORA: "Ethiopian diaspora / foreign national of Ethiopian origin",
  FOREIGN_RESIDENT: "Foreign national resident in Ethiopia", NON_RESIDENT: "Non-resident",
};
export const verificationLabels: Record<VerificationStatus, string> = {
  PENDING: "Awaiting officer review", INFORMATION_REQUESTED: "More information requested", VERIFIED: "Verified", SUSPENDED: "Suspended", REJECTED: "Not approved",
};

/** The signed-in importer's verification record, or null when none has been submitted yet. */
export async function getImporterProfile(): Promise<ImporterProfile | null> {
  const token = getSessionAccessToken();
  if (!token) throw new Error("Sign in to the Importer Portal to continue.");
  const response = await fetch(`${importerApiBase}/importer-profile`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Please sign in again." : "Unable to load your verification status.");
  return response.json() as Promise<ImporterProfile>;
}

/** The goods as the importer knows them: brand and model when given, otherwise the product name. */
export function declarationTitle(item: { productName: string; brand?: string; model?: string }) {
  const brand = (item.brand ?? "").trim(), model = (item.model ?? "").trim();
  if (!model || model === "Generic") return item.productName;
  return brand && brand !== "Generic" && !model.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${model}` : model;
}

/** A short version of a tariff book description: the most specific clause, without dashes or a trailing "other". */
export function tariffSummary(description: string | null | undefined) {
  const clean = (description ?? "").replace(/^[\s\-–—:]+/, "").replace(/\s*[—–-]+\s*other\.?$/i, "").trim();
  if (!clean) return "";
  const parts = clean.split(/;\s*/).map(part => part.trim()).filter(part => part.length > 3 && !/^other\b/i.test(part));
  const pick = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? clean;
  const text = pick.charAt(0).toUpperCase() + pick.slice(1);
  return text.length > 90 ? `${text.slice(0, 87).replace(/[\s,]+\S*$/, "")}…` : text;
}

export type DeclarationSummary = { id: string; reference: string; status: string; productName: string; brand?: string; model?: string; suggestedTariffDescription?: string; importPurpose: string; originCountryName: string; submittedAt: string; updatedAt: string; version: string; invoiceAmount: number | null; invoiceCurrency: string; assessedPayable: number | null; assessmentCurrency: string; canEdit?: boolean };

/** Importer-facing wording for declaration review statuses. */
export const declarationStatus: Record<string, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  SUBMITTED: { label: "In review", tone: "info" },
  INFORMATION_REQUESTED: { label: "Action needed", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "info" },
  ASSESSMENT_READY: { label: "Being valued", tone: "info" },
  IN_ASSESSMENT: { label: "Tax assessment", tone: "info" },
  ASSESSED: { label: "Assessed", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};
export const purposeLabels: Record<string, string> = { MANUFACTURING: "Manufacturing / production", COMMERCIAL_RESALE: "Commercial resale", PERSONAL: "Personal use", INSTITUTIONAL: "Institutional use", OTHER: "Other" };
export const declarationDocumentLabels: Record<string, string> = { COMMERCIAL_INVOICE: "Commercial invoice", PACKING_LIST: "Packing list", CERTIFICATE_OF_ORIGIN: "Certificate of origin" };

/** Currencies offered for the price paid; the API accepts any three-letter ISO code. */
export const invoiceCurrencies = ["USD", "EUR", "GBP", "CNY", "AED", "INR", "TRY", "SAR", "JPY", "KRW", "ZAR", "KES", "ETB"];

export function formatMoney(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency || "ETB", maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
}

export type ImporterNotification = { id: string; declarationId: string | null; kind: string; title: string; message: string; link: string; createdAt: string; readAt: string | null };
export const getImporterNotifications = () => importerApi<{ unread: number; items: ImporterNotification[] }>("/importer-notifications");
export const markNotificationRead = (id: string) => importerApi<unknown>(`/importer-notifications/${id}/read`, { method: "POST" });
export const markAllNotificationsRead = () => importerApi<unknown>("/importer-notifications/read-all", { method: "POST" });

/** The importer's own sign-in account (name, contact details, picture). Business details live on the verification record. */
export type ImporterAccount = { id: string; username: string; fullName: string; email: string; phone: string; createdAt: string; lastLoginAt: string | null; updatedAt: string | null; hasPhoto: boolean; photoUpdatedAt: string | null };
export const getImporterAccount = () => importerApi<ImporterAccount>("/importer-profile/account");
export const updateImporterAccount = (change: { fullName: string; email: string; phone: string }) =>
  importerApi<ImporterAccount>("/importer-profile/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
export const changeImporterPassword = (change: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
  importerApi<{ message: string }>("/importer-profile/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
export function uploadImporterPhoto(file: File) {
  const form = new FormData(); form.append("file", file);
  return importerApi<{ photoUpdatedAt: string }>("/importer-profile/account/photo", { method: "PUT", body: form });
}
export const removeImporterPhoto = () => importerApi<unknown>("/importer-profile/account/photo", { method: "DELETE" });
/** The profile picture as an object URL (images cannot send the bearer token themselves). */
export async function loadImporterPhoto(): Promise<string | null> {
  const token = getSessionAccessToken();
  if (!token) return null;
  const response = await fetch(`${importerApiBase}/importer-profile/account/photo`, { headers: { Authorization: `Bearer ${token}` } });
  return response.ok ? URL.createObjectURL(await response.blob()) : null;
}


/* ---------- Activity (the importer's own audit trail) ---------- */
export type ImporterActivityItem = {
  id: string; occurredAt: string; category: "CASE" | "VERIFICATION" | "ACCOUNT" | "SECURITY"; action: string; title: string; tone: "info" | "success" | "warning" | "danger" | "neutral";
  actor: string; byMe: boolean; note: string | null; declaration: { id: string; reference: string; title: string } | null; link: string | null;
};
export type ImporterActivity = { total: number; page: number; pageSize: number; counts: Record<string, number>; items: ImporterActivityItem[] };
export const getImporterActivity = (category: string, page: number) =>
  importerApi<ImporterActivity>(`/importer-activity?${new URLSearchParams({ ...(category ? { category } : {}), page: String(page) })}`);

/* ---------- Change of verified details (name, registered name, TIN) ---------- */
export type IdentityChange = {
  id: string; accountId: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reason: string; reviewNote: string; reviewedAt: string | null; createdAt: string; version: string;
  importerName?: string | null; email?: string | null; importerType?: string | null;
  changes: { field: "FULL_NAME" | "LEGAL_NAME" | "TIN"; label: string; current: string; requested: string }[];
  document: { fileName: string; contentType: string; size: number; sha256: string };
};
export const getMyChangeRequests = () => importerApi<IdentityChange[]>("/importer-profile/change-requests");
export const requestIdentityChange = (form: FormData) => importerApi<IdentityChange>("/importer-profile/change-requests", { method: "POST", body: form });
export const cancelIdentityChange = (id: string) => importerApi<IdentityChange>(`/importer-profile/change-requests/${id}`, { method: "DELETE" });
