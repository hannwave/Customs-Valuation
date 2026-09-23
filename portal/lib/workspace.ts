import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";

export type WorkspaceRole = "SystemAdministrator" | "CustomsAdministrator" | "CustomsOfficer";
export type LocationStatus = "ACTIVE" | "INACTIVE" | "TEMPORARILY_CLOSED" | "PLANNED" | "ARCHIVED";
export function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  const role = String(value ?? "").replace(/[\s_-]/g, "").toUpperCase();
  if (role === "SYSTEMADMIN" || role === "SYSTEMADMINISTRATOR") return "SystemAdministrator";
  if (role === "CUSTOMSADMIN" || role === "CUSTOMSADMINISTRATOR") return "CustomsAdministrator";
  if (role === "CUSTOMSOFFICER") return "CustomsOfficer";
  return null;
}
export interface WorkspaceUser { id: string; username?: string; email: string; fullName: string; role: WorkspaceRole; roleCode: string; active: boolean; status: string; primaryLocationId: string | null; employeeNumber: string; phone: string; responsibilities: string; archivedAt?: string | null; archiveReason?: string | null; createdAt?: string; updatedAt?: string | null; lastLoginAt?: string | null }
export interface CustomsLocation { id: string; officialCode: string; name: string; displayName: string; locationType: string; parentLocationId: string | null; region: string; zone: string; cityWoreda: string; borderCountry: string; status: LocationStatus; effectiveFrom: string; effectiveTo: string | null; isEntryPoint: boolean; isExitPoint: boolean; supportsImport: boolean; supportsExport: boolean; supportsTransit: boolean; supportsValuation: boolean; supportsInspection: boolean; latitude: number | null; longitude: number | null; source: string; sourceReference: string; lastVerifiedAt: string | null; version: string }
export interface WorkspaceProfile { user: WorkspaceUser; permissions: string[]; locations: CustomsLocation[]; locationTypes: string[]; locationStatuses: string[]; employeeResponsibilities?: string[] }
export interface SelfProfile { user: Pick<WorkspaceUser, "username" | "email" | "fullName" | "role" | "roleCode" | "employeeNumber" | "phone">; location: CustomsLocation | null }
export interface EmployeeRecord { user: WorkspaceUser; locationId: string | null }
export interface ValuationDecision { id: string; hsCodeId: string; selectedReferenceValue: number; currency: string; decision: string; justification: string; evidenceNotes: string; officerSubjectId: string; recordedAt: string; locationId: string | null; locationSnapshotJson: string; status: string; submittedAt: string | null; reviewedBy: string | null; reviewJustification: string | null; reviewedAt: string | null; version: string }
export interface AuditRecord { id: string; userId: string; username: string; occurredAt: string; action: string; module: string; recordId: string; locationId: string | null; previousValueJson: string | null; newValueJson: string | null; decision: string | null; justification: string | null }
export interface DashboardKpi { key: string; label: string; value: string; detail: string; tone: "blue" | "teal" | "gold" | "red" | "green" }
export interface DashboardLocation { id: string; officialCode: string; name: string; displayName: string; locationType: string; parentLocationId: string | null; status: string; supportsImport: boolean; supportsExport: boolean; supportsTransit: boolean; supportsValuation: boolean; supportsInspection: boolean }
export interface DashboardEmployee { user: WorkspaceUser; locationId: string | null }
export interface DashboardDecision { id: string; hsCodeId: string; hsCode: string; product: string; selectedReferenceValue: number; currency: string; decision: string; status: string; recordedAt: string; locationId: string | null }
export interface DashboardSource { id: string; name: string; pool: string; isApproved: boolean }
export interface WorkspaceDashboard { role: WorkspaceRole; generatedAt: string; kpis: DashboardKpi[]; activeRevision: { id: string; name: string; number: number; effectiveDate: string; status: string; codeCount: number } | null; locations: DashboardLocation[]; employees: DashboardEmployee[]; decisions: DashboardDecision[]; sources: DashboardSource[]; audit: AuditRecord[] }
export interface CustomsAdminAnalytics {
  generatedAt: string;
  scope: { region: string; branchCount: number; activeBranches: number };
  filters: { dateFrom: string; dateTo: string; locationId: string | null; officerId: string | null; status: string; hsChapter: string; currency: string };
  scopeNote: string;
  summary: {
    activeOffices: number; totalOffices: number; activeOfficers: number; managedOfficers: number;
    pendingValuations: number; returnedValuations: number; approvedValuations: number; rejectedValuations: number;
    decisions: number; decisionsToday: number; suspendedAccounts: number; averageReviewHours: number | null;
    overdueReviews: number; approvalRate: number; returnRate: number; rejectionRate: number; evidenceCoverage: number; justificationCoverage: number;
  };
  statusBreakdown: Array<{ status: string; count: number; percentage: number }>;
  trends: Array<{ period: string; label: string; decisions: number; submitted: number; approved: number; returned: number; averageReviewHours: number | null }>;
  branchPerformance: Array<{ locationId: string; name: string; officialCode: string; status: string; active: boolean; officers: number; decisions: number; pending: number; submitted: number; approved: number; returned: number; rejected: number; averageReviewHours: number | null; lastDecisionAt: string | null }>;
  officerPerformance: Array<{ userId: string; name: string; employeeNumber: string; status: string; active: boolean; branch: string; responsibilities: string; lastLoginAt: string | null; decisions: number; pending: number; submitted: number; approved: number; returned: number; rejected: number; averageReviewHours: number | null; lastDecisionAt: string | null }>;
  topHsCodes: Array<{ hsCode: string; description: string; decisions: number; approved: number; returned: number; currencies: string; averageReferenceValue: number | null }>;
  quality: {
    missingEvidence: number; missingJustification: number; validLocalObservations: number; potentialOutliers: number;
    unreviewedOutliers: number; confirmedOutliers: number; rejectedOutliers: number;
    outlierTrend: Array<{ period: string; label: string; count: number }>;
    sharedReferenceData: boolean; localMedianEtb: number | null; internationalMedianEtb: number | null;
    localVsInternationalVariancePercent: number | null; localObservationCount: number; internationalObservationCount: number;
  };
  sourceCoverage: Array<{ sourceId: string; name: string; pool: string; approved: boolean; records: number }>;
  auditSummary: Array<{ action: string; count: number }>;
  auditActivity: Array<{ id: string; occurredAt: string; actor: string; action: string; module: string; location: string; recordId: string; justification: string | null }>;
  alerts: Array<{ severity: string; title: string; detail: string }>;
}

export async function workspaceApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionAccessToken();
  if (!token) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); throw new Error("Sign in to continue."); }
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
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
}

export const roleLabel = (role?: string) => role?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? "Workspace user";
export const locationLabel = (location: CustomsLocation) => `${location.name} · ${location.officialCode}`;

/** Client‑side helper mirroring AccessRules.NormalizeRole for System Administrator */
export const isSystemAdmin = (role?: string | null): boolean => {
  if (!role) return false;
  const normalized = role
    .replace(/[\s_-]/g, "")
    .toUpperCase()
    .replace(/^SYSTEMADMIN.*$/g, "SYSTEMADMINISTRATOR");
  return normalized === "SYSTEMADMINISTRATOR";
};
