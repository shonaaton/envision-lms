import { notFound, redirect } from "next/navigation";
import OpeningEditor from "@/components/admin/careers/OpeningEditor";
import { getCareersActor } from "@/lib/careers/careersAccess";
import { getPostingForAdmin, listHireAccessRoles } from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

export default async function EditOpeningPage({ params }: { params: { id: string } }) {
  if (!(await getCareersActor("edit"))) redirect("/admin/careers");
  const posting = await getPostingForAdmin(params.id);
  if (!posting) notFound();
  return <OpeningEditor key={posting.id} posting={posting} accessRoles={await listHireAccessRoles()} />;
}
