import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { dbConnect } from "@/lib/db";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import TemplatePreviewClient from "@/components/homework/TemplatePreviewClient";

export const dynamic = "force-dynamic";

export default async function TemplatePreviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !(await canAccessFeature("homeworkTemplates", session.user as any, "view"))) redirect("/dashboard");
  await dbConnect();
  const template = await AssignmentTemplate.findById(params.id).lean();
  if (!template) redirect("/admin/homework-templates");
  return <TemplatePreviewClient template={JSON.parse(JSON.stringify(template))} />;
}
