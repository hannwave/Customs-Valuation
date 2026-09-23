"use client";

import dynamic from "next/dynamic";
import {
  ETHIOPIA_COORDINATE_BOUNDS,
  coordinateValidationMessage,
  parseCoordinate,
} from "@/lib/location-coordinates";

const LocationCoordinatePicker = dynamic(() => import("@/components/LocationCoordinatePicker"), {
  ssr: false,
  loading: () => <div className="coordinate-picker-loading">Loading Ethiopia map picker…</div>,
});

interface Props {
  latitude: string;
  longitude: string;
  required: boolean;
  onChange: (field: "latitude" | "longitude", value: string) => void;
}

export default function LocationCoordinatesFieldset({ latitude, longitude, required, onChange }: Props) {
  const validationMessage = coordinateValidationMessage(latitude, longitude, required);
  const isReady = !validationMessage && parseCoordinate(latitude) !== null && parseCoordinate(longitude) !== null;

  return (
    <fieldset className="coordinate-fields wide-field">
      <legend>Map coordinates {required && <span>Required</span>}</legend>
      <p>Use decimal degrees for the location’s physical point. These coordinates place the region or branch precisely on the Ethiopia organization map.</p>
      <div className="coordinate-input-grid">
        <label>
          <span>Latitude</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.000001"
            min={ETHIOPIA_COORDINATE_BOUNDS.minLatitude}
            max={ETHIOPIA_COORDINATE_BOUNDS.maxLatitude}
            required={required}
            placeholder="e.g. 9.0300"
            value={latitude}
            onChange={event => onChange("latitude", event.target.value)}
          />
        </label>
        <label>
          <span>Longitude</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.000001"
            min={ETHIOPIA_COORDINATE_BOUNDS.minLongitude}
            max={ETHIOPIA_COORDINATE_BOUNDS.maxLongitude}
            required={required}
            placeholder="e.g. 38.7400"
            value={longitude}
            onChange={event => onChange("longitude", event.target.value)}
          />
        </label>
      </div>
      <small className={isReady ? "coordinate-feedback is-ready" : validationMessage ? "coordinate-feedback is-warning" : "coordinate-feedback"}>
        {isReady
          ? "Ready for the Ethiopia organization map."
          : validationMessage ?? "Coordinates are optional for existing records, but needed for an exact map position."}
      </small>
      <LocationCoordinatePicker
        latitude={parseCoordinate(latitude)}
        longitude={parseCoordinate(longitude)}
        onPick={(nextLatitude, nextLongitude) => {
          onChange("latitude", nextLatitude.toFixed(6));
          onChange("longitude", nextLongitude.toFixed(6));
        }}
      />
    </fieldset>
  );
}
