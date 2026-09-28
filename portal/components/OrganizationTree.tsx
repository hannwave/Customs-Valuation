"use client";

import { useState } from "react";
import { FiChevronDown, FiChevronRight, FiFolder, FiMapPin } from "react-icons/fi";

interface CustomsLocation { id: string; name: string; displayName?: string; officialCode: string; locationType: string; parentLocationId: string | null; status: string }
interface Props { locations: CustomsLocation[]; selectedId: string | null; onSelect: (id: string) => void }

export default function OrganizationTree({ locations, selectedId, onSelect }: Props) {
  const regions = locations.filter(location => location.locationType === "REGION");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(regions.map(region => region.id)));

  function toggle(id: string) {
    setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function statusClass(status: string) {
    return status === "ACTIVE" ? "org-status-active" : status === "TEMPORARILY_CLOSED" ? "org-status-maintenance" : "org-status-offline";
  }

  function renderBranch(branch: CustomsLocation) {
    const selected = selectedId === branch.id;
    return <li key={branch.id}><button type="button" className={`org-tree-node ${selected ? "org-tree-selected" : ""}`} onClick={() => onSelect(branch.id)}><FiMapPin className="org-icon-branch" /><span className="org-node-copy"><strong>{branch.name}</strong><small>{branch.officialCode}</small></span><i className={`org-status-dot ${statusClass(branch.status)}`} title={branch.status} /></button></li>;
  }

  return <div className="org-tree-container"><div className="org-tree-heading"><div><p className="org-eyebrow">Hierarchy</p><h2>Regions and branches</h2></div><span>{locations.length} locations</span></div>{regions.length === 0 ? <div className="org-tree-empty">No regions match your search.</div> : <ul className="org-tree-list">{regions.map(region => { const children = locations.filter(location => location.parentLocationId === region.id && location.locationType === "BRANCH"); const selected = selectedId === region.id; return <li key={region.id}><div className={`org-tree-node ${selected ? "org-tree-selected" : ""}`}><button type="button" className="org-toggle-btn" onClick={() => toggle(region.id)} aria-label={`${expanded.has(region.id) ? "Collapse" : "Expand"} ${region.name}`}>{expanded.has(region.id) ? <FiChevronDown /> : <FiChevronRight />}</button><button type="button" className="org-tree-select" onClick={() => onSelect(region.id)}><FiFolder className="org-icon-region" /><span className="org-node-copy"><strong>{region.name}</strong><small>{region.officialCode} · {children.length} {children.length === 1 ? "branch" : "branches"}</small></span><i className={`org-status-dot ${statusClass(region.status)}`} title={region.status} /></button></div>{expanded.has(region.id) && children.length > 0 && <ul className="org-tree-list org-tree-nested">{children.map(renderBranch)}</ul>}</li>; })}</ul>}</div>;
}
