"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FiClock, FiEdit3, FiFilter, FiMapPin, FiPlus } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import LocationCoordinatesFieldset from "@/components/LocationCoordinatesFieldset";
import { coordinateValidationMessage, hasRecordedEthiopianCoordinates, parseCoordinate } from "@/lib/location-coordinates";
import { workspaceApi, type CustomsLocation, type LocationStatus, type WorkspaceProfile } from "@/lib/workspace";

type LocationHistory = { id: string; changedAt: string; changedBy: string; changeReason: string };
type BranchForm = {
  id?: string;
  officialCode: string;
  name: string;
  displayName: string;
  parentLocationId: string;
  status: LocationStatus;
  latitude: string;
  longitude: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  version?: string;
};

const now = () => new Date().toISOString();
const blankBranch = (defaultRegionId = ""): BranchForm => ({
  officialCode: "",
  name: "",
  displayName: "",
  parentLocationId: defaultRegionId,
  status: "ACTIVE",
  latitude: "",
  longitude: "",
  effectiveFrom: now(),
  effectiveTo: null,
  reason: "",
});

export default function BranchesPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [form, setForm] = useState<BranchForm>(() => blankBranch());
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>("ALL");
  const [history, setHistory] = useState<LocationHistory[]>([]);
  const [historyFor, setHistoryFor] = useState<CustomsLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await workspaceApi<WorkspaceProfile>("/me");
      if (current.user.role !== "SystemAdministrator") {
        throw new Error("Only a System Administrator can maintain customs branches.");
      }
      setProfile(current);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Branches could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allLocations = profile?.locations ?? [];
  const regions = useMemo(
    () => allLocations.filter(loc => loc.locationType === "REGION"),
    [allLocations]
  );
  const branches = useMemo(
    () => allLocations.filter(loc => loc.locationType === "BRANCH"),
    [allLocations]
  );

  // Default region selection if available and not yet set
  useEffect(() => {
    if (!form.parentLocationId && regions.length > 0 && !form.id) {
      setForm(prev => ({ ...prev, parentLocationId: regions[0].id }));
    }
  }, [regions, form.parentLocationId, form.id]);

  const filteredBranches = useMemo(() => {
    if (selectedRegionFilter === "ALL") return branches;
    return branches.filter(branch => branch.parentLocationId === selectedRegionFilter);
  }, [branches, selectedRegionFilter]);

  function edit(branch: CustomsLocation) {
    setForm({
      id: branch.id,
      officialCode: branch.officialCode,
      name: branch.name,
      displayName: branch.displayName,
      parentLocationId: branch.parentLocationId ?? "",
      status: branch.status,
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
      effectiveFrom: branch.effectiveFrom,
      effectiveTo: branch.effectiveTo,
      version: branch.version,
      reason: "",
    });
    setNotice("");
    setHistory([]);
    setHistoryFor(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function showHistory(branch: CustomsLocation) {
    setError("");
    setHistoryFor(branch);
    try {
      setHistory(await workspaceApi<LocationHistory[]>(`/locations/${branch.id}/history`));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Branch change history could not be loaded.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!form.parentLocationId) {
      setError("Please select a parent region for this branch.");
      return;
    }

    const coordinateError = coordinateValidationMessage(form.latitude, form.longitude, true);
    if (coordinateError) {
      setError(coordinateError);
      return;
    }

    setBusy(true);

    try {
      const payload = {
        location: {
          id: form.id,
          officialCode: form.officialCode.trim().toUpperCase(),
          name: form.name.trim(),
          displayName: form.displayName.trim() || form.name.trim(),
          locationType: "BRANCH",
          parentLocationId: form.parentLocationId,
          status: form.status,
          latitude: parseCoordinate(form.latitude),
          longitude: parseCoordinate(form.longitude),
          effectiveFrom: form.effectiveFrom,
          effectiveTo: form.effectiveTo || null,
          version: form.version,
        },
        reason: form.reason.trim(),
      };

      const path = form.id ? `/locations/${form.id}` : "/locations";
      await workspaceApi<CustomsLocation>(path, {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setForm(blankBranch(regions[0]?.id ?? ""));
      setNotice(form.id ? "Branch updated. Previous version saved to history." : "New branch created successfully inside the selected region.");
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "The branch could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <DataState kind="loading" title="Loading branches" description="Retrieving registered customs branches." />;
  }

  if (!profile) {
    return <DataState kind="error" title="Branches unavailable" description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="management-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">System Administration · Level 2</p>
          <h1>Customs Branches</h1>
          <p className="lead">
            Manage operational branches located inside regions. Each branch must belong to an official region.
          </p>
        </div>
        <span className="workspace-tag">
          <FiMapPin /> {branches.length} branches registered
        </span>
      </div>

      {error && <DataState kind="error" compact title="Action failed" description={error} onRetry={() => void load()} />}
      {notice && <p className="management-notice" role="status">{notice}</p>}

      {regions.length === 0 ? (
        <DataState
          kind="empty"
          title="No regions available"
          description="You must create at least one Region before you can create branches inside regions. Please go to Regions under System Administration."
        />
      ) : (
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <h2>{form.id ? `Edit ${form.name}` : "Create new branch"}</h2>
              <p>Official codes are permanent once saved. You may add an optional audit note.</p>
            </div>
            {form.id && (
              <button type="button" onClick={() => setForm(blankBranch(regions[0]?.id ?? ""))}>
                <FiPlus /> New branch
              </button>
            )}
          </div>

          <form className="management-form location-form" onSubmit={save}>
            <label>
              <span>Official code</span>
              <input
                required
                pattern="[A-Za-z0-9_-]+"
                maxLength={40}
                placeholder="e.g. ET-BR-KALITY"
                disabled={Boolean(form.id)}
                value={form.officialCode}
                onChange={e => setForm(v => ({ ...v, officialCode: e.target.value.toUpperCase() }))}
              />
            </label>

            <label>
              <span>Branch name</span>
              <input
                required
                maxLength={200}
                placeholder="e.g. Kality Customs Branch"
                value={form.name}
                onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
              />
            </label>

            <label>
              <span>Display name</span>
              <input
                placeholder="e.g. Kality Branch Office"
                value={form.displayName}
                onChange={e => setForm(v => ({ ...v, displayName: e.target.value }))}
              />
            </label>

            <label>
              <span>Region (Parent Level 1)</span>
              <select
                required
                value={form.parentLocationId}
                onChange={e => setForm(v => ({ ...v, parentLocationId: e.target.value }))}
              >
                <option value="" disabled>Select a region</option>
                {regions.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.officialCode})
                  </option>
                ))}
              </select>
            </label>

          <label>
            <span>Status</span>
            <select
                value={form.status}
                onChange={e => setForm(v => ({ ...v, status: e.target.value as BranchForm["status"] }))}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="TEMPORARILY_CLOSED">TEMPORARILY_CLOSED</option>
                <option value="PLANNED">PLANNED</option>
                <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>

          <LocationCoordinatesFieldset
            latitude={form.latitude}
            longitude={form.longitude}
            required
            onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))}
          />

          <label>
              <span>Effective from</span>
              <input
                type="datetime-local"
                value={form.effectiveFrom.slice(0, 16)}
                onChange={e => setForm(v => ({ ...v, effectiveFrom: new Date(e.target.value).toISOString() }))}
              />
            </label>

            <label>
              <span>Effective to (optional)</span>
              <input
                type="datetime-local"
                value={form.effectiveTo?.slice(0, 16) ?? ""}
                onChange={e => setForm(v => ({ ...v, effectiveTo: e.target.value ? new Date(e.target.value).toISOString() : null }))}
              />
            </label>

            <label className="wide-field">
              <span>Audit note (optional)</span>
              <textarea
                rows={2}
                placeholder="Optionally note why this branch was created or updated..."
                value={form.reason}
                onChange={e => setForm(v => ({ ...v, reason: e.target.value }))}
              />
            </label>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Saving…" : form.id ? "Save branch changes" : "Create branch"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <h2>Registered Branches</h2>
            <p>Operational customs branches organized inside regions.</p>
          </div>
          {regions.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiFilter />
              <select
                aria-label="Filter by region"
                value={selectedRegionFilter}
                onChange={e => setSelectedRegionFilter(e.target.value)}
                style={{ padding: "0.4rem 0.75rem", borderRadius: "0.375rem", border: "1px solid var(--border)" }}
              >
                <option value="ALL">All regions ({branches.length})</option>
                {regions.map(r => {
                  const count = branches.filter(b => b.parentLocationId === r.id).length;
                  return (
                    <option key={r.id} value={r.id}>
                      {r.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        {filteredBranches.length === 0 ? (
          <DataState
            kind="empty"
            compact
            title="No branches found"
            description={
              selectedRegionFilter === "ALL"
                ? "Create the first branch using the form above."
                : "No branches registered in the selected region yet."
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Official code</th>
                  <th>Branch name</th>
                  <th>Display name</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Map position</th>
                  <th>Effective from</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBranches.map(branch => {
                  const parentRegion = regions.find(r => r.id === branch.parentLocationId);
                  return (
                    <tr key={branch.id}>
                      <td><strong>{branch.officialCode}</strong></td>
                      <td>{branch.name}</td>
                      <td>{branch.displayName || "—"}</td>
                      <td>
                        <span className="workspace-tag">
                          {parentRegion ? parentRegion.name : "Unassigned"}
                        </span>
                      </td>
                      <td>
                        <span className={branch.status === "ACTIVE" ? "status-active" : "status-pending"}>
                          {branch.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span className={hasRecordedEthiopianCoordinates(branch.latitude, branch.longitude) ? "coordinate-status is-recorded" : "coordinate-status"}>
                          {hasRecordedEthiopianCoordinates(branch.latitude, branch.longitude) ? "Recorded" : "Needed"}
                        </span>
                      </td>
                      <td><small>{new Date(branch.effectiveFrom).toLocaleDateString()}</small></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={() => edit(branch)}>
                            <FiEdit3 /> Edit
                          </button>
                          <button type="button" onClick={() => void showHistory(branch)}>
                            <FiClock /> History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {historyFor && (
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <h2>Change history: {historyFor.name} ({historyFor.officialCode})</h2>
              <p>Audited change log for this branch.</p>
            </div>
            <button type="button" onClick={() => setHistoryFor(null)}>Close history</button>
          </div>
          {history.length === 0 ? (
            <DataState kind="empty" compact title="No history records found" description="No change records logged yet." />
          ) : (
            <div className="timeline-list">
              {history.map(entry => (
                <article key={entry.id}>
                  <FiClock />
                  <div>
                    <strong>{entry.changeReason}</strong>
                    <small>{new Date(entry.changedAt).toLocaleString()} · {entry.changedBy}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
