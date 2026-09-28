"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataState } from "@/components/DataState";
import OrganizationDetails from "@/components/OrganizationDetails";
import OrganizationHeader from "@/components/OrganizationHeader";
import OrganizationTree from "@/components/OrganizationTree";
import { hasRecordedEthiopianCoordinates } from "@/lib/location-coordinates";
import { isSystemAdmin, workspaceApi, type CustomsLocation, type WorkspaceProfile } from "@/lib/workspace";

const OrganizationMap = dynamic(() => import("@/components/OrganizationMap"), {
  ssr: false,
  loading: () => <div className="org-map-loading">Opening the Ethiopia location map…</div>,
});

export default function OrganizationPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await workspaceApi<WorkspaceProfile>("/me");
      if (!isSystemAdmin(current.user.role)) throw new Error("Only a System Administrator can view the organization.");
      setProfile(current);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed to load organization data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const locations: CustomsLocation[] = profile?.locations ?? [];
  const visibleLocations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return locations;
    const matches = locations.filter(location => [
      location.name,
      location.displayName,
      location.officialCode,
      location.region,
      location.zone,
      location.cityWoreda,
    ].some(value => value?.toLowerCase().includes(query)));
    const visibleIds = new Set(matches.map(location => location.id));
    matches.forEach(location => { if (location.parentLocationId) visibleIds.add(location.parentLocationId); });
    return locations.filter(location => visibleIds.has(location.id));
  }, [locations, search]);

  useEffect(() => {
    if (selectedId && visibleLocations.some(location => location.id === selectedId)) return;
    setSelectedId(visibleLocations[0]?.id ?? null);
  }, [selectedId, visibleLocations]);

  if (loading) return <DataState kind="loading" title="Loading organization" description="Fetching regions and branches…" />;
  if (error) return <DataState kind="error" title="Organization unavailable" description={error} onRetry={() => void load()} />;
  if (!profile) return <DataState kind="error" title="Organization unavailable" description="Organization data is missing." onRetry={() => void load()} />;

  const regions = locations.filter(location => location.locationType === "REGION");
  const branches = locations.filter(location => location.locationType === "BRANCH");
  const mappedCount = locations.filter(location => hasRecordedEthiopianCoordinates(location.latitude, location.longitude)).length;
  const selected = locations.find(location => location.id === selectedId);

  function manageLocation(id: string) {
    const location = locations.find(item => item.id === id);
    if (!location) return;
    router.push(`/administration/${location.locationType === "REGION" ? "regions" : "branches"}`);
  }

  return (
    <div className="org-page">
      <OrganizationHeader
        fullName={profile.user.fullName || profile.user.username || "System Administrator"}
        regionCount={regions.length}
        branchCount={branches.length}
        mappedCount={mappedCount}
        search={search}
        onSearch={setSearch}
      />
      <div className="org-page-body">
        <section className="org-tree-panel" aria-label="Organization hierarchy">
          <OrganizationTree locations={visibleLocations} selectedId={selectedId} onSelect={setSelectedId} />
        </section>
        <section className="org-map-panel" aria-label="Organization map">
          <OrganizationMap locations={visibleLocations} selectedId={selectedId} onSelect={setSelectedId} />
        </section>
        <section className="org-details-panel" aria-label="Location details">
          <OrganizationDetails locations={locations} selectedId={selected?.id ?? null} onEdit={manageLocation} onAddBranch={id => router.push(`/administration/branches?region=${encodeURIComponent(id)}`)} />
        </section>
      </div>
    </div>
  );
}
