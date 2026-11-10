import "server-only";
// Address geocoding for seller location verification.
// GOOGLE_MAPS_API_KEY set → Google Geocoding API (best accuracy for AU street addresses).
// Otherwise → OpenStreetMap Nominatim (free; max 1 request/second, so calls are throttled here).

import { brand } from "@/config/brand";

export type GeoResult = {
  lat: number;
  lng: number;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  formatted: string;
  precision: "street" | "suburb" | "approximate";
  provider: "google" | "osm";
};

export type AddressInput = { unit?: string | null; street: string; suburb: string; state: string; postcode: string };

const STATE_NAMES: Record<string, string> = {
  "NEW SOUTH WALES": "NSW", VICTORIA: "VIC", QUEENSLAND: "QLD", "WESTERN AUSTRALIA": "WA", "SOUTH AUSTRALIA": "SA",
  TASMANIA: "TAS", "AUSTRALIAN CAPITAL TERRITORY": "ACT", "NORTHERN TERRITORY": "NT",
};
const stateCode = (s: string | null | undefined) => {
  if (!s) return null;
  const u = s.trim().toUpperCase();
  return STATE_NAMES[u] ?? (Object.values(STATE_NAMES).includes(u) ? u : null);
};

export const geocoderName = () => (process.env.GOOGLE_MAPS_API_KEY?.trim() ? "Google Maps" : "OpenStreetMap");

export async function geocodeAddress(a: AddressInput): Promise<GeoResult | null> {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ? google(a) : osm(a);
}

async function google(a: AddressInput): Promise<GeoResult | null> {
  const address = `${a.unit ? `${a.unit}/` : ""}${a.street}, ${a.suburb} ${a.state} ${a.postcode}, Australia`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:AU&region=au&key=${encodeURIComponent(process.env.GOOGLE_MAPS_API_KEY!.trim())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoding failed (HTTP ${res.status})`);
  const json = (await res.json()) as { status: string; results: { formatted_address: string; geometry: { location: { lat: number; lng: number }; location_type: string }; address_components: { long_name: string; short_name: string; types: string[] }[] }[] };
  if (json.status === "ZERO_RESULTS" || !json.results?.length) return null;
  if (json.status !== "OK") throw new Error(`Geocoding error: ${json.status}`);
  const r = json.results[0];
  const comp = (t: string) => r.address_components.find((c) => c.types.includes(t));
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    suburb: comp("locality")?.long_name ?? comp("sublocality")?.long_name ?? null,
    postcode: comp("postal_code")?.long_name ?? null,
    state: stateCode(comp("administrative_area_level_1")?.short_name),
    formatted: r.formatted_address,
    precision: ["ROOFTOP", "RANGE_INTERPOLATED"].includes(r.geometry.location_type) ? "street" : r.geometry.location_type === "GEOMETRIC_CENTER" ? "suburb" : "approximate",
    provider: "google",
  };
}

let lastOsmCall = 0;
async function osm(a: AddressInput): Promise<GeoResult | null> {
  // Nominatim usage policy: ≤1 request/second and an identifying User-Agent.
  const wait = lastOsmCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOsmCall = Date.now();
  const q = new URLSearchParams({
    street: `${a.unit ? `${a.unit}/` : ""}${a.street}`, city: a.suburb, state: a.state, postalcode: a.postcode,
    country: "Australia", format: "jsonv2", addressdetails: "1", limit: "1",
  });
  const headers = { "User-Agent": `${brand.name}/1.0 (+${brand.url})`, "Accept-Language": "en-AU" };
  let res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoding failed (HTTP ${res.status})`);
  let rows = (await res.json()) as { lat: string; lon: string; display_name: string; addresstype?: string; address: Record<string, string> }[];
  let precision: GeoResult["precision"] = "street";
  if (!rows.length) {
    // fall back to the suburb centre so the seller can still drop the pin
    await new Promise((r) => setTimeout(r, 1100));
    lastOsmCall = Date.now();
    q.delete("street");
    res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
    rows = res.ok ? await res.json() : [];
    precision = "suburb";
    if (!rows.length) return null;
  }
  const r = rows[0];
  const ad = r.address ?? {};
  return {
    lat: Number(r.lat),
    lng: Number(r.lon),
    suburb: ad.suburb ?? ad.town ?? ad.city_district ?? ad.village ?? ad.hamlet ?? ad.city ?? null,
    postcode: ad.postcode ?? null,
    state: stateCode(ad.state) ?? stateCode(ad["ISO3166-2-lvl4"]?.replace("AU-", "")),
    formatted: r.display_name,
    precision: precision === "street" && !ad.road ? "approximate" : precision,
    provider: "osm",
  };
}
