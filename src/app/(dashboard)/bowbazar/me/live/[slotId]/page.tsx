import { redirect } from "next/navigation";
import LiveClassroom from "@/components/classroom/LiveClassroom";
import { LiveRoomNotice } from "@/components/bowbazar/LiveRoomNotice";
import { requireBranchStudent } from "@/lib/branch/http";
import { studentLiveRoom } from "@/lib/branch/live";
import { BranchError } from "@/lib/branch/errors";
import { todayKey } from "@/lib/branch/rules";
import { BranchSlot } from "@/models/Branch";

export const dynamic = "force-dynamic";

/** Today's online class in the academy's live room, for a branch student on its register. */
export default async function BowbazarMyLiveRoomPage({ params }: { params: { slotId: string } }) {
  const me = await requireBranchStudent();
  if (!me) redirect("/bowbazar/me");
  const userId = String(me.user.id);
  try {
    const room = await studentLiveRoom(me.branch, params.slotId, todayKey(), { id: String(me.student._id), userId, name: me.student.name });
    return (
      <LiveClassroom
        classroomId={room.classroomId}
        role="student"
        userId={userId}
        sessionId={room.sessionId}
        branchMode={{ exitHref: "/bowbazar/me", finishUrl: "/api/bowbazar/live/finish" }}
      />
    );
  } catch (error) {
    if (!(error instanceof BranchError)) throw error;
    const slot: any = await BranchSlot.findOne({ _id: params.slotId, branch: me.branch }).select("meetingUrl mode").lean().catch(() => null);
    return (
      <LiveRoomNotice
        title="Your live class isn't open"
        message={error.message}
        backHref="/bowbazar/me"
        backLabel="Back to my class"
        meetingUrl={slot?.mode === "online" ? slot.meetingUrl || "" : ""}
      />
    );
  }
}
