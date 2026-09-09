export const ACADEMY_TIME_ZONE = process.env.NEXT_PUBLIC_ACADEMY_TIME_ZONE || "Asia/Kolkata";

function dateParts(value: string | Date, timeZone = ACADEMY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = dateParts(date, timeZone);
  const utcFromParts = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return utcFromParts - date.getTime();
}

/**
 * The instant at which a wall-clock reading happens in `timeZone`.
 *
 * Resolved in two passes because the offset that applies depends on the instant
 * we are still solving for - around a DST change the first guess can land on the
 * wrong side of the transition.
 */
function fromWallClock(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string
) {
  const firstGuess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(firstGuess), timeZone);
  const adjusted = firstGuess - firstOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(adjusted), timeZone);
  return new Date(firstGuess - secondOffset);
}

export function zonedDateTime(dateValue: string | Date, time = "00:00", timeZone = ACADEMY_TIME_ZONE) {
  const { year, month, day } = dateParts(dateValue, timeZone);
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const [hours, minutes] = normalizedTime.split(":").map(Number);
  return fromWallClock(Number(year), Number(month), Number(day), hours || 0, minutes || 0, timeZone);
}

export function academyDateTime(dateValue: string | Date, time = "00:00") {
  return zonedDateTime(dateValue, time, ACADEMY_TIME_ZONE);
}

export function academyDateKey(value: string | Date) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const { year, month, day } = dateParts(value, ACADEMY_TIME_ZONE);
  return `${year}-${month}-${day}`;
}

export function academyDayBounds(value: string | Date) {
  const key = academyDateKey(value);
  const start = academyDateTime(key, "00:00");
  const end = academyDateTime(key, "23:59");
  end.setSeconds(59, 999);
  return { start, end };
}

export function formatAcademyDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {},
  timeZone = ACADEMY_TIME_ZONE
) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(new Date(value));
}

/**
 * The "HH:mm" wall-clock label for an instant, in academy time.
 *
 * Classroom.startTime is always read back as an academy-timezone time (see
 * getSessionStart), so anything writing it has to format it here rather than
 * with toTimeString(), which would silently record the server's own timezone
 * and shift every join window by the server offset.
 */
export function academyTimeOfDay(value: string | Date, timeZone = ACADEMY_TIME_ZONE) {
  const { hour, minute } = dateParts(value, timeZone);
  return `${hour === "24" ? "00" : hour}:${minute}`;
}

/**
 * The value for an `<input type="datetime-local">`, in academy wall-clock time.
 *
 * A datetime-local input has no timezone: it shows back whatever wall clock it
 * is given and returns that same wall clock on submit. Building that string with
 * `getTimezoneOffset()` reads the clock of whichever machine happens to render
 * it - the server for a server component, the admin's laptop for a client one -
 * so an 11:37 IST demo was shown as 06:07 to an admin on a UTC server. Pair this
 * with parseAcademyDateTimeLocal on the receiving end so the value goes out and
 * comes back in the same timezone.
 */
export function academyDateTimeLocalInput(value?: string | Date | null, timeZone = ACADEMY_TIME_ZONE) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const { year, month, day, hour, minute } = dateParts(date, timeZone);
  return `${year}-${month}-${day}T${hour === "24" ? "00" : hour}:${minute}`;
}

/**
 * Read an `<input type="datetime-local">` value as academy wall-clock time.
 *
 * `new Date("2026-09-09T11:42")` resolves a bare wall clock against the *server's*
 * timezone, so on a UTC host every time an admin typed was banked five and a half
 * hours late - the WhatsApp confirmation quoted the requested slot while the
 * classroom sat on the shifted one. Values that already carry a zone (an ISO
 * string with Z or an offset, or a Date) are unambiguous and pass straight
 * through.
 */
export function parseAcademyDateTimeLocal(value?: string | Date | null, timeZone = ACADEMY_TIME_ZONE) {
  if (value instanceof Date) return new Date(value.getTime());
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return new Date(raw);
  return fromWallClock(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), timeZone);
}
