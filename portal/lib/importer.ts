import { getSessionAccessToken } from "@/lib/auth/session";

export type ImporterDeclaration = {
  id: string; reference: string; status: string; importerId: string; locationId: string;
  suggestedHsCodeId: string; suggestedTariffLineId: string; suggestedTariffDescription: string; confirmedHsCodeId: string | null; confirmedTariffLineId: string | null;
  originCountryCode: string; originCountryName: string; importPurpose: string; purposeDetails: string;
  isCommercialProduct: boolean; isMachineryOrEquipment: boolean; requestedTreatments: string[];
  brand: string; model: string; productName: string; description: string; manufacturer: string;
  serialOrPartNumber: string; specifications: string; quantity: number; unit: string;
  reviewNote: string; submittedAt: string; updatedAt: string; version: string;
  documents: { kind: string; fileName: string; contentType: string; size: number; uploadedAt: string }[];
};

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
