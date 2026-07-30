import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import TemplatePreviewClient from "@/components/homework/TemplatePreviewClient";

export const dynamic = "force-dynamic";

export default async function TemplatePreviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "admin") redirect("/dashboard");
  await dbConnect();
  const template = await AssignmentTemplate.findById(params.id).lean();
  if (!template) redirect("/admin/homework-templates");
  return <TemplatePreviewClient template={JSON.parse(JSON.stringify(template))} />;
}
