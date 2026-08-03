import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record selected");

const manualAssignmentSchema = z.object({
  classroomId: objectIdSchema,
  targetMode: z.enum(["batches", "students"]),
  targetIds: z.array(objectIdSchema).min(1, "Choose at least one batch or student").max(500),
  dueAt: z.string().datetime(),
});

function assignmentType(template: any) {
  if (template.activities?.some((activity: any) => activity.type === "study_pgn")) return "pgn_study";
  if (template.activities?.some((activity: any) => activity.type === "quiz" || activity.type === "written_answer")) return "quiz";
  return "puzzle_set";
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = manualAssignmentSchema.parse(await req.json());
    const dueAt = new Date(body.dueAt);
    if (dueAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Choose a submission deadline in the future." }, { status: 400 });
    }

    await dbConnect();
    const [template, classroom] = await Promise.all([
      AssignmentTemplate.findOne({ _id: params.id, isActive: { $ne: false } }).lean(),
      Classroom.findById(body.classroomId).select("title coach instructor").lean(),
    ]);
    if (!template) return NextResponse.json({ error: "Assignment template not found" }, { status: 404 });
    if (!classroom) return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
    const templateRecord = template as any;

    const targetIds = Array.from(new Set(body.targetIds));
    let assignedBatches: any[] = [];
    let assignedStudents: any[] = [];

    if (body.targetMode === "batches") {
      const batches: any[] = await Batch.find({
        _id: { $in: targetIds },
        isActive: { $ne: false },
      }).select("students").lean();
      if (batches.length !== targetIds.length) {
        return NextResponse.json({ error: "One or more selected batches are unavailable." }, { status: 400 });
      }
      assignedBatches = batches.map((batch: any) => batch._id);
      const batchStudentIds = Array.from(new Set(batches.flatMap((batch: any) => (batch.students || []).map((student: any) => student.toString()))));
      const activeStudents = await User.find({
        _id: { $in: batchStudentIds },
        role: "student",
        isActive: { $ne: false },
      }).select("_id").lean();
      assignedStudents = activeStudents.map((student: any) => student._id);
      if (!assignedStudents.length) {
        return NextResponse.json({ error: "The selected batches do not contain any active students." }, { status: 400 });
      }
    } else {
      const students = await User.find({
        _id: { $in: targetIds },
        role: "student",
        isActive: { $ne: false },
      }).select("_id").lean();
      if (students.length !== targetIds.length) {
        return NextResponse.json({ error: "One or more selected students are unavailable." }, { status: 400 });
      }
      assignedStudents = students.map((student: any) => student._id);
    }

    const actorId = String((session.user as any).id);
    const classroomRecord = classroom as any;
    const instructor = classroomRecord.coach || classroomRecord.instructor || actorId;
    const created: any = await Homework.create({
      classroom: classroomRecord._id,
      instructor,
      type: assignmentType(templateRecord),
      title: templateRecord.title,
      description: templateRecord.description,
      instructions: templateRecord.instructions,
      assignedStudents,
      assignedBatches,
      assignAllStudents: false,
      puzzles: JSON.parse(JSON.stringify(templateRecord.puzzles || [])),
      activities: JSON.parse(JSON.stringify(templateRecord.activities || [])),
      dueAt,
      numberOfAttempts: templateRecord.numberOfAttempts || 1,
      timeLimitMinutes: templateRecord.timeLimitMinutes || 0,
      scoring: templateRecord.scoring || undefined,
      sourceTemplate: templateRecord._id,
      autoAssigned: false,
      automationStatus: "manually_assigned",
      isPublished: true,
    });

    await recordActivity({
      actor: actorId,
      type: "homework.manually_assigned",
      label: `Assigned homework template ${templateRecord.title}`,
      entityType: "Homework",
      entityId: created._id.toString(),
      metadata: {
        templateId: params.id,
        classroomId: body.classroomId,
        targetMode: body.targetMode,
        targetCount: targetIds.length,
        recipientCount: assignedStudents.length,
        dueAt: dueAt.toISOString(),
      },
    });

    return NextResponse.json({
      id: created._id.toString(),
      assignedRecipientCount: assignedStudents.length,
      targetCount: targetIds.length,
      dueAt: dueAt.toISOString(),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Check the assignment details." }, { status: 400 });
    }
    return NextResponse.json({ error: error?.message || "Could not assign this homework template." }, { status: 400 });
  }
}
