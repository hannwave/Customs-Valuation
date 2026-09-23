"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { FiMapPin, FiRefreshCw } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { getSessionAccessToken } from "@/lib/auth/session";
import { locationLabel, roleLabel, workspaceApi, type EmployeeRecord, type WorkspaceProfile } from "@/lib/workspace";

type RegistrationRequest = { id: string; fullName: string; staffId: string; email: string; department: string; role: string; locationId: string | null; status: string; submittedAt: string };
type EmployeeDraft = { status: string; locationId: string; includeChildren?: boolean; responsibilities: string; reason: string };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";

async function authApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api/auth${path}`, { ...init, headers: { Authorization: `Bearer ${getSessionAccessToken()}`, ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "The account request could not be completed.");
  return body as T;
}

export default function AdministrationPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, EmployeeDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const current = await workspaceApi<WorkspaceProfile>("/me");
      if (current.user.role === "CustomsOfficer") throw new Error("Customs Officers do not have user-administration access.");
      const employeeRows = await workspaceApi<EmployeeRecord[]>("/employees");
      const visibleEmployees = current.user.role === "SystemAdministrator"
        ? employeeRows.filter(row => row.user.role === "CustomsAdministrator")
        : employeeRows;
      let pending: RegistrationRequest[] = [];
      if (current.user.role === "SystemAdministrator") {
        const response = await authApi<{ requests: RegistrationRequest[] }>("/registration-requests");
        pending = response.requests;
      }
      setProfile(current); setEmployees(visibleEmployees); setRequests(pending);
      setDrafts(Object.fromEntries(visibleEmployees.map(row => [row.user.id, {
        status: row.user.status || (row.user.active ? "ACTIVE" : "INACTIVE"),
        locationId: row.locationId ?? row.user.primaryLocationId ?? "",
        responsibilities: "",
        reason: "",
      }])));
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Unable to load user administration."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function approve(id: string) {
    setBusy(id); setError(""); setNotice("");
    try { await authApi(`/registration-requests/${id}/approve`, { method: "POST" }); setNotice("The registration was approved with the employee’s requested branch assignment."); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Approval failed."); }
    finally { setBusy(""); }
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const created = await workspaceApi<{ role?: string; status?: string }>("/employees", { method: "POST", body: JSON.stringify({ ...Object.fromEntries(form.entries()), includeChildren: form.get("includeChildren") === "true" }) });
      event.currentTarget.reset(); setNotice(created.role === "CustomsOfficer" ? "Officer account created as pending validation. Set its status to ACTIVE after reviewing the official staff details." : "The employee account and initial location assignment were created."); await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Account creation failed."); }
    finally { setBusy(""); }
  }

  async function deny(id: string) {
    const reason = reviewReasons[id]?.trim() ?? "";
    if (reason.length < 10) { setError("Enter at least 10 characters explaining why the request is denied."); return; }
    setBusy(`deny-${id}`); setError(""); setNotice("");
    try { await authApi(`/registration-requests/${id}/deny`, { method: "POST", body: JSON.stringify({ reason }) }); setNotice("The registration request was denied and recorded."); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Denial failed."); }
    finally { setBusy(""); }
  }

  async function updateEmployee(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setBusy(id); setError(""); setNotice("");
    try {
      await workspaceApi(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
      setNotice("The employee status and office assignment were updated with an audit record."); await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The account could not be updated."); }
    finally { setBusy(""); }
  }

  if (loading) return <DataState kind="loading" title="Loading user administration" description="Checking your role and employee assignments." />;
  if (!profile) return <DataState kind="error" title="Administration is unavailable" description={error} onRetry={() => void load()} />;
  const activeLocations = profile.locations.filter(location => location.status === "ACTIVE");
  return <div className="management-page">
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>{profile.user.role === "SystemAdministrator" ? "User and access control" : "Employees and regional access"}</h1><p className="lead">{profile.user.role === "SystemAdministrator" ? "Review employee registration requests and manage approved employee accounts." : "Manage Customs Officers assigned within your region."}</p></div>
      {profile.user.role === "SystemAdministrator" && <Link className="primary-link" href="/administration/organization"><FiMapPin />Open organization</Link>}
    </div>
    <div className="role-banner"><span className="badge">{roleLabel(profile.user.role)}</span><strong>{profile.user.role === "SystemAdministrator" ? "Nationwide authority" : `${profile.locations.length} assigned location${profile.locations.length === 1 ? "" : "s"}`}</strong><span>{profile.permissions.includes("users.manage_all") ? "May manage administrators and officers." : "May manage Customs Officers assigned to your location."}</span></div>
    {error && <DataState kind="error" compact title="Action could not be completed" description={error} onRetry={() => void load()} />}
    {notice && <p className="management-notice" role="status">{notice}</p>}

    {profile.user.role === "SystemAdministrator" && <section className="admin-panel">
      <div className="panel-heading"><div><h2>Pending Customs Administrator requests</h2><p>Applicants submit their own credentials and requested branch. You can review the request, but passwords and usernames remain private.</p></div><button type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button></div>
      {requests.length === 0 ? <DataState kind="empty" compact title="No pending employee requests" description="New employee registration requests will appear here." /> : <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Department</th><th>Requested branch</th><th>Submitted</th><th>Review</th></tr></thead><tbody>{requests.map(request => { const requestedLocation = request.locationId ? profile.locations.find(location => location.id === request.locationId) : null; return <tr key={request.id}><td><strong>{request.fullName}</strong><small>{request.email}<br />{request.staffId}</small></td><td>{request.department || "—"}</td><td>{requestedLocation ? locationLabel(requestedLocation) : request.locationId ? request.locationId.slice(0, 8) : "Not selected"}</td><td>{new Date(request.submittedAt).toLocaleDateString()}</td><td><div className="request-review-actions"><button className="approve-button" type="button" disabled={busy === request.id} onClick={() => void approve(request.id)}>{busy === request.id ? "Approving…" : "Approve"}</button><input aria-label={`Denial reason for ${request.fullName}`} placeholder="Reason to deny (10+ characters)" value={reviewReasons[request.id] ?? ""} onChange={event => setReviewReasons(values => ({ ...values, [request.id]: event.target.value }))} /><button className="secondary-button danger-button" type="button" disabled={busy === `deny-${request.id}`} onClick={() => void deny(request.id)}>{busy === `deny-${request.id}` ? "Denying…" : "Deny"}</button></div></td></tr>; })}</tbody></table></div>}
    </section>}

    <section className="admin-panel">
      <div className="panel-heading"><div><h2>{profile.user.role === "SystemAdministrator" ? "Customs Administrator accounts" : "Managed Customs Officers"}</h2><p>{employees.length} account{employees.length === 1 ? "" : "s"} visible in your assigned location.</p></div></div>
      {employees.length === 0 ? <DataState kind="empty" compact title={profile.user.role === "SystemAdministrator" ? "No Customs Administrator accounts" : "No manageable employees"} description={profile.user.role === "SystemAdministrator" ? "Approved Customs Administrator accounts will appear here." : "Customs Officers appear here after an approved location assignment."} /> : <div className="table-wrap"><table className="management-table"><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>Primary location</th><th>Responsibilities / reason</th><th>Action</th></tr></thead><tbody>{employees.map(row => {
        const draft = drafts[row.user.id];
        return <tr key={row.user.id}><td><strong>{row.user.fullName}</strong><small>@{row.user.username}<br />{row.user.email}</small></td><td>{roleLabel(row.user.role)}</td><td><select aria-label={`Status for ${row.user.fullName}`} value={draft?.status ?? "ACTIVE"} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], status: event.target.value } }))}><option>ACTIVE</option><option>PENDING_VALIDATION</option><option>SUSPENDED</option><option>INACTIVE</option><option>LOCKED</option></select></td><td><select aria-label={`Location for ${row.user.fullName}`} value={draft?.locationId ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], locationId: event.target.value } }))}><option value="">Select</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select>{row.user.role === "CustomsAdministrator" && <label className="inline-check"><input type="checkbox" checked={draft?.includeChildren ?? false} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], includeChildren: event.target.checked } }))} />Include children</label>}<small>{row.assignments?.length ?? (row.locationId ? 1 : 0)} active assignment{(row.assignments?.length ?? (row.locationId ? 1 : 0)) === 1 ? "" : "s"}</small></td><td><input aria-label={`Responsibilities for ${row.user.fullName}`} placeholder="Responsibilities" value={draft?.responsibilities ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], responsibilities: event.target.value } }))} /><input aria-label={`Change reason for ${row.user.fullName}`} placeholder="Reason (10+ characters)" value={draft?.reason ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], reason: event.target.value } }))} /></td><td><button className="approve-button" type="button" disabled={busy === row.user.id || !draft?.locationId || (draft?.reason.length ?? 0) < 10} onClick={() => void updateEmployee(row.user.id)}>{busy === row.user.id ? "Saving…" : "Save"}</button></td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}
