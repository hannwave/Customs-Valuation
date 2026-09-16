"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { FiMapPin, FiRefreshCw, FiUserPlus } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { getSessionAccessToken } from "@/lib/auth/session";
import { locationLabel, roleLabel, workspaceApi, type EmployeeRecord, type WorkspaceProfile } from "@/lib/workspace";

type RegistrationRequest = { id: string; fullName: string; staffId: string; email: string; department: string; role: string; status: string; submittedAt: string };
type EmployeeDraft = { status: string; locationId: string; includeChildren: boolean; responsibilities: string; reason: string };
type ScopeDraft = { locationId: string; includeChildren: boolean; responsibilities: string; reason: string };
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
  const [drafts, setDrafts] = useState<Record<string, EmployeeDraft>>({});
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, ScopeDraft>>({});
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
      let pending: RegistrationRequest[] = [];
      if (current.user.role === "SystemAdministrator") {
        const response = await authApi<{ requests: RegistrationRequest[] }>("/registration-requests");
        pending = response.requests;
      }
      setProfile(current); setEmployees(employeeRows); setRequests(pending);
      setDrafts(Object.fromEntries(employeeRows.map(row => [row.user.id, {
        status: row.user.status || (row.user.active ? "ACTIVE" : "INACTIVE"),
        locationId: row.user.primaryLocationId ?? row.assignments[0]?.customsLocationId ?? "",
        includeChildren: row.assignments.find(scope => scope.customsLocationId === row.user.primaryLocationId)?.includeChildLocations ?? false,
        responsibilities: row.assignments[0]?.responsibilities ?? "",
        reason: "",
      }])));
      setScopeDrafts(Object.fromEntries(employeeRows.filter(row => row.user.role === "CustomsAdministrator").map(row => [row.user.id, { locationId: "", includeChildren: true, responsibilities: "", reason: "" }])));
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Unable to load user administration."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function approve(id: string) {
    setBusy(id); setError(""); setNotice("");
    try { await authApi(`/registration-requests/${id}/approve`, { method: "POST" }); setNotice("The registration was approved. Assign the officer to an office below."); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Approval failed."); }
    finally { setBusy(""); }
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await workspaceApi("/employees", { method: "POST", body: JSON.stringify({ ...Object.fromEntries(form.entries()), includeChildren: form.get("includeChildren") === "true" }) });
      event.currentTarget.reset(); setNotice("The employee account and initial location assignment were created."); await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Account creation failed."); }
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

  async function addScope(id: string) {
    const draft = scopeDrafts[id]; if (!draft) return;
    setBusy(`scope-${id}`); setError(""); setNotice("");
    try { await workspaceApi(`/employees/${id}/scopes`, { method: "POST", body: JSON.stringify(draft) }); setNotice("Administrator scope added. Descendant access follows the selected hierarchy setting."); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The scope could not be added."); }
    finally { setBusy(""); }
  }
  async function revokeScope(userId: string, scopeId: string) {
    const reason = scopeDrafts[userId]?.reason ?? ""; setBusy(scopeId); setError(""); setNotice("");
    try { await workspaceApi(`/employees/${userId}/scopes/${scopeId}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }); setNotice("Administrator scope revoked with its historical record preserved."); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The scope could not be revoked."); }
    finally { setBusy(""); }
  }

  if (loading) return <DataState kind="loading" title="Loading user administration" description="Checking your role, location scope, and employee assignments." />;
  if (!profile) return <DataState kind="error" title="Administration is unavailable" description={error} onRetry={() => void load()} />;
  const activeLocations = profile.locations.filter(location => location.status === "ACTIVE");
  return <div className="management-page">
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>User and access control</h1><p className="lead">Create accounts and manage responsibility only within your authorized customs locations.</p></div>
      {profile.user.role === "SystemAdministrator" && <Link className="primary-link" href="/administration/locations"><FiMapPin />Manage locations</Link>}
    </div>
    <div className="role-banner"><span className="badge">{roleLabel(profile.user.role)}</span><strong>{profile.user.role === "SystemAdministrator" ? "Nationwide authority" : `${profile.locations.length} scoped location${profile.locations.length === 1 ? "" : "s"}`}</strong><span>{profile.permissions.includes("users.manage_all") ? "May manage administrators and officers." : "May manage Customs Officers whose complete assignment remains within your scope."}</span></div>
    {error && <DataState kind="error" compact title="Action could not be completed" description={error} onRetry={() => void load()} />}
    {notice && <p className="management-notice" role="status">{notice}</p>}

    {profile.user.role === "SystemAdministrator" && <section className="admin-panel">
      <div className="panel-heading"><div><h2>Pending registration requests</h2><p>Public registrations create officer requests only. Approval does not grant location access.</p></div><button type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button></div>
      {requests.length === 0 ? <DataState kind="empty" compact title="No pending registration requests" description="New officer requests will appear here." /> : <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Department</th><th>Requested role</th><th>Submitted</th><th>Action</th></tr></thead><tbody>{requests.map(request => <tr key={request.id}><td><strong>{request.fullName}</strong><small>{request.email}<br />{request.staffId}</small></td><td>{request.department || "—"}</td><td>{roleLabel(request.role)}</td><td>{new Date(request.submittedAt).toLocaleDateString()}</td><td><button className="approve-button" type="button" disabled={busy === request.id} onClick={() => void approve(request.id)}>{busy === request.id ? "Approving…" : "Approve as Officer"}</button></td></tr>)}</tbody></table></div>}
    </section>}

    <section className="admin-panel">
      <div className="panel-heading"><div><h2>Create employee account</h2><p>A location assignment is mandatory and is validated by the API.</p></div><FiUserPlus aria-hidden="true" /></div>
      {activeLocations.length === 0 ? <DataState kind="empty" compact title="No active location is available" description={profile.user.role === "SystemAdministrator" ? "Create an official customs location before creating employee accounts." : "Ask a System Administrator to create a location and assign it to your scope."} /> : <form className="management-form" onSubmit={createEmployee}>
        <label><span>Full name</span><input name="fullName" required /></label>
        <label><span>Username</span><input name="username" minLength={3} required /></label>
        <label><span>Email</span><input name="email" type="email" required /></label>
        <label><span>Employee number</span><input name="employeeNumber" /></label>
        <label><span>Phone</span><input name="phone" /></label>
        <label><span>Role</span><select name="role" required><option value="CustomsOfficer">Customs Officer</option>{profile.user.role === "SystemAdministrator" && <option value="CustomsAdministrator">Customs Administrator</option>}</select></label>
        <label><span>Primary location</span><select name="locationId" required defaultValue=""><option value="" disabled>Select an office</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
        <label><span>Temporary password</span><input name="password" type="password" minLength={8} required autoComplete="new-password" /><small>Uppercase, lowercase, number and symbol required.</small></label>
        {profile.user.role === "SystemAdministrator" && <label className="checkbox-field"><input name="includeChildren" type="checkbox" value="true" /><span>Include child locations</span><small>Used only when creating a Customs Administrator.</small></label>}
        <div className="form-actions"><button className="primary-button" type="submit" disabled={busy === "create"}>{busy === "create" ? "Creating…" : "Create account"}</button></div>
      </form>}
    </section>

    <section className="admin-panel">
      <div className="panel-heading"><div><h2>Managed employees</h2><p>{employees.length} account{employees.length === 1 ? "" : "s"} visible in your location scope.</p></div></div>
      {employees.length === 0 ? <DataState kind="empty" compact title="No manageable employees" description="Officers and administrators appear here after an authorized location assignment." /> : <div className="table-wrap"><table className="management-table"><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>Primary location</th><th>Responsibilities / reason</th><th>Action</th></tr></thead><tbody>{employees.map(row => {
        const draft = drafts[row.user.id];
        return <tr key={row.user.id}><td><strong>{row.user.fullName}</strong><small>@{row.user.username}<br />{row.user.email}</small></td><td>{roleLabel(row.user.role)}</td><td><select aria-label={`Status for ${row.user.fullName}`} value={draft?.status ?? "ACTIVE"} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], status: event.target.value } }))}><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option><option>LOCKED</option></select></td><td><select aria-label={`Location for ${row.user.fullName}`} value={draft?.locationId ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], locationId: event.target.value } }))}><option value="">Select</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select>{row.user.role === "CustomsAdministrator" && <label className="inline-check"><input type="checkbox" checked={draft?.includeChildren ?? false} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], includeChildren: event.target.checked } }))} />Include children</label>}<small>{row.assignments.length} active assignment{row.assignments.length === 1 ? "" : "s"}</small></td><td><input aria-label={`Responsibilities for ${row.user.fullName}`} placeholder="Responsibilities" value={draft?.responsibilities ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], responsibilities: event.target.value } }))} /><input aria-label={`Change reason for ${row.user.fullName}`} placeholder="Reason (10+ characters)" value={draft?.reason ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], reason: event.target.value } }))} /></td><td><button className="approve-button" type="button" disabled={busy === row.user.id || !draft?.locationId || (draft?.reason.length ?? 0) < 10} onClick={() => void updateEmployee(row.user.id)}>{busy === row.user.id ? "Saving…" : "Save"}</button></td></tr>;
      })}</tbody></table></div>}
    </section>
    {profile.user.role === "SystemAdministrator" && employees.some(row => row.user.role === "CustomsAdministrator") && <section className="admin-panel">
      <div className="panel-heading"><div><h2>Administrator location scopes</h2><p>Add independent offices or whole descendant hierarchies. Revocation is effective-dated, never deleted.</p></div></div>
      <div className="scope-grid">{employees.filter(row => row.user.role === "CustomsAdministrator").map(row => {
        const draft = scopeDrafts[row.user.id];
        return <article className="scope-card" key={row.user.id}><h3>{row.user.fullName}</h3><p>{row.assignments.length ? row.assignments.map(scope => `${profile.locations.find(location => location.id === scope.customsLocationId)?.officialCode ?? scope.customsLocationId.slice(0, 8)}${scope.includeChildLocations ? " + children" : ""}`).join(" · ") : "No active scope"}</p>
          <div className="scope-list">{row.assignments.map(scope => <div key={scope.id}><span>{locationLabel(profile.locations.find(location => location.id === scope.customsLocationId)!)}</span><button type="button" disabled={busy === scope.id || (draft?.reason.length ?? 0) < 10} onClick={() => void revokeScope(row.user.id, scope.id)}>Revoke</button></div>)}</div>
          <div className="scope-form"><select aria-label={`New scope for ${row.user.fullName}`} value={draft?.locationId ?? ""} onChange={event => setScopeDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], locationId: event.target.value } }))}><option value="">Select additional location</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select><input placeholder="Responsibilities" value={draft?.responsibilities ?? ""} onChange={event => setScopeDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], responsibilities: event.target.value } }))} /><input placeholder="Assignment or revocation reason" value={draft?.reason ?? ""} onChange={event => setScopeDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], reason: event.target.value } }))} /><label className="inline-check"><input type="checkbox" checked={draft?.includeChildren ?? true} onChange={event => setScopeDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], includeChildren: event.target.checked } }))} />Include child locations</label><button className="primary-button" type="button" disabled={busy === `scope-${row.user.id}` || !draft?.locationId || (draft?.reason.length ?? 0) < 10} onClick={() => void addScope(row.user.id)}>Add scope</button></div>
        </article>;
      })}</div>
    </section>}
  </div>;
}
