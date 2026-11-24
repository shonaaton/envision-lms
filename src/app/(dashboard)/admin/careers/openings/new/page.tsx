import { redirect } from "next/navigation";
import OpeningEditor from "@/components/admin/careers/OpeningEditor";
import { getCareersActor } from "@/lib/careers/careersAccess";
import { listHireAccessRoles } from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

export default async function NewOpeningPage() {
  if (!(await getCareersActor("create"))) redirect("/admin/careers");
  return <OpeningEditor posting={null} accessRoles={await listHireAccessRoles()} />;
}
