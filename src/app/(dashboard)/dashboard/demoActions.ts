"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatAcademyDateTime, parseAcademyDateTimeLocal } from "@/lib/academyTime";
import { auth } from "@/lib/auth";
import { bookDemoForAccount, canScheduleDemoForAccount } from "@/lib/demoScheduling";

function backToDashboard(key: "demoError" | "demoOk", message: string): never {
  redirect(`/dashboard?${new URLSearchParams({ [key]: message }).toString()}`);
}

/**
 * Assign Demo from the dashboard's demo leads panel. The salesperson a lead is
 * assigned to can book its demo without waiting for the family to request one;
 * demo managers can book for any lead.
 */
export async function assignDemoFromDashboard(formData: FormData) {
  const session = await auth();
  const user: any = session?.user;
  if (!user?.id) redirect("/dashboard");
  const studentId = String(formData.get("student") || "");
  if (!(await canScheduleDemoForAccount(user, studentId))) {
    backToDashboard("demoError", "Only the salesperson assigned to this lead, or a demo manager, can book its demo.");
  }
  const result = await bookDemoForAccount({
    studentId,
    coachId: String(formData.get("coach") || ""),
    start: parseAcademyDateTimeLocal(String(formData.get("startAt") || "")),
    durationMinutes: Math.max(15, Number(formData.get("durationMinutes") || 30)),
    meetingUrl: String(formData.get("meetingUrl") || "").trim(),
    actorId: String(user.id),
  });
  revalidatePath("/dashboard");
  revalidatePath("/admin/demo-center");
  revalidatePath("/classrooms");
  if (!result.ok) backToDashboard("demoError", result.error);
  backToDashboard("demoOk", `Demo confirmed for ${formatAcademyDateTime(result.start)}.`);
}
