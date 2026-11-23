import { User } from "@/models/User";
import { isValidTimeZone } from "@/lib/localTime/studentTimeZone";

/** The cookie the student's browser sets with its own timezone (components/layout/TimeZoneCookie). */
export const TIME_ZONE_COOKIE = "ec_tz";

// Per-process memory of what was last written, so opening pages costs no writes
// once the zone is stored. The query filter is the real guard.
const lastStamped = new Map<string, string>();

/** Saves the timezone the student's device reports, when it changed. Never throws. */
export async function stampTimeZone(userId: string, rawZone: string | undefined | null, now = new Date()) {
  if (!userId || !rawZone) return;
  let zone = rawZone;
  try {
    zone = decodeURIComponent(rawZone);
  } catch {
    return;
  }
  if (!isValidTimeZone(zone)) return;
  if (lastStamped.get(userId) === zone) return;
  lastStamped.set(userId, zone);
  if (lastStamped.size > 5000) lastStamped.clear();
  try {
    await User.updateOne({ _id: userId, timeZone: { $ne: zone } }, { $set: { timeZone: zone, timeZoneSeenAt: now } });
  } catch (error) {
    lastStamped.delete(userId);
    console.error("timeZone stamp failed", error);
  }
}
