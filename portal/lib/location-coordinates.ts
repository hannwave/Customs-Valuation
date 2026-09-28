export const ETHIOPIA_COORDINATE_BOUNDS = {
  minLatitude: 3.35,
  maxLatitude: 14.95,
  minLongitude: 33.0,
  maxLongitude: 48.05,
} as const;

export function parseCoordinate(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function coordinateValidationMessage(latitudeValue: string, longitudeValue: string, required: boolean): string | null {
  const latitude = parseCoordinate(latitudeValue);
  const longitude = parseCoordinate(longitudeValue);
  const latitudeEntered = latitudeValue.trim().length > 0;
  const longitudeEntered = longitudeValue.trim().length > 0;

  if (!latitudeEntered && !longitudeEntered) {
    return required ? "Latitude and longitude are required for every customs location." : null;
  }
  if (!latitudeEntered || !longitudeEntered || latitude === null || longitude === null) {
    return "Enter both latitude and longitude as decimal numbers.";
  }
  if (
    latitude < ETHIOPIA_COORDINATE_BOUNDS.minLatitude
    || latitude > ETHIOPIA_COORDINATE_BOUNDS.maxLatitude
    || longitude < ETHIOPIA_COORDINATE_BOUNDS.minLongitude
    || longitude > ETHIOPIA_COORDINATE_BOUNDS.maxLongitude
  ) {
    return "Coordinates must be inside Ethiopia.";
  }
  return null;
}

export function hasRecordedEthiopianCoordinates(latitude: number | null, longitude: number | null) {
  return latitude !== null
    && longitude !== null
    && latitude >= ETHIOPIA_COORDINATE_BOUNDS.minLatitude
    && latitude <= ETHIOPIA_COORDINATE_BOUNDS.maxLatitude
    && longitude >= ETHIOPIA_COORDINATE_BOUNDS.minLongitude
    && longitude <= ETHIOPIA_COORDINATE_BOUNDS.maxLongitude;
}
