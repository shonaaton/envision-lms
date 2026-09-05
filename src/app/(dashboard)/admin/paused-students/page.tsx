import { redirect } from "next/navigation";

import PausedStudentsClient from "@/components/admin/PausedStudentsClient";
import { requireStudentPauseAccess } from "@/lib/studentPauseAccess";

export const dynamic = "force-dynamic";

export default async function PausedStudentsPage() {
  const session = await requireStudentPauseAccess("view");
  if (!session) redirect("/dashboard?restricted=1");
  const canManage = Boolean(await requireStudentPauseAccess("manage"));
  return <PausedStudentsClient canManage={canManage} />;
}
