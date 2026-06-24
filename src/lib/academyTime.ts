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

export function zonedDateTime(dateValue: string | Date, time = "00:00", timeZone = ACADEMY_TIME_ZONE) {
  const { year, month, day } = dateParts(dateValue, timeZone);
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const [hours, minutes] = normalizedTime.split(":").map(Number);
  const firstGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), hours || 0, minutes || 0, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(firstGuess), timeZone);
  const adjusted = firstGuess - firstOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(adjusted), timeZone);
  return new Date(firstGuess - secondOffset);
}

export function academyDateTime(dateValue: string | Date, time = "00:00") {
  return zonedDateTime(dateValue, time, ACADEMY_TIME_ZONE);
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
