"use client";

import { FiSearch } from "react-icons/fi";

interface Props {
  fullName: string;
  regionCount: number;
  branchCount: number;
  mappedCount: number;
  search: string;
  onSearch: (value: string) => void;
}

export default function OrganizationHeader({ fullName, regionCount, branchCount, mappedCount, search, onSearch }: Props) {
  return (
    <header className="org-header">
      <div className="org-header-left">
        <p className="org-eyebrow">System Administration · Organization</p>
        <h1 className="org-title">Customs organization</h1>
        <p className="org-subtitle">Review the official two-level hierarchy, location status, and operational capabilities.</p>
      </div>
      <div className="org-header-right">
        <div className="org-stat"><strong>{regionCount}</strong><span>Regions</span></div>
        <div className="org-stat"><strong>{branchCount}</strong><span>Branches</span></div>
        <div className="org-stat org-stat--map"><strong>{mappedCount}</strong><span>Map positions</span></div>
        <label className="org-search">
          <span className="sr-only">Search regions and branches</span>
          <input type="text" placeholder="Search regions or branches" className="org-search-input" value={search} onChange={event => onSearch(event.target.value)} />
          <FiSearch className="org-search-icon" />
        </label>
        <div className="org-user-info"><span className="org-user-avatar">{fullName.slice(0, 1).toUpperCase()}</span><span className="org-username">{fullName}</span></div>
      </div>
    </header>
  );
}
