"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

const headquarters: [number, number] = [9.018, 38.798];

export function HeadquartersMap() {
  return <div className="headquarters-map" aria-label="Map showing Ethiopian Customs Commission headquarters in Addis Ababa">
    <MapContainer center={headquarters} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CircleMarker center={headquarters} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#0564d9", fillOpacity: 1 }}><Popup><strong>Ethiopian Customs Commission</strong><br />Head Office, Addis Ababa, Ethiopia</Popup></CircleMarker>
    </MapContainer>
  </div>;
}
