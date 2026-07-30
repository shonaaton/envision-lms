import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import TemplateEditClient from "@/components/homework/TemplateEditClient";

export const dynamic = "force-dynamic";

function editableTemplate(template: any) {
  const data = JSON.parse(JSON.stringify(template));
  delete data._id;
  delete data.topicKey;
  delete data.createdAt;
  delete data.updatedAt;
  delete data.createdBy;
  delete data.updatedBy;
  delete data.__v;
  if (data.course && typeof data.course === "object") data.course = data.course._id;
  return data;
}

export default async function TemplateEditPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "admin") redirect("/dashboard");
  await dbConnect();
  const template = await AssignmentTemplate.findById(params.id).lean();
  if (!template) redirect("/admin/homework-templates");
  return <TemplateEditClient id={params.id} initialJson={JSON.stringify(editableTemplate(template), null, 2)} />;
}
