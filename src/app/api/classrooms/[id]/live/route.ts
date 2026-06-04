import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

function canCoach(role: string | undefined) {
  return role === "admin" || role === "instructor";
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const classroom: any = await Classroom.findById(params.id).populate("coach instructor students", "name email username").lean();
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let live: any = await ClassroomSession.findOne({ classroom: params.id })
    .populate("selectedStudents boardControlStudents challenge.student", "name username")
    .lean();
  if (!live) {
    const created = await ClassroomSession.create({
      classroom: params.id,
      coach: classroom.coach || classroom.instructor,
      fen: "start",
      mode: "teaching",
    });
    live = await ClassroomSession.findById(created._id).populate("selectedStudents boardControlStudents challenge.student", "name username").lean();
  }
  const activeQuestion: any = live.activeQuestion
    ? await LiveQuestion.findById(live.activeQuestion).lean()
    : await LiveQuestion.findOne({ classroom: params.id, status: "live" }).sort({ createdAt: -1 }).lean();
  const responses = activeQuestion
    ? await LiveQuestionResponse.find({ question: activeQuestion._id }).populate("student", "name username").sort({ submittedAt: -1 }).lean()
    : [];
  return NextResponse.json({ classroom, live, activeQuestion, responses, serverTime: new Date() });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !canCoach(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const body = await req.json();
  const allowed = [
    "topic",
    "mode",
    "fen",
    "pgn",
    "moveHistory",
    "orientation",
    "selectedStudents",
    "boardControlStudents",
    "drawings",
    "locked",
    "challenge",
  ];
  const update: any = {};
  for (const key of allowed) if (key in body) update[key] = body[key];
  const live = await ClassroomSession.findOneAndUpdate(
    { classroom: params.id },
    { $set: update, $setOnInsert: { classroom: params.id, coach: (session.user as any).id } },
    { upsert: true, new: true }
  );
  return NextResponse.json(live);
}
