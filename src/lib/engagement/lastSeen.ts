import { User } from "@/models/User";

const STAMP_EVERY_MS = 60 * 60_000;

// Per-process memory of the last stamp, so a family clicking around the portal
// costs one write an hour, not one per page. The query filter is the real guard:
// a second instance or a restart only ever re-checks, never double-writes.
const lastStamped = new Map<string, number>();

/** Records that this account opened the portal, at most once an hour. Never throws. */
export async function touchLastSeen(userId: string, now = new Date()) {
  if (!userId) return;
  const previous = lastStamped.get(userId) || 0;
  if (now.getTime() - previous < STAMP_EVERY_MS) return;
  lastStamped.set(userId, now.getTime());
  if (lastStamped.size > 5000) lastStamped.clear();
  try {
    await User.updateOne(
      { _id: userId, $or: [{ lastSeenAt: { $exists: false } }, { lastSeenAt: { $lt: new Date(now.getTime() - STAMP_EVERY_MS) } }] },
      { $set: { lastSeenAt: now } }
    );
  } catch (error) {
    console.error("lastSeenAt stamp failed", error);
  }
}
