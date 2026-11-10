// Seller location verification — pure rules (no I/O), shared by server actions and tests.

import { distanceMetres, insideAustralia, postcodeMatchesState, sameSuburb, STATE_CODES } from "./au-validation";

export const LOCATION_STATUS = {
  NOT_VERIFIED: "Not verified",
  PENDING: "Pending verification",
  VERIFIED: "Verified",
  FAILED: "Verification failed",
  MANUAL_REVIEW: "Requires manual review",
} as const;
export type LocationStatus = keyof typeof LOCATION_STATUS;

export const BUSINESS_CHECK_STATUS: Record<string, string> = {
  NOT_CHECKED: "Not checked",
  VERIFIED: "Verified on ABR",
  MISMATCH: "Details don't match ABR",
  INACTIVE: "ABN cancelled / inactive",
  NOT_FOUND: "Not found on ABR",
  MANUAL_REVIEW: "Requires manual review",
};

/** Max distance between the seller's confirmed pin and the geocoded address before it needs review. */
export const PIN_TOLERANCE_M = { street: 300, suburb: 5000, approximate: 2000 } as const;

export type AddressFields = { country: string; street: string; unit: string | null; suburb: string; state: string; postcode: string };

export type StoredGeo = {
  pin: { lat: number; lng: number } | null;
  geocoded: { lat: number; lng: number; suburb: string | null; postcode: string | null; state: string | null; formatted: string; precision: "street" | "suburb" | "approximate"; provider: string } | null;
  distanceM: number | null;
  checkedAt: string;
};

/** Hard validation of the typed address. Returns the first problem (shown to the seller) or null. */
export function addressProblem(a: Partial<AddressFields>, label = "Address") {
  if (a.country !== "AU") return "Only Australian sellers can register at the moment.";
  if (!a.street || a.street.trim().length < 3) return `${label}: enter the street address (number and street name).`;
  if (!/\d/.test(a.street)) return `${label}: include the street number.`;
  if (/^(po box|gpo box|locked bag|private bag)\b/i.test(a.street.trim())) return `${label}: a PO Box can't be used — enter a street address.`;
  if (!a.suburb || a.suburb.trim().length < 2) return `${label}: enter the suburb / city.`;
  if (!a.state || !STATE_CODES.includes(a.state)) return `${label}: choose the state or territory.`;
  if (!a.postcode || !/^\d{4}$/.test(a.postcode)) return `${label}: the postcode must be 4 digits.`;
  if (!postcodeMatchesState(a.postcode, a.state)) return `${label}: postcode ${a.postcode} isn't in ${a.state}. Check the postcode and state.`;
  return null;
}

/**
 * Decides the automatic location status.
 * VERIFIED needs: address found + suburb/postcode/state agree + pin confirmed near the address + accepted proof of address.
 * Anything inconsistent → MANUAL_REVIEW (an admin decides); a random pin is never accepted on its own.
 */
export function evaluateLocation(input: {
  address: AddressFields;
  geo: StoredGeo;
  pinConfirmed: boolean;
  proofOfAddressAccepted: boolean;
}): { status: LocationStatus; problems: string[] } {
  const { address, geo, pinConfirmed, proofOfAddressAccepted } = input;
  const problems: string[] = [];
  if (!pinConfirmed || !geo.pin) return { status: "NOT_VERIFIED", problems: ["Map pin not confirmed yet."] };
  if (!insideAustralia(geo.pin)) return { status: "FAILED", problems: ["The map pin is outside Australia."] };
  const g = geo.geocoded;
  if (!g) {
    problems.push("The address couldn't be found by the geocoding service.");
  } else {
    if (g.postcode && g.postcode !== address.postcode) problems.push(`Geocoded postcode is ${g.postcode}, not ${address.postcode}.`);
    if (g.state && g.state !== address.state) problems.push(`Geocoded state is ${g.state}, not ${address.state}.`);
    if (g.suburb && !sameSuburb(g.suburb, address.suburb)) problems.push(`Geocoded suburb is "${g.suburb}", not "${address.suburb}".`);
    if (g.precision !== "street") problems.push("Only the suburb could be located, not the exact street address.");
    const d = geo.distanceM ?? distanceMetres(g, geo.pin);
    const tol = PIN_TOLERANCE_M[g.precision];
    if (d > tol) problems.push(`The confirmed pin is ${(d / 1000).toFixed(1)} km from the address (limit ${tol >= 1000 ? `${tol / 1000} km` : `${tol} m`}).`);
  }
  if (problems.length) return { status: "MANUAL_REVIEW", problems };
  if (!proofOfAddressAccepted) return { status: "PENDING", problems: ["Address checks passed — waiting for proof of address to be accepted."] };
  return { status: "VERIFIED", problems: [] };
}
