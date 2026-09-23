"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FiClock, FiEdit3, FiMapPin, FiPlus } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import LocationCoordinatesFieldset from "@/components/LocationCoordinatesFieldset";
import { coordinateValidationMessage, hasRecordedEthiopianCoordinates, parseCoordinate } from "@/lib/location-coordinates";
import { workspaceApi, type CustomsLocation, type LocationStatus, type WorkspaceProfile } from "@/lib/workspace";

type LocationHistory = { id: string; changedAt: string; changedBy: string; changeReason: string };
type RegionForm = {
  id?: string;
  officialCode: string;
  name: string;
  displayName: string;
  locationType: string;
  status: LocationStatus;
  latitude: string;
  longitude: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  version?: string;
};

const now = () => new Date().toISOString();
const blankRegion = (): RegionForm => ({
  officialCode: "",
  name: "",
  displayName: "",
  locationType: "REGION",
  status: "ACTIVE",
  latitude: "",
  longitude: "",
  effectiveFrom: now(),
  effectiveTo: null,
  reason: "",
});

export default function RegionsPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [form, setForm] = useState<RegionForm>(blankRegion);
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
        throw new Error("Only a System Administrator can maintain customs regions.");
      }
      setProfile(current);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Regions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allLocations = profile?.locations ?? [];
  const regions = allLocations.filter(loc => loc.locationType === "REGION");
  const branches = allLocations.filter(loc => loc.locationType === "BRANCH");

  function edit(region: CustomsLocation) {
    setForm({
      id: region.id,
      officialCode: region.officialCode,
      name: region.name,
      displayName: region.displayName,
      locationType: region.locationType,
      status: region.status,
      latitude: region.latitude?.toString() ?? "",
      longitude: region.longitude?.toString() ?? "",
      effectiveFrom: region.effectiveFrom,
      effectiveTo: region.effectiveTo,
      version: region.version,
      reason: "",
    });
    setNotice("");
    setHistory([]);
    setHistoryFor(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function showHistory(region: CustomsLocation) {
    setError("");
    setHistoryFor(region);
    try {
      setHistory(await workspaceApi<LocationHistory[]>(`/locations/${region.id}/history`));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Region change history could not be loaded.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

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
          locationType: form.locationType,
          parentLocationId: null,
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

      setForm(blankRegion());
      setNotice(form.id ? "Region updated. Previous version saved to history." : "New region created successfully.");
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "The region could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <DataState kind="loading" title="Loading regions" description="Retrieving registered customs regions." />;
  }

  if (!profile) {
    return <DataState kind="error" title="Regions unavailable" description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="management-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">System Administration · Level 1</p>
          <h1>Customs Regions</h1>
          <p className="lead">
            Manage top-level organizational regions. Branches are organized inside these regions.
          </p>
        </div>
        <span className="workspace-tag">
          <FiMapPin /> {regions.length} regions registered
        </span>
      </div>

      {error && <DataState kind="error" compact title="Action failed" description={error} onRetry={() => void load()} />}
      {notice && <p className="management-notice" role="status">{notice}</p>}

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <h2>{form.id ? `Edit ${form.name}` : "Create new region"}</h2>
            <p>Official codes are permanent once saved. You may add an optional audit note.</p>
          </div>
          {form.id && (
            <button type="button" onClick={() => setForm(blankRegion())}>
              <FiPlus /> New region
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
              placeholder="e.g. ET-REG-AA"
              disabled={Boolean(form.id)}
              value={form.officialCode}
              onChange={e => setForm(v => ({ ...v, officialCode: e.target.value.toUpperCase() }))}
            />
          </label>

          <label>
            <span>Region name</span>
            <input
              required
              maxLength={200}
              placeholder="e.g. Addis Ababa Region"
              value={form.name}
              onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
            />
          </label>

          <label>
            <span>Display name</span>
            <input
              placeholder="e.g. Central / Addis Ababa"
              value={form.displayName}
              onChange={e => setForm(v => ({ ...v, displayName: e.target.value }))}
            />
          </label>

          <label>
            <span>Status</span>
            <select
              value={form.status}
              onChange={e => setForm(v => ({ ...v, status: e.target.value as RegionForm["status"] }))}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
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
              placeholder="Optionally note why this region was created or updated..."
              value={form.reason}
              onChange={e => setForm(v => ({ ...v, reason: e.target.value }))}
            />
          </label>

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : form.id ? "Save region changes" : "Create region"}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <h2>Registered Regions</h2>
            <p>Official customs regions under national administration.</p>
          </div>
        </div>

        {regions.length === 0 ? (
          <DataState
            kind="empty"
            compact
            title="No regions yet"
            description="Create the first region using the form above. Once created, branches can be placed inside it."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Official code</th>
                  <th>Region name</th>
                  <th>Display name</th>
                  <th>Branches inside</th>
                  <th>Status</th>
                  <th>Map position</th>
                  <th>Effective from</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {regions.map(region => {
                  const branchCount = branches.filter(b => b.parentLocationId === region.id).length;
                  return (
                    <tr key={region.id}>
                      <td><strong>{region.officialCode}</strong></td>
                      <td>{region.name}</td>
                      <td>{region.displayName || "—"}</td>
                      <td>
                        <span className="workspace-tag">{branchCount} {branchCount === 1 ? "branch" : "branches"}</span>
                      </td>
                      <td>
                        <span className={region.status === "ACTIVE" ? "status-active" : "status-pending"}>
                          {region.status}
                        </span>
                      </td>
                      <td>
                        <span className={hasRecordedEthiopianCoordinates(region.latitude, region.longitude) ? "coordinate-status is-recorded" : "coordinate-status"}>
                          {hasRecordedEthiopianCoordinates(region.latitude, region.longitude) ? "Recorded" : "Needed"}
                        </span>
                      </td>
                      <td><small>{new Date(region.effectiveFrom).toLocaleDateString()}</small></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={() => edit(region)}>
                            <FiEdit3 /> Edit
                          </button>
                          <button type="button" onClick={() => void showHistory(region)}>
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
              <p>Audited change log for this region.</p>
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
