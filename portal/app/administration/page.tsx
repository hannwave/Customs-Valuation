"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { FiActivity, FiArchive, FiDownload, FiMapPin, FiPlus, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { getSessionAccessToken } from "@/lib/auth/session";
import { locationLabel, roleLabel, workspaceApi, type AuditRecord, type EmployeeRecord, type WorkspaceProfile } from "@/lib/workspace";

type RegistrationRequest = { id: string; fullName: string; staffId: string; email: string; department: string; role: string; locationId: string | null; status: string; submittedAt: string };
type EmployeeDraft = { status: string; locationId: string; responsibilities: string; reason: string };
type OfficerForm = { username: string; fullName: string; email: string; password: string; confirmPassword: string; employeeNumber: string; phone: string; locationId: string; responsibilities: string[]; reason: string };
const responsibilityOptions = ["Valuation", "Inspection", "Import", "Export", "Transit"] as const;
const blankOfficerForm = (locationId = ""): OfficerForm => ({ username: "", fullName: "", email: "", password: "", confirmPassword: "", employeeNumber: "", phone: "", locationId, responsibilities: [], reason: "" });
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";

async function authApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api/auth${path}`, { ...init, headers: { Authorization: `Bearer ${getSessionAccessToken()}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
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
  const [search, setSearch] = useState("");
  const [activityEmployee, setActivityEmployee] = useState<EmployeeRecord | null>(null);
  const [activity, setActivity] = useState<AuditRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [archiveEmployee, setArchiveEmployee] = useState<EmployeeRecord | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<OfficerForm>(blankOfficerForm());
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
        responsibilities: row.user.responsibilities ?? "",
        reason: "",
      }])));
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Unable to load user administration."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function approve(id: string) {
    setBusy(id); setError(""); setNotice("");
    try { await authApi(`/registration-requests/${id}/approve`, { method: "POST" }); setNotice("The registration was approved with the employee's requested branch assignment."); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Approval failed."); }
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

  async function openActivity(employee: EmployeeRecord) {
    setActivityEmployee(employee); setActivity([]); setActivityLoading(true); setError("");
    try { setActivity(await workspaceApi<AuditRecord[]>(`/employees/${employee.user.id}/audit`)); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The employee activity could not be loaded."); }
    finally { setActivityLoading(false); }
  }

  async function exportActivity() {
    if (!activityEmployee) return;
    setBusy(`export-${activityEmployee.user.id}`); setError("");
    try {
      const response = await fetch(`${apiBase}/api/workspace/employees/${activityEmployee.user.id}/audit/export`, { headers: { Authorization: `Bearer ${getSessionAccessToken()}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "The activity export could not be created.");
      }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `employee-${activityEmployee.user.id}-activity.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The activity export could not be created."); }
    finally { setBusy(""); }
  }

  async function archiveSelectedEmployee() {
    if (!archiveEmployee) return;
    if (archiveReason.trim().length < 10) { setError("Explain the archive in at least 10 characters."); return; }
    setBusy(`archive-${archiveEmployee.user.id}`); setError(""); setNotice("");
    try {
      await workspaceApi(`/employees/${archiveEmployee.user.id}/archive`, { method: "POST", body: JSON.stringify({ reason: archiveReason.trim() }) });
      setNotice(`${archiveEmployee.user.fullName} was archived and can no longer sign in.`); setArchiveEmployee(null); setArchiveReason(""); await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The employee could not be archived."); }
    finally { setBusy(""); }
  }

  function openCreateForm() {
    const firstBranch = profile?.locations.find(location => location.status === "ACTIVE" && location.locationType === "BRANCH")?.id ?? "";
    setCreateForm(blankOfficerForm(firstBranch));
    setCreateOpen(true); setError(""); setNotice("");
  }

  function closeCreateForm() {
    setCreateOpen(false); setCreateForm(blankOfficerForm());
  }

  async function createOfficer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createForm.password !== createForm.confirmPassword) { setError("The password and confirmation do not match."); return; }
    if (createForm.responsibilities.length === 0) { setError("Select at least one responsibility."); return; }
    if (createForm.reason.trim().length < 10) { setError("Explain the account creation in at least 10 characters."); return; }
    setBusy("create-officer"); setError(""); setNotice("");
    try {
      await workspaceApi("/employees", {
        method: "POST",
        body: JSON.stringify({
          username: createForm.username,
          fullName: createForm.fullName,
          email: createForm.email,
          password: createForm.password,
          role: "CustomsOfficer",
          locationId: createForm.locationId,
          employeeNumber: createForm.employeeNumber,
          phone: createForm.phone,
          responsibilities: createForm.responsibilities.join(", "),
          reason: createForm.reason,
        }),
      });
      setNotice("Customs Officer created and assigned to the selected branch.");
      closeCreateForm();
      await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The Customs Officer could not be created."); }
    finally { setBusy(""); }
  }

  if (loading) return <DataState kind="loading" title="Loading user administration" description="Checking your role and employee assignments." />;
  if (!profile) return <DataState kind="error" title="Administration is unavailable" description={error} onRetry={() => void load()} />;
  const now = Date.now();
  const activeLocations = profile.locations.filter(location => location.status === "ACTIVE" && location.locationType === "BRANCH" && new Date(location.effectiveFrom).getTime() <= now && (!location.effectiveTo || new Date(location.effectiveTo).getTime() > now));
  const canCreateOfficer = profile.user.role === "CustomsAdministrator";
  const availableResponsibilities = profile.employeeResponsibilities?.length ? profile.employeeResponsibilities : responsibilityOptions;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleEmployees = normalizedSearch ? employees.filter(row => [row.user.fullName, row.user.email, row.user.employeeNumber, row.user.username, row.user.responsibilities].some(value => value?.toLowerCase().includes(normalizedSearch))) : employees;

  if (profile.user.role === "CustomsAdministrator") return <div className="management-page customs-admin-workspace">
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Employees and regional access</h1><p className="lead">Manage Customs Officers assigned within your region. Employee creation, assignment, status, and responsibility changes are recorded in the audit trail.</p></div><Link className="primary-link" href="/valuation-decisions"><FiActivity />Open valuation reviews</Link></div>
    <div className="role-banner"><span className="badge">{roleLabel(profile.user.role)}</span><strong>{profile.locations.length} assigned location{profile.locations.length === 1 ? "" : "s"}</strong><span>May manage Customs Officers assigned to your location.</span></div>
    {error && <DataState kind="error" compact title="Action could not be completed" description={error} onRetry={() => void load()} />}
    {notice && <p className="management-notice" role="status">{notice}</p>}

    <section className="admin-panel customs-admin-table-panel">
      <div className="panel-heading employee-panel-heading"><div><p className="eyebrow">Regional employee register</p><h2>Customs Officers</h2><p>{visibleEmployees.length} of {employees.length} employee{employees.length === 1 ? "" : "s"} visible in your assigned region.</p></div><div className="employee-panel-actions">{employees.length > 0 && <label className="employee-search"><FiSearch aria-hidden="true" /><span className="sr-only">Search employees</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email, staff ID" />{search && <button type="button" aria-label="Clear employee search" onClick={() => setSearch("")}><FiX /></button>}</label>}<button className="primary-button" type="button" onClick={openCreateForm}><FiPlus />Add employee</button></div></div>
      <div className="table-wrap"><table className="management-table customs-admin-employee-table"><thead><tr><th>Employee</th><th>Status</th><th>Assigned branch</th><th>Responsibilities</th><th>Change reason</th><th>Actions</th></tr></thead><tbody>
        {createOpen && <tr className="employee-create-row"><td colSpan={6}><div className="employee-table-form-heading"><div><p className="eyebrow">Add employee</p><h3>Create Customs Officer</h3><p>Complete the new employee row before saving the account and branch assignment.</p></div><button className="icon-button" type="button" aria-label="Close add employee row" onClick={closeCreateForm}><FiX /></button></div>{activeLocations.length === 0 ? <DataState kind="empty" compact title="No active branches available" description="An active branch in your region is required before an Officer can be created." /> : <form className="employee-table-form" onSubmit={createOfficer}>
          <div className="employee-table-form-grid"><label>Username<input required value={createForm.username} onChange={event => setCreateForm(current => ({ ...current, username: event.target.value }))} autoComplete="off" placeholder="e.g. abebe.kebede" /></label><label>Full name<input required value={createForm.fullName} onChange={event => setCreateForm(current => ({ ...current, fullName: event.target.value }))} placeholder="Officer full name" /></label><label>Work email<input required type="email" value={createForm.email} onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))} placeholder="officer@customs.gov" /></label><label>Employee / staff ID<input required value={createForm.employeeNumber} onChange={event => setCreateForm(current => ({ ...current, employeeNumber: event.target.value }))} placeholder="Official staff identifier" /></label><label>Phone number<input value={createForm.phone} onChange={event => setCreateForm(current => ({ ...current, phone: event.target.value }))} placeholder="Optional contact number" /></label><label>Assign to branch<select required value={createForm.locationId} onChange={event => setCreateForm(current => ({ ...current, locationId: event.target.value }))}><option value="">Select an active branch</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label><label>Password<input required type="password" minLength={8} value={createForm.password} onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))} autoComplete="new-password" placeholder="8+ characters" /></label><label>Confirm password<input required type="password" minLength={8} value={createForm.confirmPassword} onChange={event => setCreateForm(current => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" placeholder="Repeat password" /></label><div className="employee-table-responsibilities"><span className="field-label">Responsibilities</span><div className="responsibility-options">{availableResponsibilities.map(option => <label className="checkbox-field" key={option}><input type="checkbox" checked={createForm.responsibilities.includes(option)} onChange={() => setCreateForm(current => ({ ...current, responsibilities: current.responsibilities.includes(option) ? current.responsibilities.filter(item => item !== option) : [...current.responsibilities, option] }))} /><span>{option}</span></label>)}</div></div><label className="employee-table-form-wide">Reason for account creation<textarea required minLength={10} rows={3} value={createForm.reason} onChange={event => setCreateForm(current => ({ ...current, reason: event.target.value }))} placeholder="Explain the appointment, duty assignment, or approved staffing request." /></label></div><div className="form-actions"><button className="secondary-button" type="button" onClick={closeCreateForm}>Cancel</button><button className="primary-button" type="submit" disabled={busy === "create-officer"}>{busy === "create-officer" ? "Saving..." : "Save employee"}</button></div>
        </form>}</td></tr>}
        {employees.length === 0 ? <tr><td colSpan={6}><DataState kind="empty" compact title="No Customs Officers yet" description="Use Add employee to create the first Officer in an active branch." /></td></tr> : visibleEmployees.length === 0 ? <tr><td colSpan={6}><DataState kind="empty" compact title="No matching employees" description="Try a different name, email, staff ID, or responsibility." /></td></tr> : visibleEmployees.map(row => { const draft = drafts[row.user.id]; return <tr key={row.user.id}><td><strong>{row.user.fullName}</strong><small>{row.user.email}<br />{row.user.employeeNumber || "No staff ID"}</small></td><td><select aria-label={`Status for ${row.user.fullName}`} value={draft?.status ?? "ACTIVE"} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], status: event.target.value } }))}><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option><option>LOCKED</option></select>{row.user.archivedAt && <small>Archived {new Date(row.user.archivedAt).toLocaleDateString()}</small>}</td><td><select aria-label={`Branch for ${row.user.fullName}`} value={draft?.locationId ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], locationId: event.target.value } }))}><option value="">Select</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select><small>{row.locationId ? "1 assigned branch" : "No branch assigned"}</small></td><td><input aria-label={`Responsibilities for ${row.user.fullName}`} placeholder="Valuation, Inspection" value={draft?.responsibilities ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], responsibilities: event.target.value } }))} /></td><td><input aria-label={`Change reason for ${row.user.fullName}`} placeholder="Reason (10+ characters)" value={draft?.reason ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], reason: event.target.value } }))} /></td><td><div className="employee-row-actions"><button className="approve-button" type="button" disabled={busy === row.user.id || !draft?.locationId || (draft?.reason.length ?? 0) < 10} onClick={() => void updateEmployee(row.user.id)}>{busy === row.user.id ? "Saving..." : "Save"}</button><button className="secondary-button" type="button" onClick={() => void openActivity(row)}><FiActivity />Activity</button><button className="secondary-button danger-button" type="button" disabled={!row.user.active || busy === `archive-${row.user.id}`} onClick={() => { setArchiveEmployee(row); setArchiveReason(""); setError(""); }}><FiArchive />Archive</button></div></td></tr>; })}
      </tbody></table></div>
    </section>

    {activityEmployee && <section className="employee-activity-panel" aria-live="polite"><div className="panel-heading"><div><p className="eyebrow">Employee activity</p><h3>{activityEmployee.user.fullName}</h3><p>Authorized records from the employee's current regional assignment.</p></div><div className="employee-panel-actions"><button className="secondary-button" type="button" onClick={() => void exportActivity()} disabled={busy === `export-${activityEmployee.user.id}`}><FiDownload />{busy === `export-${activityEmployee.user.id}` ? "Preparing..." : "Export CSV"}</button><button className="icon-button" type="button" aria-label="Close employee activity" onClick={() => setActivityEmployee(null)}><FiX /></button></div></div>{activityLoading ? <DataState kind="loading" compact title="Loading activity" description="Retrieving authorized employee events." /> : activity.length === 0 ? <DataState kind="empty" compact title="No activity recorded" description="Audited actions for this employee will appear here." /> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Module</th><th>Location</th><th>Reason</th></tr></thead><tbody>{activity.map(record => <tr key={record.id}><td>{new Date(record.occurredAt).toLocaleString()}</td><td><span className="badge">{record.action.replaceAll("_", " ")}</span></td><td>{record.module}</td><td>{record.locationId ? record.locationId.slice(0, 8) : "Global"}</td><td>{record.justification || "-"}</td></tr>)}</tbody></table></div>}</section>}
    {archiveEmployee && <section className="employee-archive-panel"><div><p className="eyebrow">Archive employee</p><h3>{archiveEmployee.user.fullName}</h3><p>Archiving disables sign-in and preserves the account and audit history. It does not delete records.</p></div><label><span>Reason for archiving</span><textarea rows={3} minLength={10} value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="Explain the transfer, separation, or approved access change." /></label><div className="form-actions"><button className="secondary-button" type="button" onClick={() => { setArchiveEmployee(null); setArchiveReason(""); }}>Cancel</button><button className="secondary-button danger-button" type="button" disabled={busy === `archive-${archiveEmployee.user.id}`} onClick={() => void archiveSelectedEmployee()}><FiArchive />{busy === `archive-${archiveEmployee.user.id}` ? "Archiving..." : "Archive employee"}</button></div></section>}
  </div>;

  return <div className="management-page">
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>{profile.user.role === "SystemAdministrator" ? "User and access control" : "Employees and regional access"}</h1><p className="lead">{profile.user.role === "SystemAdministrator" ? "Review employee registration requests and manage approved employee accounts." : "Manage Customs Officers assigned within your region."}</p></div>
      {profile.user.role === "SystemAdministrator" && <Link className="primary-link" href="/administration/organization"><FiMapPin />Open organization</Link>}
    </div>
    <div className="role-banner"><span className="badge">{roleLabel(profile.user.role)}</span><strong>{profile.user.role === "SystemAdministrator" ? "Nationwide authority" : `${profile.locations.length} assigned location${profile.locations.length === 1 ? "" : "s"}`}</strong><span>{profile.permissions.includes("users.manage_all") ? "May manage administrators and officers." : "May manage Customs Officers assigned to your location."}</span></div>
    {error && <DataState kind="error" compact title="Action could not be completed" description={error} onRetry={() => void load()} />}
    {notice && <p className="management-notice" role="status">{notice}</p>}

    {profile.user.role === "SystemAdministrator" && <section className="admin-panel">
      <div className="panel-heading"><div><h2>Pending Customs Administrator requests</h2><p>Applicants submit their own credentials and requested branch. You can review the request, but passwords and usernames remain private.</p></div><button type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button></div>
      {requests.length === 0 ? <DataState kind="empty" compact title="No pending employee requests" description="New employee registration requests will appear here." /> : <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Department</th><th>Requested branch</th><th>Submitted</th><th>Review</th></tr></thead><tbody>{requests.map(request => { const requestedLocation = request.locationId ? profile.locations.find(location => location.id === request.locationId) : null; return <tr key={request.id}><td><strong>{request.fullName}</strong><small>{request.email}<br />{request.staffId}</small></td><td>{request.department || "-"}</td><td>{requestedLocation ? locationLabel(requestedLocation) : request.locationId ? request.locationId.slice(0, 8) : "Not selected"}</td><td>{new Date(request.submittedAt).toLocaleDateString()}</td><td><div className="request-review-actions"><button className="approve-button" type="button" disabled={busy === request.id} onClick={() => void approve(request.id)}>{busy === request.id ? "Approving..." : "Approve"}</button><input aria-label={`Denial reason for ${request.fullName}`} placeholder="Reason to deny (10+ characters)" value={reviewReasons[request.id] ?? ""} onChange={event => setReviewReasons(values => ({ ...values, [request.id]: event.target.value }))} /><button className="secondary-button danger-button" type="button" disabled={busy === `deny-${request.id}`} onClick={() => void deny(request.id)}>{busy === `deny-${request.id}` ? "Denying..." : "Deny"}</button></div></td></tr>; })}</tbody></table></div>}
    </section>}

    <section className="admin-panel">
      <div className="panel-heading employee-panel-heading"><div><h2>{profile.user.role === "SystemAdministrator" ? "Customs Administrator accounts" : "Managed Customs Officers"}</h2><p>{visibleEmployees.length} of {employees.length} account{employees.length === 1 ? "" : "s"} visible in your assigned location.</p></div><div className="employee-panel-actions">{employees.length > 0 && <label className="employee-search"><FiSearch aria-hidden="true" /><span className="sr-only">Search employees</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email, staff ID" />{search && <button type="button" aria-label="Clear employee search" onClick={() => setSearch("")}><FiX /></button>}</label>}{canCreateOfficer && <button className="primary-button" type="button" onClick={openCreateForm}><FiPlus />Create Customs Officer</button>}</div></div>
      {canCreateOfficer && createOpen && <div className="officer-create-form">
        <div className="officer-create-heading"><div><p className="eyebrow">New employee account</p><h3>Create Customs Officer</h3><p>Assign the officer to an active branch and record the reason for granting access.</p></div><button className="icon-button" type="button" aria-label="Close create officer form" onClick={closeCreateForm}><FiX /></button></div>
        {activeLocations.length === 0 ? <DataState kind="empty" compact title="No active branches available" description="An active branch in your region is required before an Officer can be created." /> : <form className="management-form" onSubmit={createOfficer}>
          <label>Username<input required value={createForm.username} onChange={event => setCreateForm(current => ({ ...current, username: event.target.value }))} autoComplete="off" placeholder="e.g. abebe.kebede" /></label>
          <label>Full name<input required value={createForm.fullName} onChange={event => setCreateForm(current => ({ ...current, fullName: event.target.value }))} placeholder="Officer full name" /></label>
          <label>Work email<input required type="email" value={createForm.email} onChange={event => setCreateForm(current => ({ ...current, email: event.target.value }))} placeholder="officer@customs.gov" /></label>
          <label>Employee / staff ID<input required value={createForm.employeeNumber} onChange={event => setCreateForm(current => ({ ...current, employeeNumber: event.target.value }))} placeholder="Official staff identifier" /></label>
          <label>Phone number<input value={createForm.phone} onChange={event => setCreateForm(current => ({ ...current, phone: event.target.value }))} placeholder="Optional contact number" /></label>
          <label>Assign to branch<select required value={createForm.locationId} onChange={event => setCreateForm(current => ({ ...current, locationId: event.target.value }))}><option value="">Select an active branch</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
          <label>Password<input required type="password" minLength={8} value={createForm.password} onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))} autoComplete="new-password" placeholder="8+ characters with upper, lower, number and symbol" /></label>
          <label>Confirm password<input required type="password" minLength={8} value={createForm.confirmPassword} onChange={event => setCreateForm(current => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" placeholder="Repeat the password" /></label>
          <div className="wide-field"><span className="field-label">Responsibilities</span><div className="responsibility-options">{availableResponsibilities.map(option => <label className="checkbox-field" key={option}><input type="checkbox" checked={createForm.responsibilities.includes(option)} onChange={() => setCreateForm(current => ({ ...current, responsibilities: current.responsibilities.includes(option) ? current.responsibilities.filter(item => item !== option) : [...current.responsibilities, option] }))} /><span>{option}</span></label>)}</div><small>Select every operational responsibility that applies to this Officer.</small></div>
          <label className="wide-field">Reason for account creation<textarea required minLength={10} rows={3} value={createForm.reason} onChange={event => setCreateForm(current => ({ ...current, reason: event.target.value }))} placeholder="Explain the appointment, duty assignment, or approved staffing request." /></label>
          <div className="form-actions"><button className="secondary-button" type="button" onClick={closeCreateForm}>Cancel</button><button className="primary-button" type="submit" disabled={busy === "create-officer"}>{busy === "create-officer" ? "Creating..." : "Create Officer"}</button></div>
        </form>}
      </div>}
      {activityEmployee && <section className="employee-activity-panel" aria-live="polite"><div className="panel-heading"><div><p className="eyebrow">Employee activity</p><h3>{activityEmployee.user.fullName}</h3><p>Authorized records from the employee’s current regional assignment.</p></div><div className="employee-panel-actions"><button className="secondary-button" type="button" onClick={() => void exportActivity()} disabled={busy === `export-${activityEmployee.user.id}`}><FiDownload />{busy === `export-${activityEmployee.user.id}` ? "Preparing…" : "Export CSV"}</button><button className="icon-button" type="button" aria-label="Close employee activity" onClick={() => setActivityEmployee(null)}><FiX /></button></div></div>{activityLoading ? <DataState kind="loading" compact title="Loading activity" description="Retrieving authorized employee events." /> : activity.length === 0 ? <DataState kind="empty" compact title="No activity recorded" description="Audited actions for this employee will appear here." /> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Module</th><th>Location</th><th>Reason</th></tr></thead><tbody>{activity.map(record => <tr key={record.id}><td>{new Date(record.occurredAt).toLocaleString()}</td><td><span className="badge">{record.action.replaceAll("_", " ")}</span></td><td>{record.module}</td><td>{record.locationId ? record.locationId.slice(0, 8) : "Global"}</td><td>{record.justification || "—"}</td></tr>)}</tbody></table></div>}</section>}
      {archiveEmployee && <section className="employee-archive-panel"><div><p className="eyebrow">Archive employee</p><h3>{archiveEmployee.user.fullName}</h3><p>Archiving disables sign-in and preserves the account and audit history. It does not delete records.</p></div><label><span>Reason for archiving</span><textarea rows={3} minLength={10} value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="Explain the transfer, separation, or approved access change." /></label><div className="form-actions"><button className="secondary-button" type="button" onClick={() => { setArchiveEmployee(null); setArchiveReason(""); }}>Cancel</button><button className="secondary-button danger-button" type="button" disabled={busy === `archive-${archiveEmployee.user.id}`} onClick={() => void archiveSelectedEmployee()}><FiArchive />{busy === `archive-${archiveEmployee.user.id}` ? "Archiving…" : "Archive employee"}</button></div></section>}
      {employees.length === 0 ? <DataState kind="empty" compact title={profile.user.role === "SystemAdministrator" ? "No Customs Administrator accounts" : "No manageable employees"} description={profile.user.role === "SystemAdministrator" ? "Approved Customs Administrator accounts will appear here." : "Customs Officers appear here after an approved location assignment."} /> : visibleEmployees.length === 0 ? <DataState kind="empty" compact title="No matching employees" description="Try a different name, email, staff ID, or responsibility." /> : <div className="table-wrap"><table className="management-table"><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>Primary location</th><th>Responsibilities / reason</th><th>Action</th></tr></thead><tbody>{visibleEmployees.map(row => {
        const draft = drafts[row.user.id];
        return <tr key={row.user.id}><td><strong>{row.user.fullName}</strong><small>{row.user.email}<br />{row.user.employeeNumber || "No staff ID"}</small></td><td>{roleLabel(row.user.role)}</td><td><select aria-label={`Status for ${row.user.fullName}`} value={draft?.status ?? "ACTIVE"} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], status: event.target.value } }))}><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option><option>LOCKED</option></select>{row.user.archivedAt && <small>Archived {new Date(row.user.archivedAt).toLocaleDateString()}</small>}</td><td><select aria-label={`Location for ${row.user.fullName}`} value={draft?.locationId ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], locationId: event.target.value } }))}><option value="">Select</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select><small>{row.locationId ? "1 assigned location" : "No location assigned"}</small></td><td><input aria-label={`Responsibilities for ${row.user.fullName}`} placeholder="Valuation, Inspection" value={draft?.responsibilities ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], responsibilities: event.target.value } }))} /><input aria-label={`Change reason for ${row.user.fullName}`} placeholder="Reason (10+ characters)" value={draft?.reason ?? ""} onChange={event => setDrafts(values => ({ ...values, [row.user.id]: { ...values[row.user.id], reason: event.target.value } }))} /></td><td><div className="employee-row-actions"><button className="approve-button" type="button" disabled={busy === row.user.id || !draft?.locationId || (draft?.reason.length ?? 0) < 10} onClick={() => void updateEmployee(row.user.id)}>{busy === row.user.id ? "Saving…" : "Save"}</button><button className="secondary-button" type="button" onClick={() => void openActivity(row)}><FiActivity />Activity</button><button className="secondary-button danger-button" type="button" disabled={!row.user.active || busy === `archive-${row.user.id}`} onClick={() => { setArchiveEmployee(row); setArchiveReason(""); setError(""); }}><FiArchive />Archive</button></div></td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}
