import { redirect } from "next/navigation";
import ChangeRequestClient from "@/components/bowbazar/ChangeRequestClient";
import { myChanges } from "@/lib/branch/changes";
import { requireBranchStudent } from "@/lib/branch/http";
import { WEEK_ORDER, slotLabel, todayKey } from "@/lib/branch/rules";
import { BranchSlot } from "@/models/Branch";

export const dynamic = "force-dynamic";

/** A branch student asks to move one week's class, or to change class time for good. */
export default async function BowbazarChangeClassPage() {
  const me = await requireBranchStudent();
  if (!me) redirect("/bowbazar/me");
  const [slots, changes] = await Promise.all([
    BranchSlot.find({ _id: { $in: me.student.slots || [] } }).lean() as Promise<any[]>,
    myChanges(me.student),
  ]);
  const mySlots = slots
    .sort((a, b) => WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime))
    .map((slot) => ({ id: String(slot._id), label: slotLabel(slot), dayOfWeek: slot.dayOfWeek as number, mode: slot.mode as string }));
  return <ChangeRequestClient mySlots={mySlots} initialChanges={JSON.parse(JSON.stringify(changes))} today={todayKey()} active={me.student.status === "active"} />;
}
