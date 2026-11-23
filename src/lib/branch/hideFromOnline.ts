import { Types } from "mongoose";
import { User } from "@/models/User";

/**
 * Bowbazar runs as its own academy inside the same database. Most online reads
 * are kept clean by the User and Classroom scope hooks, but records that only
 * point at a person (notifications, activity, submissions, exam results) carry
 * no branch of their own. Online screens that list those leave out these ids.
 */
const CACHE_MS = 60_000;
let cache: { at: number; ids: Types.ObjectId[] } | null = null;

export async function branchAccountIds(now = Date.now()) {
  if (cache && now - cache.at < CACHE_MS) return cache.ids;
  const rows: any[] = await User.find({ branch: { $ne: null } }).select("_id").setOptions({ allBranches: true }).lean();
  cache = { at: now, ids: rows.map((row) => row._id) };
  return cache.ids;
}

/** Activity rows done by, or about, a branch account - or tagged as branch work. */
export function onlineActivityFilter(ids: Types.ObjectId[]) {
  return { actor: { $nin: ids }, targetUser: { $nin: ids }, type: { $not: /^branch\./ } };
}

export function clearBranchAccountCache() {
  cache = null;
}
