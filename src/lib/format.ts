export function money(cents: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function toCents(input: FormDataEntryValue | null) {
  const n = Number(String(input ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export function dateTime(d: Date | string | null | undefined, timeZone = "Australia/Sydney") {
  if (!d) return "—";
  // note: dateStyle/timeStyle cannot be combined with timeZoneName
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(d));
}

export function date(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Sydney" }).format(new Date(d));
}

export function padTicket(n: number, total: number) {
  return String(n).padStart(Math.max(5, String(total).length), "0");
}

/** "Jane Citizen" -> "Jane C." ; email-like -> masked */
export function maskName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1) + "***";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function str(v: FormDataEntryValue | null | undefined) {
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(v: FormDataEntryValue | null | undefined) {
  const s = str(v);
  return s.length ? s : null;
}

export function ageOn(dob: Date, at = new Date()) {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--;
  return age;
}
