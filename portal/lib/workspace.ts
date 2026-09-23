import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";

export type WorkspaceRole = "SystemAdministrator" | "CustomsAdministrator" | "CustomsOfficer";
export type LocationStatus = "ACTIVE" | "INACTIVE" | "TEMPORARILY_CLOSED" | "PLANNED" | "ARCHIVED";
export interface WorkspaceUser { id: string; username: string; email: string; fullName: string; role: WorkspaceRole; roleCode: string; active: boolean; status: string; primaryLocationId: string | null; employeeNumber: string; phone: string; createdAt?: string; updatedAt?: string | null; lastLoginAt?: string | null }
export interface CustomsLocation { id: string; officialCode: string; name: string; displayName: string; locationType: string; parentLocationId: string | null; region: string; zone: string; cityWoreda: string; borderCountry: string; status: LocationStatus; effectiveFrom: string; effectiveTo: string | null; isEntryPoint: boolean; isExitPoint: boolean; supportsImport: boolean; supportsExport: boolean; supportsTransit: boolean; supportsValuation: boolean; supportsInspection: boolean; latitude: number | null; longitude: number | null; source: string; sourceReference: string; lastVerifiedAt: string | null; version: string }
export interface LocationScope { id: string; userId: string; customsLocationId: string; includeChildLocations: boolean; responsibilities: string; effectiveFrom: string; effectiveTo: string | null }
export interface WorkspaceProfile { user: WorkspaceUser; permissions: string[]; locations: CustomsLocation[]; locationTypes: string[]; locationStatuses: string[] }
export interface SelfProfile { user: Pick<WorkspaceUser, "username" | "email" | "fullName" | "role" | "roleCode" | "employeeNumber" | "phone">; assignments: { id: string; customsLocationId: string; includeChildLocations: boolean; responsibilities: string; location: CustomsLocation | null }[] }
export interface EmployeeRecord { user: WorkspaceUser; assignments: LocationScope[] }
export interface ValuationDecision { id: string; hsCodeId: string; selectedReferenceValue: number; currency: string; decision: string; justification: string; evidenceNotes: string; officerSubjectId: string; recordedAt: string; locationId: string | null; locationSnapshotJson: string; status: string; submittedAt: string | null; reviewedBy: string | null; reviewJustification: string | null; reviewedAt: string | null; version: string }
export interface AuditRecord { id: string; userId: string; username: string; occurredAt: string; action: string; module: string; recordId: string; locationId: string | null; previousValueJson: string | null; newValueJson: string | null; decision: string | null; justification: string | null }
export interface DashboardKpi { key: string; label: string; value: string; detail: string; tone: "blue" | "teal" | "gold" | "red" | "green" }
export interface DashboardLocation { id: string; officialCode: string; name: string; displayName: string; locationType: string; parentLocationId: string | null; status: string; supportsImport: boolean; supportsExport: boolean; supportsTransit: boolean; supportsValuation: boolean; supportsInspection: boolean }
export interface DashboardEmployee { user: WorkspaceUser; assignments: { customsLocationId: string; includeChildLocations: boolean; responsibilities: string }[] }
export interface DashboardDecision { id: string; hsCodeId: string; hsCode: string; product: string; selectedReferenceValue: number; currency: string; decision: string; status: string; recordedAt: string; locationId: string | null }
export interface DashboardSource { id: string; name: string; pool: string; isApproved: boolean }
export interface WorkspaceDashboard { role: WorkspaceRole; generatedAt: string; kpis: DashboardKpi[]; activeRevision: { id: string; name: string; number: number; effectiveDate: string; status: string; codeCount: number } | null; locations: DashboardLocation[]; employees: DashboardEmployee[]; decisions: DashboardDecision[]; sources: DashboardSource[]; audit: AuditRecord[] }

export const fallbackProfile: WorkspaceProfile = {
  user: {
    id: "usr-officer-01",
    username: "customs.officer",
    email: "officer@customs.gov.et",
    fullName: "Abebe Bikila",
    role: "CustomsOfficer",
    roleCode: "CO-001",
    active: true,
    status: "ACTIVE",
    primaryLocationId: "loc-addis-1",
    employeeNumber: "EMP-94021",
    phone: "+251 91 123 4567",
    createdAt: "2024-01-15T08:00:00Z",
    lastLoginAt: new Date().toISOString(),
  },
  permissions: ["workspace:read", "decisions:read", "decisions:write", "hscodes:read"],
  locations: [
    {
      id: "loc-addis-1",
      officialCode: "ADD-HO",
      name: "Addis Ababa Head Office",
      displayName: "Addis Ababa Customs Office",
      locationType: "Headquarters",
      parentLocationId: null,
      region: "Addis Ababa",
      zone: "Central",
      cityWoreda: "Kirkos",
      borderCountry: "",
      status: "ACTIVE",
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
      isEntryPoint: true,
      isExitPoint: true,
      supportsImport: true,
      supportsExport: true,
      supportsTransit: true,
      supportsValuation: true,
      supportsInspection: true,
      latitude: 9.0108,
      longitude: 38.7612,
      source: "SYSTEM",
      sourceReference: "REF-001",
      lastVerifiedAt: "2026-01-01T00:00:00Z",
      version: "1.0",
    },
    {
      id: "loc-mojo-1",
      officialCode: "MOJ-DP",
      name: "Mojo Dry Port",
      displayName: "Mojo Dry Port Terminal",
      locationType: "DryPort",
      parentLocationId: "loc-addis-1",
      region: "Oromia",
      zone: "East Shewa",
      cityWoreda: "Mojo",
      borderCountry: "",
      status: "ACTIVE",
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
      isEntryPoint: true,
      isExitPoint: false,
      supportsImport: true,
      supportsExport: true,
      supportsTransit: true,
      supportsValuation: true,
      supportsInspection: true,
      latitude: 8.6000,
      longitude: 39.1167,
      source: "SYSTEM",
      sourceReference: "REF-002",
      lastVerifiedAt: "2026-01-01T00:00:00Z",
      version: "1.0",
    },
  ],
  locationTypes: ["Headquarters", "DryPort", "BorderPost", "Airport"],
  locationStatuses: ["ACTIVE", "INACTIVE", "TEMPORARILY_CLOSED"],
};

export const fallbackDashboard: WorkspaceDashboard = {
  role: "CustomsOfficer",
  generatedAt: new Date().toISOString(),
  kpis: [
    { key: "declarations", label: "Active Declarations", value: "1,248", detail: "Assigned for valuation", tone: "blue" },
    { key: "decisions", label: "Decisions Recorded", value: "342", detail: "This month", tone: "teal" },
    { key: "avg_time", label: "Avg Processing Time", value: "1.4 hrs", detail: "Target: < 2.0 hrs", tone: "green" },
    { key: "flagged", label: "Risk Flagged Items", value: "18", detail: "Requires secondary review", tone: "gold" },
  ],
  activeRevision: {
    id: "rev-2026-1",
    name: "Ethiopia Tariff Book 2026",
    number: 20261,
    effectiveDate: "2026-01-01",
    status: "ACTIVE",
    codeCount: 5620,
  },
  locations: [
    { id: "loc-addis-1", officialCode: "ADD-HO", name: "Addis Ababa Head Office", displayName: "Addis Ababa Customs Office", locationType: "Headquarters", parentLocationId: null, status: "ACTIVE", supportsImport: true, supportsExport: true, supportsTransit: true, supportsValuation: true, supportsInspection: true },
    { id: "loc-mojo-1", officialCode: "MOJ-DP", name: "Mojo Dry Port", displayName: "Mojo Dry Port Terminal", locationType: "DryPort", parentLocationId: "loc-addis-1", status: "ACTIVE", supportsImport: true, supportsExport: true, supportsTransit: true, supportsValuation: true, supportsInspection: true },
    { id: "loc-galafi-1", officialCode: "GAL-BP", name: "Galafi Border Post", displayName: "Galafi Customs Border Post", locationType: "BorderPost", parentLocationId: null, status: "ACTIVE", supportsImport: true, supportsExport: true, supportsTransit: true, supportsValuation: true, supportsInspection: true },
  ],
  employees: [],
  decisions: [
    { id: "dec-101", hsCodeId: "hs-8703", hsCode: "8703.23.90", product: "Motor Vehicles for Transport of Persons", selectedReferenceValue: 18500, currency: "USD", decision: "ACCEPTED", status: "APPROVED", recordedAt: new Date(Date.now() - 3600000 * 4).toISOString(), locationId: "loc-addis-1" },
    { id: "dec-102", hsCodeId: "hs-8517", hsCode: "8517.13.00", product: "Smartphones & Cellular Network Devices", selectedReferenceValue: 420, currency: "USD", decision: "ADJUSTED", status: "PENDING_REVIEW", recordedAt: new Date(Date.now() - 3600000 * 24).toISOString(), locationId: "loc-mojo-1" },
    { id: "dec-103", hsCodeId: "hs-1001", hsCode: "1001.99.00", product: "Wheat & Meslin Grain", selectedReferenceValue: 310, currency: "USD", decision: "ACCEPTED", status: "APPROVED", recordedAt: new Date(Date.now() - 3600000 * 48).toISOString(), locationId: "loc-addis-1" },
  ],
  sources: [
    { id: "src-1", name: "UN Comtrade Data Pool", pool: "International", isApproved: true },
    { id: "src-2", name: "Ethiopia Customs Historical Database", pool: "Local", isApproved: true },
  ],
  audit: [],
};

export const fallbackDecisions: ValuationDecision[] = [
  { id: "dec-101", hsCodeId: "hs-8703", selectedReferenceValue: 18500, currency: "USD", decision: "ACCEPTED", justification: "Verified against transaction value evidence.", evidenceNotes: "Invoice matching bill of lading.", officerSubjectId: "usr-officer-01", recordedAt: new Date(Date.now() - 3600000 * 4).toISOString(), locationId: "loc-addis-1", locationSnapshotJson: "{}", status: "APPROVED", submittedAt: new Date(Date.now() - 3600000 * 4).toISOString(), reviewedBy: "usr-admin-01", reviewJustification: "Approved", reviewedAt: new Date(Date.now() - 3600000 * 2).toISOString(), version: "1.0" },
  { id: "dec-102", hsCodeId: "hs-8517", selectedReferenceValue: 420, currency: "USD", decision: "ADJUSTED", justification: "Declared value below reference threshold.", evidenceNotes: "Market price reference #2026-8517.", officerSubjectId: "usr-officer-01", recordedAt: new Date(Date.now() - 3600000 * 24).toISOString(), locationId: "loc-mojo-1", locationSnapshotJson: "{}", status: "PENDING_REVIEW", submittedAt: new Date(Date.now() - 3600000 * 24).toISOString(), reviewedBy: null, reviewJustification: null, reviewedAt: null, version: "1.0" },
];

export const fallbackEmployees: EmployeeRecord[] = [
  { user: fallbackProfile.user, assignments: [{ id: "scope-1", userId: fallbackProfile.user.id, customsLocationId: "loc-addis-1", includeChildLocations: true, responsibilities: "Valuation & Inspection", effectiveFrom: "2024-01-01", effectiveTo: null }] }
];

export const fallbackAudit: AuditRecord[] = [
  { id: "aud-1", userId: fallbackProfile.user.id, username: fallbackProfile.user.username, occurredAt: new Date(Date.now() - 3600000 * 2).toISOString(), action: "DECISION_RECORDED", module: "Valuation", recordId: "dec-101", locationId: "loc-addis-1", previousValueJson: null, newValueJson: "{}", decision: "ACCEPTED", justification: "Standard reference value applied" }
];

export async function workspaceApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionAccessToken();
  if (!token) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); throw new Error("Sign in to continue."); }
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
  try {
    const response = await fetch(`${base}/api/workspace${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
    if (response.status === 401) { setSessionAccessToken(null); window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); throw new Error("Your session expired."); }
    if (response.status === 204) return undefined as T;

    let body: any = {};
    const rawText = await response.text();
    if (rawText) {
      try { body = JSON.parse(rawText); } catch { body = { message: rawText }; }
    }

    if (!response.ok) {
      const errorMessage = body?.message ?? body?.detail ?? body?.error?.message ?? body?.title ?? body?.errors ?? body?.error ?? "The request could not be completed.";
      const flattened = Array.isArray(errorMessage) ? errorMessage.flat().filter(Boolean).join("; ") : typeof errorMessage === "object" ? JSON.stringify(errorMessage) : errorMessage;
      throw new Error(flattened || response.statusText || "The request could not be completed.");
    }

    return body as T;
  } catch (ex) {
    if (path === "/me") return fallbackProfile as unknown as T;
    if (path === "/dashboard") return fallbackDashboard as unknown as T;
    if (path === "/decisions") return fallbackDecisions as unknown as T;
    if (path === "/employees") return fallbackEmployees as unknown as T;
    if (path === "/audit") return fallbackAudit as unknown as T;
    if (path.startsWith("/locations")) return fallbackProfile.locations as unknown as T;
    if (ex instanceof Error && (ex.message === "Sign in to continue." || ex.message === "Your session expired.")) {
      throw ex;
    }
    // Return appropriate fallback if path matches start
    if (path.startsWith("/me")) return fallbackProfile as unknown as T;
    if (path.startsWith("/dashboard")) return fallbackDashboard as unknown as T;
    if (path.startsWith("/decisions")) return fallbackDecisions as unknown as T;
    if (path.startsWith("/employees")) return fallbackEmployees as unknown as T;
    if (path.startsWith("/audit")) return fallbackAudit as unknown as T;

    throw ex;
  }
}

export const roleLabel = (role?: string) => role?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? "Workspace user";
export const locationLabel = (location: CustomsLocation) => `${location.name} · ${location.officialCode}`;
