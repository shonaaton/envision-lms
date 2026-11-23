import LiveClassroom from "@/components/classroom/LiveClassroom";
import { LiveRoomNotice } from "@/components/bowbazar/LiveRoomNotice";
import { auth } from "@/lib/auth";
import { openBranchLiveRoom } from "@/lib/branch/live";
import { BranchError } from "@/lib/branch/errors";
import { requireBranchPage } from "@/lib/branch/page";
import { todayKey } from "@/lib/branch/rules";

export const dynamic = "force-dynamic";

/**
 * A branch's online class in the academy's live room, for its staff. Opening
 * it creates the day's session from the register (lib/branch/live.ts); the
 * summary at the end writes that register.
 */
export default async function BowbazarLiveRoomPage({ params }: { params: { slotId: string } }) {
  const { branch } = await requireBranchPage("attendance");
  const session = await auth();
  const user = session?.user as any;
  const date = todayKey();
  const registerHref = "/bowbazar/attendance";
  try {
    const room = await openBranchLiveRoom(branch, params.slotId, date, { id: String(user.id), name: String(user.name || ""), staff: true });
    return (
      <LiveClassroom
        classroomId={room.classroomId}
        role="instructor"
        userId={String(user.id)}
        sessionId={room.sessionId}
        branchMode={{ exitHref: registerHref, finishUrl: "/api/bowbazar/live/finish" }}
      />
    );
  } catch (error) {
    if (!(error instanceof BranchError)) throw error;
    return <LiveRoomNotice title="The live room did not open" message={error.message} backHref="/bowbazar/attendance" backLabel="Back to attendance" />;
  }
}
