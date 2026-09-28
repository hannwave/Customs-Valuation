"use client";

import { GeoJSON, MapContainer, Marker, Popup, useMap } from "react-leaflet";
// Leaflet is installed as a runtime dependency in this workspace without its optional typings.
// @ts-expect-error Leaflet runtime import has no local declaration file.
import { divIcon } from "leaflet";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";

interface CustomsLocation {
  id: string;
  name: string;
  officialCode: string;
  latitude: number | null;
  longitude: number | null;
  locationType: string;
  status: string;
  parentLocationId: string | null;
}

interface MapLocation extends CustomsLocation {
  mapLatitude: number;
  mapLongitude: number;
  approximate: boolean;
}

type MapLayer = "all" | "regions" | "branches";

interface Props {
  locations: CustomsLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Keep the operational map focused on Ethiopia even when an older or invalid
// coordinate exists in the database. The small padding leaves the country
// visible while preventing the map from drifting into neighbouring countries.
const ETHIOPIA_BOUNDS = [[3.35, 33.0], [14.95, 48.05]] as const;
const ETHIOPIA_MAX_BOUNDS = [[2.25, 31.75], [16.05, 49.25]] as const;

// These are representative regional centers used only until a location has
// verified coordinates. A saved latitude/longitude always takes precedence.
const ETHIOPIAN_REGION_CENTERS: Record<string, readonly [number, number]> = {
  AFAR: [11.75, 40.75],
  AMHARA: [11.5, 38.5],
  BENISHANGUL_GUMUZ: [10.75, 35.8],
  CENTRAL_ETHIOPIA: [8.2, 38.3],
  GAMBELA: [8.25, 34.6],
  HARARI: [9.31, 42.13],
  OROMIA: [7.55, 39.0],
  SIDAMA: [6.7, 38.4],
  SOMALI: [6.5, 44.5],
  SOUTH_ETHIOPIA: [6.0, 37.5],
  SOUTH_WEST_ETHIOPIA_PEOPLES: [7.0, 35.6],
  TIGRAY: [14.1, 38.5],
  ADDIS_ABABA: [9.03, 38.74],
  DIRE_DAWA: [9.6, 41.85],
};

// The boundary file is used only as a visual geographic reference. Location
// records and their Region/Branch hierarchy remain the authoritative data.
const BOUNDARY_REGION_CODES: Record<string, string> = {
  "Addis Ababa": "ADDIS_ABABA",
  Afar: "AFAR",
  Amhara: "AMHARA",
  "Beneshangul Gumu": "BENISHANGUL_GUMUZ",
  "Dire Dawa": "DIRE_DAWA",
  Gambela: "GAMBELA",
  Hareri: "HARARI",
  Oromia: "OROMIA",
  Somali: "SOMALI",
  Tigray: "TIGRAY",
};

function isEthiopianCoordinate(latitude: number | null, longitude: number | null) {
  return latitude != null
    && longitude != null
    && latitude >= ETHIOPIA_BOUNDS[0][0]
    && latitude <= ETHIOPIA_BOUNDS[1][0]
    && longitude >= ETHIOPIA_BOUNDS[0][1]
    && longitude <= ETHIOPIA_BOUNDS[1][1];
}

function locationKey(location: CustomsLocation) {
  const code = location.officialCode.toUpperCase().replace(/[^A-Z]+/g, "_").replace(/^_|_$/g, "");
  if (ETHIOPIAN_REGION_CENTERS[code]) return code;
  return location.name.toUpperCase().replace(/[^A-Z]+/g, "_").replace(/^_|_$/g, "");
}

function fallbackCoordinates(location: CustomsLocation, locations: CustomsLocation[]) {
  const region = location.locationType === "REGION"
    ? location
    : locations.find(candidate => candidate.id === location.parentLocationId && candidate.locationType === "REGION");
  if (!region) return null;

  const center = ETHIOPIAN_REGION_CENTERS[locationKey(region)];
  if (!center) return null;
  if (location.locationType === "REGION") return center;

  const siblings = locations
    .filter(candidate => candidate.parentLocationId === location.parentLocationId && candidate.locationType === "BRANCH")
    .sort((first, second) => first.name.localeCompare(second.name));
  const siblingIndex = Math.max(0, siblings.findIndex(candidate => candidate.id === location.id));
  const angle = siblingIndex * (Math.PI / 4);
  const radius = 0.1 + Math.min(siblingIndex, 4) * 0.025;
  return [center[0] + Math.sin(angle) * radius, center[1] + Math.cos(angle) * radius] as [number, number];
}

function toMapLocations(locations: CustomsLocation[]): MapLocation[] {
  return locations.flatMap(location => {
    const hasSavedCoordinates = isEthiopianCoordinate(location.latitude, location.longitude);
    const coordinates = hasSavedCoordinates
      ? [location.latitude!, location.longitude!] as [number, number]
      : fallbackCoordinates(location, locations);
    if (!coordinates) return [];
    return [{ ...location, mapLatitude: coordinates[0], mapLongitude: coordinates[1], approximate: !hasSavedCoordinates }];
  });
}

// The map is loaded client-side by the route. These casts keep the map usable
// when a workspace has Leaflet runtime packages but not its optional typings.
const LeafletMap = MapContainer as unknown as ComponentType<any>;
const LeafletMarker = Marker as unknown as ComponentType<any>;
const LeafletPopup = Popup as unknown as ComponentType<any>;
const LeafletGeoJson = GeoJSON as unknown as ComponentType<any>;

function MapViewport({ selected, revision }: { selected?: MapLocation; revision: number }) {
  const map = useMap() as any;
  const previousRevision = useRef(revision);
  useEffect(() => {
    if (revision !== previousRevision.current) {
      previousRevision.current = revision;
      map.fitBounds(ETHIOPIA_BOUNDS, { padding: [18, 18], animate: true });
      return;
    }
    if (selected) {
      map.setView([selected.mapLatitude, selected.mapLongitude], selected.approximate ? 6 : 7, { animate: true });
      return;
    }
    map.fitBounds(ETHIOPIA_BOUNDS, { padding: [18, 18], animate: false });
  }, [map, revision, selected]);
  return null;
}

export default function OrganizationMap({ locations, selectedId, onSelect }: Props) {
  const [boundaries, setBoundaries] = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayer>("all");
  const [viewportRevision, setViewportRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch("/maps/ethiopia-adm1.geojson")
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active && data?.type === "FeatureCollection") setBoundaries(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const mappedLocations = toMapLocations(locations);
  const visibleMapLocations = activeLayer === "all"
    ? mappedLocations
    : mappedLocations.filter(location => activeLayer === "regions" ? location.locationType === "REGION" : location.locationType === "BRANCH");
  const selected = visibleMapLocations.find(location => location.id === selectedId);
  const selectedLocation = locations.find(location => location.id === selectedId);
  const selectedRegionId = selectedLocation?.locationType === "REGION" ? selectedLocation.id : selectedLocation?.parentLocationId;
  const regionsByCode = new Map(locations.filter(location => location.locationType === "REGION").map(location => [location.officialCode, location]));
  const regionCount = mappedLocations.filter(location => location.locationType === "REGION").length;
  const branchCount = mappedLocations.filter(location => location.locationType === "BRANCH").length;
  const approximateCount = visibleMapLocations.filter(location => location.approximate).length;

  function regionForBoundary(feature: any) {
    const shapeName = String(feature?.properties?.shapeName ?? "");
    return regionsByCode.get(BOUNDARY_REGION_CODES[shapeName]);
  }

  function boundaryStyle(feature: any) {
    const region = regionForBoundary(feature);
    const isSelected = region?.id === selectedRegionId;
    return {
      color: isSelected ? "#087f71" : "#9dcfc3",
      fillColor: isSelected ? "#a9dfd1" : "#dff2ea",
      fillOpacity: isSelected ? 0.76 : 0.52,
      weight: isSelected ? 2.5 : 1.1,
    };
  }

  function bindBoundaryInteraction(feature: any, layer: any) {
    const region = regionForBoundary(feature);
    if (!region) return;
    layer.bindTooltip(region.name, { direction: "center", className: "org-map-boundary-tooltip", sticky: true });
    layer.on({ click: () => onSelect(region.id) });
  }

  function focusEthiopia() {
    setActiveLayer("all");
    setViewportRevision(current => current + 1);
  }

  return (
    <div className="org-map-container">
      <LeafletMap
        center={[9.145, 40.4897]}
        zoom={6}
        minZoom={5}
        maxZoom={12}
        maxBounds={ETHIOPIA_MAX_BOUNDS}
        maxBoundsViscosity={1}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        {boundaries && <LeafletGeoJson key={selectedRegionId ?? "ethiopia"} data={boundaries} style={boundaryStyle} onEachFeature={bindBoundaryInteraction} />}
        <MapViewport selected={selected} revision={viewportRevision} />
        {visibleMapLocations.map(location => (
          <LeafletMarker
            key={location.id}
            position={[location.mapLatitude, location.mapLongitude]}
            icon={divIcon({
              className: `org-map-ping-marker ${location.locationType === "REGION" ? "org-map-ping-marker--region" : "org-map-ping-marker--branch"} ${selectedId === location.id ? "is-selected" : ""}`,
              html: '<span class="org-map-ping-core" aria-hidden="true"></span>',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
              popupAnchor: [0, -16],
            })}
            eventHandlers={{ click: () => onSelect(location.id) }}
          >
            <LeafletPopup><strong>{location.name}</strong><br />{location.locationType} · {location.status}{location.approximate && <><br /><small>Approximate regional position</small></>}</LeafletPopup>
          </LeafletMarker>
        ))}
      </LeafletMap>
      <div className="org-map-title-overlay">
        <span>LOCATION COVERAGE</span>
        <strong>Ethiopia customs network</strong>
        <small>Explore regions, branches, and assigned coverage</small>
      </div>
      <div className="org-map-country-label" aria-hidden="true">Ethiopia</div>
      <div className="org-map-layer-toggle" role="group" aria-label="Map locations to display">
        <button type="button" className={activeLayer === "all" ? "is-active" : ""} onClick={() => setActiveLayer("all")}>All <span>{regionCount + branchCount}</span></button>
        <button type="button" className={activeLayer === "regions" ? "is-active" : ""} onClick={() => setActiveLayer("regions")}>Regions <span>{regionCount}</span></button>
        <button type="button" className={activeLayer === "branches" ? "is-active" : ""} onClick={() => setActiveLayer("branches")}>Branches <span>{branchCount}</span></button>
        <button type="button" className="org-map-focus-btn" onClick={focusEthiopia}>Focus Ethiopia</button>
      </div>
      <div className="org-map-legend" aria-label="Map legend">
        <strong>Location key</strong>
        <span><i className="org-map-legend-dot org-map-legend-dot--region" />Region <em>{regionCount}</em></span>
        <span><i className="org-map-legend-dot org-map-legend-dot--branch" />Branch <em>{branchCount}</em></span>
      </div>
      {selected && <div className="org-map-selection-card"><span>{selected.locationType === "REGION" ? "Region selected" : "Branch selected"}</span><strong>{selected.name}</strong><small>{selected.approximate ? "Approximate regional position" : "Recorded location coordinates"}</small></div>}
      {approximateCount > 0 && <div className="org-map-approximate-note">{approximateCount} approximate {approximateCount === 1 ? "position" : "positions"} shown until coordinates are recorded</div>}
      <a className="org-map-boundary-credit" href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">Boundary reference: geoBoundaries · CC BY 4.0</a>
      {visibleMapLocations.length === 0 && <div className="org-map-empty"><span className="org-map-empty-icon" aria-hidden="true">⌖</span><strong>No map position available</strong><span>This location is not linked to a recognized Ethiopian region yet.</span></div>}
    </div>
  );
}
