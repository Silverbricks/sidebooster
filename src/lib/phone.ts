// Mobile validation: friendly AU-specific messages (parseAuMobile) confirmed by the international
// libphonenumber metadata (valid number + type MOBILE). Server-side only, to keep the metadata out of browser bundles.

import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { parseAuMobile, type MobileResult } from "./au-validation";

export function validateMobile(input: string): MobileResult {
  const r = parseAuMobile(input);
  if (!r.ok) return r;
  const n = parsePhoneNumberFromString(r.e164, "AU");
  if (!n || !n.isValid()) return { ok: false, error: "That mobile number isn't valid. Check the digits." };
  const type = n.getType();
  if (type && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") return { ok: false, error: "That number isn't a mobile number. Use a mobile starting 04." };
  return { ok: true, e164: n.number };
}
