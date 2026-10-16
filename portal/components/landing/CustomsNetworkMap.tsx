"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { ComponentType } from "react";
import { useEffect } from "react";
import { HEAD_OFFICE, type NetworkRegion } from "./network";

const ETHIOPIA_BOUNDS = [[3.35, 33.0], [14.95, 48.05]] as const;

const LeafletMap = MapContainer as unknown as ComponentType<any>;
const LeafletGeoJson = GeoJSON as unknown as ComponentType<any>;
const LeafletCircle = CircleMarker as unknown as ComponentType<any>;

/** Flies to the selected region, or back to the whole country. */
function Viewport({ focus }: { focus: readonly [number, number] | null }) {
  const map = useMap() as any;
  useEffect(() => {
    if (focus) map.flyTo(focus, 7, { duration: 0.8 });
    else map.fitBounds(ETHIOPIA_BOUNDS, { padding: [12, 12], animate: true });
  }, [map, focus]);
  return null;
}

/** Public map of the Customs network: the Addis Ababa head office and each region's branches (placed at the region centre). */
export default function CustomsNetworkMap({ regions, boundaries, selected, onSelect }: {
  regions: NetworkRegion[]; boundaries: unknown; selected: string | null; onSelect: (code: string | null) => void;
}) {
  const focus = regions.find(region => region.code === selected)?.center ?? null;
  return <LeafletMap bounds={ETHIOPIA_BOUNDS} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }} aria-label="Map of Ethiopian Customs offices">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {!!boundaries && <LeafletGeoJson data={boundaries} style={() => ({ color: "#1d5fa8", weight: 1, fillColor: "#1d5fa8", fillOpacity: 0.05 })} />}
    {regions.map(region => {
      const active = region.code === selected;
      return <LeafletCircle key={region.code} center={region.center} radius={Math.min(18, 7 + region.branches.length * 2)}
        pathOptions={{ color: "#ffffff", weight: 2, fillColor: active ? "#f5b80a" : "#1567c0", fillOpacity: 0.92 }}
        eventHandlers={{ click: () => onSelect(region.code) }}>
        <Tooltip direction="top" offset={[0, -6]}>{region.name} · {region.branches.length} {region.branches.length === 1 ? "branch" : "branches"}</Tooltip>
        <Popup><strong>{region.name}</strong><br />{region.branches.length ? region.branches.join(", ") : "Regional office"}</Popup>
      </LeafletCircle>;
    })}
    <LeafletCircle center={HEAD_OFFICE} radius={10} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#d6261d", fillOpacity: 1 }}>
      <Tooltip direction="right" offset={[8, 0]} permanent>Head office</Tooltip>
      <Popup><strong>Ethiopian Customs Commission</strong><br />Head office, Addis Ababa</Popup>
    </LeafletCircle>
    <Viewport focus={focus} />
  </LeafletMap>;
}
