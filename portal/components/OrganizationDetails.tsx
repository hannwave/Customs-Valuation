"use client";

import { useMemo } from "react";
import { FiEdit3, FiMapPin, FiPlus } from "react-icons/fi";
import { hasRecordedEthiopianCoordinates } from "@/lib/location-coordinates";
import { type CustomsLocation } from "@/lib/workspace";

interface Props {
  locations: CustomsLocation[];
  selectedId: string | null;
  onEdit: (id: string) => void;
  onAddBranch: (parentId: string) => void;
}

export default function OrganizationDetails({ locations, selectedId, onEdit, onAddBranch }: Props) {
  const selected = useMemo(() => locations.find(location => location.id === selectedId), [locations, selectedId]);

  if (!selected) {
    return <div className="org-details org-details-empty"><FiMapPin /><strong>Select a location</strong><p>Select a region or branch from the hierarchy or map to inspect its database-backed details.</p></div>;
  }

  const parent = selected.parentLocationId ? locations.find(location => location.id === selected.parentLocationId) : null;
  const fields = [
    ["Official code", selected.officialCode],
    ["Display name", selected.displayName || selected.name],
    ["Hierarchy", selected.locationType === "REGION" ? "Top-level region" : `Branch in ${parent?.name ?? "unassigned region"}`],
    ["Status", selected.status.replaceAll("_", " ")],
    ["Region", selected.region || "Not recorded"],
    ["Zone / city-woreda", [selected.zone, selected.cityWoreda].filter(Boolean).join(" · ") || "Not recorded"],
    ["Effective from", new Date(selected.effectiveFrom).toLocaleDateString()],
    ["Effective to", selected.effectiveTo ? new Date(selected.effectiveTo).toLocaleDateString() : "Open-ended"],
  ];
  const capabilities = [
    ["Import", selected.supportsImport],
    ["Export", selected.supportsExport],
    ["Transit", selected.supportsTransit],
    ["Valuation", selected.supportsValuation],
    ["Inspection", selected.supportsInspection],
  ] as const;
  const hasCoordinates = hasRecordedEthiopianCoordinates(selected.latitude, selected.longitude);

  return (
    <div className="org-details">
      <header className="org-details-header">
        <div><p className="org-eyebrow">Selected location</p><h2 className="org-details-title">{selected.name}</h2><span className="org-detail-code"><FiMapPin /> {selected.officialCode}</span></div>
        <div className="org-detail-actions">
          <button className="org-action-btn" type="button" onClick={() => onEdit(selected.id)} title={`Manage ${selected.locationType.toLowerCase()}`}><FiEdit3 /><span>Manage</span></button>
          {selected.locationType === "REGION" && <button className="org-action-btn org-action-btn--primary" type="button" onClick={() => onAddBranch(selected.id)} title="Create a branch in this region"><FiPlus /><span>Add branch</span></button>}
        </div>
      </header>
      <dl className="org-details-grid">
        {fields.map(([label, value]) => <div key={label} className="org-detail-item"><dt className="org-detail-label">{label}</dt><dd className="org-detail-value">{value}</dd></div>)}
      </dl>
      <section className="org-detail-section"><h3>Operational capabilities</h3><div className="org-capabilities">{capabilities.map(([label, enabled]) => <span key={label} className={enabled ? "is-enabled" : ""}><i aria-hidden="true" />{label}</span>)}</div></section>
      <section className="org-detail-section"><h3>Coordinates</h3><p className="org-coordinate-value">{hasCoordinates ? `${selected.latitude}, ${selected.longitude}` : "Not recorded — add latitude and longitude in the location form to set an exact map position."}</p><span className={hasCoordinates ? "org-coordinate-badge is-recorded" : "org-coordinate-badge"}>{hasCoordinates ? "Exact map position recorded" : "Approximate map position"}</span></section>
      <section className="org-detail-section org-detail-source"><h3>Data provenance</h3><p>{selected.source || "Not recorded"}{selected.sourceReference ? ` · ${selected.sourceReference}` : ""}</p></section>
    </div>
  );
}
