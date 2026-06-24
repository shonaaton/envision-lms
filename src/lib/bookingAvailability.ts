export type AvailabilitySlot = {
  dayOfWeek: number;
  startTime: string;
  endTime?: string;
  slotMinutes?: number;
};

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
    dayOfWeek: weekdayMap[read("weekday")] ?? -1,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcFromParts = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcFromParts - date.getTime();
}

function parseTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function zonedDateTimeToUtc(
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

export function nextOccurrenceForWeeklySlot(slot: AvailabilitySlot, timeZone: string, now = new Date()) {
  const parsed = parseTime(slot.startTime);
  if (!parsed) return null;
  const nowParts = getTimeZoneParts(now, timeZone);
  const todayStart = zonedDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day, parsed.hours, parsed.minutes, timeZone);
  const dayOffset = (slot.dayOfWeek - nowParts.dayOfWeek + 7) % 7;
  const candidate = new Date(todayStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate;
}

export function isBookingWithinAvailability(input: {
  startAt: Date;
  endAt: Date;
  timeZone: string;
  slots: AvailabilitySlot[];
}) {
  const durationMinutes = Math.round((input.endAt.getTime() - input.startAt.getTime()) / 60000);
  if (durationMinutes < 15) {
    return { ok: false as const, reason: "Bookings must be at least 15 minutes long." };
  }

  const local = getTimeZoneParts(input.startAt, input.timeZone);
  const requestedStart = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  const matchingSlot = input.slots.find((slot) => {
    if (Number(slot.dayOfWeek) !== local.dayOfWeek) return false;
    if (String(slot.startTime || "") !== requestedStart) return false;
    const slotMinutes = Math.max(15, Number(slot.slotMinutes || 60));
    return slotMinutes === durationMinutes;
  });

  if (!matchingSlot) {
    return { ok: false as const, reason: "That time is no longer available for this coach." };
  }

  if (matchingSlot.endTime) {
    const parsedEnd = parseTime(matchingSlot.endTime);
    if (parsedEnd) {
      const latestEnd = zonedDateTimeToUtc(local.year, local.month, local.day, parsedEnd.hours, parsedEnd.minutes, input.timeZone);
      if (input.endAt.getTime() > latestEnd.getTime()) {
        return { ok: false as const, reason: "That booking runs past the coach's available time window." };
      }
    }
  }

  return { ok: true as const };
}
