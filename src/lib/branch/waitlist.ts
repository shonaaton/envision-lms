import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { BranchSlot, BranchWaitlist } from "@/models/Branch";
import { BranchError } from "./errors";
import type { BranchKey } from "./scope";
import { tenDigitPhone } from "./admissionRules";

/** Families waiting for a seat in a full slot. Staff are told when one frees (lib/branch/alerts.ts). */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);

export async function listWaitlist(branch: BranchKey) {
  await dbConnect();
  const entries: any[] = await BranchWaitlist.find({ branch, status: "waiting" }).sort({ createdAt: 1 }).lean();
  return entries.map((entry) => ({
    id: id(entry),
    slotId: id(entry.slot),
    name: entry.name as string,
    phone: entry.phone || "",
    note: entry.note || "",
    createdAt: entry.createdAt,
    createdByName: entry.createdByName || "",
  }));
}

export async function addToWaitlist(branch: BranchKey, input: any, actor: { id: string; name?: string }) {
  await dbConnect();
  const slotId = String(input?.slotId || "");
  if (!Types.ObjectId.isValid(slotId) || !(await BranchSlot.exists({ _id: slotId, branch }))) throw new BranchError("Pick a slot.");
  const name = text(input?.name, 120);
  if (!name) throw new BranchError("Enter a name.");
  const phone = input?.phone ? tenDigitPhone(input.phone) : "";
  if (input?.phone && !phone) throw new BranchError("Enter a 10-digit mobile number.");
  await BranchWaitlist.create({ branch, slot: slotId, name, phone, note: text(input?.note, 300), createdBy: actor.id, createdByName: actor.name || "" });
  return listWaitlist(branch);
}

/** Takes someone off: "placed" once they have a seat, "removed" if they stopped waiting. */
export async function closeWaitlistEntry(branch: BranchKey, entryId: string, status: unknown) {
  await dbConnect();
  if (!Types.ObjectId.isValid(entryId)) throw new BranchError("Not found.", 404);
  const result = await BranchWaitlist.updateOne(
    { _id: entryId, branch, status: "waiting" },
    { $set: { status: status === "placed" ? "placed" : "removed", closedAt: new Date() } }
  );
  if (!result.matchedCount) throw new BranchError("Not found.", 404);
  return listWaitlist(branch);
}
