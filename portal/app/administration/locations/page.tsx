"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FiClock, FiEdit3, FiMapPin, FiPlus } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { locationLabel, workspaceApi, type CustomsLocation, type WorkspaceProfile } from "@/lib/workspace";

type LocationHistory = { id: string; changedAt: string; changedBy: string; changeReason: string };
type LocationForm = Omit<CustomsLocation, "id" | "version"> & { id?: string; version?: string; reason: string };
const now = () => new Date().toISOString();
const blankLocation = (): LocationForm => ({
  officialCode: "", name: "", displayName: "", locationType: "BRANCH_OFFICE", parentLocationId: null,
  region: "", zone: "", cityWoreda: "", borderCountry: "", status: "ACTIVE", effectiveFrom: now(), effectiveTo: null,
  isEntryPoint: false, isExitPoint: false, supportsImport: true, supportsExport: true, supportsTransit: false,
  supportsValuation: true, supportsInspection: false, latitude: null, longitude: null, source: "", sourceReference: "",
  lastVerifiedAt: null, reason: "",
});
const capabilityFields = [
  ["isEntryPoint", "Entry point"], ["isExitPoint", "Exit point"], ["supportsImport", "Imports"],
  ["supportsExport", "Exports"], ["supportsTransit", "Transit"], ["supportsValuation", "Valuation"],
  ["supportsInspection", "Inspection"],
] as const;

export default function LocationsPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [form, setForm] = useState<LocationForm>(blankLocation);
  const [history, setHistory] = useState<LocationHistory[]>([]);
  const [historyFor, setHistoryFor] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const current = await workspaceApi<WorkspaceProfile>("/me");
      if (current.user.role !== "SystemAdministrator") throw new Error("Only a System Administrator can maintain the official location hierarchy.");
      setProfile(current);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Locations could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function edit(location: CustomsLocation) {
    setForm({ ...location, reason: "" }); setNotice(""); setHistory([]); setHistoryFor("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function showHistory(location: CustomsLocation) {
    setError(""); setHistoryFor(location.id);
    try { setHistory(await workspaceApi<LocationHistory[]>(`/locations/${location.id}/history`)); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Location history could not be loaded."); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const { reason, ...location } = form;
      const path = form.id ? `/locations/${form.id}` : "/locations";
      await workspaceApi<CustomsLocation>(path, { method: form.id ? "PUT" : "POST", body: JSON.stringify({ location, reason }) });
      setForm(blankLocation()); setNotice(form.id ? "Location updated. The former values remain in history." : "Location created and added to the official hierarchy."); await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The location could not be saved."); }
    finally { setBusy(false); }
  }

  if (loading) return <DataState kind="loading" title="Loading location registry" description="Retrieving the official customs organization hierarchy." />;
  if (!profile) return <DataState kind="error" title="Location registry is unavailable" description={error} onRetry={() => void load()} />;
  return <div className="management-page">
    <div className="page-heading"><div><p className="eyebrow">System administration</p><h1>Customs locations</h1><p className="lead">Maintain official offices, operational capabilities, hierarchy, and effective status without deleting historical records.</p></div><span className="workspace-tag"><FiMapPin />{profile.locations.length} registered</span></div>
    {error && <DataState kind="error" compact title="Location action failed" description={error} onRetry={() => void load()} />}
    {notice && <p className="management-notice" role="status">{notice}</p>}
    <section className="admin-panel">
      <div className="panel-heading"><div><h2>{form.id ? `Edit ${form.name}` : "Add official location"}</h2><p>Official codes are permanent after creation. Every update requires a reason.</p></div>{form.id && <button type="button" onClick={() => setForm(blankLocation())}><FiPlus /> New location</button>}</div>
      <form className="management-form location-form" onSubmit={save}>
        <label><span>Official code</span><input required pattern="[A-Za-z0-9_-]+" maxLength={40} disabled={Boolean(form.id)} value={form.officialCode} onChange={event => setForm(value => ({ ...value, officialCode: event.target.value.toUpperCase() }))} /></label>
        <label><span>Name</span><input required value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} /></label>
        <label><span>Display name</span><input value={form.displayName} onChange={event => setForm(value => ({ ...value, displayName: event.target.value }))} /></label>
        <label><span>Location type</span><select value={form.locationType} onChange={event => setForm(value => ({ ...value, locationType: event.target.value }))}>{profile.locationTypes.map(type => <option key={type}>{type}</option>)}</select></label>
        <label><span>Parent location</span><select value={form.parentLocationId ?? ""} onChange={event => setForm(value => ({ ...value, parentLocationId: event.target.value || null }))}><option value="">Top-level location</option>{profile.locations.filter(location => location.id !== form.id).map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
        <label><span>Status</span><select value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as LocationForm["status"] }))}>{profile.locationStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <label><span>Region</span><input value={form.region} onChange={event => setForm(value => ({ ...value, region: event.target.value }))} /></label>
        <label><span>Zone</span><input value={form.zone} onChange={event => setForm(value => ({ ...value, zone: event.target.value }))} /></label>
        <label><span>City / woreda</span><input value={form.cityWoreda} onChange={event => setForm(value => ({ ...value, cityWoreda: event.target.value }))} /></label>
        <label><span>Border country</span><input value={form.borderCountry} onChange={event => setForm(value => ({ ...value, borderCountry: event.target.value }))} /></label>
        <label><span>Effective from</span><input type="datetime-local" value={form.effectiveFrom.slice(0, 16)} onChange={event => setForm(value => ({ ...value, effectiveFrom: new Date(event.target.value).toISOString() }))} /></label>
        <label><span>Effective to</span><input type="datetime-local" value={form.effectiveTo?.slice(0, 16) ?? ""} onChange={event => setForm(value => ({ ...value, effectiveTo: event.target.value ? new Date(event.target.value).toISOString() : null }))} /></label>
        <label><span>Data source</span><input value={form.source} onChange={event => setForm(value => ({ ...value, source: event.target.value }))} /></label>
        <label><span>Source reference</span><input value={form.sourceReference} onChange={event => setForm(value => ({ ...value, sourceReference: event.target.value }))} /></label>
        <label><span>Latitude</span><input type="number" min="-90" max="90" step="any" value={form.latitude ?? ""} onChange={event => setForm(value => ({ ...value, latitude: event.target.value ? Number(event.target.value) : null }))} /></label>
        <label><span>Longitude</span><input type="number" min="-180" max="180" step="any" value={form.longitude ?? ""} onChange={event => setForm(value => ({ ...value, longitude: event.target.value ? Number(event.target.value) : null }))} /></label>
        <label><span>Last verified</span><input type="datetime-local" value={form.lastVerifiedAt?.slice(0, 16) ?? ""} onChange={event => setForm(value => ({ ...value, lastVerifiedAt: event.target.value ? new Date(event.target.value).toISOString() : null }))} /></label>
        <fieldset className="capability-fields"><legend>Operational capabilities</legend>{capabilityFields.map(([key, label]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={event => setForm(value => ({ ...value, [key]: event.target.checked }))} /><span>{label}</span></label>)}</fieldset>
        <label className="wide-field"><span>Reason for creation or change</span><textarea required minLength={10} rows={3} value={form.reason} onChange={event => setForm(value => ({ ...value, reason: event.target.value }))} /></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : form.id ? "Save audited change" : "Create location"}</button></div>
      </form>
    </section>
    <section className="admin-panel">
      <div className="panel-heading"><div><h2>Official location hierarchy</h2><p>Inactive and archived records remain visible for historical decisions.</p></div></div>
      {profile.locations.length === 0 ? <DataState kind="empty" compact title="No customs locations yet" description="Create the head office or first operational location above." /> : <div className="table-wrap"><table><thead><tr><th>Code and name</th><th>Type</th><th>Parent</th><th>Capabilities</th><th>Status</th><th>Actions</th></tr></thead><tbody>{profile.locations.map(location => <tr key={location.id}><td><strong>{location.officialCode}</strong><small>{location.displayName || location.name}<br />{[location.region, location.cityWoreda].filter(Boolean).join(" · ")}</small></td><td>{location.locationType.replaceAll("_", " ")}</td><td>{profile.locations.find(parent => parent.id === location.parentLocationId)?.officialCode ?? "—"}</td><td><small>{[location.supportsValuation && "Valuation", location.supportsInspection && "Inspection", location.supportsImport && "Import", location.supportsExport && "Export", location.supportsTransit && "Transit"].filter(Boolean).join(", ") || "None"}</small></td><td><span className={location.status === "ACTIVE" ? "status-active" : "status-pending"}>{location.status.replaceAll("_", " ")}</span></td><td><div className="row-actions"><button type="button" onClick={() => edit(location)}><FiEdit3 /> Edit</button><button type="button" onClick={() => void showHistory(location)}><FiClock /> History</button></div></td></tr>)}</tbody></table></div>}
    </section>
    {historyFor && <section className="admin-panel"><div className="panel-heading"><div><h2>Change history</h2><p>{profile.locations.find(location => location.id === historyFor)?.displayName}</p></div></div>{history.length === 0 ? <DataState kind="empty" compact title="No history records" description="The first record appears after creation." /> : <div className="timeline-list">{history.map(entry => <article key={entry.id}><FiClock /><div><strong>{entry.changeReason}</strong><small>{new Date(entry.changedAt).toLocaleString()} · {entry.changedBy}</small></div></article>)}</div>}</section>}
  </div>;
}
