/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffset(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant;
}

/** Convert an <input type="datetime-local"> value interpreted in `timeZone` to a UTC Date. */
export function zonedToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = guess - tzOffset(guess, timeZone);
  ts = guess - tzOffset(ts, timeZone); // second pass handles DST boundaries
  return new Date(ts);
}

/** Format a UTC Date as a datetime-local value in `timeZone` (for form defaults). */
export function utcToZonedInput(d: Date | null | undefined, timeZone: string) {
  if (!d) return "";
  const shifted = new Date(d.getTime() + tzOffset(d.getTime(), timeZone));
  return shifted.toISOString().slice(0, 16);
}
