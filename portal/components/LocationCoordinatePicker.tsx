"use client";

import { CircleMarker, GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { ETHIOPIA_COORDINATE_BOUNDS } from "@/lib/location-coordinates";

interface Props {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
}

const ETHIOPIA_BOUNDS = [
  [ETHIOPIA_COORDINATE_BOUNDS.minLatitude, ETHIOPIA_COORDINATE_BOUNDS.minLongitude],
  [ETHIOPIA_COORDINATE_BOUNDS.maxLatitude, ETHIOPIA_COORDINATE_BOUNDS.maxLongitude],
] as const;
const ETHIOPIA_MAX_BOUNDS = [[2.25, 31.75], [16.05, 49.25]] as const;

const LeafletMap = MapContainer as unknown as ComponentType<any>;
const LeafletTileLayer = TileLayer as unknown as ComponentType<any>;
const LeafletGeoJson = GeoJSON as unknown as ComponentType<any>;
const LeafletCircleMarker = CircleMarker as unknown as ComponentType<any>;

function PickerViewport({ latitude, longitude }: Pick<Props, "latitude" | "longitude">) {
  const map = useMap() as any;
  const previousPoint = useRef<string | null>(null);

  useEffect(() => {
    const point = latitude !== null && longitude !== null ? `${latitude},${longitude}` : null;
    if (point === previousPoint.current) return;
    previousPoint.current = point;
    if (latitude !== null && longitude !== null) {
      map.setView([latitude, longitude], 8, { animate: true });
      return;
    }
    map.fitBounds(ETHIOPIA_BOUNDS, { padding: [12, 12], animate: false });
  }, [latitude, longitude, map]);

  return null;
}

function MapClickHandler({ onPick }: Pick<Props, "onPick">) {
  useMapEvents({
    click(event: any) {
      const latitude = event.latlng.lat as number;
      const longitude = event.latlng.lng as number;
      if (
        latitude >= ETHIOPIA_COORDINATE_BOUNDS.minLatitude
        && latitude <= ETHIOPIA_COORDINATE_BOUNDS.maxLatitude
        && longitude >= ETHIOPIA_COORDINATE_BOUNDS.minLongitude
        && longitude <= ETHIOPIA_COORDINATE_BOUNDS.maxLongitude
      ) {
        onPick(latitude, longitude);
      }
    },
  });
  return null;
}

export default function LocationCoordinatePicker({ latitude, longitude, onPick }: Props) {
  const [boundaries, setBoundaries] = useState<any>(null);

  useEffect(() => {
    let active = true;
    void fetch("/maps/ethiopia-adm1.geojson")
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active && data?.type === "FeatureCollection") setBoundaries(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <div className="coordinate-picker">
      <div className="coordinate-picker-heading"><strong>Choose on map</strong><span>Click an exact Ethiopia location</span></div>
      <LeafletMap
        center={[9.145, 40.4897]}
        zoom={6}
        minZoom={5}
        maxZoom={15}
        maxBounds={ETHIOPIA_MAX_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom={false}
        zoomControl
        style={{ height: "220px", width: "100%" }}
      >
        <LeafletTileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {boundaries && <LeafletGeoJson data={boundaries} style={{ color: "#9dcfc3", fillColor: "#dff2ea", fillOpacity: 0.45, weight: 1 }} />}
        <PickerViewport latitude={latitude} longitude={longitude} />
        <MapClickHandler onPick={onPick} />
        {latitude !== null && longitude !== null && <LeafletCircleMarker center={[latitude, longitude]} radius={8} pathOptions={{ color: "#087f71", fillColor: "#16a085", fillOpacity: 0.94, weight: 3 }} />}
      </LeafletMap>
      <small>Tip: zoom with the map controls after clicking the map, then click again to refine the point.</small>
    </div>
  );
}
