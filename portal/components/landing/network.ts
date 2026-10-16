// Shared by the landing page and its map; kept free of Leaflet so the page can render on the server.
export type NetworkRegion = { code: string; name: string; branches: string[]; center: readonly [number, number] };

export const HEAD_OFFICE: readonly [number, number] = [9.018, 38.798];
